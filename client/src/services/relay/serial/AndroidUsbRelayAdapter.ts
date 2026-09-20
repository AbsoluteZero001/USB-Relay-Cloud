import {Capacitor} from "@capacitor/core";

import {formatHardwareError, getPlatformDebugInfo, hardwareLog,} from "../diagnostics";
import type {
  RequestableSerialAdapter,
} from "./SerialAdapter";
import {
  UsbRelay,
  type NativeSerialStatus,
  type NativeUsbDevice,
} from "./UsbRelayPlugin";
import type {
  SerialDeviceChange,
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

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0").toUpperCase())
    .join(" ");
}

/**
 * 原生设备 → 跨平台 SerialPortInfo。
 *
 * 关键点：无论 UsbSerialProber 是否识别到驱动，设备都必须出现在列表里，
 * 只是 supported=false，UI 会提示「检测到 USB 设备，但未找到兼容串口驱动」。
 */
export function toAndroidPortInfo(
  device: NativeUsbDevice,
  currentDeviceId: string | null = null,
): SerialPortInfo {
  const isCh340 =
    device.vendorId === CH340_VENDOR_ID &&
    device.productId === CH340_PRODUCT_ID;
  const driverName = device.driverName ?? null;
  const description = isCh340
    ? "USB-SERIAL CH340"
    : device.productName
      ?? (driverName ? `${driverName} 串口设备` : "USB 设备");
  return {
    port: device.deviceId,
    device: `${device.deviceId} · ${description}`,
    description,
    manufacturer: device.manufacturer,
    hwid: `USB\\VID_${device.vendorId}&PID_${device.productId}`,
    vendorId: device.vendorId,
    productId: device.productId,
    serialNumber: device.serialNumber,
    isCurrent: device.deviceId === currentDeviceId,
    driverName,
    supported: device.supported,
    hasPermission: device.hasPermission,
  };
}

function errorMessage(error: unknown): string {
  return formatHardwareError(error);
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
  private readonly deviceChangeListeners =
    new Set<(change: SerialDeviceChange) => void>();

  isSupported(): boolean {
    return Capacitor.isNativePlatform()
      && Capacitor.getPlatform() === "android";
  }

  async listPorts(): Promise<SerialPortInfo[]> {
    this.ensureSupported();
    const platform = getPlatformDebugInfo();
    hardwareLog.info(
      "扫描 USB / 串口设备",
      `平台=${platform.platform} · Capacitor.isNativePlatform=${platform.capacitorNative}`,
    );
    try {
      const { devices } = await UsbRelay.getDevices();
      const ports = devices.map((device) =>
        toAndroidPortInfo(device, this.currentDeviceId),
      );
      hardwareLog.info(
        `UsbManager 设备数量：${ports.length}`,
        ports.length
          ? ports
              .map(
                (port) =>
                  `${port.port} VID=${port.vendorId} PID=${port.productId} `
                  + `驱动=${port.driverName ?? "unknown"} `
                  + `可打开=${port.supported ? "yes" : "no"} `
                  + `已授权=${port.hasPermission ? "yes" : "no"}`,
              )
              .join("\n")
          : "未检测到 USB 设备（请确认 OTG + CH340 已插入）",
      );
      return ports;
    } catch (error) {
      hardwareLog.error("扫描 USB 设备失败", errorMessage(error));
      throw error;
    }
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
      )
      ?? ports.find((port) => port.supported)
      ?? ports[0];
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
      hardwareLog.info(
        "正在打开串口",
        `deviceId=${portId} baudRate=${options.baudRate} `
        + `dataBits=${options.dataBits} stopBits=${options.stopBits} `
        + `parity=${options.parity}`,
      );
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
      hardwareLog.info(
        "串口打开成功",
        `deviceId=${portId} baudRate=${options.baudRate}`,
      );
      this.emitStatus();
    } catch (error) {
      hardwareLog.error("串口打开失败", errorMessage(error));
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
      hardwareLog.info("串口已断开");
      this.emitStatus();
    }
  }

  async send(data: Uint8Array): Promise<void> {
    if (this.state !== "connected") {
      throw new Error("Android USB 串口尚未连接");
    }
    try {
      await UsbRelay.write({ dataBase64: bytesToBase64(data) });
      hardwareLog.info("串口写入成功", bytesToHex(data));
    } catch (error) {
      hardwareLog.error(
        "串口写入失败",
        `${bytesToHex(data)} · ${errorMessage(error)}`,
      );
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

  onDeviceChange(
    listener: (change: SerialDeviceChange) => void,
  ): () => void {
    this.deviceChangeListeners.add(listener);
    void this.ensureNativeListeners();
    return () => this.deviceChangeListeners.delete(listener);
  }

  private emitDeviceChange(change: SerialDeviceChange): void {
    for (const listener of this.deviceChangeListeners) {
      listener(change);
    }
  }

  /**
   * 申请 USB 权限。已经授权时原生侧直接返回 true，不会弹窗。
   * 未授权时弹出 Android 系统授权对话框，用户拒绝/超时会抛出异常。
   */
  private async requestPermission(deviceId: string): Promise<void> {
    this.state = "waiting_permission";
    this.errorCode = null;
    this.errorDetail = null;
    this.emitStatus();
    hardwareLog.info("请求 USB 访问权限", `deviceId=${deviceId}`);
    try {
      const result = await UsbRelay.requestPermission({ deviceId });
      if (!result.granted) {
        throw new Error("用户拒绝了 Android USB 访问权限");
      }
      hardwareLog.info("USB 权限已授予", `deviceId=${deviceId}`);
      this.state = "disconnected";
      this.emitStatus();
    } catch (error) {
      hardwareLog.error("USB 权限申请失败", errorMessage(error));
      this.fail(error);
      throw error;
    }
  }

  private async ensureNativeListeners(): Promise<void> {
    if (this.listenersRegistered || !this.isSupported()) {
      return;
    }
    this.listenersRegistered = true;
    try {
      await UsbRelay.addListener("statusChange", (status) => {
        this.applyNativeStatus(status);
      });
      await UsbRelay.addListener("deviceAttached", ({ device }) => {
        hardwareLog.info(
          "检测到 USB 设备插入",
          `deviceId=${device.deviceId} VID=${device.vendorId} `
          + `PID=${device.productId} 驱动=${device.driverName ?? "unknown"}`,
        );
        this.emitDeviceChange({
          type: "attached",
          port: toAndroidPortInfo(device, this.currentDeviceId),
        });
      });
      await UsbRelay.addListener("deviceDetached", ({ device }) => {
        const wasCurrent = device.deviceId === this.currentDeviceId;
        hardwareLog.warn(
          "USB 设备已拔出",
          `deviceId=${device.deviceId} 当前连接=${wasCurrent ? "yes" : "no"}`,
        );
        if (wasCurrent) {
          this.currentDeviceId = null;
          this.lastPort = device.deviceId;
          this.state = "error";
          this.errorCode = "SERIAL_DEVICE_DISCONNECTED";
          this.errorDetail = "USB 串口设备已拔出";
          this.emitStatus();
        }
        this.emitDeviceChange({
          type: "detached",
          port: toAndroidPortInfo(device, null),
        });
      });
    } catch (error) {
      this.listenersRegistered = false;
      hardwareLog.warn(
        "注册 USB 插拔监听失败，自动刷新不可用",
        errorMessage(error),
      );
    }
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
