import { apiGet, apiPost } from "./http";

import type {
  Device,
  DeviceDetail,
  HeartbeatPayload,
  HeartbeatResponse,
  PageResponse,
  RelayState,
} from "@/types/api";

export function fetchDevices(
  page = 1,
  pageSize = 50,
): Promise<PageResponse<Device>> {
  return apiGet<PageResponse<Device>>("/devices", { page, pageSize });
}

export function fetchDevice(deviceId: string): Promise<DeviceDetail> {
  return apiGet<DeviceDetail>(`/devices/${encodeURIComponent(deviceId)}`);
}

export function fetchRelayState(
  deviceId: string,
  channel = 1,
): Promise<RelayState> {
  return apiGet<RelayState>(
    `/devices/${encodeURIComponent(deviceId)}/state`,
    { channel },
  );
}

export function sendHeartbeat(
  deviceId: string,
  payload: HeartbeatPayload,
): Promise<HeartbeatResponse> {
  return apiPost<HeartbeatResponse>(
    `/devices/${encodeURIComponent(deviceId)}/heartbeat`,
    payload,
  );
}
