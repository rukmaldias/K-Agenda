import { useEffect, useState, useSyncExternalStore } from "react";
import type {
  ChangeStateResponse,
  ReferenceBodyMessage,
  ReferenceNode,
  ReferenceSearchMessage,
  ReferenceTreeMessage,
  SnapshotData,
  SnapshotMessage,
  TaskBodyMessage,
} from "../types/snapshot";

export type ConnectionStatus = "connecting" | "open" | "closed";

type IncomingMessage =
  | SnapshotMessage
  | TaskBodyMessage
  | ReferenceBodyMessage
  | ReferenceTreeMessage
  | ReferenceSearchMessage
  | ChangeStateResponse;

interface StoreState {
  status: ConnectionStatus;
  snapshot: SnapshotData | null;
  // undefined: never fetched yet; null is not a valid state -- an empty
  // References dir still resolves to `[]`, same as the snapshot arrays.
  referenceTree: ReferenceNode[] | undefined;
}

// Always connects directly to the raw websocket port, never proxied
// through Vite's dev server -- k-agenda-ws.el and k-agenda-server.el are
// two independent listeners, and the websocket is the same one whether
// the HTML is served by `npm run dev` or by simple-httpd in production.
const WS_PORT = import.meta.env.VITE_WS_PORT ?? "35921";
const WS_URL = `ws://${window.location.hostname || "localhost"}:${WS_PORT}`;

const INITIAL_RETRY_MS = 500;
const MAX_RETRY_MS = 10_000;

let state: StoreState = { status: "connecting", snapshot: null, referenceTree: undefined };
let currentSocket: WebSocket | null = null;
const listeners = new Set<() => void>();
const messageListeners = new Set<(msg: IncomingMessage) => void>();

function setState(next: Partial<StoreState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getState() {
  return state;
}

function connect(retryMs = INITIAL_RETRY_MS) {
  const socket = new WebSocket(WS_URL);
  currentSocket = socket;

  socket.addEventListener("open", () => {
    setState({ status: "open" });
  });

  socket.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(event.data) as IncomingMessage;
      if (message.type === "snapshot") {
        setState({ snapshot: message.data });
      } else if (message.type === "reference-tree") {
        setState({ referenceTree: message.tree });
      }
      messageListeners.forEach((l) => l(message));
    } catch {
      // Ignore malformed frames rather than crashing the socket loop.
    }
  });

  const scheduleReconnect = () => {
    setState({ status: "closed" });
    if (currentSocket === socket) currentSocket = null;
    setTimeout(() => connect(Math.min(retryMs * 2, MAX_RETRY_MS)), retryMs);
  };

  socket.addEventListener("close", scheduleReconnect);
  socket.addEventListener("error", () => socket.close());
}

connect();

export function useConnectionStatus(): ConnectionStatus {
  return useSyncExternalStore(subscribe, () => getState().status);
}

export function useSnapshot(): SnapshotData | null {
  return useSyncExternalStore(subscribe, () => getState().snapshot);
}

function sendMessage(message: Record<string, unknown>): void {
  if (currentSocket && currentSocket.readyState === WebSocket.OPEN) {
    currentSocket.send(JSON.stringify(message));
  }
}

/** Fetches a task's full body text on demand when ID is non-null (not
 * part of the main snapshot broadcast -- some entries have long bodies,
 * not worth sending for every task on every save). Returns undefined
 * while loading; null once resolved with no body / an id the backend
 * couldn't find; otherwise the body text. */
export function useTaskBody(id: string | null): string | null | undefined {
  const [body, setBody] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!id) {
      setBody(undefined);
      return;
    }
    setBody(undefined);
    const onMessage = (msg: IncomingMessage) => {
      if (msg.type === "task-body" && msg.id === id) {
        setBody(msg.body);
      }
    };
    messageListeners.add(onMessage);
    sendMessage({ type: "task-body-request", id });
    return () => {
      messageListeners.delete(onMessage);
    };
  }, [id]);

  return body;
}

/** Fetches a References tree node's full body text on demand when ID is
 * non-null -- same on-demand-fetch pattern as `useTaskBody' above, applied
 * to a `reference-body-request'/`reference-body' pair instead. FILE is the
 * id of ID's tree root (a reference file's absolute path) -- passed along
 * so the backend can look up just that one file instead of scanning all
 * of them; the caller already has it from the tree it rendered. Returns
 * undefined while loading; null once resolved with no body / an id the
 * backend couldn't find; otherwise the body text. */
export function useReferenceBody(id: string | null, file: string | null): string | null | undefined {
  const [body, setBody] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!id || !file) {
      setBody(undefined);
      return;
    }
    setBody(undefined);
    const onMessage = (msg: IncomingMessage) => {
      if (msg.type === "reference-body" && msg.id === id) {
        setBody(msg.body);
      }
    };
    messageListeners.add(onMessage);
    sendMessage({ type: "reference-body-request", id, file });
    return () => {
      messageListeners.delete(onMessage);
    };
  }, [id, file]);

  return body;
}

/** Fetches the References tree lazily, once the caller actually mounts --
 * not part of the main snapshot, since building it parses every reference
 * file (expensive enough with 90+ docs to stall the app if it were sent
 * on every connect/broadcast like `projects'/`tasks'). Cached globally so
 * navigating away from and back to the References page doesn't re-fetch;
 * the backend also pushes a fresh `reference-tree' message unprompted
 * after a reference file is edited (see k-agenda-ws.el), which lands in
 * the same store via the message listener below `connect()'. Re-requests
 * on (re)connect so a dropped connection doesn't leave the tree stale.
 * Returns undefined until the first response arrives. */
export function useReferenceTree(): ReferenceNode[] | undefined {
  const status = useConnectionStatus();
  const tree = useSyncExternalStore(subscribe, () => getState().referenceTree);

  useEffect(() => {
    if (status === "open") {
      sendMessage({ type: "reference-tree-request" });
    }
  }, [status]);

  return tree;
}

/** Debounce before a keystroke becomes a search request. Long enough that
 * typing a word is one round trip rather than six, short enough to feel
 * immediate. The scan itself costs ~14ms server-side; this is about not
 * making Emacs do it per character. */
const SEARCH_DEBOUNCE_MS = 150;

/** Searches reference docs (file name/title and full text) for QUERY,
 * returning the narrowed tree with matching sections surfaced. A blank
 * QUERY returns undefined rather than issuing a request -- the caller
 * falls back to the full `useReferenceTree' list, so clearing the box is
 * instant and costs no round trip.
 *
 * Returns undefined while the first result for a new query is in flight;
 * callers should keep showing the previous list rather than flashing an
 * empty one.
 *
 * Replies are matched against the query that's current at arrival time,
 * so an out-of-order or superseded response is dropped instead of
 * overwriting fresher results. */
export function useReferenceSearch(query: string): ReferenceNode[] | undefined {
  const [results, setResults] = useState<ReferenceNode[] | undefined>(undefined);
  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed === "") {
      setResults(undefined);
      return;
    }
    setResults(undefined);
    const onMessage = (msg: IncomingMessage) => {
      // The echoed query is the guard: anything not matching what we're
      // currently waiting for is a stale reply for an earlier keystroke.
      if (msg.type === "reference-search" && msg.query === trimmed) {
        setResults(msg.tree);
      }
    };
    const timer = setTimeout(() => {
      messageListeners.add(onMessage);
      sendMessage({ type: "reference-search-request", query: trimmed });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      messageListeners.delete(onMessage);
    };
  }, [trimmed]);

  return results;
}

const CHANGE_STATE_TIMEOUT_MS = 8000;

/** Sends a drag-and-drop state-change request and resolves with the
 * server's response. Rejects only on timeout (no response within
 * CHANGE_STATE_TIMEOUT_MS, e.g. the connection dropped mid-flight) --
 * an authoritative accept/reject always comes back as a resolved
 * promise with `ok` true/false, never a thrown error. */
export function requestChangeState(
  id: string,
  fromState: string,
  toState: string
): Promise<ChangeStateResponse> {
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      messageListeners.delete(onMessage);
      reject(new Error("Timed out waiting for a response."));
    }, CHANGE_STATE_TIMEOUT_MS);

    function onMessage(msg: IncomingMessage) {
      if (msg.type === "change-state-response" && msg.requestId === requestId) {
        clearTimeout(timeout);
        messageListeners.delete(onMessage);
        resolve(msg);
      }
    }

    messageListeners.add(onMessage);
    sendMessage({ type: "change-state-request", requestId, id, fromState, toState });
  });
}
