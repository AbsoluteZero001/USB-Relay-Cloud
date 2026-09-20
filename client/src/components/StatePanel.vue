<script setup lang="ts">
import {Activity, CircleHelp, Clock3, Cpu, Power, Radio, Usb,} from "@lucide/vue";
import {computed} from "vue";

import type {HardwareStatus} from "@/services/relay/hardware";
import {hardwareStateLabel} from "@/services/relay/hardware";
import {relayService} from "@/services/relay";
import type {Device, RelayState} from "@/types/api";
import {commandStatusLabel, formatDateTime, formatRelativeTime, onlineLabel, stateLabel,} from "@/utils/format";

const props = defineProps<{
  device: Device | null;
  relayState: RelayState | null;
  hardwareStatus: HardwareStatus;
}>();

const commandLabel = computed(
  () => props.relayState?.commandedState ?? "UNKNOWN",
);
const commandStatus = computed(
  () => props.relayState?.commandStatus ?? "FAILED",
);
const localSupported = computed(() => relayService.isLocalControlSupported());
const localHardwareLabel = computed(() => {
  if (!localSupported.value) return "不可用";
  return hardwareStateLabel(props.hardwareStatus.state);
});
const localHardwareOnline = computed(
    () => props.hardwareStatus.state === "CONNECTED",
);
</script>

<template>
  <section class="state-panel">
    <div class="state-panel-head">
      <div>
        <span class="section-kicker">当前继电器状态</span>
        <h2>{{ device?.deviceName ?? "未选择设备" }}</h2>
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
          <span>云端最后指令</span>
          <strong>{{ stateLabel(commandLabel) }}</strong>
        </div>
      </div>

      <dl class="state-grid">
        <div>
          <dt>
            <Usb :size="15"/>
            本地硬件
          </dt>
          <dd
              class="state-value"
              :class="localHardwareOnline ? 'success' : 'unknown'"
          >
            {{ localHardwareLabel }}
          </dd>
        </div>
        <div>
          <dt>
            <Activity :size="15"/>
            指令状态
          </dt>
          <dd
            class="state-value"
            :class="commandStatus.toLowerCase()"
          >
            {{ commandStatusLabel(commandStatus) }}
          </dd>
        </div>
        <div>
          <dt>
            <CircleHelp :size="15"/>
            硬件状态
          </dt>
          <dd class="state-value unknown">未知</dd>
        </div>
        <div>
          <dt>
            <Clock3 :size="15"/>
            最后在线
          </dt>
          <dd>{{ formatRelativeTime(device.lastSeen) }}</dd>
        </div>
        <div>
          <dt>
            <Clock3 :size="15"/>
            状态更新时间
          </dt>
          <dd>{{ formatDateTime(relayState?.updatedAt) }}</dd>
        </div>
        <div>
          <dt>
            <Cpu :size="15"/>
            设备在线
          </dt>
          <dd>{{ onlineLabel(device.onlineStatus) }}</dd>
        </div>
      </dl>

      <p class="inline-note">
        云端最后指令与本地硬件连接状态相互独立：数据库记录的 ON/OFF
        仅代表最后一次成功指令，不代表当前 USB 已连接或物理为该状态。
      </p>
    </template>

    <div v-else class="empty-inline">
      发送 heartbeat 或 relay event 后，设备会在这里出现。
    </div>
  </section>
</template>
