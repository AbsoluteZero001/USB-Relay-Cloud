import { apiGet, apiPost } from "./http";

import type {
  PageResponse,
  RelayEvent,
  RelayEventCreatePayload,
  RelayEventQuery,
} from "@/types/api";

export function fetchRelayEvents(
  deviceId: string,
  query: RelayEventQuery = {},
): Promise<PageResponse<RelayEvent>> {
  return apiGet<PageResponse<RelayEvent>>(
    `/devices/${encodeURIComponent(deviceId)}/events`,
    { ...query },
  );
}

export function createRelayEvent(
  deviceId: string,
  payload: RelayEventCreatePayload,
): Promise<RelayEvent> {
  return apiPost<RelayEvent>(
    `/devices/${encodeURIComponent(deviceId)}/events`,
    payload,
  );
}
