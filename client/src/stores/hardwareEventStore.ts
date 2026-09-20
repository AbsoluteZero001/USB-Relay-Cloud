import {defineStore} from "pinia";

import {fetchHardwareEvents} from "@/api/hardwareEventApi";
import {getApiErrorMessage} from "@/api/http";
import type {HardwareEvent, HardwareEventQuery, PageResponse,} from "@/types/api";

interface HardwareEventStoreState {
    events: HardwareEvent[];
    seenEventIds: string[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    loading: boolean;
    error: string | null;
}

export const useHardwareEventStore = defineStore("hardwareEvent", {
    state: (): HardwareEventStoreState => ({
        events: [],
        seenEventIds: [],
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 0,
        loading: false,
        error: null,
    }),

    getters: {
        latestSequence(state): number {
            return state.events.reduce(
                (latest, event) => Math.max(latest, event.sequence),
                0,
            );
        },
    },

    actions: {
        async loadEvents(
            deviceId: string,
            query: HardwareEventQuery = {},
        ): Promise<PageResponse<HardwareEvent>> {
            this.loading = true;
            this.error = null;
            try {
                const response = await fetchHardwareEvents(deviceId, {
                    page: query.page ?? this.page,
                    pageSize: query.pageSize ?? this.pageSize,
                    ...query,
                });
                this.events = [...response.records].sort(
                    (left, right) => right.sequence - left.sequence,
                );
                this.seenEventIds = response.records.map((event) => event.eventId);
                this.page = response.page;
                this.pageSize = response.pageSize;
                this.total = response.total;
                this.totalPages = response.totalPages;
                return response;
            } catch (error) {
                this.error = getApiErrorMessage(error);
                throw error;
            } finally {
                this.loading = false;
            }
        },

        appendEvent(event: HardwareEvent): boolean {
            if (this.seenEventIds.includes(event.eventId)) {
                return false;
            }
            this.seenEventIds.push(event.eventId);
            this.events = [event, ...this.events].sort(
                (left, right) => right.sequence - left.sequence,
            );
            if (this.events.length > 200) {
                const removed = this.events.splice(200);
                const removedIds = new Set(removed.map((item) => item.eventId));
                this.seenEventIds = this.seenEventIds.filter(
                    (eventId) => !removedIds.has(eventId),
                );
            }
            this.total += 1;
            return true;
        },

        clear(): void {
            this.events = [];
            this.seenEventIds = [];
            this.total = 0;
            this.totalPages = 0;
            this.page = 1;
        },
    },
});
