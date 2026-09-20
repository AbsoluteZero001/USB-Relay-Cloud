import type {
  SerialDeviceChange,
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

  /**
   * USB 插拔监听（可选能力）。
   *
   * Android：Capacitor 插件广播 deviceAttached / deviceDetached。
   * Web：navigator.serial 的 connect / disconnect 事件。
   * Electron：暂未提供。
   *
   * Provider 依赖该回调在插入后自动重新扫描、拔出后关闭串口并刷新 UI。
   */
  onDeviceChange?(
    listener: (change: SerialDeviceChange) => void,
  ): () => void;
}

export interface RequestableSerialAdapter extends SerialAdapter {
  requestPort(): Promise<SerialPortInfo>;
}

export function isRequestable(
  adapter: SerialAdapter,
): adapter is RequestableSerialAdapter {
  return "requestPort" in adapter;
}
