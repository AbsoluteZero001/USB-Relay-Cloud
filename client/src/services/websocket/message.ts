import type {HardwareEvent, RelayEvent, RelayWebSocketMessage,} from "@/types/api";

const MESSAGE_TYPES = new Set<RelayWebSocketMessage["type"]>([
  "CONNECTED",
  "RELAY_STATE_CHANGED",
  "DEVICE_STATUS_CHANGED",
  "SYNC_COMPLETE",
    "HARDWARE_EVENT",
  "ERROR",
    "AUTHENTICATED",
    "AUTH_FAILED",
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

export function websocketMessageToHardwareEvent(
    message: RelayWebSocketMessage,
): HardwareEvent | null {
    if (
        message.type !== "HARDWARE_EVENT" ||
        typeof message.sequence !== "number" ||
        !message.eventId ||
        !message.deviceId ||
        !message.hardwareEventType ||
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
        eventType: message.hardwareEventType,
        source: message.source,
        clientId: message.clientId,
        profileName: message.hardwareProfileName ?? null,
        serialDevice: message.hardwareSerialDevice ?? null,
        vendorId: message.hardwareVendorId ?? null,
        productId: message.hardwareProductId ?? null,
        baudRate: message.hardwareBaudRate ?? null,
        dataBits: message.hardwareDataBits ?? null,
        stopBits: message.hardwareStopBits ?? null,
        parity: message.hardwareParity ?? null,
        channel: message.channel ?? null,
        actorUserId: null,
        actorUsername: null,
        actorClientId: null,
        executorClientId: null,
        errorCode: message.hardwareErrorCode ?? null,
        errorMessage: message.hardwareErrorMessage ?? null,
        createdAt: message.timestamp,
        idempotentReplay: false,
    };
}
