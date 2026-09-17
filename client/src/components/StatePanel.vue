<script setup lang="ts">
import {
  Activity,
  CircleHelp,
  Clock3,
  Power,
  Radio,
} from "@lucide/vue";
import { computed } from "vue";

import type { Device, RelayState } from "@/types/api";
import {
  formatDateTime,
  formatRelativeTime,
  onlineLabel,
} from "@/utils/format";

const props = defineProps<{
  device: Device | null;
  relayState: RelayState | null;
}>();

const commandLabel = computed(
  () => props.relayState?.commandedState ?? "UNKNOWN",
);
const commandStatus = computed(
  () => props.relayState?.commandStatus ?? "FAILED",
);
</script>

<template>
  <section class="state-panel">
    <div class="state-panel-head">
      <div>
        <span class="section-kicker">Current relay state</span>
        <h2>{{ device?.deviceName ?? "No device selected" }}</h2>
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
      <div class="command-state">
        <span class="command-icon" :class="commandLabel.toLowerCase()">
          <Power :size="28" />
        </span>
        <div>
          <span>Last Command</span>
          <strong>{{ commandLabel }}</strong>
        </div>
      </div>

      <dl class="state-grid">
        <div>
          <dt><Activity :size="15" /> Command Status</dt>
          <dd
            class="state-value"
            :class="commandStatus.toLowerCase()"
          >
            {{ commandStatus }}
          </dd>
        </div>
        <div>
          <dt><CircleHelp :size="15" /> Hardware State</dt>
          <dd class="state-value unknown">UNKNOWN</dd>
        </div>
        <div>
          <dt><Clock3 :size="15" /> Last Seen</dt>
          <dd>{{ formatRelativeTime(device.lastSeen) }}</dd>
        </div>
        <div>
          <dt><Clock3 :size="15" /> State Updated</dt>
          <dd>{{ formatDateTime(relayState?.updatedAt) }}</dd>
        </div>
      </dl>
    </template>

    <div v-else class="empty-inline">
      发送 heartbeat 或 relay event 后，设备会在这里出现。
    </div>
  </section>
</template>
