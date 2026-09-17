import type { SerialAdapter } from "./SerialAdapter";
import type {
  SerialOpenOptions,
  SerialPortInfo,
  SerialStatus,
} from "./types";

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
    return ports.map((port) => ({
      port: port.port,
      device: port.device,
      description: port.description,
      manufacturer: port.manufacturer,
      hwid: port.hwid,
      vendorId: port.vendorId,
      productId: port.productId,
      serialNumber: port.serialNumber,
      isCurrent: port.is_current,
    }));
  }

  async connect(
    portId: string,
    options: SerialOpenOptions,
  ): Promise<void> {
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
    await this.api().send(Array.from(data));
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
