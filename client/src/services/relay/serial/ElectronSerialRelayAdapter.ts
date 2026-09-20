import type { SerialAdapter } from "./SerialAdapter";
import type {
  SerialOpenOptions,
  SerialPortInfo,
  SerialStatus,
} from "./types";
import {formatHardwareError, hardwareLog} from "../diagnostics";

/**
 * Electron bridge placeholder.
 * The IPC contract exists so the future Node SerialPort adapter can be
 * added without changing RelayService or any Vue page.
 */
export class ElectronSerialRelayAdapter implements SerialAdapter {
  readonly name = "ElectronSerialRelayAdapter";

  private status: SerialStatus = {
    state: "disconnected",
    port: null,
    device: null,
    baudRate: 9600,
    connected: false,
    errorCode: null,
    detail: null,
  };

  isSupported(): boolean {
    return typeof window !== "undefined" && !!window.desktopAPI?.serial;
  }

  async listPorts(): Promise<SerialPortInfo[]> {
    const api = this.api();
    const ports = await api.listPorts();
    const mapped = ports.map((port) => ({
      port: port.port,
      device: port.device,
      description: port.description,
      manufacturer: port.manufacturer,
      hwid: port.hwid,
      vendorId: port.vendorId,
      productId: port.productId,
      serialNumber: port.serialNumber,
      isCurrent: port.is_current,
      driverName: null,
      supported: !!port.vendorId && !!port.productId,
      hasPermission: true,
    }));
    hardwareLog.info(
      `Electron 串口数量：${mapped.length}`,
      mapped.map((port) => `${port.port} ${port.description}`).join("\n"),
    );
    return mapped;
  }

  async connect(
    portId: string,
    options: SerialOpenOptions,
  ): Promise<void> {
    try {
      const result = await this.api().connect(portId, options);
      this.status = {
        state: result.state as SerialStatus["state"],
        port: result.port,
        device: result.port,
        baudRate: options.baudRate,
        connected: result.connected,
        errorCode: result.error_code,
        detail: result.detail,
      };
      hardwareLog.info(
        "Electron 串口已打开",
        `${portId} baudRate=${options.baudRate}`,
      );
    } catch (error) {
      hardwareLog.error("Electron 串口打开失败", formatHardwareError(error));
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.api().disconnect();
    this.status = {
      ...this.status,
      state: "disconnected",
      port: null,
      device: null,
      connected: false,
      errorCode: null,
      detail: null,
    };
  }

  async send(data: Uint8Array): Promise<void> {
    try {
      await this.api().send(Array.from(data));
      hardwareLog.info(
        "Electron 串口写入成功",
        Array.from(data)
          .map((byte) => byte.toString(16).padStart(2, "0").toUpperCase())
          .join(" "),
      );
    } catch (error) {
      hardwareLog.error("Electron 串口写入失败", formatHardwareError(error));
      throw error;
    }
  }

  getStatus(): SerialStatus {
    return this.status;
  }

  private api() {
    const serial = window.desktopAPI?.serial;
    if (!serial) {
      throw new Error("Electron serial IPC API is not available");
    }
    return serial;
  }
}
