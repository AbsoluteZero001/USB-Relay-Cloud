<script setup lang="ts">
import {onBeforeUnmount, ref, watch} from "vue";

import AppLayout from "@/layouts/AppLayout.vue";
import { relayWebSocket } from "@/services/websocket";
import { websocketMessageToRelayEvent } from "@/services/websocket/message";
import {useAuthStore} from "@/stores/authStore";
import { useConnectionStore } from "@/stores/connectionStore";
import { useDeviceStore } from "@/stores/deviceStore";
import { useEventStore } from "@/stores/eventStore";
import { useRelayStore } from "@/stores/relayStore";

const authStore = useAuthStore();
const deviceStore = useDeviceStore();
const eventStore = useEventStore();
const relayStore = useRelayStore();
const connectionStore = useConnectionStore();

const bootstrapping = ref(false);
const bootstrapError = ref<string | null>(null);
let unsubscribeMessage: (() => void) | null = null;
let unsubscribeStatus: (() => void) | null = null;
let deviceRefreshTimer: number | null = null;

async function loadSelectedDevice(deviceId: string | null): Promise<void> {
  if (!deviceId) return;
  await Promise.allSettled([
    relayStore.loadState(deviceId),
    eventStore.loadEvents(deviceId),
  ]);
}

function scheduleDeviceRefresh(deviceId: string): void {
  if (deviceStore.devices.some((device) => device.deviceId === deviceId)) {
    return;
  }
  deviceStore.ensureDevicePlaceholder(deviceId);
  if (deviceRefreshTimer !== null) {
    window.clearTimeout(deviceRefreshTimer);
  }
  deviceRefreshTimer = window.setTimeout(() => {
    deviceRefreshTimer = null;
    void deviceStore.loadDevices();
  }, 400);
}

function teardownSubscriptions(): void {
  unsubscribeMessage?.();
  unsubscribeStatus?.();
  unsubscribeMessage = null;
  unsubscribeStatus = null;
  relayWebSocket.disconnect();
  if (deviceRefreshTimer !== null) {
    window.clearTimeout(deviceRefreshTimer);
    deviceRefreshTimer = null;
  }
}

async function bootstrap(): Promise<void> {
  bootstrapping.value = true;
  bootstrapError.value = null;
  try {
    await authStore.refreshUser();
    if (!authStore.isAuthenticated) {
      // token 无效，交给路由守卫跳转 /login
      return;
    }
    await deviceStore.loadDevices();
    await loadSelectedDevice(deviceStore.selectedDeviceId);

    unsubscribeStatus = relayWebSocket.onStatus((status) => {
      connectionStore.setWebSocketStatus(status);
    });
    unsubscribeMessage = relayWebSocket.onMessage((message) => {
      connectionStore.markMessageReceived();
      if (message.type === "RELAY_STATE_CHANGED") {
        const event = websocketMessageToRelayEvent(message);
        if (event) {
          scheduleDeviceRefresh(event.deviceId);
          if (eventStore.appendEvent(event)) {
            relayStore.applyEvent(event);
          }
        }
        return;
      }
      if (message.type === "DEVICE_STATUS_CHANGED" && message.deviceId) {
        deviceStore.setOnlineStatus(
          message.deviceId,
          message.onlineStatus ?? "OFFLINE",
          message.timestamp,
        );
        return;
      }
      if (message.type === "ERROR" && message.message) {
        connectionStore.setError(message.message);
      }
    });
    // 连接 WebSocket；客户端会在 open 后自动发送 AUTH 帧，
    // 服务端验证通过后会推送 gap replay（基于 latestSequence）。
    relayWebSocket.connect(eventStore.latestSequence);
  } catch (error) {
    bootstrapError.value =
      error instanceof Error ? error.message : "初始化失败";
    connectionStore.setError(bootstrapError.value);
  } finally {
    bootstrapping.value = false;
  }
}

// 登录成功 → bootstrap；登出 → 清理 WS 与 store
watch(
    () => authStore.isAuthenticated,
    (authenticated) => {
      if (authenticated) {
        void bootstrap();
      } else {
        teardownSubscriptions();
        eventStore.clear();
      }
    },
    {immediate: true},
);

watch(
  () => deviceStore.selectedDeviceId,
  (deviceId) => {
    if (authStore.isAuthenticated) {
      void loadSelectedDevice(deviceId);
    }
  },
);

onBeforeUnmount(() => {
  teardownSubscriptions();
});
</script>

<template>
  <AppLayout
    :booting="bootstrapping"
    :bootstrap-error="bootstrapError"
  />
</template>
