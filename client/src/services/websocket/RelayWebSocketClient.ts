import {parseRelayWebSocketMessage,} from "./message";

import type {RelayWebSocketMessage, WebSocketStatus,} from "@/types/api";

type MessageListener = (message: RelayWebSocketMessage) => void;
type StatusListener = (status: WebSocketStatus) => void;

const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

export class RelayWebSocketClient {
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempt = 0;
  private intentionallyClosed = false;
  private status: WebSocketStatus = "idle";
  private afterSequence = 0;
  private readonly messageListeners = new Set<MessageListener>();
  private readonly statusListeners = new Set<StatusListener>();

    constructor(
        private readonly baseUrl: string | (() => string),
    ) {
    }

  connect(afterSequence = 0): void {
    this.intentionallyClosed = false;
    this.afterSequence = Math.max(afterSequence, 0);
    this.clearReconnectTimer();
    this.openSocket();
  }

  disconnect(): void {
    this.intentionallyClosed = true;
    this.clearReconnectTimer();
    this.socket?.close(1000, "client shutdown");
    this.socket = null;
    this.setStatus("disconnected");
  }

  updateAfterSequence(sequence: number): void {
    this.afterSequence = Math.max(this.afterSequence, sequence);
  }

  onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  getStatus(): WebSocketStatus {
    return this.status;
  }

  private openSocket(): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return;
    }
    this.setStatus(
      this.reconnectAttempt === 0 ? "connecting" : "reconnecting",
    );

    const socket = new WebSocket(this.buildUrl(this.afterSequence));
    this.socket = socket;

    socket.addEventListener("open", () => {
      if (socket !== this.socket) return;
      this.reconnectAttempt = 0;
      this.setStatus("connected");
    });

    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      try {
        const message = parseRelayWebSocketMessage(event.data);
        if (typeof message.sequence === "number") {
          this.updateAfterSequence(message.sequence);
        }
        for (const listener of this.messageListeners) {
          listener(message);
        }
      } catch (error) {
        console.warn("Ignoring malformed WebSocket message", error);
      }
    });

    socket.addEventListener("close", () => {
      if (socket !== this.socket) return;
      this.socket = null;
      if (this.intentionallyClosed) {
        this.setStatus("disconnected");
        return;
      }
      this.scheduleReconnect();
    });

    socket.addEventListener("error", () => {
      socket.close();
    });
  }

  private scheduleReconnect(): void {
    this.setStatus("reconnecting");
    const delay = Math.min(
      INITIAL_RECONNECT_DELAY_MS * 2 ** this.reconnectAttempt,
      MAX_RECONNECT_DELAY_MS,
    );
    this.reconnectAttempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setStatus(status: WebSocketStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }

  private buildUrl(afterSequence: number): string {
      const baseUrl =
          typeof this.baseUrl === "function" ? this.baseUrl() : this.baseUrl;
      const resolved = baseUrl.startsWith("ws://") ||
      baseUrl.startsWith("wss://")
          ? new URL(baseUrl)
          : new URL(baseUrl, window.location.origin);
    resolved.searchParams.set("afterSequence", String(afterSequence));
    return resolved.toString();
  }
}
