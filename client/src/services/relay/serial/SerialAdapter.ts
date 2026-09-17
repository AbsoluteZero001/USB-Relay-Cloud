import type {
  SerialOpenOptions,
  SerialPortInfo,
  SerialStatus,
} from "./types";

export interface SerialAdapter {
  readonly name: string;

  isSupported(): boolean;

  listPorts(): Promise<SerialPortInfo[]>;

  connect(portId: string, options: SerialOpenOptions): Promise<void>;

  disconnect(): Promise<void>;

  send(data: Uint8Array): Promise<void>;

  getStatus(): SerialStatus;
}

export interface RequestableSerialAdapter extends SerialAdapter {
  requestPort(): Promise<SerialPortInfo>;
}

export function isRequestable(
  adapter: SerialAdapter,
): adapter is RequestableSerialAdapter {
  return "requestPort" in adapter;
}
