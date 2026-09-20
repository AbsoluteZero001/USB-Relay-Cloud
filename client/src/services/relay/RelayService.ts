import {createHardwareEvent} from "@/api/hardwareEventApi";
import {createRelayEvent} from "@/api/eventApi";
import {createSerialAdapter, getRelayRuntime, type RelayRuntime,} from "./serial";
import {CloudRelayProvider} from "./providers/CloudRelayProvider";
import {LocalRelayProvider,} from "./providers/LocalRelayProvider";
import {
    getPlatformDebugInfo,
    hardwareLog,
    type HardwareLogEntry,
    type PlatformDebugInfo,
} from "./diagnostics";
import type {HardwareStatus} from "./hardware/HardwareStatus";
import type {RelayHardwareProfile} from "./hardware/HardwareProfile";
import {EventOutbox, type OutboxFlushSummary} from "./EventOutbox";
import type {
    CloudSyncStatus,
    CommandStatus,
    HardwareEventCreatePayload,
    HardwareEventType,
    RelayAction,
    RelayEvent,
    RelayEventCreatePayload,
    RelayExecutionResult,
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

    constructor() {
        // 订阅本地硬件生命周期事件，上报到服务端 hardware_event 表。
        // 仅当已设置 deviceId（用户选择了设备）时才真正 POST。
        this.localProvider.onHardwareEvent((eventType, context) => {
            void this.reportHardwareEvent(eventType, context);
        });
    }

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

    /**
     * 适配器是否支持「选择新设备」。
     * Web Serial 必须由用户手势触发 requestPort()，Android 则是申请 USB 权限。
     */
    supportsPortRequest(): boolean {
        return this.localProvider.supportsPortRequest();
    }

    /** 当前运行平台（android / electron / web）与 Capacitor 判定结果。 */
    getPlatform(): PlatformDebugInfo {
        return getPlatformDebugInfo();
    }

    /** 硬件层调试日志（扫描 / 授权 / 打开 / 写入 / 异常）。 */
    getDiagnostics(): readonly HardwareLogEntry[] {
        return hardwareLog.list();
    }

    onDiagnostics(
        listener: (entries: readonly HardwareLogEntry[]) => void,
    ): () => void {
        return hardwareLog.subscribe(listener);
    }

    clearDiagnostics(): void {
        hardwareLog.clear();
    }

  isLocalControlConnected(): boolean {
      return this.localProvider.isHardwareConnected();
  }

    isHardwareConnected(): boolean {
        return this.localProvider.isHardwareConnected();
    }

    isCommandExecuting(): boolean {
        return this.localProvider.isCommandExecuting();
  }

  getLocalStatus() {
    return this.localProvider.getStatus();
  }

    getHardwareStatus(): HardwareStatus {
        return this.localProvider.getHardwareStatus();
    }

  getLastLocalCommand() {
    return this.localProvider.getLastCommand();
  }

  onLocalStatusChange(
    listener: (status: ReturnType<LocalRelayProvider["getStatus"]>) => void,
  ): () => void {
    return this.localProvider.onStatusChange(listener);
  }

    onHardwareStatusChange(
        listener: (status: HardwareStatus) => void,
    ): () => void {
        return this.localProvider.onHardwareStatusChange(listener);
    }

  listLocalPorts() {
    return this.localProvider.listPorts();
  }

    scanAndMatch(): Promise<
        {
            port: import("./serial/types").SerialPortInfo;
            profile: RelayHardwareProfile | null;
            generic: boolean;
        }[]
    > {
        return this.localProvider.scanAndMatch();
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

    /**
     * 设置当前关联的云端设备 ID。
     * 硬件生命周期事件（USB_ATTACHED / CONNECTED 等）只有在设置了 deviceId 后才会上报服务端。
     */
    setLocalDeviceId(deviceId: string | null): void {
        this.localProvider.setDeviceId(deviceId);
    }

    /**
     * 上报硬件生命周期事件到服务端 hardware_event 表。
     * 与 relay_event 完全独立，绝不把 USB 拔出伪装成 relay OFF。
     */
    private async reportHardwareEvent(
        eventType: HardwareEventType,
        context: {
            port?: import("./serial/types").SerialPortInfo | null;
            profile?: RelayHardwareProfile | null;
            errorCode?: string | null;
            errorMessage?: string | null;
        },
    ): Promise<void> {
        const deviceId = this.localProvider.getDeviceId();
        if (!deviceId) {
            return;
        }
        const port = context.port ?? null;
        const profile = context.profile ?? null;
        const payload: HardwareEventCreatePayload = {
            eventId: createId(),
            eventType,
            source: this.localProvider.getSource(),
            clientId: clientId(),
            profileName: profile?.name ?? null,
            serialDevice: port?.device ?? null,
            vendorId: port?.vendorId ?? null,
            productId: port?.productId ?? null,
            baudRate: profile?.baudRate ?? null,
            dataBits: profile?.dataBits ?? null,
            stopBits: profile?.stopBits ?? null,
            parity: profile?.parity ?? null,
            channel: profile?.channels ?? null,
            errorCode: context.errorCode ?? null,
            errorMessage: context.errorMessage ?? null,
        };
        try {
            await createHardwareEvent(deviceId, payload);
        } catch {
            // 硬件事件上报失败不影响控制流程；V1 不做重试队列。
        }
    }

    /**
     * 执行本地继电器指令并同步云端。
     *
     * 严格语义（spec §4 / §10）：
     * - 仅当本地硬件 CONNECTED 才尝试 USB 写入；否则直接 FAILED，不调用 write。
     * - 写入成功 → commandedState=action、commandStatus=SUCCESS、POST 事件。
     * - 写入失败 → commandedState=previousState（保持原值，不 optimistic update）、
     *   commandStatus=FAILED、仍 POST FAILED 事件用于日志，但服务端不更新 relay_state。
     * - 云端 commandedState 与本地硬件连接状态相互独立：
     *   本地断开不会生成假的 OFF，也不会修改云端最后指令。
     */
  async executeLocalCommand(
    deviceId: string | null,
    channel: number,
    action: RelayAction,
  ): Promise<RelayExecutionResult> {
        const previousState: RelayStateValue =
            this.localProvider.getLastCommand().commandedState;
    const eventId = createId();
      const source = this.localProvider.getSource();
      const callerId = clientId();

      let localWriteSucceeded = false;
      let commandStatus: CommandStatus = "FAILED";
      let cloudSyncMessage: string | null = null;

        // spec §4 step 3：RelayService 先检查 hardware provider 是否 CONNECTED。
        if (!this.localProvider.isHardwareConnected()) {
            cloudSyncMessage = `本地硬件未连接，无法执行 ${action} 指令`;
        } else {
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
        }

      // Phase 8：先入队（持久化），再立即 POST；
      // 200 → 出队；失败 → 保留在队列，等重连/启动重试。
      // 幂等：服务端 relay_event.event_id UNIQUE 保证重复 POST 安全。
        // 只有「真正尝试过写串口」的指令才上传事件：
        // 本地没有写入（串口未连接 / 设备已被拔出）时不上传，
        // 否则会出现「没有硬件却产生控制日志与广播」的假记录。
        if (!localWriteSucceeded && !this.localProvider.isHardwareConnected()) {
            hardwareLog.warn(
                "云端同步跳过",
                `reason=SERIAL_NOT_CONNECTED action=${action} `
                + "本地未写入任何字节，未上传 relay_event",
            );
            return {
                commandId: eventId,
                deviceId,
                channel,
                commandedState: previousState,
                commandStatus,
                hardwareState: "UNKNOWN",
                localWriteSucceeded: false,
                cloudSyncStatus: "NOT_REQUIRED",
                cloudSyncMessage:
                    cloudSyncMessage ?? "本地串口未连接，指令未发送（未上传云端）",
                cloudEvent: null,
            };
        }

        // currentState 表示「本次尝试的目标状态」，必须与 action 一致：
        // 服务端会校验二者相同，但只对 commandStatus=SUCCESS 更新 relay_state，
        // 因此 FAILED 事件只是审计记录，不会伪造硬件状态。
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

      // 未关联云端设备：本地串口写入已经完成，直接返回。
      // 本地硬件控制与 Cloud Sync 是两层，缺少云端 deviceId
      // 绝不能阻止用户操作继电器。
      if (!deviceId) {
          hardwareLog.info(
              "云端同步跳过",
              `reason=NO_CLOUD_DEVICE action=${action} `
              + `localWriteSucceeded=${localWriteSucceeded}`,
          );
          return {
              commandId: eventId,
              deviceId: null,
              channel,
              commandedState: localWriteSucceeded ? action : previousState,
              commandStatus,
              hardwareState: "UNKNOWN",
              localWriteSucceeded,
              cloudSyncStatus: "NOT_REQUIRED",
              cloudSyncMessage: localWriteSucceeded
                  ? "本地控制已完成，未关联云端设备（未上传）"
                  : cloudSyncMessage,
              cloudEvent: null,
          };
      }

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
        commandedState: localWriteSucceeded ? action : previousState,
        commandStatus,
      hardwareState: "UNKNOWN",
        localWriteSucceeded,
      cloudSyncStatus,
      cloudSyncMessage,
      cloudEvent,
    };
  }
}
