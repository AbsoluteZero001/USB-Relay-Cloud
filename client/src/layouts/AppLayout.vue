<script setup lang="ts">
import {
  Cpu,
  LayoutDashboard,
  ScrollText,
  Settings,
  RadioTower,
} from "@lucide/vue";
import { computed } from "vue";
import { RouterLink, RouterView, useRoute } from "vue-router";

import ConnectionBadge from "@/components/ConnectionBadge.vue";
import { useDeviceStore } from "@/stores/deviceStore";
import { onlineLabel } from "@/utils/format";

defineProps<{
  booting: boolean;
  bootstrapError: string | null;
}>();

const route = useRoute();
const deviceStore = useDeviceStore();

const navItems = [
  { name: "dashboard", label: "Dashboard", icon: LayoutDashboard, to: "/" },
  { name: "devices", label: "Devices", icon: Cpu, to: "/devices" },
  { name: "logs", label: "Logs", icon: ScrollText, to: "/logs" },
  { name: "settings", label: "Settings", icon: Settings, to: "/settings" },
] as const;

const currentLabel = computed(() => {
  const item = navItems.find((candidate) => candidate.name === route.name);
  return item?.label ?? "USB Relay Cloud";
});
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar" aria-label="主导航">
      <div class="brand-block">
        <span class="brand-icon"><RadioTower :size="22" /></span>
        <div>
          <strong>USB Relay Cloud</strong>
          <span>Device operations</span>
        </div>
      </div>

      <nav class="side-nav">
        <RouterLink
          v-for="item in navItems"
          :key="item.name"
          :to="item.to"
          class="nav-item"
          :class="{ active: route.name === item.name }"
        >
          <component :is="item.icon" :size="18" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div v-if="deviceStore.selectedDevice" class="sidebar-device">
        <span
          class="status-dot"
          :class="deviceStore.selectedDevice.onlineStatus.toLowerCase()"
        />
        <div>
          <strong>{{ deviceStore.selectedDevice.deviceName }}</strong>
          <span>{{ onlineLabel(deviceStore.selectedDevice.onlineStatus) }}</span>
        </div>
      </div>
    </aside>

    <div class="app-main">
      <header class="app-header">
        <div>
          <span class="header-kicker">USB Relay Platform</span>
          <h1>{{ currentLabel }}</h1>
        </div>
        <ConnectionBadge />
      </header>

      <div v-if="bootstrapError" class="alert alert-error" role="alert">
        {{ bootstrapError }}
      </div>

      <main class="page-stage" :class="{ 'is-booting': booting }">
        <div v-if="booting" class="loading-line" />
        <RouterView v-else />
      </main>
    </div>

    <nav class="bottom-nav" aria-label="移动端导航">
      <RouterLink
        v-for="item in navItems"
        :key="item.name"
        :to="item.to"
        class="bottom-nav-item"
        :class="{ active: route.name === item.name }"
      >
        <component :is="item.icon" :size="20" />
        <span>{{ item.label }}</span>
      </RouterLink>
    </nav>
  </div>
</template>
