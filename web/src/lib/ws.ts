import { useEffect, useState, useSyncExternalStore } from "react";
import type {
  ChangeStateResponse,
  SnapshotData,
  SnapshotMessage,
  TaskBodyMessage,
} from "../types/snapshot";

export type ConnectionStatus = "connecting" | "open" | "closed";

type IncomingMessage = SnapshotMessage | TaskBodyMessage | ChangeStateResponse;

interface StoreState {
  status: ConnectionStatus;
  snapshot: SnapshotData | null;
}

// Always connects directly to the raw websocket port, never proxied
// through Vite's dev server -- k-agenda-ws.el and k-agenda-server.el are
// two independent listeners, and the websocket is the same one whether
// the HTML is served by `npm run dev` or by simple-httpd in production.
const WS_PORT = import.meta.env.VITE_WS_PORT ?? "35921";
const WS_URL = `ws://${window.location.hostname || "localhost"}:${WS_PORT}`;

const INITIAL_RETRY_MS = 500;
const MAX_RETRY_MS = 10_000;

let state: StoreState = { status: "connecting", snapshot: null };
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
