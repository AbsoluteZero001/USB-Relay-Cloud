import type {
  RequestableSerialAdapter,
} from "./SerialAdapter";
import type {
  SerialOpenOptions,
  SerialPortInfo,
  SerialStatus,
} from "./types";

const CH340_VENDOR_ID = 0x1a86;

function hex4(value: number | undefined): string | null {
  return value == null
    ? null
    : value.toString(16).toUpperCase().padStart(4, "0");
}

function describePort(port: SerialPort, index: number): SerialPortInfo {
  const info = port.getInfo();
  const isCh340 = info.usbVendorId === CH340_VENDOR_ID;
  const description = isCh340
    ? "USB-SERIAL CH340"
    : "USB Serial Device";
  return {
    port: String(index),
    device: `串口 ${index + 1} · ${description}`,
    description,
    manufacturer: isCh340 ? "QinHeng Electronics" : null,
    hwid:
      info.usbVendorId != null && info.usbProductId != null
        ? `VID_${hex4(info.usbVendorId)}&PID_${hex4(info.usbProductId)}`
        : null,
    vendorId: hex4(info.usbVendorId),
    productId: hex4(info.usbProductId),
    serialNumber: null,
    isCurrent: false,
  };
}

export class WebSerialRelayAdapter implements RequestableSerialAdapter {
  readonly name = "WebSerialRelayAdapter";

  private port: SerialPort | null = null;
  private state: SerialStatus["state"] = "disconnected";
  private baudRate = 9600;
  private errorCode: string | null = null;
  private errorDetail: string | null = null;

  isSupported(): boolean {
    return typeof navigator !== "undefined" && "serial" in navigator;
  }

  async listPorts(): Promise<SerialPortInfo[]> {
    this.ensureSupported();
    const ports = await navigator.serial.getPorts();
    return ports.map((port, index) => ({
      ...describePort(port, index),
      isCurrent: port === this.port,
    }));
  }

  async requestPort(): Promise<SerialPortInfo> {
    this.ensureSupported();
    try {
      const port = await navigator.serial.requestPort();
      const ports = await navigator.serial.getPorts();
      return {
        ...describePort(port, Math.max(ports.indexOf(port), 0)),
        isCurrent: port === this.port,
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") {
        throw new Error("已取消串口选择");
      }
      throw error;
    }
  }

  async connect(
    portId: string,
    options: SerialOpenOptions,
  ): Promise<void> {
    this.ensureSupported();
    const index = Number.parseInt(portId, 10);
    const ports = await navigator.serial.getPorts();
    const port = Number.isInteger(index) ? ports[index] : undefined;
    if (!port) {
      throw new Error("所选串口不存在，请重新授权");
    }
    if (options.dataBits !== 7 && options.dataBits !== 8) {
      throw new Error("Web Serial 仅支持 7 或 8 数据位");
    }
    if (options.stopBits !== 1 && options.stopBits !== 2) {
      throw new Error("Web Serial 仅支持 1 或 2 停止位");
    }
    this.state = "connecting";
    try {
      await port.open({
        baudRate: options.baudRate,
        dataBits: options.dataBits,
        stopBits: options.stopBits,
        parity:
          options.parity === "even" || options.parity === "odd"
            ? options.parity
            : "none",
        flowControl:
          options.flowControl === "hardware" ? "hardware" : undefined,
      });
      this.port = port;
      this.baudRate = options.baudRate;
      this.state = "connected";
      this.errorCode = null;
      this.errorDetail = null;
    } catch (error) {
      this.state = "error";
      this.errorCode = "SERIAL_OPEN_FAILED";
      this.errorDetail =
        error instanceof Error ? error.message : "串口打开失败";
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    const port = this.port;
    this.port = null;
    if (port) {
      try {
        await port.close();
      } catch {
        // Best effort: the device may already be detached.
      }
    }
    this.state = "disconnected";
    this.errorCode = null;
    this.errorDetail = null;
  }

  async send(data: Uint8Array): Promise<void> {
    if (!this.port || this.state !== "connected") {
      throw new Error("Web Serial 串口尚未连接");
    }
    const writer = this.port.writable?.getWriter();
    if (!writer) {
      throw new Error("串口不可写");
    }
    try {
      await writer.write(data);
    } finally {
      writer.releaseLock();
    }
  }

  getStatus(): SerialStatus {
    return {
      state: this.state,
      port: this.port ? "selected" : null,
      device: this.port ? "Web Serial" : null,
      baudRate: this.baudRate,
      connected: this.state === "connected",
      errorCode: this.errorCode,
      detail: this.errorDetail,
    };
  }

  private ensureSupported(): void {
    if (!this.isSupported()) {
      throw new Error(
        "当前浏览器不支持 Web Serial，请使用 Chrome/Edge 并通过安全上下文访问",
      );
    }
  }
}
