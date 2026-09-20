import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export interface NativeUsbDevice {
  deviceId: string;
  vendorId: string;
  productId: string;
  manufacturer: string | null;
  productName: string | null;
  serialNumber: string | null;
  driverName: string | null;
  portCount: number;
  /** UsbSerialProber 是否识别到可用串口驱动 */
  supported: boolean;
  /** UsbManager.hasPermission(device) 的结果 */
  hasPermission: boolean;
}

export interface NativeSerialStatus {
  state: "disconnected" | "connecting" | "waiting_permission" | "connected" | "error";
  deviceId: string | null;
  baudRate: number;
  connected: boolean;
  errorCode: string | null;
  detail: string | null;
}

export interface UsbRelayPlugin {
  getDevices(): Promise<{ devices: NativeUsbDevice[] }>;

  requestPermission(options: {
    deviceId?: string;
  }): Promise<{ granted: boolean; deviceId: string }>;

  open(options: {
    deviceId: string;
    baudRate: number;
    dataBits: number;
    stopBits: number;
    parity: string;
    flowControl: string;
  }): Promise<void>;

  write(options: { dataBase64: string }): Promise<void>;

  close(): Promise<void>;

  getStatus(): Promise<NativeSerialStatus>;

  addListener(
    eventName: "statusChange",
    listener: (status: NativeSerialStatus) => void,
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: "deviceAttached" | "deviceDetached",
    listener: (event: { device: NativeUsbDevice }) => void,
  ): Promise<PluginListenerHandle>;
}

export const UsbRelay = registerPlugin<UsbRelayPlugin>("UsbRelay");
