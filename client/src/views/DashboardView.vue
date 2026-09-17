<script setup lang="ts">
import {
  ArrowRight,
  Cpu,
  RefreshCw,
  ScrollText,
} from "@lucide/vue";
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";

import EventLogList from "@/components/EventLogList.vue";
import LocalRelayPanel from "@/components/LocalRelayPanel.vue";
import StatePanel from "@/components/StatePanel.vue";
import { useDeviceStore } from "@/stores/deviceStore";
import { useEventStore } from "@/stores/eventStore";
import { useRelayStore } from "@/stores/relayStore";
import type { RelayExecutionResult } from "@/types/api";

const deviceStore = useDeviceStore();
const relayStore = useRelayStore();
const eventStore = useEventStore();
const refreshing = ref(false);

const selectedDevice = computed(() => deviceStore.selectedDevice);
const relayState = computed(() => {
  const deviceId = selectedDevice.value?.deviceId;
  return deviceId ? relayStore.stateFor(deviceId, 1) : null;
});
const selectedEvents = computed(() => {
  const deviceId = selectedDevice.value?.deviceId;
  if (!deviceId) return [];
  return eventStore.events.filter((event) => event.deviceId === deviceId);
});

async function refresh(): Promise<void> {
  refreshing.value = true;
  try {
    await deviceStore.loadDevices();
    const deviceId = deviceStore.selectedDeviceId;
    if (deviceId) {
      await Promise.allSettled([
        relayStore.loadState(deviceId),
        eventStore.loadEvents(deviceId),
      ]);
    }
  } finally {
    refreshing.value = false;
  }
}

function applyLocalResult(result: RelayExecutionResult): void {
  if (result.cloudEvent && eventStore.appendEvent(result.cloudEvent)) {
    relayStore.applyEvent(result.cloudEvent);
  } else {
    relayStore.applyLocalCommand(
      result.deviceId,
      result.channel,
      result.commandedState,
    );
  }
}
</script>

<template>
  <div class="dashboard-page">
    <section class="page-toolbar">
      <div class="device-switcher" v-if="deviceStore.devices.length">
        <label for="dashboard-device">Device</label>
        <select
          id="dashboard-device"
          :value="deviceStore.selectedDeviceId ?? ''"
          @change="
            deviceStore.selectDevice(
              ($event.target as HTMLSelectElement).value,
            )
          "
        >
          <option
            v-for="device in deviceStore.devices"
            :key="device.deviceId"
            :value="device.deviceId"
          >
            {{ device.deviceName }}
          </option>
        </select>
      </div>
      <div v-else class="toolbar-empty">
        <Cpu :size="16" />
        No device registered
      </div>

      <button
        class="button button-secondary"
        type="button"
        :disabled="refreshing"
        @click="refresh"
      >
        <RefreshCw :size="16" :class="{ spin: refreshing }" />
        Refresh
      </button>
    </section>

    <div class="dashboard-grid">
      <StatePanel
        :device="selectedDevice"
        :relay-state="relayState"
      />
      <LocalRelayPanel
        :device-id="selectedDevice?.deviceId ?? null"
        @completed="applyLocalResult"
      />
    </div>

    <section class="data-panel">
      <div class="panel-heading">
        <div>
          <span class="section-kicker">Realtime history</span>
          <h2>Recent Events</h2>
        </div>
        <RouterLink class="text-link" to="/logs">
          Open Logs
          <ArrowRight :size="15" />
        </RouterLink>
      </div>

      <EventLogList :events="selectedEvents" :limit="8" />
    </section>

    <RouterLink
      v-if="!deviceStore.devices.length"
      class="setup-callout"
      to="/settings"
    >
      <ScrollText :size="20" />
      <div>
        <strong>Register the first device</strong>
        <span>Use heartbeat or upload a relay event.</span>
      </div>
      <ArrowRight :size="18" />
    </RouterLink>
  </div>
</template>
