<script setup lang="ts">
import {Radio, Wifi, WifiOff} from "@lucide/vue";
import {computed} from "vue";

import {useConnectionStore} from "@/stores/connectionStore";
import type {Device, RelayState} from "@/types/api";
import {onlineLabel, stateLabel, webSocketStatusLabel,} from "@/utils/format";

const props = defineProps<{
  device: Device | null;
  relayState: RelayState | null;
}>();

const connectionStore = useConnectionStore();

const commandLabel = computed(
  () => props.relayState?.commandedState ?? "UNKNOWN",
);
const wsStatus = computed(() => connectionStore.webSocketStatus);
const wsOnline = computed(
    () =>
        wsStatus.value === "connected" || wsStatus.value === "reconnecting",
);
const wsLabel = computed(() =>
    wsOnline.value ? "实时在线" : webSocketStatusLabel(wsStatus.value),
);
</script>

<template>
  <section class="panel-card device-overview-card">
    <div class="panel-card-head">
      <div>
        <span class="section-kicker">设备概览</span>
        <h2>当前继电器</h2>
      </div>
      <span
        v-if="device"
        class="status-badge"
        :class="device.onlineStatus.toLowerCase()"
      >
        <Radio :size="14" />
        {{ onlineLabel(device.onlineStatus) }}
      </span>
    </div>

    <template v-if="device">
      <div class="overview-device">
        <strong>{{ device.deviceName }}</strong>
        <span class="overview-device-id">{{ device.deviceId }}</span>
      </div>

      <dl class="overview-grid">
        <div class="overview-item">
          <dt>云端最后指令</dt>
          <dd
              class="overview-value"
              :class="commandLabel.toLowerCase()"
          >
            {{ stateLabel(commandLabel) }}
          </dd>
        </div>
        <div class="overview-item">
          <dt>云端在线状态</dt>
          <dd
              class="overview-value"
              :class="device.onlineStatus.toLowerCase()"
          >
            {{ onlineLabel(device.onlineStatus) }}
          </dd>
        </div>
        <div class="overview-item">
          <dt>WebSocket</dt>
          <dd
              class="overview-value"
              :class="wsOnline ? 'success' : 'unknown'"
          >
            <component
                :is="wsOnline ? Wifi : WifiOff"
                :size="14"
            />
            {{ wsLabel }}
          </dd>
        </div>
      </dl>
    </template>

    <div v-else class="empty-inline">
      发送 heartbeat 或 relay event 后，设备会在这里出现。
    </div>
  </section>
</template>
