<script setup lang="ts">
import { CloudOff, Radio } from "@lucide/vue";
import { computed } from "vue";

import { useConnectionStore } from "@/stores/connectionStore";

const connectionStore = useConnectionStore();
const online = computed(
  () => connectionStore.webSocketStatus === "connected",
);
const label = computed(() => {
  const labels: Record<string, string> = {
    idle: "未连接",
    connecting: "连接中",
    connected: "实时在线",
    reconnecting: "重连中",
    disconnected: "已断开",
  };
  return labels[connectionStore.webSocketStatus] ?? "未知";
});
</script>

<template>
  <span class="connection-badge" :class="{ online }">
    <Radio v-if="online" :size="15" />
    <CloudOff v-else :size="15" />
    {{ label }}
  </span>
</template>
