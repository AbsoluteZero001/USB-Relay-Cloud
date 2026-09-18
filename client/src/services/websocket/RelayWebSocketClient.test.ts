import { afterEach, describe, expect, it, vi } from "vitest";

import { RelayWebSocketClient } from "./RelayWebSocketClient";

class FakeSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instances: FakeSocket[] = [];

  readonly url: string;
  readyState = FakeSocket.CONNECTING;
    readonly sent: string[] = [];
  private readonly listeners = new Map<string, Set<(event: Event) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

    send(data: string): void {
        this.sent.push(data);
    }

  close(code = 1000, reason = ""): void {
    this.readyState = FakeSocket.CLOSED;
    this.emit("close", new CloseEvent("close", { code, reason }));
  }

  serverClose(): void {
    this.readyState = FakeSocket.CLOSED;
    this.emit("close", new CloseEvent("close", { code: 1006 }));
  }

  open(): void {
    this.readyState = FakeSocket.OPEN;
    this.emit("open", new Event("open"));
  }

  message(data: string): void {
    this.emit("message", new MessageEvent("message", { data }));
  }

  private emit(type: string, event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

const FAKE_TOKEN = "fake-jwt-token";

afterEach(() => {
  FakeSocket.instances = [];
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("RelayWebSocketClient", () => {
    it("sends AUTH frame on open and dispatches business messages", () => {
    vi.stubGlobal("WebSocket", FakeSocket);
    const client = new RelayWebSocketClient(
      "ws://localhost:8080/ws/relay",
        () => FAKE_TOKEN,
    );
    const listener = vi.fn();
    client.onMessage(listener);

    client.connect(37);
    const socket = FakeSocket.instances[0];
    expect(socket?.url).toContain("afterSequence=37");

    socket?.open();
        // 客户端应在 open 后立即发送 AUTH 帧
        expect(socket?.sent).toContain(
            JSON.stringify({type: "AUTH", token: FAKE_TOKEN}),
        );

        socket?.message(
            JSON.stringify({
                type: "AUTHENTICATED",
                message: "authenticated as admin",
                timestamp: "2026-09-17T14:32:18Z",
            }),
        );
        expect(client.isAuthenticated()).toBe(true);

    socket?.message(
      JSON.stringify({
        type: "SYNC_COMPLETE",
        sequence: 37,
        timestamp: "2026-09-17T14:32:18Z",
      }),
    );

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SYNC_COMPLETE", sequence: 37 }),
    );
  });

    it("disconnects on AUTH_FAILED without reconnecting", () => {
        vi.useFakeTimers();
        vi.stubGlobal("WebSocket", FakeSocket);
        const client = new RelayWebSocketClient(
            "ws://localhost:8080/ws/relay",
            () => FAKE_TOKEN,
        );
        const status = vi.fn();
        client.onStatus(status);

        client.connect();
        FakeSocket.instances[0]?.open();
        FakeSocket.instances[0]?.message(
            JSON.stringify({
                type: "AUTH_FAILED",
                message: "JWT 无效或已过期",
                timestamp: "2026-09-17T14:32:18Z",
            }),
        );

        expect(status).toHaveBeenLastCalledWith("disconnected");
        expect(client.isAuthenticated()).toBe(false);

        // AUTH_FAILED 不应触发重连
        vi.advanceTimersByTime(30_000);
        expect(FakeSocket.instances).toHaveLength(1);
    });

    it("does not open socket when no token is available", () => {
        vi.stubGlobal("WebSocket", FakeSocket);
        const client = new RelayWebSocketClient(
            "ws://localhost:8080/ws/relay",
            () => null,
        );
        const status = vi.fn();
        client.onStatus(status);

        client.connect();
        expect(FakeSocket.instances).toHaveLength(0);
        expect(status).toHaveBeenLastCalledWith("disconnected");
    });

  it("reconnects with exponential backoff after an unexpected close", () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeSocket);
    const client = new RelayWebSocketClient(
      "ws://localhost:8080/ws/relay",
        () => FAKE_TOKEN,
    );
    const status = vi.fn();
    client.onStatus(status);

    client.connect();
    FakeSocket.instances[0]?.serverClose();
    expect(status).toHaveBeenLastCalledWith("reconnecting");

    vi.advanceTimersByTime(1_000);
    expect(FakeSocket.instances).toHaveLength(2);
  });
});
