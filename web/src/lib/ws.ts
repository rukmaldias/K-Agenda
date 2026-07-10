import { useSyncExternalStore } from "react";
import type { SnapshotData, SnapshotMessage } from "../types/snapshot";

export type ConnectionStatus = "connecting" | "open" | "closed";

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
const listeners = new Set<() => void>();

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

  socket.addEventListener("open", () => {
    setState({ status: "open" });
  });

  socket.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(event.data) as SnapshotMessage;
      if (message.type === "snapshot") {
        setState({ snapshot: message.data });
      }
    } catch {
      // Ignore malformed frames rather than crashing the socket loop.
    }
  });

  const scheduleReconnect = () => {
    setState({ status: "closed" });
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
