<script setup lang="ts">
import {ArrowRight, History, Radio, Usb,} from "@lucide/vue";
import {computed} from "vue";

import type {HardwareEvent, RelayEvent,} from "@/types/api";
import {
  commandStatusLabel,
  formatTime,
  hardwareEventClass,
  hardwareEventResultLabel,
  hardwareEventTypeLabel,
  sourceLabel,
  stateLabel,
} from "@/utils/format";

const props = withDefaults(
  defineProps<{
    relayEvents: RelayEvent[];
    hardwareEvents: HardwareEvent[];
    limit?: number;
    dense?: boolean;
  }>(),
  {
    limit: 0,
    dense: false,
  },
);

interface UnifiedLogItem {
  kind: "relay" | "hardware";
  relay?: RelayEvent;
  hardware?: HardwareEvent;
  time: string;
  dateKey: string;
}

const allItems = computed<UnifiedLogItem[]>(() => {
  const items: UnifiedLogItem[] = [
    ...props.relayEvents.map((event) => ({
      kind: "relay" as const,
      relay: event,
      time: event.createdAt,
      dateKey: dateKeyOf(event.createdAt),
    })),
    ...props.hardwareEvents.map((event) => ({
      kind: "hardware" as const,
      hardware: event,
      time: event.createdAt,
      dateKey: dateKeyOf(event.createdAt),
    })),
  ];
  items.sort((a, b) => b.time.localeCompare(a.time));
  return props.limit > 0 ? items.slice(0, props.limit) : items;
});

function parityChar(parity: string | null | undefined): string {
  return (parity ?? "N").charAt(0).toUpperCase();
}

function dateKeyOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateHeader(dateKey: string): string {
  if (!dateKey) return "";
  const [y, m, d] = dateKey.split("-").map(Number);
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  if (dateKey === todayKey) {
    return `今天 · ${y}年${m}月${d}日`;
  }
  return `${y}年${m}月${d}日`;
}

const groupedItems = computed(() => {
  const groups: { dateKey: string; items: UnifiedLogItem[] }[] = [];
  for (const item of allItems.value) {
    const last = groups[groups.length - 1];
    if (last && last.dateKey === item.dateKey) {
      last.items.push(item);
    } else {
      groups.push({dateKey: item.dateKey, items: [item]});
    }
  }
  return groups;
});
</script>

<template>
  <div v-if="allItems.length" class="event-list-v2" :class="{ dense }">
    <template v-for="group in groupedItems" :key="group.dateKey">
      <div class="log-date-header">
        <span>{{ formatDateHeader(group.dateKey) }}</span>
      </div>

      <article
          v-for="item in group.items"
          :key="item.kind === 'relay' ? item.relay!.eventId : item.hardware!.eventId"
          class="log-row"
          :data-event-id="item.kind === 'relay' ? item.relay!.eventId : item.hardware!.eventId"
      >
        <time class="log-time" :datetime="item.time">
          {{ formatTime(item.time) }}
        </time>

        <div class="log-main">
          <!-- 继电器 ON/OFF 事件 -->
          <template v-if="item.kind === 'relay' && item.relay">
            <div class="log-title">
              <span
                  class="log-icon"
                  :class="item.relay.currentState.toLowerCase()"
              >
                <Radio :size="15"/>
              </span>
              <strong>
                继电器{{ stateLabel(item.relay.currentState) }}
              </strong>
            </div>
            <div class="log-sub">
              <span class="log-device">
                {{ item.relay.deviceId }} ·
                {{ item.relay.previousState }}
                <ArrowRight :size="12"/>
                {{ item.relay.currentState }}
              </span>
              <span class="log-meta">
                通道 {{ item.relay.channel }} ·
                {{ sourceLabel(item.relay.source) }}
              </span>
            </div>
          </template>

          <!-- 硬件生命周期事件 -->
          <template v-else-if="item.kind === 'hardware' && item.hardware">
            <div class="log-title">
              <span class="log-icon hardware">
                <Usb :size="15"/>
              </span>
              <strong>{{ hardwareEventTypeLabel(item.hardware.eventType) }}</strong>
            </div>
            <div class="log-sub">
              <span class="log-device">
                {{ item.hardware.serialDevice ?? "未知设备" }}
                <template v-if="item.hardware.profileName">
                  · {{ item.hardware.profileName }}
                </template>
              </span>
              <span class="log-meta">
                <template v-if="item.hardware?.baudRate">
                  {{ item.hardware!.baudRate }} {{ item.hardware!.dataBits }}{{
                    parityChar(item.hardware!.parity)
                  }}{{ item.hardware!.stopBits }}
                  ·
                </template>
                {{ sourceLabel(item.hardware!.source) }}
              </span>
            </div>
            <div
                v-if="item.hardware.errorMessage"
                class="log-error"
            >
              {{ item.hardware.errorMessage }}
            </div>
          </template>
        </div>

        <div class="log-status">
          <span
              class="status-tag"
              :class="
              item.kind === 'relay'
                ? item.relay!.commandStatus.toLowerCase()
                : hardwareEventClass(item.hardware!.eventType)
            "
          >
            {{
              item.kind === "relay"
                  ? commandStatusLabel(item.relay!.commandStatus)
                  : hardwareEventResultLabel(item.hardware!.eventType)
            }}
          </span>
        </div>
      </article>
    </template>
  </div>

  <div v-else class="empty-inline">
    <History :size="18" />
    <span>暂无历史事件</span>
  </div>
</template>
