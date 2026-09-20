<script setup lang="ts">
import {Cable, CircleSlash, PlugZap, RefreshCw, Usb,} from "@lucide/vue";
import {computed, onBeforeUnmount, onMounted, ref} from "vue";

import {getApiErrorMessage} from "@/api/http";
import {relayService} from "@/services/relay";
import type {HardwareStatus} from "@/services/relay/hardware";
import {hardwareStateLabel} from "@/services/relay/hardware";
import type {RelayAction, RelayExecutionResult,} from "@/types/api";
import type {SerialPortInfo} from "@/services/relay/serial/types";

const props = defineProps<{
  deviceId: string | null;
  hardwareStatus: HardwareStatus;
}>();

const emit = defineEmits<{
  completed: [result: RelayExecutionResult];
}>();

const supported = computed(() => relayService.isLocalControlSupported());
const status = computed(() => props.hardwareStatus);
const matchedPorts = ref<{ port: SerialPortInfo; profile: unknown }[]>([]);
const selectedPort = ref("");
const error = ref<string | null>(null);
const cloudNotice = ref<string | null>(null);
const busy = ref(false);

const connected = computed(() => status.value.state === "CONNECTED");
const canControl = computed(
    () =>
        connected.value &&
        !status.value.executing &&
        !!props.deviceId,
);
const isOn = computed(() => status.value.commandedState === "ON");
const switchLabel = computed(() => {
  if (status.value.executing) return "执行中";
  if (status.value.commandedState === "UNKNOWN") return "未知";
  return isOn.value ? "开启" : "关闭";
});
const matchedProfile = computed(() => status.value.matchedProfile);
const stateLabel = computed(() => hardwareStateLabel(status.value.state));

async function scan(): Promise<void> {
  if (!supported.value || busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    const result = await relayService.scanAndMatch();
    matchedPorts.value = result;
    const current = status.value.lastPorts.find((p) => p.isCurrent);
    const supportedPort = result.find((entry) => entry.profile);
    selectedPort.value =
        current?.port ??
        supportedPort?.port.port ??
        result[0]?.port.port ??
        "";
  } catch (caught) {
    error.value = getApiErrorMessage(caught);
  } finally {
    busy.value = false;
  }
}

async function requestPort(): Promise<void> {
  if (!supported.value || busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    const port = await relayService.requestLocalPort();
    selectedPort.value = port.port;
    await scan();
  } catch (caught) {
    const message = getApiErrorMessage(caught);
    if (message !== "已取消串口选择") {
      error.value = message;
    }
  } finally {
    busy.value = false;
  }
}

async function connect(): Promise<void> {
  if (!selectedPort.value || busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    await relayService.connectLocal(selectedPort.value);
  } catch (caught) {
    error.value = getApiErrorMessage(caught);
  } finally {
    busy.value = false;
  }
}

async function disconnect(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    await relayService.disconnectLocal();
  } finally {
    busy.value = false;
  }
}

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

onMounted(() => {
  void scan();
});

onBeforeUnmount(() => {
  // 硬件状态订阅由 DashboardView 统一管理，此处无需清理。
});
</script>

<template>
  <section class="local-panel">
    <div class="panel-heading">
      <div>
        <span class="section-kicker">本地硬件</span>
        <h2>USB 继电器</h2>
      </div>
      <span
        class="status-badge"
        :class="connected ? 'online' : 'offline'"
      >
        <Usb :size="14" />
        {{ stateLabel }}
      </span>
    </div>

    <div v-if="!supported" class="empty-inline">
      当前平台未提供可用的本地串口适配器。仅可查看云端状态与日志。
    </div>

    <template v-else>
      <div v-if="matchedProfile" class="profile-info">
        <strong>已检测：USB-SERIAL {{ matchedProfile.usbChip }}</strong>
        <span>
          配置：{{ matchedProfile.name }} / {{ matchedProfile.baudRate }}
          {{ matchedProfile.dataBits }}{{
            matchedProfile.parity === "none" ? "N" : matchedProfile.parity
          }}{{ matchedProfile.stopBits }} / 通道 {{ matchedProfile.channels }}
        </span>
      </div>

      <label class="field-group">
        <span>串口设备</span>
        <select v-model="selectedPort" :disabled="connected || busy">
          <option value="" disabled>选择串口</option>
          <option
              v-for="entry in matchedPorts"
              :key="entry.port.port"
              :value="entry.port.port"
          >
            {{ entry.port.device }}{{ entry.profile ? " · 受支持" : "" }}
          </option>
        </select>
      </label>

      <div class="button-row">
        <button
          class="button button-secondary"
          type="button"
          :disabled="busy"
          @click="scan"
        >
          <RefreshCw :size="16" />
          扫描
        </button>
        <button
          v-if="!connected"
          class="button button-primary"
          type="button"
          :disabled="busy || !selectedPort"
          @click="connect"
        >
          <PlugZap :size="16" />
          连接
        </button>
        <button
          v-else
          class="button button-secondary"
          type="button"
          :disabled="busy"
          @click="disconnect"
        >
          <Cable :size="16" />
          断开
        </button>
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
          <span class="relay-switch-text">{{ switchLabel }}</span>
        </button>
        <span v-if="!connected && status.state !== 'UNSUPPORTED'" class="switch-hint">
          硬件未连接，滑块已禁用
        </span>
        <span v-else-if="status.state === 'UNSUPPORTED'" class="switch-hint">
          未检测到支持的 USB 继电器
        </span>
      </div>

      <p v-if="status.state === 'PERMISSION_REQUIRED'" class="inline-note">
        需要 USB 权限，请在系统中授权后重试。
      </p>
      <p v-if="error" class="inline-note error">{{ error }}</p>
      <p v-else-if="cloudNotice" class="inline-note success">
        {{ cloudNotice }}
      </p>
      <p class="inline-note">
        <CircleSlash :size="13"/>
        硬件状态始终为未知，LCUS-1 无已验证的状态回读协议。
      </p>
    </template>
  </section>
</template>

<style scoped>
.profile-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 0.75rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--border-subtle, #d8dee4);
  border-radius: 8px;
  background: var(--bg-muted, #f6f8fa);
  font-size: 0.85rem;
}

.profile-info span {
  color: var(--text-muted, #57606a);
}

.relay-switch-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0.75rem 0;
}

.relay-switch {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0;
}

.relay-switch.disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.relay-switch-track {
  width: 46px;
  height: 26px;
  border-radius: 999px;
  background: var(--switch-off, #c7ccd1);
  position: relative;
  transition: background 0.18s ease;
  flex-shrink: 0;
}

.relay-switch.on .relay-switch-track {
  background: var(--switch-on, #1f8a55);
}

.relay-switch-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  transition: transform 0.18s ease;
}

.relay-switch.on .relay-switch-thumb {
  transform: translateX(20px);
}

.relay-switch-text {
  font-size: 0.9rem;
  font-weight: 600;
}

.switch-hint {
  font-size: 0.8rem;
  color: var(--text-muted, #57606a);
}
</style>
