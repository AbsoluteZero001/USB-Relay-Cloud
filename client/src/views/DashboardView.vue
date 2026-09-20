<script setup lang="ts">
import {ArrowRight, Cpu, RefreshCw, ScrollText,} from "@lucide/vue";
import {computed, onBeforeUnmount, onMounted, ref} from "vue";
import {RouterLink} from "vue-router";

import EventLogList from "@/components/EventLogList.vue";
import LocalRelayPanel from "@/components/LocalRelayPanel.vue";
import StatePanel from "@/components/StatePanel.vue";
import {relayService} from "@/services/relay";
import type {HardwareStatus} from "@/services/relay/hardware";
import {useDeviceStore} from "@/stores/deviceStore";
import {useEventStore} from "@/stores/eventStore";
import {useRelayStore} from "@/stores/relayStore";
import type {RelayExecutionResult} from "@/types/api";

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

// 本地硬件状态由 RelayService / LocalRelayProvider 维护，独立于云端 relay_state。
// WebSocket 收到 RELAY_STATE_CHANGED 只会更新 relayStore.commandedState，
// 不会改变本地 hardwareConnectionState（spec §12）。
const hardwareStatus = ref<HardwareStatus>(relayService.getHardwareStatus());
let unsubscribeHardware: (() => void) | null = null;

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
  // spec §4：云端事件回执优先；写入失败时不推进本地 commandedState。
  if (result.cloudEvent && eventStore.appendEvent(result.cloudEvent)) {
    relayStore.applyEvent(result.cloudEvent);
    return;
  }
  if (result.commandStatus === "SUCCESS") {
    relayStore.applyLocalCommand(
      result.deviceId,
      result.channel,
      result.commandedState,
        "SUCCESS",
    );
  }
  // FAILED：不更新 relayStore commandedState，UI 保持原状态。
}

onMounted(() => {
  unsubscribeHardware = relayService.onHardwareStatusChange((next) => {
    hardwareStatus.value = next;
  });
});

onBeforeUnmount(() => {
  unsubscribeHardware?.();
});
</script>

<template>
  <div class="dashboard-page">
    <section class="page-toolbar">
      <div class="device-switcher" v-if="deviceStore.devices.length">
        <label for="dashboard-device">设备</label>
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
        暂无设备
      </div>

      <button
        class="button button-secondary"
        type="button"
        :disabled="refreshing"
        @click="refresh"
      >
        <RefreshCw :size="16" :class="{ spin: refreshing }" />
        刷新
      </button>
    </section>

    <div class="dashboard-grid">
      <StatePanel
        :device="selectedDevice"
        :relay-state="relayState"
        :hardware-status="hardwareStatus"
      />
      <LocalRelayPanel
        :device-id="selectedDevice?.deviceId ?? null"
        :hardware-status="hardwareStatus"
        @completed="applyLocalResult"
      />
    </div>

    <section class="data-panel">
      <div class="panel-heading">
        <div>
          <span class="section-kicker">实时历史</span>
          <h2>最近事件</h2>
        </div>
        <RouterLink class="text-link" to="/logs">
          查看全部日志
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
        <strong>注册第一台设备</strong>
        <span>发送心跳或上传继电器事件后即可开始。</span>
      </div>
      <ArrowRight :size="18" />
    </RouterLink>
  </div>
</template>
