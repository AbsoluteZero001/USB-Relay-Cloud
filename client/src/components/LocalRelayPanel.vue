<script setup lang="ts">
import {Cable, PlugZap, Power, PowerOff, RefreshCw, Usb,} from "@lucide/vue";
import {computed, onBeforeUnmount, onMounted, ref} from "vue";

import {getApiErrorMessage} from "@/api/http";
import {relayService} from "@/services/relay";
import type {RelayAction, RelayExecutionResult,} from "@/types/api";
import type {SerialPortInfo, SerialStatus,} from "@/services/relay/serial/types";

const props = defineProps<{
  deviceId: string | null;
}>();

const emit = defineEmits<{
  completed: [result: RelayExecutionResult];
}>();

const ports = ref<SerialPortInfo[]>([]);
const selectedPort = ref("");
const status = ref<SerialStatus>(relayService.getLocalStatus());
const busy = ref(false);
const error = ref<string | null>(null);
const cloudNotice = ref<string | null>(null);
let unsubscribeStatus: (() => void) | null = null;

const supported = computed(() => relayService.isLocalControlSupported());
const connected = computed(() => status.value.connected);
const busyLabel = computed(() => {
  if (status.value.state === "waiting_permission") return "等待 USB 授权";
  if (status.value.state === "connecting") return "正在连接";
  return null;
});

async function refreshPorts(): Promise<void> {
  if (!supported.value) return;
  error.value = null;
  try {
    ports.value = await relayService.listLocalPorts();
    const current = ports.value.find((port) => port.isCurrent);
    selectedPort.value =
      current?.port || selectedPort.value || ports.value[0]?.port || "";
  } catch (caught) {
    error.value = getApiErrorMessage(caught);
  }
}

async function requestPort(): Promise<void> {
  if (!supported.value || busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    const port = await relayService.requestLocalPort();
    selectedPort.value = port.port;
    await refreshPorts();
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
    status.value = relayService.getLocalStatus();
  } catch (caught) {
    error.value = getApiErrorMessage(caught);
    status.value = relayService.getLocalStatus();
  } finally {
    busy.value = false;
  }
}

async function disconnect(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  try {
    await relayService.disconnectLocal();
    status.value = relayService.getLocalStatus();
  } finally {
    busy.value = false;
  }
}

async function execute(action: RelayAction): Promise<void> {
  if (!props.deviceId || !connected.value || busy.value) return;
  busy.value = true;
  error.value = null;
  cloudNotice.value = null;
  try {
    const result = await relayService.executeLocalCommand(
      props.deviceId,
      1,
      action,
    );
    cloudNotice.value = result.cloudSyncStatus === "SUCCESS"
      ? "云端已同步"
      : result.cloudSyncMessage ?? "云端同步失败";
    emit("completed", result);
    status.value = relayService.getLocalStatus();
  } catch (caught) {
    error.value = getApiErrorMessage(caught);
    status.value = relayService.getLocalStatus();
  } finally {
    busy.value = false;
  }
}

onMounted(() => {
  status.value = relayService.getLocalStatus();
  unsubscribeStatus = relayService.onLocalStatusChange((next) => {
    status.value = next;
  });
  void refreshPorts();
});

onBeforeUnmount(() => {
  unsubscribeStatus?.();
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
        {{ connected ? "已连接" : "未连接" }}
      </span>
    </div>

    <div v-if="!supported" class="empty-inline">
      当前平台未提供可用的本地串口适配器。
    </div>

    <template v-else>
      <label class="field-group">
        <span>串口设备</span>
        <select v-model="selectedPort" :disabled="connected || busy">
          <option value="" disabled>选择串口</option>
          <option
            v-for="port in ports"
            :key="port.port"
            :value="port.port"
          >
            {{ port.device }}
          </option>
        </select>
      </label>

      <div class="button-row">
        <button
          class="button button-secondary"
          type="button"
          :disabled="busy"
          @click="requestPort"
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

      <div class="relay-actions">
        <button
          class="button button-off"
          type="button"
          :disabled="!connected || busy || !deviceId"
          @click="execute('OFF')"
        >
          <PowerOff :size="17" />
          继电器 OFF
        </button>
        <button
          class="button button-on"
          type="button"
          :disabled="!connected || busy || !deviceId"
          @click="execute('ON')"
        >
          <Power :size="17" />
          继电器 ON
        </button>
      </div>

      <p v-if="busyLabel" class="inline-note">{{ busyLabel }}</p>
      <p v-if="error" class="inline-note error">{{ error }}</p>
      <p v-else-if="cloudNotice" class="inline-note success">
        {{ cloudNotice }}
      </p>
      <p class="inline-note">
        硬件状态固定为 UNKNOWN，LCUS-1 无已验证的状态回读协议。
      </p>
    </template>
  </section>
</template>
