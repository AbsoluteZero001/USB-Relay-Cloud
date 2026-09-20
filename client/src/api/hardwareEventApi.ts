import {apiGet, apiPost} from "./http";

import type {HardwareEvent, HardwareEventCreatePayload, HardwareEventQuery, PageResponse,} from "@/types/api";

export function fetchHardwareEvents(
    deviceId: string,
    query: HardwareEventQuery = {},
): Promise<PageResponse<HardwareEvent>> {
    return apiGet<PageResponse<HardwareEvent>>(
        `/devices/${encodeURIComponent(deviceId)}/hardware-events`,
        {...query},
    );
}

export function createHardwareEvent(
    deviceId: string,
    payload: HardwareEventCreatePayload,
): Promise<HardwareEvent> {
    return apiPost<HardwareEvent>(
        `/devices/${encodeURIComponent(deviceId)}/hardware-events`,
        payload,
    );
}
