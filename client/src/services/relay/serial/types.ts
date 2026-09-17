export type SerialConnectionState =
  | "disconnected"
  | "connecting"
  | "waiting_permission"
  | "connected"
  | "error";

export type SerialParity = "none" | "even" | "odd" | "mark" | "space";
export type SerialFlowControl = "none" | "software" | "hardware";

export interface SerialOpenOptions {
  baudRate: number;
  dataBits: 5 | 6 | 7 | 8;
  stopBits: 1 | 1.5 | 2;
  parity: SerialParity;
  flowControl: SerialFlowControl;
}

export interface SerialPortInfo {
  port: string;
  device: string;
  description: string;
  manufacturer: string | null;
  hwid: string | null;
  vendorId: string | null;
  productId: string | null;
  serialNumber: string | null;
  isCurrent: boolean;
}

export interface SerialStatus {
  state: SerialConnectionState;
  port: string | null;
  device: string | null;
  baudRate: number;
  connected: boolean;
  errorCode: string | null;
  detail: string | null;
}
