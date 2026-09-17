import type {
  RelayAction,
  RelayStateValue,
} from "@/types/api";

export interface RelayProviderCommand {
  eventId: string;
  deviceId: string;
  channel: number;
  action: RelayAction;
  previousState: RelayStateValue;
  clientId: string;
}

export interface RelayProviderExecution {
  commandId: string;
  deviceId: string;
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
