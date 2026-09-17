import type { SerialAdapter } from "../serial";
import type { SerialPortInfo, SerialStatus } from "../serial/types";
import type {
  RelayProvider,
  RelayProviderCommand,
  RelayProviderExecution,
} from "./RelayProvider";

import type {
  CommandStatus,
  EventSource,
  RelayAction,
  RelayStateValue,
} from "@/types/api";

export interface RelayProtocolConfig {
  baudRate: number;
  dataBits: 5 | 6 | 7 | 8;
  stopBits: 1 | 1.5 | 2;
  parity: "none" | "even" | "odd" | "mark" | "space";
  flowControl: "none" | "software" | "hardware";
  onCommand: Uint8Array;
  offCommand: Uint8Array;
}

export const DEFAULT_RELAY_PROTOCOL: RelayProtocolConfig = {
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: "none",
  flowControl: "none",
  // Verified on CH340 + LCUS-1. Do not replace without hardware validation.
  onCommand: new Uint8Array([0xa0, 0x01, 0x01, 0xa2]),
  offCommand: new Uint8Array([0xa0, 0x01, 0x00, 0xa1]),
};

export class LocalRelayProvider implements RelayProvider {
  readonly id = "LOCAL" as const;

  private commandedState: RelayStateValue = "UNKNOWN";
  private commandStatus: CommandStatus | null = null;
  private busy = false;

  constructor(
    private readonly adapter: SerialAdapter,
    private readonly protocol = DEFAULT_RELAY_PROTOCOL,
  ) {}

  isAvailable(): boolean {
    return this.adapter.isSupported();
  }

  async listPorts() {
    return this.adapter.listPorts();
  }

  async requestPort() {
    const requestable = this.adapter as SerialAdapter & {
      requestPort?: () => Promise<SerialPortInfo>;
    };
    if (requestable.requestPort) {
      return requestable.requestPort();
    }
    const ports = await this.adapter.listPorts();
    const first = ports[0];
    if (!first) {
      throw new Error("未发现可用串口");
    }
    return first;
  }

  async connect(portId: string): Promise<void> {
    await this.adapter.connect(portId, {
      baudRate: this.protocol.baudRate,
      dataBits: this.protocol.dataBits,
      stopBits: this.protocol.stopBits,
      parity: this.protocol.parity,
      flowControl: this.protocol.flowControl,
    });
    this.commandedState = "UNKNOWN";
    this.commandStatus = null;
  }

  async disconnect(): Promise<void> {
    await this.adapter.disconnect();
    this.commandedState = "UNKNOWN";
    this.commandStatus = null;
  }

  getStatus() {
    return this.adapter.getStatus();
  }

  onStatusChange(
    listener: (status: SerialStatus) => void,
  ): () => void {
    const subscribable = this.adapter as SerialAdapter & {
      onStatusChange?: (
        callback: (status: SerialStatus) => void,
      ) => () => void;
    };
    return subscribable.onStatusChange?.(listener) ?? (() => undefined);
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

  async execute(
    command: RelayProviderCommand,
  ): Promise<RelayProviderExecution> {
    if (this.busy) {
      throw new Error("已有继电器指令正在执行");
    }
    if (command.channel !== 1) {
      throw new Error("当前 LCUS-1 配置只验证了通道 1");
    }
    this.busy = true;
    try {
      const bytes = this.commandBytes(command.action);
      await this.adapter.send(bytes);
      this.commandedState = command.action;
      this.commandStatus = "SUCCESS";
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
      throw error;
    } finally {
      this.busy = false;
    }
  }

  private commandBytes(action: RelayAction): Uint8Array {
    return action === "ON"
      ? this.protocol.onCommand
      : this.protocol.offCommand;
  }
}
