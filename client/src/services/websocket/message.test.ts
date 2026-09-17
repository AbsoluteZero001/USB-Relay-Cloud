import { describe, expect, it } from "vitest";

import {
  parseRelayWebSocketMessage,
  websocketMessageToRelayEvent,
} from "./message";

describe("WebSocket message mapping", () => {
  it("parses and maps RELAY_STATE_CHANGED", () => {
    const raw = JSON.stringify({
      type: "RELAY_STATE_CHANGED",
      sequence: 42,
      eventId: "00000000-0000-4000-8000-000000000001",
      deviceId: "relay-001",
      channel: 1,
      commandedState: "ON",
      commandStatus: "SUCCESS",
      hardwareState: "UNKNOWN",
      previousState: "OFF",
      currentState: "ON",
      action: "ON",
      source: "ANDROID",
      clientId: "android-tablet-001",
      timestamp: "2026-09-17T14:32:18Z",
    });

    const message = parseRelayWebSocketMessage(raw);
    const event = websocketMessageToRelayEvent(message);

    expect(event).toMatchObject({
      sequence: 42,
      deviceId: "relay-001",
      previousState: "OFF",
      currentState: "ON",
      hardwareState: "UNKNOWN",
      commandStatus: "SUCCESS",
    });
  });

  it("rejects malformed or unsupported messages", () => {
    expect(() => parseRelayWebSocketMessage("not-json"))
      .toThrow("valid JSON");
    expect(() =>
      parseRelayWebSocketMessage(JSON.stringify({ type: "UNKNOWN" })),
    ).toThrow("Unsupported");
  });

  it("returns null when required relay event fields are missing", () => {
    const event = websocketMessageToRelayEvent({
      type: "RELAY_STATE_CHANGED",
      sequence: 1,
      deviceId: "relay-001",
    });
    expect(event).toBeNull();
  });
});
