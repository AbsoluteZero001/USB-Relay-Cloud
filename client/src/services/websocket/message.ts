import type {
  RelayEvent,
  RelayWebSocketMessage,
} from "@/types/api";

const MESSAGE_TYPES = new Set<RelayWebSocketMessage["type"]>([
  "CONNECTED",
  "RELAY_STATE_CHANGED",
  "DEVICE_STATUS_CHANGED",
  "SYNC_COMPLETE",
  "ERROR",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseRelayWebSocketMessage(
  raw: string,
): RelayWebSocketMessage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("WebSocket message is not valid JSON");
  }
  if (!isRecord(parsed) || typeof parsed.type !== "string") {
    throw new Error("WebSocket message does not contain a type");
  }
  if (!MESSAGE_TYPES.has(parsed.type as RelayWebSocketMessage["type"])) {
    throw new Error(`Unsupported WebSocket message type: ${parsed.type}`);
  }
  return parsed as unknown as RelayWebSocketMessage;
}

export function websocketMessageToRelayEvent(
  message: RelayWebSocketMessage,
): RelayEvent | null {
  if (
    message.type !== "RELAY_STATE_CHANGED" ||
    typeof message.sequence !== "number" ||
    !message.eventId ||
    !message.deviceId ||
    typeof message.channel !== "number" ||
    !message.action ||
    !message.previousState ||
    !message.currentState ||
    !message.commandStatus ||
    !message.source ||
    !message.clientId ||
    !message.timestamp
  ) {
    return null;
  }
  return {
    sequence: message.sequence,
    eventId: message.eventId,
    deviceId: message.deviceId,
    channel: message.channel,
    action: message.action,
    previousState: message.previousState,
    currentState: message.currentState,
    commandStatus: message.commandStatus,
    source: message.source,
    clientId: message.clientId,
    hardwareState: message.hardwareState ?? "UNKNOWN",
    createdAt: message.timestamp,
    idempotentReplay: false,
  };
}
