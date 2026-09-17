import { defineStore } from "pinia";

import { fetchRelayState } from "@/api/deviceApi";
import { getApiErrorMessage } from "@/api/http";
import type {
  RelayEvent,
  RelayState,
  RelayStateValue,
} from "@/types/api";

interface RelayStoreState {
  statesByDevice: Record<string, Record<number, RelayState>>;
  loading: boolean;
  error: string | null;
}

export const useRelayStore = defineStore("relay", {
  state: (): RelayStoreState => ({
    statesByDevice: {},
    loading: false,
    error: null,
  }),

  getters: {
    stateFor: (state) => {
      return (deviceId: string, channel = 1): RelayState | null =>
        state.statesByDevice[deviceId]?.[channel] ?? null;
    },
  },

  actions: {
    async loadState(deviceId: string, channel = 1): Promise<RelayState> {
      this.loading = true;
      this.error = null;
      try {
        const relayState = await fetchRelayState(deviceId, channel);
        this.setState(relayState);
        return relayState;
      } catch (error) {
        this.error = getApiErrorMessage(error);
        throw error;
      } finally {
        this.loading = false;
      }
    },

    setState(relayState: RelayState): void {
      const deviceStates =
        this.statesByDevice[relayState.deviceId] ?? {};
      deviceStates[relayState.channel] = relayState;
      this.statesByDevice[relayState.deviceId] = deviceStates;
    },

    applyEvent(event: RelayEvent): void {
      const deviceStates = this.statesByDevice[event.deviceId] ?? {};
      const previous = deviceStates[event.channel];
      deviceStates[event.channel] = {
        deviceId: event.deviceId,
        channel: event.channel,
        commandedState: event.currentState,
        commandStatus: event.commandStatus,
        hardwareState: "UNKNOWN",
        lastEventId: event.eventId,
        lastEventSequence: event.sequence,
        updatedAt: event.createdAt,
      };
      if (
        previous?.lastEventSequence != null &&
        previous.lastEventSequence > event.sequence
      ) {
        deviceStates[event.channel] = previous;
        return;
      }
      this.statesByDevice[event.deviceId] = deviceStates;
    },

    applyLocalCommand(
      deviceId: string,
      channel: number,
      commandedState: RelayStateValue,
    ): void {
      const existing = this.statesByDevice[deviceId]?.[channel];
      const deviceStates = this.statesByDevice[deviceId] ?? {};
      deviceStates[channel] = {
        deviceId,
        channel,
        commandedState,
        commandStatus: "SUCCESS",
        hardwareState: "UNKNOWN",
        lastEventId: existing?.lastEventId ?? null,
        lastEventSequence: existing?.lastEventSequence ?? null,
        updatedAt: new Date().toISOString(),
      };
      this.statesByDevice[deviceId] = deviceStates;
    },
  },
});
