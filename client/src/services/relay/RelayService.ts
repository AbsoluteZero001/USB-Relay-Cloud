import { createRelayEvent } from "@/api/eventApi";
import {
  getRelayRuntime,
  type RelayRuntime,
} from "./serial";
import { createSerialAdapter } from "./serial";
import { CloudRelayProvider } from "./providers/CloudRelayProvider";
import {
  LocalRelayProvider,
} from "./providers/LocalRelayProvider";
import type {
  CloudSyncStatus,
  RelayAction,
  RelayExecutionResult,
  RelayEvent,
  RelayStateValue,
} from "@/types/api";

const CLIENT_ID_STORAGE_KEY = "usb-relay-cloud-client-id";

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clientId(): string {
  if (typeof localStorage === "undefined") {
    return `runtime-${createId()}`;
  }
  const existing = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
  if (existing) return existing;
  const created = `${getRelayRuntime()}-${createId()}`;
  localStorage.setItem(CLIENT_ID_STORAGE_KEY, created);
  return created;
}

export class RelayService {
  private readonly localProvider = new LocalRelayProvider(
    createSerialAdapter(),
  );
  private readonly cloudProvider = new CloudRelayProvider();

  getRuntime(): RelayRuntime {
    return getRelayRuntime();
  }

  isLocalControlSupported(): boolean {
    return this.localProvider.isAvailable();
  }

  isLocalControlConnected(): boolean {
    return this.localProvider.getStatus().connected;
  }

  getLocalStatus() {
    return this.localProvider.getStatus();
  }

  getLastLocalCommand() {
    return this.localProvider.getLastCommand();
  }

  onLocalStatusChange(
    listener: (status: ReturnType<LocalRelayProvider["getStatus"]>) => void,
  ): () => void {
    return this.localProvider.onStatusChange(listener);
  }

  listLocalPorts() {
    return this.localProvider.listPorts();
  }

  requestLocalPort() {
    return this.localProvider.requestPort();
  }

  connectLocal(portId: string): Promise<void> {
    return this.localProvider.connect(portId);
  }

  disconnectLocal(): Promise<void> {
    return this.localProvider.disconnect();
  }

  async executeLocalCommand(
    deviceId: string,
    channel: number,
    action: RelayAction,
  ): Promise<RelayExecutionResult> {
    const previousState = this.localProvider.getLastCommand().commandedState;
    const eventId = createId();
    const execution = await this.localProvider.execute({
      eventId,
      deviceId,
      channel,
      action,
      previousState,
      clientId: clientId(),
    });

    let cloudSyncStatus: CloudSyncStatus = "FAILED";
    let cloudSyncMessage: string | null = null;
    let cloudEvent: RelayEvent | null = null;
    try {
      cloudEvent = await createRelayEvent(deviceId, {
        eventId,
        channel,
        action,
        previousState,
        currentState: action,
        commandStatus: "SUCCESS",
        source: this.localProvider.getSource(),
        clientId: clientId(),
      });
      cloudSyncStatus = "SUCCESS";
    } catch (error) {
      cloudSyncMessage =
        error instanceof Error ? error.message : "云端事件上传失败";
    }

    const commandedState: RelayStateValue = action;
    return {
      commandId: eventId,
      deviceId,
      channel,
      commandedState,
      commandStatus: execution.commandedState === action
        ? "SUCCESS"
        : "FAILED",
      hardwareState: "UNKNOWN",
      localWriteSucceeded: true,
      cloudSyncStatus,
      cloudSyncMessage,
      cloudEvent,
    };
  }
}
