import {
    describeUnsupportedPort,
    matchHardwareProfile,
    type RelayHardwareProfile,
} from "../hardware/HardwareProfile";
import {type HardwareConnectionState, hardwareStateLabel, type HardwareStatus,} from "../hardware/HardwareStatus";
import {formatHardwareError, hardwareLog} from "../diagnostics";
import type {SerialAdapter} from "../serial/SerialAdapter";
import type {
    SerialDeviceChange,
    SerialPortInfo,
    SerialStatus,
} from "../serial/types";
import type {RelayProvider, RelayProviderCommand, RelayProviderExecution,} from "./RelayProvider";

import type {CommandStatus, EventSource, HardwareEventType, RelayAction, RelayStateValue,} from "@/types/api";

/** 硬件生命周期事件上下文，用于上报到服务端 hardware_event。 */
export interface HardwareEventContext {
    port?: SerialPortInfo | null;
    profile?: RelayHardwareProfile | null;
    errorCode?: string | null;
    errorMessage?: string | null;
}

/** 硬件事件监听器签名。 */
export type HardwareEventListener = (
    eventType: HardwareEventType,
    context: HardwareEventContext,
) => void;

function errorMessage(error: unknown): string {
    return formatHardwareError(error) || "本地 USB 操作失败";
}

/**
 * 本地 USB 继电器 Provider。
 *
 * 严格状态约束（修复历史 Bug）：
 * - 只有 hardwareState === CONNECTED 才允许执行指令。
 * - 执行指令前必须匹配到受支持的 HardwareProfile。
 * - USB 写入成功后才更新本地 commandedState；写入失败保持原状态，
 *   不产生假 SUCCESS，不改云端 relay_state。
 * - LCUS-1 无已验证状态回读，hardwareState 始终为 UNKNOWN。
 *
 * 云端 commandedState 与本地硬件连接状态是两个独立概念：
 * - 本地硬件断开不会修改云端最后指令，也不生成假的 OFF 事件。
 */
export class LocalRelayProvider implements RelayProvider {
  readonly id = "LOCAL" as const;

  private commandedState: RelayStateValue = "UNKNOWN";
  private commandStatus: CommandStatus | null = null;
    private commandExecuting = false;
    private matchedProfile: RelayHardwareProfile | null = null;
    private lastPorts: SerialPortInfo[] = [];

    private hardwareState: HardwareConnectionState = "DISCONNECTED";
    private hardwareErrorCode: string | null = null;
    private hardwareErrorDetail: string | null = null;

    /** 当前关联的云端设备 ID；设置后才能上报 hardware_event。 */
    private deviceId: string | null = null;

    private adapterSubscribed = false;
    private deviceChangeSubscribed = false;
    private lastHardwareEventKey: string | null = null;
    private readonly statusListeners = new Set<(status: SerialStatus) => void>();
    private readonly hardwareListeners = new Set<(status: HardwareStatus) => void>();
    private readonly hardwareEventListeners = new Set<HardwareEventListener>();

    constructor(private readonly adapter: SerialAdapter) {
    }

  isAvailable(): boolean {
    return this.adapter.isSupported();
  }

    /** 适配器是否支持「选择新设备」（Web Serial requestPort / Android 授权）。 */
    supportsPortRequest(): boolean {
        return typeof (this.adapter as SerialAdapter & {
            requestPort?: unknown;
        }).requestPort === "function";
    }

    async listPorts(): Promise<SerialPortInfo[]> {
        const ports = await this.adapter.listPorts();
        this.lastPorts = ports;
        return ports;
  }

    /**
     * 扫描 USB 设备并尝试匹配受支持的 HardwareProfile。
     * 返回每个端口及其匹配到的配置（未匹配则为 null）。
     * 同时更新硬件状态机：DETECTED / UNSUPPORTED / DISCONNECTED。
     */
    async scanAndMatch(): Promise<
        { port: SerialPortInfo; profile: RelayHardwareProfile | null }[]
    > {
        this.trySubscribeDeviceChange();
        // 重新扫描不能破坏已经建立的连接：只要当前串口仍在列表中，
        // 扫描结束后必须回到 CONNECTED，而不是降级为 DETECTED。
        const wasConnected = this.hardwareState === "CONNECTED";
        const connectedPortId = wasConnected
            ? this.adapter.getStatus().port
            : null;
        this.hardwareState = "SCANNING";
        this.hardwareErrorCode = null;
        this.hardwareErrorDetail = null;
        this.emitHardwareStatus();

        let ports: SerialPortInfo[];
        try {
            ports = await this.adapter.listPorts();
        } catch (error) {
            this.lastPorts = [];
            this.hardwareState = "ERROR";
            this.hardwareErrorCode = "SCAN_FAILED";
            this.hardwareErrorDetail = errorMessage(error);
            hardwareLog.error("扫描 USB 设备失败", this.hardwareErrorDetail);
            this.emitHardwareStatus();
            throw error;
        }
        this.lastPorts = ports;
        const matched = ports.map((port) => ({
            port,
            profile: matchHardwareProfile(port),
        }));
        const hasMatch = matched.some((entry) => entry.profile);
        const connectedStillPresent = wasConnected
            && !!connectedPortId
            && ports.some((port) => port.port === connectedPortId);
        if (connectedStillPresent) {
            this.hardwareState = "CONNECTED";
        } else if (ports.length === 0) {
            this.hardwareState = "DISCONNECTED";
        } else if (hasMatch) {
            this.hardwareState = "DETECTED";
            // 检测到受支持的 USB 设备 → 上报 USB_ATTACHED
            const matchedEntry = matched.find((entry) => entry.profile);
            if (matchedEntry) {
                // 扫描阶段就记录匹配到的配置，UI 可在连接前显示设备型号。
                this.matchedProfile = matchedEntry.profile;
                this.emitHardwareEvent("USB_ATTACHED", {
                    port: matchedEntry.port,
                    profile: matchedEntry.profile,
                });
            }
        } else {
            this.hardwareState = "UNSUPPORTED";
            this.matchedProfile = null;
            this.hardwareErrorCode = "UNSUPPORTED_DEVICE";
            const firstPort = ports[0];
            this.hardwareErrorDetail = firstPort
                ? `${describeUnsupportedPort(firstPort)}（需要 CH340 + LCUS-1）`
                : "检测到 USB 设备，但未找到兼容串口驱动";
            // 检测到不支持的 USB 设备 → 上报 UNSUPPORTED_DEVICE
            if (firstPort) {
                this.emitHardwareEvent("UNSUPPORTED_DEVICE", {
                    port: firstPort,
                    profile: null,
                });
            }
        }
        hardwareLog.info(
            "USB 扫描完成",
            `设备数=${ports.length} 已匹配配置=${matched.filter((m) => m.profile).length} `
            + `状态=${this.hardwareState}`,
        );
        this.emitHardwareStatus();
        return matched;
    }

    async requestPort(): Promise<SerialPortInfo> {
    const requestable = this.adapter as SerialAdapter & {
      requestPort?: () => Promise<SerialPortInfo>;
    };
    if (requestable.requestPort) {
        const port = await requestable.requestPort();
        // 刷新端口缓存，保证 connect() 能匹配到 profile
        try {
            this.lastPorts = await this.adapter.listPorts();
        } catch {
            // 保留 requestPort 返回的端口信息
            this.lastPorts = this.lastPorts.includes(port)
                ? this.lastPorts
                : [...this.lastPorts, port];
        }
        return port;
    }
        const matched = await this.scanAndMatch();
        const supported = matched.find((entry) => entry.profile);
        if (!supported) {
            throw new Error("未发现受支持的 USB 继电器");
        }
        return supported.port;
  }

  async connect(portId: string): Promise<void> {
      let port = this.lastPorts.find((entry) => entry.port === portId) ?? null;
      if (!port) {
          try {
              this.lastPorts = await this.adapter.listPorts();
              port = this.lastPorts.find((entry) => entry.port === portId) ?? null;
          } catch {
              // 忽略列举失败，继续以无 profile 处理
          }
      }
      const profile = port ? matchHardwareProfile(port) : null;
      if (!profile) {
          this.matchedProfile = null;
          this.hardwareState = "UNSUPPORTED";
          this.hardwareErrorCode = "UNSUPPORTED_DEVICE";
          this.hardwareErrorDetail = port
              ? `${describeUnsupportedPort(port)}（需要 CH340 + LCUS-1）`
              : "未检测到受支持的 USB 继电器（需要 CH340 + LCUS-1）";
          hardwareLog.warn("连接被拒绝", this.hardwareErrorDetail);
          this.emitHardwareStatus();
          throw new Error(this.hardwareErrorDetail);
      }
      this.matchedProfile = profile;
      this.hardwareState = "CONNECTING";
      this.hardwareErrorCode = null;
      this.hardwareErrorDetail = null;
      this.emitHardwareStatus();
      try {
          await this.adapter.connect(portId, {
              baudRate: profile.baudRate,
              dataBits: profile.dataBits,
              stopBits: profile.stopBits,
              parity: profile.parity,
              flowControl: profile.flowControl,
          });
          this.hardwareState = "CONNECTED";
          this.commandedState = "UNKNOWN";
          this.commandStatus = null;
          this.hardwareErrorCode = null;
          this.hardwareErrorDetail = null;
          this.emitHardwareStatus();
          // 串口成功打开 → 上报 USB_CONNECTED
          this.emitHardwareEvent("USB_CONNECTED", {
              port,
              profile,
          });
          hardwareLog.info(
              "USB 继电器已连接",
              `${profile.name} · ${profile.baudRate} `
              + `${profile.dataBits}${profile.parity === "none"
                  ? "N"
                  : profile.parity.toUpperCase()[0]}${profile.stopBits}`,
          );
      } catch (error) {
          this.hardwareState = "ERROR";
          this.hardwareErrorCode = "SERIAL_OPEN_FAILED";
          this.hardwareErrorDetail = errorMessage(error);
          hardwareLog.error("打开串口失败", this.hardwareErrorDetail);
          this.emitHardwareStatus();
          // 串口打开失败 → 上报 USB_OPEN_FAILED
          this.emitHardwareEvent("USB_OPEN_FAILED", {
              port,
              profile,
              errorCode: "SERIAL_OPEN_FAILED",
              errorMessage: errorMessage(error),
          });
          throw error;
      }
  }

  async disconnect(): Promise<void> {
      const profile = this.matchedProfile;
      const port = this.lastPorts.find((p) => p.isCurrent) ?? null;
      try {
          await this.adapter.disconnect();
      } finally {
          this.commandedState = "UNKNOWN";
          this.commandStatus = null;
          this.matchedProfile = null;
          this.hardwareState = "DISCONNECTED";
          this.hardwareErrorCode = null;
          this.hardwareErrorDetail = null;
          this.emitHardwareStatus();
          // 主动断开连接 → 上报 USB_DISCONNECTED（不是 USB_DETACHED）
          this.emitHardwareEvent("USB_DISCONNECTED", {
              port,
              profile,
          });
      }
  }

    getStatus(): SerialStatus {
    return this.adapter.getStatus();
  }

  onStatusChange(
    listener: (status: SerialStatus) => void,
  ): () => void {
      this.statusListeners.add(listener);
      this.trySubscribeAdapter();
      return () => this.statusListeners.delete(listener);
  }

  getLastCommand(): {
    commandedState: RelayStateValue;
    commandStatus: CommandStatus | null;
    hardwareState: "UNKNOWN";
  } {
    return {
      commandedState: this.commandedState,
      commandStatus: this.commandStatus,
      hardwareState: "UNKNOWN",
    };
  }

  getSource(): EventSource {
    const name = this.adapter.name.toLowerCase();
    if (name.includes("android")) return "ANDROID";
    if (name.includes("electron")) return "ELECTRON";
    return "WEB";
  }

    isHardwareConnected(): boolean {
        return this.hardwareState === "CONNECTED";
    }

    /** 设置当前关联的云端设备 ID；设置后硬件事件才会上报。 */
    setDeviceId(deviceId: string | null): void {
        this.deviceId = deviceId;
    }

    getDeviceId(): string | null {
        return this.deviceId;
    }

    /**
     * 订阅硬件生命周期事件（USB_ATTACHED / CONNECTED / DISCONNECTED / DETACHED 等）。
     * 监听器由 RelayService 注册，用于把事件上报到服务端 hardware_event 表。
     */
    onHardwareEvent(listener: HardwareEventListener): () => void {
        this.hardwareEventListeners.add(listener);
        return () => this.hardwareEventListeners.delete(listener);
    }

    private emitHardwareEvent(
        eventType: HardwareEventType,
        context: HardwareEventContext,
    ): void {
        // 同一设备的重复扫描/重复广播只上报一次，避免 hardware_event 刷屏。
        const key = `${eventType}:${context.port?.port ?? "-"}`;
        if (this.lastHardwareEventKey === key) {
            return;
        }
        this.lastHardwareEventKey = key;
        for (const listener of this.hardwareEventListeners) {
            listener(eventType, context);
        }
    }

    isCommandExecuting(): boolean {
        return this.commandExecuting;
    }

    getHardwareStatus(): HardwareStatus {
        return {
            state: this.hardwareState,
            matchedProfile: this.matchedProfile,
            commandedState: this.commandedState,
            commandStatus: this.commandStatus,
            executing: this.commandExecuting,
            lastPorts: this.lastPorts,
            errorCode: this.hardwareErrorCode,
            errorDetail: this.hardwareErrorDetail,
        };
    }

    onHardwareStatusChange(
        listener: (status: HardwareStatus) => void,
    ): () => void {
        this.hardwareListeners.add(listener);
        this.trySubscribeAdapter();
        this.trySubscribeDeviceChange();
        listener(this.getHardwareStatus());
        return () => this.hardwareListeners.delete(listener);
    }

    /**
     * 执行继电器指令。
     *
     * 严格约束：
     * 1. 已有指令在执行 → 拒绝（并发锁）。
     * 2. hardwareState !== CONNECTED → 拒绝，不调用 adapter.send。
     * 3. 未匹配 HardwareProfile → 拒绝。
     * 4. 仅当 adapter.send 成功才更新 commandedState=action、commandStatus=SUCCESS。
     * 5. send 失败 → commandStatus=FAILED，commandedState 保持原值（不 optimistic update）。
     */
  async execute(
    command: RelayProviderCommand,
  ): Promise<RelayProviderExecution> {
        if (this.commandExecuting) {
      throw new Error("已有继电器指令正在执行");
    }
        if (this.hardwareState !== "CONNECTED") {
            throw new Error(
                `本地硬件未连接，当前状态：${hardwareStateLabel(this.hardwareState)}`,
            );
        }
        if (!this.matchedProfile) {
            throw new Error("未匹配到受支持的硬件配置，无法执行指令");
        }
        const profile = this.matchedProfile;
    if (command.channel !== 1) {
        throw new Error(`当前 ${profile.name} 仅验证了通道 1`);
    }
        this.commandExecuting = true;
        this.emitHardwareStatus();
    try {
        const bytes = this.commandBytes(command.action, profile);
      await this.adapter.send(bytes);
      this.commandedState = command.action;
      this.commandStatus = "SUCCESS";
        this.emitHardwareStatus();
      return {
        commandId: command.eventId,
        deviceId: command.deviceId,
        channel: command.channel,
        action: command.action,
        previousState: command.previousState,
        commandedState: command.action,
        hardwareState: "UNKNOWN",
      };
    } catch (error) {
      this.commandStatus = "FAILED";
        this.emitHardwareStatus();
      throw error;
    } finally {
        this.commandExecuting = false;
        this.emitHardwareStatus();
    }
    }

    private commandBytes(
        action: RelayAction,
        profile: RelayHardwareProfile,
    ): Uint8Array {
        return action === "ON" ? profile.onCommand : profile.offCommand;
    }

    private trySubscribeAdapter(): void {
        if (this.adapterSubscribed) {
            return;
        }
        const subscribable = this.adapter as SerialAdapter & {
            onStatusChange?: (callback: (status: SerialStatus) => void) => () => void;
        };
        if (!subscribable.onStatusChange) {
            return;
    }
        this.adapterSubscribed = true;
        subscribable.onStatusChange((status) => this.handleAdapterStatus(status));
  }

    /**
     * 订阅 USB 插拔事件。
     *
     * - 插入：自动重新扫描并刷新 UI（用户不需要退出 App）
     * - 拔出：关闭串口（适配器内部完成）+ 刷新设备列表 + 硬件状态回到未连接
     */
    private trySubscribeDeviceChange(): void {
        if (this.deviceChangeSubscribed) {
            return;
        }
        const subscribable = this.adapter as SerialAdapter & {
            onDeviceChange?: (
                listener: (change: SerialDeviceChange) => void,
            ) => () => void;
        };
        if (!subscribable.onDeviceChange) {
            return;
        }
        this.deviceChangeSubscribed = true;
        subscribable.onDeviceChange((change) => {
            void this.handleDeviceChange(change);
        });
    }

    private async handleDeviceChange(
        change: SerialDeviceChange,
    ): Promise<void> {
        hardwareLog.info(
            change.type === "attached"
                ? "USB 插入：自动重新扫描"
                : "USB 拔出：刷新设备列表",
            change.port?.port ?? "unknown",
        );
        try {
            await this.scanAndMatch();
        } catch (error) {
            // 扫描失败时错误已写入 hardwareStatus.errorDetail，此处不再抛出。
            hardwareLog.warn("插拔后自动扫描失败", errorMessage(error));
        }
    }

    private handleAdapterStatus(serial: SerialStatus): void {
        this.recomputeHardwareState(serial);
        for (const listener of this.statusListeners) {
            listener(serial);
        }
    }

    private recomputeHardwareState(serial: SerialStatus): void {
        const detached = serial.errorCode === "SERIAL_DEVICE_DISCONNECTED";
        let next: HardwareConnectionState;
        if (detached) {
            next = "DISCONNECTED";
        } else {
            switch (serial.state) {
                case "disconnected":
                    next = "DISCONNECTED";
                    break;
                case "waiting_permission":
                    next = "PERMISSION_REQUIRED";
                    break;
                case "connecting":
                    next = "CONNECTING";
                    break;
                case "connected":
                    next = this.matchedProfile ? "CONNECTED" : "CONNECTING";
                    break;
                default:
                    next = "ERROR";
                    break;
            }
        }
        this.hardwareErrorCode = serial.errorCode;
        this.hardwareErrorDetail = serial.detail;
        // 仅在“从 CONNECTED 真正断开 / 失联”时才重置本地指令状态与已匹配 profile。
        // 连接流程中 AndroidUsbRelayAdapter.requestPermission 会在授权后推送一次瞬时
        // "disconnected"（此时 hardwareState 仍是 CONNECTING），不属于“已连接后断开”，
        // 绝不能清除 matchedProfile，否则后续 open 成功也无法进入 CONNECTED（历史 Bug）。
        const wasConnected = this.hardwareState === "CONNECTED";
        const nowTerminal = next === "DISCONNECTED" || next === "ERROR";
        if (wasConnected && nowTerminal) {
            // USB 拔出或断开：重置本地指令状态。
            // 不修改云端 commandedState，不生成假的 OFF 事件。
            this.commandedState = "UNKNOWN";
            this.commandStatus = null;
            // 保存 profile 引用用于上报，然后清空。
            const detachedProfile = this.matchedProfile;
            this.matchedProfile = null;
            // USB 物理拔出（detached）→ 上报 USB_DETACHED；
            // 其他断开（如主动 disconnect 已在 disconnect() 中上报 USB_DISCONNECTED）。
            if (detached) {
                const port = this.lastPorts.find((p) => p.isCurrent) ?? null;
                this.emitHardwareEvent("USB_DETACHED", {
                    port,
                    profile: detachedProfile,
                });
            }
        }
        this.hardwareState = next;
        this.emitHardwareStatus();
    }

    private emitHardwareStatus(): void {
        const status = this.getHardwareStatus();
        for (const listener of this.hardwareListeners) {
            listener(status);
        }
  }
}
