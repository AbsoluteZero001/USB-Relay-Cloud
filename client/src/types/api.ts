export type OnlineStatus = "ONLINE" | "OFFLINE";
export type RelayAction = "ON" | "OFF";
export type RelayStateValue = "ON" | "OFF" | "UNKNOWN";
export type CommandStatus = "SUCCESS" | "FAILED";
export type EventSource = "ANDROID" | "WEB" | "ELECTRON" | "SYSTEM";

/**
 * 硬件生命周期事件类型。与继电器 ON/OFF 指令事件相互独立。
 * USB 拔出只记录 USB_DETACHED / USB_DISCONNECTED，绝不伪造 relay OFF。
 */
export type HardwareEventType =
    | "USB_ATTACHED"
    | "USB_CONNECTED"
    | "USB_DISCONNECTED"
    | "USB_DETACHED"
    | "USB_PERMISSION_GRANTED"
    | "USB_PERMISSION_DENIED"
    | "USB_OPEN_FAILED"
    | "USB_WRITE_FAILED"
    | "UNSUPPORTED_DEVICE";
export type WebSocketStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export interface ApiResponse<T> {
  success: boolean;
  code: string;
  message: string;
  data: T;
  timestamp: string;
}

export interface PageResponse<T> {
  records: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Device {
  id: number;
  deviceId: string;
  deviceName: string;
  deviceType: string;
  onlineStatus: OnlineStatus;
  lastSeen: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RelayState {
  deviceId: string;
  channel: number;
  commandedState: RelayStateValue;
  commandStatus: CommandStatus;
  hardwareState: RelayStateValue;
  lastEventId: string | null;
  lastEventSequence: number | null;
  updatedAt: string | null;
}

export interface RelayEvent {
  sequence: number;
  eventId: string;
  deviceId: string;
  channel: number;
  action: RelayAction;
  previousState: RelayStateValue;
  currentState: RelayStateValue;
  commandStatus: CommandStatus;
  source: EventSource;
  clientId: string;
  hardwareState: RelayStateValue;
  createdAt: string;
  idempotentReplay: boolean;
}

export interface DeviceDetail {
  device: Device;
  states: RelayState[];
}

export interface HeartbeatResponse {
  device: Device;
  states: RelayState[];
}

export interface RelayEventCreatePayload {
  eventId: string;
  channel: number;
  action: RelayAction;
  previousState: RelayStateValue;
  currentState: RelayStateValue;
  commandStatus: CommandStatus;
  source: EventSource;
  clientId: string;
}

export interface HeartbeatPayload {
  deviceName: string;
  deviceType: string;
  clientId: string;
}

export interface RelayEventQuery {
  page?: number;
  pageSize?: number;
  afterSequence?: number;
  from?: string;
  to?: string;
  action?: RelayAction;
  source?: EventSource;
}

/**
 * 硬件生命周期事件。独立于继电器 ON/OFF 指令事件。
 * USB 拔出只记录 USB_DETACHED / USB_DISCONNECTED，绝不伪造 relay OFF。
 */
export interface HardwareEvent {
    sequence: number;
    eventId: string;
    deviceId: string;
    eventType: HardwareEventType;
    source: EventSource;
    clientId: string;
    profileName: string | null;
    serialDevice: string | null;
    vendorId: string | null;
    productId: string | null;
    baudRate: number | null;
    dataBits: number | null;
    stopBits: number | null;
    parity: string | null;
    channel: number | null;
    actorUserId: number | null;
    actorUsername: string | null;
    actorClientId: string | null;
    executorClientId: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    createdAt: string;
    idempotentReplay: boolean;
}

export interface HardwareEventCreatePayload {
    eventId: string;
    eventType: HardwareEventType;
    source: EventSource;
    clientId: string;
    profileName?: string | null;
    serialDevice?: string | null;
    vendorId?: string | null;
    productId?: string | null;
    baudRate?: number | null;
    dataBits?: number | null;
    stopBits?: number | null;
    parity?: string | null;
    channel?: number | null;
    actorUserId?: number | null;
    actorUsername?: string | null;
    actorClientId?: string | null;
    executorClientId?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
}

export interface HardwareEventQuery {
    page?: number;
    pageSize?: number;
    from?: string;
    to?: string;
}

export interface RelayWebSocketMessage {
  type:
    | "CONNECTED"
    | "RELAY_STATE_CHANGED"
    | "DEVICE_STATUS_CHANGED"
    | "SYNC_COMPLETE"
      | "HARDWARE_EVENT"
      | "ERROR"
      | "AUTHENTICATED"
      | "AUTH_FAILED";
  sequence?: number;
  eventId?: string;
  deviceId?: string;
  deviceName?: string;
  channel?: number;
  commandedState?: RelayStateValue;
  commandStatus?: CommandStatus;
  hardwareState?: RelayStateValue;
  previousState?: RelayStateValue;
  currentState?: RelayStateValue;
  action?: RelayAction;
  source?: EventSource;
  clientId?: string;
  onlineStatus?: OnlineStatus;
  timestamp?: string;
  message?: string;
    // HARDWARE_EVENT 专用字段
    hardwareEventType?: HardwareEventType;
    hardwareProfileName?: string;
    hardwareSerialDevice?: string;
    hardwareVendorId?: string;
    hardwareProductId?: string;
    hardwareBaudRate?: number;
    hardwareDataBits?: number;
    hardwareStopBits?: number;
    hardwareParity?: string;
    hardwareErrorCode?: string;
    hardwareErrorMessage?: string;
}

export interface LoginResponse {
    accessToken: string;
    tokenType: string;
    expiresIn: number;
}

export interface CurrentUser {
    userId: number;
    username: string;
    globalRole: string;
}

export type CloudSyncStatus = "SUCCESS" | "FAILED" | "NOT_REQUIRED";

export interface RelayExecutionResult {
  commandId: string;
  deviceId: string;
  channel: number;
  commandedState: RelayStateValue;
  commandStatus: CommandStatus;
  hardwareState: "UNKNOWN";
  localWriteSucceeded: boolean;
  cloudSyncStatus: CloudSyncStatus;
  cloudSyncMessage: string | null;
  cloudEvent: RelayEvent | null;
}
