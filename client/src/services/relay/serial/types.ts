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
  /** 平台内唯一标识：Android 为 UsbDevice.deviceId，Web 为内部注册号 */
  port: string;
  device: string;
  description: string;
  manufacturer: string | null;
  hwid: string | null;
  vendorId: string | null;
  productId: string | null;
  serialNumber: string | null;
  isCurrent: boolean;
  /**
   * 原生串口驱动名（Android 由 UsbSerialProber 给出：CH340 / CDC ACM / FTDI…）。
   * Web / Electron 无法获取时为 null。
   */
  driverName?: string | null;
  /**
   * 平台是否已识别到兼容串口驱动。
   * 为 false 时表示「检测到 USB 设备，但没有可用的串口驱动」，UI 必须
   * 明确提示，而不是把设备从列表里藏起来。
   */
  supported?: boolean;
  /**
   * Android USB 授权状态；null 表示该平台无需（或无法）判定。
   * false 时 UI 应提供「授权并连接」。
   */
  hasPermission?: boolean | null;
}

/** USB 设备插拔变化，用于 UI 自动刷新与串口关闭。 */
export type SerialDeviceChangeType = "attached" | "detached";

export interface SerialDeviceChange {
  type: SerialDeviceChangeType;
  port: SerialPortInfo | null;
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
