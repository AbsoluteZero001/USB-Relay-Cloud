<script setup lang="ts">
import {AlertCircle, HelpCircle, Loader2, Power, PowerOff} from "@lucide/vue";
import {computed, ref, watch} from "vue";

import {getApiErrorMessage} from "@/api/http";
import {relayService} from "@/services/relay";
import {resolveControlAvailability} from "@/services/relay/controlAvailability";
import {hardwareLog} from "@/services/relay/diagnostics";
import type {HardwareStatus} from "@/services/relay/hardware";
import {hardwareStateLabel} from "@/services/relay/hardware";
import type {
  RelayAction,
  RelayExecutionResult,
  RelayStateValue,
} from "@/types/api";
import {stateLabel} from "@/utils/format";

const props = defineProps<{
  /** 关联的云端设备 ID；null 表示仅本地控制（不阻塞开关） */
  deviceId: string | null;
  hardwareStatus: HardwareStatus;
}>();

const emit = defineEmits<{
  completed: [result: RelayExecutionResult];
}>();

const status = computed(() => props.hardwareStatus);
const connected = computed(() => status.value.state === "CONNECTED");
const commandedState = computed<RelayStateValue>(
    () => status.value.commandedState,
);
const isOn = computed(() => commandedState.value === "ON");
const isOff = computed(() => commandedState.value === "OFF");
const isUnknown = computed(() => commandedState.value === "UNKNOWN");

/**
 * 控制权限只取决于本地串口连接 + 是否有写入正在进行。
 * 与云端 device / relay_state / WebSocket 无关（见 controlAvailability.ts）。
 */
const availability = computed(() => resolveControlAvailability(status.value));
const canControl = computed(() => availability.value.canControl);
const writeInProgress = computed(
    () => status.value.executing || availability.value.writeInProgress,
);

const switchStateClass = computed(() => {
  if (!connected.value) return "is-offline";
  if (isOn.value) return "is-on";
  if (isOff.value) return "is-off";
  return "is-unknown";
});

const switchLabel = computed(() => {
  if (!connected.value) {
    return availability.value.reason === "SERIAL_DISCONNECTED"
      ? "已断开"
      : "未连接";
  }
  if (isOn.value) return "ON";
  if (isOff.value) return "OFF";
  return "未知";
});

const executionLabel = computed(() => {
  if (writeInProgress.value) return "EXECUTING";
  if (status.value.commandStatus === "FAILED") return "FAILED";
  if (connected.value) return "READY";
  return "IDLE";
});

const executionLabelClass = computed(() => {
  if (writeInProgress.value) return "info";
  if (status.value.commandStatus === "FAILED") return "failed";
  if (connected.value) return "success";
  return "unknown";
});

const error = ref<string | null>(null);
const notice = ref<string | null>(null);

const hintText = computed(() => {
  if (error.value) return error.value;
  if (status.value.commandStatus === "FAILED" && status.value.errorDetail) {
    return status.value.errorDetail;
  }
  if (!connected.value) {
    return `${hardwareStateLabel(status.value.state)}：${availability.value.message}`;
  }
  if (writeInProgress.value) return "正在写入串口指令…";
  if (isUnknown.value) return "当前状态未知，可发送控制指令";
  return availability.value.message;
});

// canControl=false 时必须能看出具体原因（不再只有一句“不能控制”）。
// 只在「可控制性 / 原因」真正变化时记录，避免硬件状态频繁推送刷屏。
watch(
    () => `${availability.value.canControl}:${availability.value.reason ?? ""}`,
    () => {
  if (availability.value.canControl) {
    hardwareLog.info(
      "canControl=true",
      `state=${status.value.state} relayState=${commandedState.value}`,
    );
    return;
  }
  hardwareLog.info(
    `canControl=false reason=${availability.value.reason}`,
    `${availability.value.message} · state=${status.value.state} `
    + `relayState=${commandedState.value}`,
  );
}, {immediate: true});

async function toggle(): Promise<void> {
  if (!canControl.value) {
    hardwareLog.warn(
      `canControl=false reason=${availability.value.reason}`,
      `忽略点击 · state=${status.value.state}`,
    );
    return;
  }
  const target: RelayAction = isOn.value ? "OFF" : "ON";
  const previousState = commandedState.value;
  error.value = null;
  notice.value = null;
  try {
    const result = await relayService.executeLocalCommand(
        props.deviceId,
        1,
        target,
    );
    if (!result.localWriteSucceeded) {
      // 本地写入失败：状态保持原值，不伪造成功。
      error.value = result.cloudSyncMessage ?? "本地写入失败，状态未改变";
      hardwareLog.warn(
        "本地写入失败，状态保持原值",
        `target=${target} previousState=${previousState} `
        + `reason=${error.value}`,
      );
    } else if (result.cloudSyncStatus === "SUCCESS") {
      notice.value = `已发送 ${target}，云端已同步`;
    } else if (result.cloudSyncStatus === "NOT_REQUIRED") {
      notice.value = `已发送 ${target}（本地控制完成，未关联云端设备）`;
    } else {
      notice.value = `已发送 ${target}；${
          result.cloudSyncMessage ?? "云端同步失败"
      }`;
    }
    emit("completed", result);
  } catch (caught) {
    error.value = getApiErrorMessage(caught);
    hardwareLog.warn(
      "本地控制异常，状态保持原值",
      `target=${target} previousState=${previousState} reason=${error.value}`,
    );
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
      <span class="status-badge" :class="executionLabelClass">
        <component
            :is="writeInProgress ? Loader2 : Power"
            :size="14"
            :class="{spin: writeInProgress}"
        />
        {{ executionLabel }}
      </span>
    </div>

    <div class="command-state">
      <span class="command-icon" :class="switchStateClass">
        <Power :size="28"/>
      </span>
      <div>
        <span>当前指令状态</span>
        <strong :class="switchStateClass">
          {{ stateLabel(commandedState) }}
        </strong>
      </div>
    </div>

    <div class="relay-switch-row">
      <button
          type="button"
          role="switch"
          class="relay-switch"
          :class="[switchStateClass, {disabled: !canControl, busy: writeInProgress}]"
          :disabled="!canControl"
          :aria-checked="isUnknown ? 'mixed' : isOn"
          :aria-label="`继电器开关，当前 ${switchLabel}`"
          @click="toggle"
      >
        <span class="relay-switch-track">
          <span class="relay-switch-thumb">
            <Loader2 v-if="writeInProgress" :size="22" class="spin"/>
            <Power v-else-if="isOn" :size="22"/>
            <PowerOff v-else-if="isOff" :size="22"/>
            <HelpCircle v-else :size="22"/>
          </span>
        </span>
      </button>
      <div class="relay-switch-label-group">
        <span class="relay-switch-label" :class="switchStateClass">
          {{ switchLabel }}
        </span>
        <span class="relay-switch-sublabel">
          {{ isOn ? "开启" : isOff ? "关闭" : isUnknown && connected ? "未知" : "—" }}
        </span>
      </div>
    </div>

    <p
        class="inline-note"
        :class="{error: !!error || status.commandStatus === 'FAILED'}"
    >
      <AlertCircle
          v-if="error || status.commandStatus === 'FAILED'"
          :size="13"
      />
      {{ hintText }}
    </p>
    <p v-if="notice && !error" class="inline-note success">{{ notice }}</p>
  </section>
</template>
