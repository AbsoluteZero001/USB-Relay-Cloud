import {formatHardwareError, hardwareLog} from "../diagnostics";
import type {
  RequestableSerialAdapter,
} from "./SerialAdapter";
import type {
  SerialDeviceChange,
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

function looksLikeCh340(vendorId: number | undefined): boolean {
  return vendorId === CH340_VENDOR_ID;
}

/**
 * 把浏览器已授权串口描述成 SerialPortInfo。
 *
 * 重要前提：Web Serial 的 `getPorts()` **只能**返回用户此前通过
 * `requestPort()` 授权过的设备。它拿不到系统里全部串口，因此 Web 端
 * 必须区分「扫描已授权设备」与「选择新设备」两个动作。
 */
export function describeWebSerialPort(
  portId: string,
  port: SerialPort,
  isCurrent = false,
): SerialPortInfo {
  const info = port.getInfo();
  const isCh340 = looksLikeCh340(info.usbVendorId);
  const description = isCh340 ? "USB-SERIAL CH340" : "USB Serial Device";
  return {
    port: portId,
    device: `${portId} · ${description}`,
    description,
    manufacturer: isCh340 ? "QinHeng Electronics" : null,
    hwid:
      info.usbVendorId != null && info.usbProductId != null
        ? `VID_${hex4(info.usbVendorId)}&PID_${hex4(info.usbProductId)}`
        : null,
    vendorId: hex4(info.usbVendorId),
    productId: hex4(info.usbProductId),
    serialNumber: null,
    isCurrent,
    driverName: isCh340 ? "CH340" : null,
    supported: info.usbVendorId != null && info.usbProductId != null,
    hasPermission: true,
  };
}

export class WebSerialRelayAdapter implements RequestableSerialAdapter {
  readonly name = "WebSerialRelayAdapter";

  private port: SerialPort | null = null;
  private state: SerialStatus["state"] = "disconnected";
  private baudRate = 9600;
  private errorCode: string | null = null;
  private errorDetail: string | null = null;
  private nextPortId = 1;
  private listenersRegistered = false;
  private readonly portIds = new WeakMap<SerialPort, string>();
  private readonly knownPorts = new Map<string, SerialPort>();
  private readonly statusListeners = new Set<(status: SerialStatus) => void>();
  private readonly deviceChangeListeners =
    new Set<(change: SerialDeviceChange) => void>();

  isSupported(): boolean {
    // 用真值判断而不是 `"serial" in navigator`：部分 WebView 会暴露
    // 一个值为 undefined 的 serial 属性，那同样不可用。
    return typeof navigator !== "undefined" && !!navigator.serial;
  }

  async listPorts(): Promise<SerialPortInfo[]> {
    this.ensureSupported();
    const ports = await navigator.serial.getPorts();
    this.knownPorts.clear();
    const described = ports.map((port) => {
      const id = this.portIdFor(port);
      this.knownPorts.set(id, port);
      return describeWebSerialPort(id, port, port === this.port);
    });
    hardwareLog.info(
      `Web Serial 已授权设备数量：${described.length}`,
      described.length
        ? described
            .map((item) =>
              `${item.port} VID=${item.vendorId ?? "未知"} `
              + `PID=${item.productId ?? "未知"}`)
            .join("\n")
        : "没有已授权串口；请点击「选择串口设备」触发浏览器授权窗口",
    );
    return described;
  }

  /**
   * 触发浏览器原生串口选择窗口。
   * 必须在用户手势（click）中调用，禁止在页面加载 / 定时器 / WebSocket
   * 回调里偷偷调用。
   */
  async requestPort(): Promise<SerialPortInfo> {
    this.ensureSupported();
    hardwareLog.info("打开浏览器串口选择窗口");
    try {
      const port = await navigator.serial.requestPort();
      const id = this.portIdFor(port);
      this.knownPorts.set(id, port);
      const info = describeWebSerialPort(id, port, port === this.port);
      hardwareLog.info(
        "用户已选择串口设备",
        `VID=${info.vendorId ?? "未知"} PID=${info.productId ?? "未知"}`,
      );
      return info;
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") {
        throw new Error("已取消串口选择");
      }
      hardwareLog.error("串口选择失败", formatHardwareError(error));
      throw error;
    }
  }

  async connect(
    portId: string,
    options: SerialOpenOptions,
  ): Promise<void> {
    this.ensureSupported();
    const port = await this.resolvePort(portId);
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
    this.emitStatus();
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
      hardwareLog.info(
        "串口打开成功",
        `${portId} baudRate=${options.baudRate} `
        + `${options.dataBits}${options.parity[0]?.toUpperCase() ?? "N"}`
        + `${options.stopBits}`,
      );
      this.emitStatus();
    } catch (error) {
      this.state = "error";
      this.errorCode = "SERIAL_OPEN_FAILED";
      this.errorDetail = formatHardwareError(error);
      hardwareLog.error("串口打开失败", this.errorDetail);
      this.emitStatus();
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
    this.emitStatus();
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
      hardwareLog.info(
        "串口写入成功",
        Array.from(data)
          .map((byte) => byte.toString(16).padStart(2, "0").toUpperCase())
          .join(" "),
      );
    } catch (error) {
      hardwareLog.error("串口写入失败", formatHardwareError(error));
      this.errorCode = "SERIAL_WRITE_FAILED";
      this.errorDetail = formatHardwareError(error);
      this.state = "error";
      this.emitStatus();
      throw error;
    } finally {
      writer.releaseLock();
    }
  }

  getStatus(): SerialStatus {
    return {
      state: this.state,
      port: this.port ? this.portIdFor(this.port) : null,
      device: this.port ? "Web Serial" : null,
      baudRate: this.baudRate,
      connected: this.state === "connected",
      errorCode: this.errorCode,
      detail: this.errorDetail,
    };
  }

  onStatusChange(listener: (status: SerialStatus) => void): () => void {
    this.ensureWebListeners();
    this.statusListeners.add(listener);
    // Web Serial 没有原生状态回调，先推送一次当前快照。
    listener(this.getStatus());
    return () => this.statusListeners.delete(listener);
  }

  onDeviceChange(
    listener: (change: SerialDeviceChange) => void,
  ): () => void {
    this.deviceChangeListeners.add(listener);
    this.ensureWebListeners();
    return () => this.deviceChangeListeners.delete(listener);
  }

  private ensureWebListeners(): void {
    if (this.listenersRegistered || !this.isSupported()) {
      return;
    }
    this.listenersRegistered = true;
    try {
      navigator.serial.addEventListener("connect", (event) => {
        const port = event.target as SerialPort;
        void this.notifyDeviceChange("attached", port);
      });
      navigator.serial.addEventListener("disconnect", (event) => {
        const port = event.target as SerialPort;
        void this.notifyDeviceChange("detached", port);
      });
    } catch (error) {
      this.listenersRegistered = false;
      hardwareLog.warn(
        "注册 Web Serial 插拔监听失败",
        formatHardwareError(error),
      );
    }
  }

  private async notifyDeviceChange(
    type: SerialDeviceChange["type"],
    port: SerialPort,
  ): Promise<void> {
    const id = this.portIdFor(port);
    let info: SerialPortInfo | null = null;
    try {
      info = describeWebSerialPort(id, port, port === this.port);
    } catch {
      info = null;
    }
    if (type === "detached" && this.port === port) {
      this.port = null;
      this.state = "error";
      this.errorCode = "SERIAL_DEVICE_DISCONNECTED";
      this.errorDetail = "USB 串口设备已拔出";
      hardwareLog.warn("Web Serial 设备已拔出", info?.device ?? id);
      this.emitStatus();
    }
    for (const listener of this.deviceChangeListeners) {
      listener({type, port: info});
    }
  }

  private portIdFor(port: SerialPort): string {
    const existing = this.portIds.get(port);
    if (existing) return existing;
    const id = `serial-${this.nextPortId++}`;
    this.portIds.set(port, id);
    return id;
  }

  private async resolvePort(portId: string): Promise<SerialPort | null> {
    const cached = this.knownPorts.get(portId);
    if (cached) return cached;
    await this.listPorts();
    return this.knownPorts.get(portId) ?? null;
  }

  private emitStatus(): void {
    const status = this.getStatus();
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }

  private ensureSupported(): void {
    if (!this.isSupported()) {
      throw new Error(
        "当前浏览器不支持 Web Serial，请使用最新版 Chrome / Edge，"
        + "或使用 Android / Electron 客户端连接本地硬件。",
      );
    }
  }
}
