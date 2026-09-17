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

afterEach(() => {
  FakeSocket.instances = [];
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("RelayWebSocketClient", () => {
  it("adds afterSequence and dispatches typed messages", () => {
    vi.stubGlobal("WebSocket", FakeSocket);
    const client = new RelayWebSocketClient(
      "ws://localhost:8080/ws/relay",
    );
    const listener = vi.fn();
    client.onMessage(listener);

    client.connect(37);
    const socket = FakeSocket.instances[0];
    expect(socket?.url).toContain("afterSequence=37");

    socket?.open();
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

  it("reconnects with exponential backoff after an unexpected close", () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeSocket);
    const client = new RelayWebSocketClient(
      "ws://localhost:8080/ws/relay",
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
