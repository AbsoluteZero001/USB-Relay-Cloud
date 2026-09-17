<script setup lang="ts">
import { ArrowRight, History, Radio } from "@lucide/vue";
import { computed } from "vue";

import type { RelayEvent } from "@/types/api";
import { formatDateTime, sourceLabel } from "@/utils/format";

const props = withDefaults(
  defineProps<{
    events: RelayEvent[];
    limit?: number;
    dense?: boolean;
  }>(),
  {
    limit: 0,
    dense: false,
  },
);

const visibleEvents = computed(() =>
  props.limit > 0 ? props.events.slice(0, props.limit) : props.events,
);
</script>

<template>
  <div v-if="visibleEvents.length" class="event-list" :class="{ dense }">
    <article
      v-for="event in visibleEvents"
      :key="event.eventId"
      class="event-row"
      :data-event-id="event.eventId"
    >
      <span class="event-icon" :class="event.currentState.toLowerCase()">
        <Radio :size="15" />
      </span>
      <div class="event-main">
        <div class="event-transition">
          <strong>{{ event.previousState }}</strong>
          <ArrowRight :size="14" />
          <strong :class="event.currentState.toLowerCase()">
            {{ event.currentState }}
          </strong>
        </div>
        <span>
          {{ sourceLabel(event.source) }} · Relay {{ event.channel }} ·
          {{ event.commandStatus }}
        </span>
      </div>
      <time :datetime="event.createdAt">
        {{ formatDateTime(event.createdAt) }}
      </time>
    </article>
  </div>

  <div v-else class="empty-inline">
    <History :size="18" />
    <span>暂无历史事件</span>
  </div>
</template>
