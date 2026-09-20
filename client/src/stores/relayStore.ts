import {defineStore} from "pinia";

import {fetchRelayState} from "@/api/deviceApi";
import {getApiErrorMessage} from "@/api/http";
import type {CommandStatus, RelayEvent, RelayState, RelayStateValue,} from "@/types/api";

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
        // sequence 守卫：旧事件不覆盖新状态。
        if (
            previous?.lastEventSequence != null &&
            event.sequence != null &&
            previous.lastEventSequence > event.sequence
        ) {
            return;
        }
        // spec §10：仅 SUCCESS 事件推进 commandedState；
        // FAILED 事件保留 previousState（指令未生效，状态不变），
        // 只更新 commandStatus 与日志字段。
        const commandedState =
            event.commandStatus === "SUCCESS"
                ? event.currentState
                : (previous?.commandedState ?? event.previousState);
      deviceStates[event.channel] = {
        deviceId: event.deviceId,
        channel: event.channel,
          commandedState,
        commandStatus: event.commandStatus,
        hardwareState: "UNKNOWN",
        lastEventId: event.eventId,
        lastEventSequence: event.sequence,
        updatedAt: event.createdAt,
      };
      this.statesByDevice[event.deviceId] = deviceStates;
    },

    applyLocalCommand(
      deviceId: string,
      channel: number,
      commandedState: RelayStateValue,
      commandStatus: CommandStatus = "SUCCESS",
    ): void {
      const existing = this.statesByDevice[deviceId]?.[channel];
      const deviceStates = this.statesByDevice[deviceId] ?? {};
        // spec §4：写入失败时不推进 commandedState，保持原状态。
        const nextCommandedState =
            commandStatus === "SUCCESS"
                ? commandedState
                : (existing?.commandedState ?? "UNKNOWN");
      deviceStates[channel] = {
        deviceId,
        channel,
          commandedState: nextCommandedState,
          commandStatus,
        hardwareState: "UNKNOWN",
        lastEventId: existing?.lastEventId ?? null,
        lastEventSequence: existing?.lastEventSequence ?? null,
        updatedAt: new Date().toISOString(),
      };
      this.statesByDevice[deviceId] = deviceStates;
    },
  },
});
