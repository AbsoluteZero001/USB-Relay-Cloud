import type {
  RelayAction,
  RelayStateValue,
} from "@/types/api";

export interface RelayProviderCommand {
  eventId: string;
  /** 关联的云端设备 ID；null 表示仅本地控制，不做云端同步。 */
  deviceId: string | null;
  channel: number;
  action: RelayAction;
  previousState: RelayStateValue;
  clientId: string;
}

export interface RelayProviderExecution {
  commandId: string;
  deviceId: string | null;
  channel: number;
  action: RelayAction;
  previousState: RelayStateValue;
  commandedState: RelayStateValue;
  hardwareState: "UNKNOWN";
}

export interface RelayProvider {
  readonly id: "LOCAL" | "CLOUD";

  isAvailable(): boolean;

  execute(command: RelayProviderCommand): Promise<RelayProviderExecution>;
}
