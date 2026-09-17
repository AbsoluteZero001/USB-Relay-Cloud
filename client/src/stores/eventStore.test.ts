import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";

import { useEventStore } from "./eventStore";
import { useRelayStore } from "./relayStore";

import type { RelayAction, RelayEvent } from "@/types/api";

function event(
  sequence: number,
  eventId: string,
  action: RelayAction,
): RelayEvent {
  return {
    sequence,
    eventId,
    deviceId: "relay-001",
    channel: 1,
    action,
    previousState: action === "ON" ? "OFF" : "ON",
    currentState: action,
    commandStatus: "SUCCESS",
    source: "ANDROID",
    clientId: "android-tablet-001",
    hardwareState: "UNKNOWN",
    createdAt: "2026-09-17T14:32:18Z",
    idempotentReplay: false,
  };
}

describe("relay stores", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("deduplicates events by eventId", () => {
    const store = useEventStore();
    const first = event(
      1,
      "00000000-0000-4000-8000-000000000001",
      "ON",
    );

    expect(store.appendEvent(first)).toBe(true);
    expect(store.appendEvent(first)).toBe(false);
    expect(store.events).toHaveLength(1);
    expect(store.latestSequence).toBe(1);
  });

  it("applies commands and ignores stale websocket events", () => {
    const store = useRelayStore();
    store.applyEvent(
      event(10, "00000000-0000-4000-8000-000000000010", "ON"),
    );
    store.applyEvent(
      event(8, "00000000-0000-4000-8000-000000000008", "OFF"),
    );

    expect(store.stateFor("relay-001", 1)).toMatchObject({
      commandedState: "ON",
      hardwareState: "UNKNOWN",
      lastEventSequence: 10,
    });
  });
});
