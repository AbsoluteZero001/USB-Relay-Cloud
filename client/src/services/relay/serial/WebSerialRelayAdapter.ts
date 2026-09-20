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

function isSerialPort(value: unknown): value is SerialPort {
  return !!value
    && typeof value === "object"
    && typeof (value as SerialPort).getInfo === "function";
}

/**
 * 从 SerialConnectionEvent 中取出真正被插拔的 SerialPort。
 *
 * 关键：connect / disconnect 事件的目标是 `navigator.serial` 本身，
 * 被插拔的端口在 `event.port`。历史 Bug 用 `event.target` 当 SerialPort，
 * 导致永远匹配不上 activePort，物理拔出后仍然保持 CONNECTED。
 */
function readEventPort(event: Event): SerialPort | null {
  const fromEvent = (event as unknown as {port?: unknown}).port;
  if (isSerialPort(fromEvent)) {
    return fromEvent;
  }
  if (isSerialPort(event.target)) {
    return event.target;
  }
  return null;
}

function isDeviceLossError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === "InvalidStateError"
      || error.name === "NetworkError"
      || error.name === "NotFoundError"
      || error.name === "NotReadableError";
  }
  const message = formatHardwareError(error).toLowerCase();
  return message.includes("disconnect")
    || message.includes("device")
    || message.includes("network")
    || message.includes("not found")
    || message.includes("closed");
}

/**
 * 把浏览器已授权串口描述成 SerialPortInfo。
 *
 * 前提：Web Serial 的 `getPorts()` 只返回用户此前授权过的设备，
 * 而且**已授权的端口可能已经物理拔出**（Chrome 保留授权）。
 * 因此 `getPorts()` 的结果只用于「可选设备列表」，
 * 真实连接状态一律以 open / write / disconnect 事件为准。
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
    // Web Serial 只会把真实串口设备交给页面，VID/PID 缺失不影响连接
    supported: true,
    hasPermission: true,
  };
}

export class WebSerialRelayAdapter implements RequestableSerialAdapter {
  readonly name = "WebSerialRelayAdapter";

  /** 当前正在使用的 SerialPort；物理拔出后必须置空 */
  private port: SerialPort | null = null;
  /** 正在写入的 writer，断连时需要 releaseLock */
  private activeWriter: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private state: SerialStatus["state"] = "disconnected";
  /** 是否处于「已 open 且未收到 disconnect」的物理连接状态 */
  private physicalConnected = false;
  private baudRate = 9600;
  private errorCode: string | null = null;
  private errorDetail: string | null = null;
  private nextPortId = 1;
  private listenersRegistered = false;
  /** 收到过 disconnect 事件、尚未重新插入的端口 */
  private readonly absentPorts = new WeakSet<SerialPort>();
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

  isPhysicallyConnected(): boolean {
    return this.physicalConnected
      && this.state === "connected"
      && !!this.port;
  }

  async listPorts(): Promise<SerialPortInfo[]> {
    this.ensureSupported();
    const ports = await navigator.serial.getPorts();
    this.knownPorts.clear();
    const described = ports.map((port) => {
      const id = this.portIdFor(port);
      this.knownPorts.set(id, port);
      return this.withPresence(
        describeWebSerialPort(id, port, port === this.port),
        port,
      );
    });
    hardwareLog.info(
      `Web Serial 已授权设备数量：${described.length}`,
      described.length
        ? described
            .map((item) =>
              `${item.port} VID=${item.vendorId ?? "未知"} `
              + `PID=${item.productId ?? "未知"}`)
            .join("\n")
        : "没有已授权串口；请点击「选择新串口设备」触发浏览器授权窗口",
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
      this.absentPorts.delete(port);
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
    // 切换到其他端口前，先释放上一个端口
    if (this.port && this.port !== port) {
      await this.releaseResources();
    }
    this.state = "connecting";
    this.physicalConnected = false;
    this.errorCode = null;
    this.errorDetail = null;
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
      // 只有 open() 真正返回成功才进入 CONNECTED
      this.port = port;
      this.physicalConnected = true;
      this.absentPorts.delete(port);
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
      const detail = formatHardwareError(error);
      this.port = null;
      this.physicalConnected = false;
      this.state = "error";
      this.errorCode = isDeviceLossError(error)
        ? "SERIAL_DEVICE_DISCONNECTED"
        : "SERIAL_OPEN_FAILED";
      this.errorDetail = detail;
      hardwareLog.error(
        "串口打开失败（端口可能已被物理拔出）",
        detail,
      );
      this.emitStatus();
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    const port = this.port;
    const writer = this.activeWriter;
    this.port = null;
    this.activeWriter = null;
    this.physicalConnected = false;
    await this.cleanupResources(port, writer);
    this.state = "disconnected";
    this.errorCode = null;
    this.errorDetail = null;
    hardwareLog.info("串口已断开（用户主动断开）");
    this.emitStatus();
  }

  async send(data: Uint8Array): Promise<void> {
    const port = this.port;
    // 第二层保护：即使 UI 状态还没更新，也必须在写之前确认物理连接
    if (!port || this.state !== "connected" || !this.physicalConnected) {
      if (this.errorCode === "SERIAL_DEVICE_DISCONNECTED") {
        throw new Error("串口设备已断开，指令未发送。");
      }
      throw new Error("Web Serial 串口尚未连接");
    }
    const writable = port.writable;
    if (!writable) {
      this.markPhysicalDisconnect(port, "串口已关闭（writable = null）");
      throw new Error("串口设备已断开，指令未发送。");
    }
    let writer: WritableStreamDefaultWriter<Uint8Array>;
    try {
      writer = writable.getWriter();
    } catch (error) {
      this.markPhysicalDisconnect(port, formatHardwareError(error));
      throw new Error("串口设备已断开，指令未发送。");
    }
    this.activeWriter = writer;
    const hex = Array.from(data)
      .map((byte) => byte.toString(16).padStart(2, "0").toUpperCase())
      .join(" ");
    try {
      await writer.write(data);
      hardwareLog.info("串口写入成功", hex);
    } catch (error) {
      const detail = formatHardwareError(error);
      if (isDeviceLossError(error)) {
        this.markPhysicalDisconnect(port, detail);
        throw new Error(`串口设备已断开，指令未发送。(${detail})`);
      }
      this.state = "error";
      this.errorCode = "SERIAL_WRITE_FAILED";
      this.errorDetail = detail;
      hardwareLog.error("串口写入失败", `${hex} · ${detail}`);
      this.emitStatus();
      throw new Error(`串口写入失败：${detail}`);
    } finally {
      if (this.activeWriter === writer) {
        this.activeWriter = null;
      }
      try {
        writer.releaseLock();
      } catch {
        // port 已断开时 releaseLock 可能抛错，忽略即可
      }
    }
  }

  getStatus(): SerialStatus {
    const connected = this.isPhysicallyConnected();
    return {
      state: this.state,
      port: connected ? this.portIdFor(this.port as SerialPort) : null,
      device: connected ? "Web Serial" : null,
      baudRate: this.baudRate,
      connected,
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
        const port = readEventPort(event);
        if (port) {
          // 重新插入：清除「已拔出」标记，等待用户重新连接
          this.absentPorts.delete(port);
        }
        hardwareLog.info(
          "检测到 Web Serial 设备插入",
          port ? this.describeForLog(port) : "浏览器未提供 event.port",
        );
        void this.emitDeviceChange("attached", port);
      });
      navigator.serial.addEventListener("disconnect", (event) => {
        const port = readEventPort(event);
        hardwareLog.warn(
          "检测到 Web Serial 设备拔出",
          port ? this.describeForLog(port) : "浏览器未提供 event.port",
        );
        this.handlePhysicalDisconnect(port);
      });
    } catch (error) {
      this.listenersRegistered = false;
      hardwareLog.warn(
        "注册 Web Serial 插拔监听失败",
        formatHardwareError(error),
      );
    }
  }

  /**
   * 物理拔出处理。
   *
   * - port 为 null（浏览器没给 event.port）时按「当前端口可能已断开」保守处理
   * - 拔出的不是当前端口时只刷新列表，不影响当前连接
   */
  private handlePhysicalDisconnect(port: SerialPort | null): void {
    if (port && this.port && port !== this.port) {
      void this.emitDeviceChange("detached", port);
      return;
    }
    this.markPhysicalDisconnect(
      this.port,
      "USB 串口设备已拔出",
      port ?? this.port,
    );
  }

  /**
   * 统一断连流程：清状态 → 清理 writer / port → 通知上层。
   * 允许 port.close() 抛错（设备已经不在），必须捕获。
   */
  private markPhysicalDisconnect(
    activePort: SerialPort | null,
    detail: string,
    reportedPort: SerialPort | null = activePort,
  ): void {
    const writer = this.activeWriter;
    this.activeWriter = null;
    this.port = null;
    this.physicalConnected = false;
    if (reportedPort) {
      this.absentPorts.add(reportedPort);
    }
    this.state = "error";
    this.errorCode = "SERIAL_DEVICE_DISCONNECTED";
    this.errorDetail = "USB 串口设备已拔出";
    hardwareLog.error(
      "canControl=false reason=SERIAL_DISCONNECTED",
      `${detail} · 已清理 activePort / writer，relayState 保持 UNKNOWN`,
    );
    void this.cleanupResources(activePort, writer);
    this.emitStatus();
    void this.emitDeviceChange("detached", reportedPort);
  }

  private async cleanupResources(
    port: SerialPort | null,
    writer: WritableStreamDefaultWriter<Uint8Array> | null,
  ): Promise<void> {
    if (writer) {
      try {
        await writer.abort("端口已断开");
      } catch {
        // writer 可能已经随端口一起失效
      }
      try {
        writer.releaseLock();
      } catch {
        // 已释放或端口已关闭时忽略
      }
    }
    if (port) {
      try {
        await port.close();
      } catch {
        // 物理拔出后 close() 会抛错，属于预期情况
      }
    }
  }

  private async releaseResources(): Promise<void> {
    const port = this.port;
    const writer = this.activeWriter;
    this.port = null;
    this.activeWriter = null;
    this.physicalConnected = false;
    await this.cleanupResources(port, writer);
  }

  private async emitDeviceChange(
    type: SerialDeviceChange["type"],
    port: SerialPort | null,
  ): Promise<void> {
    let info: SerialPortInfo | null = null;
    if (port) {
      try {
        info = this.withPresence(
          describeWebSerialPort(
            this.portIdFor(port),
            port,
            port === this.port,
          ),
          port,
        );
      } catch {
        info = null;
      }
    }
    for (const listener of this.deviceChangeListeners) {
      listener({type, port: info});
    }
  }

  private describeForLog(port: SerialPort): string {
    try {
      const info = describeWebSerialPort(this.portIdFor(port), port);
      return `VID=${info.vendorId ?? "未知"} PID=${info.productId ?? "未知"} `
        + `当前连接=${port === this.port ? "yes" : "no"}`;
    } catch {
      return "无法读取端口信息";
    }
  }

  private portIdFor(port: SerialPort): string {
    const existing = this.portIds.get(port);
    if (existing) return existing;
    const id = `serial-${this.nextPortId++}`;
    this.portIds.set(port, id);
    return id;
  }

  /** 标注物理在位状态：已拔出 / 当前已连接 / 未知。 */
  private withPresence(
    info: SerialPortInfo,
    port: SerialPort,
  ): SerialPortInfo {
    if (this.absentPorts.has(port)) {
      return {...info, physicallyPresent: false};
    }
    if (port === this.port && this.physicalConnected) {
      return {...info, physicallyPresent: true};
    }
    return {...info, physicallyPresent: null};
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
