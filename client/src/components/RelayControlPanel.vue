<script setup lang="ts">
import {AlertCircle, Loader2, Power} from "@lucide/vue";
import {computed, ref} from "vue";

import {getApiErrorMessage} from "@/api/http";
import {relayService} from "@/services/relay";
import type {HardwareStatus} from "@/services/relay/hardware";
import type {RelayAction, RelayExecutionResult} from "@/types/api";
import {stateLabel} from "@/utils/format";

const props = defineProps<{
  deviceId: string | null;
  hardwareStatus: HardwareStatus;
}>();

const emit = defineEmits<{
  completed: [result: RelayExecutionResult];
}>();

const status = computed(() => props.hardwareStatus);
const connected = computed(() => status.value.state === "CONNECTED");
const isOn = computed(() => status.value.commandedState === "ON");
const executing = computed(() => status.value.executing);

const canControl = computed(
    () => connected.value && !executing.value && !!props.deviceId,
);

const executionLabel = computed(() => {
  if (executing.value) return "EXECUTING";
  if (status.value.commandStatus === "FAILED") return "FAILED";
  if (connected.value) return "READY";
  return "IDLE";
});

const executionLabelClass = computed(() => {
  if (executing.value) return "info";
  if (status.value.commandStatus === "FAILED") return "failed";
  if (connected.value) return "success";
  return "unknown";
});

const hintText = computed(() => {
  if (status.value.state === "UNSUPPORTED") {
    return "未匹配到支持的继电器配置";
  }
  if (status.value.state === "PERMISSION_REQUIRED") {
    return "需要 USB 权限，无法控制";
  }
  if (!connected.value) {
    return "未连接硬件，无法控制";
  }
  if (executing.value) {
    return "正在执行...";
  }
  if (status.value.commandStatus === "FAILED") {
    return status.value.errorDetail ?? "控制失败";
  }
  return "";
});

const error = ref<string | null>(null);
const cloudNotice = ref<string | null>(null);

async function toggle(): Promise<void> {
  if (!props.deviceId || !canControl.value) return;
  const target: RelayAction = isOn.value ? "OFF" : "ON";
  error.value = null;
  cloudNotice.value = null;
  try {
    const result = await relayService.executeLocalCommand(
        props.deviceId,
        1,
        target,
    );
    if (result.cloudSyncStatus === "SUCCESS") {
      cloudNotice.value = "云端已同步";
    } else {
      cloudNotice.value = result.cloudSyncMessage ?? "云端同步失败";
    }
    if (!result.localWriteSucceeded) {
      error.value = result.cloudSyncMessage ?? "本地写入失败，状态未改变";
    }
    emit("completed", result);
  } catch (caught) {
    error.value = getApiErrorMessage(caught);
  }
}
</script>

<template>
  <section class="panel-card relay-control-card">
    <div class="panel-card-head">
      <div>
        <span class="section-kicker">继电器控制</span>
        <h2>继电器 1</h2>
      </div>
      <span
          class="status-badge"
          :class="executionLabelClass"
      >
        <component
            :is="executing ? Loader2 : Power"
            :size="14"
            :class="{ spin: executing }"
        />
        {{ executionLabel }}
      </span>
    </div>

    <div class="command-state">
      <span class="command-icon" :class="isOn ? 'on' : 'off'">
        <Power :size="28"/>
      </span>
      <div>
        <span>当前指令状态</span>
        <strong :class="isOn ? 'on' : 'off'">
          {{ stateLabel(status.commandedState) }}
        </strong>
      </div>
    </div>

    <div class="relay-switch-row">
      <button
          type="button"
          role="switch"
          class="relay-switch"
          :class="{ on: isOn, disabled: !canControl }"
          :aria-checked="isOn"
          :disabled="!canControl"
          @click="toggle"
      >
        <span class="relay-switch-track">
          <span class="relay-switch-thumb"/>
        </span>
      </button>
      <span class="relay-switch-label" :class="{ on: isOn }">
        {{ isOn ? "ON" : "OFF" }}
      </span>
    </div>

    <p v-if="hintText" class="inline-note" :class="{ error: status.commandStatus === 'FAILED' }">
      <AlertCircle v-if="status.commandStatus === 'FAILED'" :size="13"/>
      {{ hintText }}
    </p>
    <p v-else-if="cloudNotice" class="inline-note success">
      {{ cloudNotice }}
    </p>
  </section>
</template>
