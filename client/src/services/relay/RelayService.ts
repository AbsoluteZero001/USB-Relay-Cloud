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
import {EventOutbox, type OutboxFlushSummary} from "./EventOutbox";
import type {
  CloudSyncStatus,
    CommandStatus,
  RelayAction,
  RelayExecutionResult,
  RelayEvent,
    RelayEventCreatePayload,
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
    private readonly eventOutbox = new EventOutbox();

  getRuntime(): RelayRuntime {
    return getRelayRuntime();
  }

    /**
     * Phase 8：本地待同步事件队列的对外接口。
     * 重连 / 启动 / 用户手动重试时由调用方触发。
     */
    flushOutbox(): Promise<OutboxFlushSummary> {
        return this.eventOutbox.flush();
    }

    outboxSize(): number {
        return this.eventOutbox.size();
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
      const source = this.localProvider.getSource();
      const callerId = clientId();

      // spec §4：USB 写入成功→生成 relay_event→POST；spec §19：FAILED
      // 事件也要上传到 relay_event，但服务端不会更新 relay_state。
      // 因此本地写入失败时仍以 commandStatus=FAILED 上传，便于日志记录。
      let localWriteSucceeded = false;
      let commandStatus: CommandStatus = "FAILED";
      let cloudSyncMessage: string | null = null;

      try {
          await this.localProvider.execute({
              eventId,
              deviceId,
              channel,
              action,
              previousState,
              clientId: callerId,
          });
          localWriteSucceeded = true;
          commandStatus = "SUCCESS";
      } catch (error) {
          cloudSyncMessage = error instanceof Error
              ? error.message
              : "本地 USB 写入失败";
      }

      // Phase 8：先入队（持久化），再立即 POST；
      // 200 → 出队；失败 → 保留在队列，等重连/启动重试。
      // 幂等：服务端 relay_event.event_id UNIQUE 保证重复 POST 安全。
      const payload: RelayEventCreatePayload = {
          eventId,
          channel,
          action,
          previousState,
          currentState: action,
          commandStatus,
          source,
          clientId: callerId,
      };
      this.eventOutbox.enqueue(deviceId, payload);

      let cloudSyncStatus: CloudSyncStatus = "FAILED";
      let cloudEvent: RelayEvent | null = null;
      try {
          cloudEvent = await createRelayEvent(deviceId, payload);
      cloudSyncStatus = "SUCCESS";
          this.eventOutbox.remove(eventId);
    } catch (error) {
          const uploadError = error instanceof Error
              ? error.message
              : "云端事件上传失败";
          cloudSyncMessage = cloudSyncMessage ?? uploadError;
    }

    return {
      commandId: eventId,
      deviceId,
      channel,
        commandedState: action,
        commandStatus,
      hardwareState: "UNKNOWN",
        localWriteSucceeded,
      cloudSyncStatus,
      cloudSyncMessage,
      cloudEvent,
    };
  }
}
