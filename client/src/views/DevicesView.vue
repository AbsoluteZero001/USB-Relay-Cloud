<script setup lang="ts">
import {
  ArrowRight,
  Cpu,
  Radio,
  RefreshCw,
} from "@lucide/vue";
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import { useDeviceStore } from "@/stores/deviceStore";
import { useRelayStore } from "@/stores/relayStore";
import {
  formatRelativeTime,
  onlineLabel,
} from "@/utils/format";

const router = useRouter();
const deviceStore = useDeviceStore();
const relayStore = useRelayStore();
const refreshing = ref(false);

async function refresh(): Promise<void> {
  refreshing.value = true;
  try {
    await deviceStore.loadDevices();
    await Promise.allSettled(
      deviceStore.devices.map((device) =>
        relayStore.loadState(device.deviceId),
      ),
    );
  } finally {
    refreshing.value = false;
  }
}

async function openDevice(deviceId: string): Promise<void> {
  deviceStore.selectDevice(deviceId);
  await relayStore.loadState(deviceId);
  await router.push("/");
}

onMounted(() => {
  void refresh();
});
</script>

<template>
  <div class="devices-page">
    <section class="page-toolbar">
      <div>
        <span class="section-kicker">Registered hardware</span>
        <h2>{{ deviceStore.devices.length }} Devices</h2>
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

    <div v-if="deviceStore.devices.length" class="device-list">
      <button
        v-for="device in deviceStore.devices"
        :key="device.deviceId"
        class="device-list-item"
        type="button"
        @click="openDevice(device.deviceId)"
      >
        <span class="device-list-icon">
          <Cpu :size="20" />
        </span>
        <span class="device-list-main">
          <strong>{{ device.deviceName }}</strong>
          <span>{{ device.deviceId }} · {{ device.deviceType }}</span>
        </span>
        <span class="device-list-state">
          <span
            class="status-badge"
            :class="device.onlineStatus.toLowerCase()"
          >
            <Radio :size="13" />
            {{ onlineLabel(device.onlineStatus) }}
          </span>
          <small>{{ formatRelativeTime(device.lastSeen) }}</small>
        </span>
        <span class="device-list-command">
          <small>Last Command</small>
          <strong>
            {{
              relayStore.stateFor(device.deviceId, 1)?.commandedState ??
              "UNKNOWN"
            }}
          </strong>
        </span>
        <ArrowRight class="device-list-arrow" :size="18" />
      </button>
    </div>

    <div v-else class="empty-state">
      <Cpu :size="28" />
      <strong>No devices registered</strong>
      <span>Heartbeat and relay events create device records.</span>
    </div>
  </div>
</template>
