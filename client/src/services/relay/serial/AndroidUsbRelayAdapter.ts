import { Capacitor } from "@capacitor/core";

import type {
  RequestableSerialAdapter,
} from "./SerialAdapter";
import {
  UsbRelay,
  type NativeSerialStatus,
  type NativeUsbDevice,
} from "./UsbRelayPlugin";
import type {
  SerialOpenOptions,
  SerialPortInfo,
  SerialStatus,
} from "./types";

const CH340_VENDOR_ID = "1A86";
const CH340_PRODUCT_ID = "7523";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function toPortInfo(device: NativeUsbDevice): SerialPortInfo {
  const isCh340 =
    device.vendorId === CH340_VENDOR_ID &&
    device.productId === CH340_PRODUCT_ID;
  const description = isCh340
    ? "USB-SERIAL CH340"
    : device.productName ?? "USB Serial Device";
  return {
    port: device.deviceId,
    device: `${device.deviceId} · ${description}`,
    description,
    manufacturer: device.manufacturer,
    hwid: `USB\\VID_${device.vendorId}&PID_${device.productId}`,
    vendorId: device.vendorId,
    productId: device.productId,
    serialNumber: device.serialNumber,
    isCurrent: false,
  };
}

function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string") return record.message;
    if (typeof record.detail === "string") return record.detail;
  }
  return "Android USB 操作失败";
}

export class AndroidUsbRelayAdapter implements RequestableSerialAdapter {
  readonly name = "AndroidUsbRelayAdapter";

  private state: SerialStatus["state"] = "disconnected";
  private currentDeviceId: string | null = null;
  private lastPort: string | null = null;
  private baudRate = 9600;
  private errorCode: string | null = null;
  private errorDetail: string | null = null;
  private listenersRegistered = false;
  private readonly statusListeners = new Set<(status: SerialStatus) => void>();

  isSupported(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  }

  async listPorts(): Promise<SerialPortInfo[]> {
    this.ensureSupported();
    const { devices } = await UsbRelay.getDevices();
    return devices.map((device) => ({
      ...toPortInfo(device),
      isCurrent: device.deviceId === this.currentDeviceId,
    }));
  }

  async requestPort(): Promise<SerialPortInfo> {
    const ports = await this.listPorts();
    if (ports.length === 0) {
      throw new Error("未发现可用于 USB Host 的串口设备");
    }
    const preferred =
      ports.find(
        (port) =>
          port.vendorId === CH340_VENDOR_ID &&
          port.productId === CH340_PRODUCT_ID,
      ) ?? ports[0];
    if (!preferred) {
      throw new Error("未发现可用于 USB Host 的串口设备");
    }
    await this.requestPermission(preferred.port);
    return preferred;
  }

  async connect(
    portId: string,
    options: SerialOpenOptions,
  ): Promise<void> {
    this.ensureSupported();
    this.state = "connecting";
    this.emitStatus();
    try {
      await this.requestPermission(portId);
      await UsbRelay.open({
        deviceId: portId,
        baudRate: options.baudRate,
        dataBits: options.dataBits,
        stopBits: options.stopBits,
        parity: options.parity,
        flowControl: options.flowControl,
      });
      this.currentDeviceId = portId;
      this.lastPort = portId;
      this.baudRate = options.baudRate;
      this.state = "connected";
      this.errorCode = null;
      this.errorDetail = null;
      this.emitStatus();
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.isSupported()) {
        await UsbRelay.close();
      }
    } finally {
      this.currentDeviceId = null;
      this.lastPort = null;
      this.state = "disconnected";
      this.errorCode = null;
      this.errorDetail = null;
      this.emitStatus();
    }
  }

  async send(data: Uint8Array): Promise<void> {
    if (this.state !== "connected") {
      throw new Error("Android USB 串口尚未连接");
    }
    try {
      await UsbRelay.write({ dataBase64: bytesToBase64(data) });
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }

  getStatus(): SerialStatus {
    const connected = this.state === "connected" && !!this.currentDeviceId;
    return {
      state: this.state,
      port: connected ? this.currentDeviceId : this.lastPort,
      device: connected ? this.currentDeviceId : this.lastPort,
      baudRate: this.baudRate,
      connected,
      errorCode: this.errorCode,
      detail: this.errorDetail,
    };
  }

  onStatusChange(listener: (status: SerialStatus) => void): () => void {
    this.statusListeners.add(listener);
    void this.ensureNativeListeners();
    return () => this.statusListeners.delete(listener);
  }

  private async requestPermission(deviceId: string): Promise<void> {
    this.state = "waiting_permission";
    this.errorCode = null;
    this.errorDetail = null;
    this.emitStatus();
    try {
      const result = await UsbRelay.requestPermission({ deviceId });
      if (!result.granted) {
        throw new Error("用户拒绝了 Android USB 访问权限");
      }
      this.state = "disconnected";
      this.emitStatus();
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }

  private async ensureNativeListeners(): Promise<void> {
    if (this.listenersRegistered || !this.isSupported()) {
      return;
    }
    this.listenersRegistered = true;
    await UsbRelay.addListener("statusChange", (status) => {
      this.applyNativeStatus(status);
    });
    await UsbRelay.addListener("deviceDetached", ({ device }) => {
      if (device.deviceId === this.currentDeviceId) {
        this.currentDeviceId = null;
        this.lastPort = device.deviceId;
        this.state = "error";
        this.errorCode = "SERIAL_DEVICE_DISCONNECTED";
        this.errorDetail = "USB 串口设备已拔出";
        this.emitStatus();
      }
    });
  }

  private applyNativeStatus(status: NativeSerialStatus): void {
    this.state = status.state;
    this.baudRate = status.baudRate || this.baudRate;
    this.errorCode = status.errorCode;
    this.errorDetail = status.detail;
    if (status.state === "disconnected" || status.state === "error") {
      this.currentDeviceId = null;
      this.lastPort = status.deviceId;
    } else {
      this.currentDeviceId = status.deviceId;
      this.lastPort = status.deviceId;
    }
    this.emitStatus();
  }

  private fail(error: unknown): void {
    this.state = "error";
    this.errorCode = "USB_OPERATION_FAILED";
    this.errorDetail = errorMessage(error);
    this.currentDeviceId = null;
    this.emitStatus();
  }

  private emitStatus(): void {
    const status = this.getStatus();
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }

  private ensureSupported(): void {
    if (!this.isSupported()) {
      throw new Error("当前环境不是 Capacitor Android");
    }
  }
}
