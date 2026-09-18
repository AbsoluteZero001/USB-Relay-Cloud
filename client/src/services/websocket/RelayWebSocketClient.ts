import {parseRelayWebSocketMessage,} from "./message";

import type {RelayWebSocketMessage, WebSocketStatus,} from "@/types/api";

type MessageListener = (message: RelayWebSocketMessage) => void;
type StatusListener = (status: WebSocketStatus) => void;
type TokenProvider = () => string | null;

const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

export class RelayWebSocketClient {
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempt = 0;
  private intentionallyClosed = false;
  private status: WebSocketStatus = "idle";
  private afterSequence = 0;
    private authenticated = false;
  private readonly messageListeners = new Set<MessageListener>();
  private readonly statusListeners = new Set<StatusListener>();

    constructor(
        private readonly baseUrl: string | (() => string),
        private readonly getToken: TokenProvider = () => null,
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
      this.authenticated = false;
    this.setStatus("disconnected");
  }

  updateAfterSequence(sequence: number): void {
    this.afterSequence = Math.max(this.afterSequence, sequence);
  }

    isAuthenticated(): boolean {
        return this.authenticated;
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
      const token = this.getToken();
      if (!token) {
          // 未登录时不连接；由调用方在登录后再次调用 connect()
          this.authenticated = false;
          this.setStatus("disconnected");
          return;
      }
      this.authenticated = false;
    this.setStatus(
      this.reconnectAttempt === 0 ? "connecting" : "reconnecting",
    );

    const socket = new WebSocket(this.buildUrl(this.afterSequence));
    this.socket = socket;

    socket.addEventListener("open", () => {
      if (socket !== this.socket) return;
      this.reconnectAttempt = 0;
        // 立即发送 AUTH 帧；服务端验证通过后才会推送业务数据
        this.sendAuthFrame(token);
        // 连接已建立但未认证；等收到 AUTHENTICATED 才视为真正可用
      this.setStatus("connected");
    });

    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      try {
        const message = parseRelayWebSocketMessage(event.data);
          if (message.type === "AUTHENTICATED") {
              this.authenticated = true;
              for (const listener of this.messageListeners) {
                  listener(message);
              }
              return;
          }
          if (message.type === "AUTH_FAILED") {
              console.warn(
                  "WebSocket AUTH_FAILED:",
                  message.message ?? "token rejected",
              );
              this.authenticated = false;
              // 鉴权失败不重连，避免循环；交由上层处理（重新登录）
              this.intentionallyClosed = true;
              socket.close(1008, "auth failed");
              this.setStatus("disconnected");
              return;
          }
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
        this.authenticated = false;
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

    private sendAuthFrame(token: string): void {
        const frame = JSON.stringify({type: "AUTH", token});
        this.socket?.send(frame);
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
