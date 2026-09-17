export type OnlineStatus = "ONLINE" | "OFFLINE";
export type RelayAction = "ON" | "OFF";
export type RelayStateValue = "ON" | "OFF" | "UNKNOWN";
export type CommandStatus = "SUCCESS" | "FAILED";
export type EventSource = "ANDROID" | "WEB" | "ELECTRON" | "SYSTEM";
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

export interface RelayWebSocketMessage {
  type:
    | "CONNECTED"
    | "RELAY_STATE_CHANGED"
    | "DEVICE_STATUS_CHANGED"
    | "SYNC_COMPLETE"
    | "ERROR";
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
