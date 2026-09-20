<script setup lang="ts">
import {Cable, PlugZap, RefreshCw, Usb,} from "@lucide/vue";
import {computed, onMounted, ref} from "vue";

import {getApiErrorMessage} from "@/api/http";
import {relayService} from "@/services/relay";
import type {HardwareStatus} from "@/services/relay/hardware";
import {hardwareStateLabel} from "@/services/relay/hardware";
import type {SerialPortInfo} from "@/services/relay/serial/types";

const props = defineProps<{
  deviceId: string | null;
  hardwareStatus: HardwareStatus;
}>();

const supported = computed(() => relayService.isLocalControlSupported());
const status = computed(() => props.hardwareStatus);
const matchedPorts = ref<{ port: SerialPortInfo; profile: unknown }[]>([]);
const selectedPort = ref("");
const error = ref<string | null>(null);
const busy = ref(false);

const connected = computed(() => status.value.state === "CONNECTED");
const matchedProfile = computed(() => status.value.matchedProfile);
const stateLabel = computed(() => hardwareStateLabel(status.value.state));

const stateBadgeClass = computed(() => {
  switch (status.value.state) {
    case "CONNECTED":
      return "success";
    case "DETECTED":
    case "SCANNING":
    case "CONNECTING":
      return "info";
    case "PERMISSION_REQUIRED":
      return "warning";
    case "UNSUPPORTED":
    case "ERROR":
      return "failed";
    default:
      return "offline";
  }
});

const selectedPortInfo = computed(() => {
  if (!selectedPort.value) return null;
  return (
      status.value.lastPorts.find((p) => p.port === selectedPort.value) ??
      null
  );
});

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

onMounted(() => {
  void scan();
});
</script>

<template>
  <section class="panel-card usb-connection-card">
    <div class="panel-card-head">
      <div>
        <span class="section-kicker">本地硬件</span>
        <h2>USB 继电器连接</h2>
      </div>
      <span class="status-badge" :class="stateBadgeClass">
        <Usb :size="14" />
        {{ stateLabel }}
      </span>
    </div>

    <div v-if="!supported" class="empty-inline">
      当前平台未提供可用的本地串口适配器。仅可查看云端状态与日志。
    </div>

    <template v-else>
      <label class="field-group field-group-large">
        <span>串口设备</span>
        <select
            v-model="selectedPort"
            :disabled="connected || busy"
            class="select-large"
        >
          <option value="" disabled>选择串口设备</option>
          <option
              v-for="entry in matchedPorts"
              :key="entry.port.port"
              :value="entry.port.port"
          >
            {{ entry.port.device }}{{ entry.profile ? " · 受支持" : "" }}
          </option>
        </select>
      </label>

      <div v-if="selectedPortInfo || matchedProfile" class="param-grid">
        <div class="param-item">
          <dt>设备</dt>
          <dd>{{ selectedPortInfo?.device ?? "—" }}</dd>
        </div>
        <div class="param-item">
          <dt>VID / PID</dt>
          <dd>
            {{ selectedPortInfo?.vendorId ?? "—" }} /
            {{ selectedPortInfo?.productId ?? "—" }}
          </dd>
        </div>
        <div class="param-item">
          <dt>驱动</dt>
          <dd>{{ selectedPortInfo?.manufacturer ?? "—" }}</dd>
        </div>
        <div class="param-item">
          <dt>HardwareProfile</dt>
          <dd>{{ matchedProfile?.name ?? "未匹配" }}</dd>
        </div>
        <div class="param-item">
          <dt>波特率</dt>
          <dd>{{ matchedProfile?.baudRate ?? "—" }}</dd>
        </div>
        <div class="param-item">
          <dt>数据位</dt>
          <dd>{{ matchedProfile?.dataBits ?? "—" }}</dd>
        </div>
        <div class="param-item">
          <dt>停止位</dt>
          <dd>{{ matchedProfile?.stopBits ?? "—" }}</dd>
        </div>
        <div class="param-item">
          <dt>校验</dt>
          <dd>{{ matchedProfile?.parity?.toUpperCase() ?? "—" }}</dd>
        </div>
        <div class="param-item">
          <dt>通道</dt>
          <dd>{{ matchedProfile?.channels ?? "—" }}</dd>
        </div>
      </div>

      <div class="button-row button-row-large">
        <button
            class="button button-secondary button-large"
          type="button"
          :disabled="busy"
            @click="connected ? disconnect() : scan()"
        >
          <RefreshCw v-if="!connected" :size="18"/>
          <Cable v-else :size="18"/>
          {{ connected ? "重新扫描" : "扫描 USB" }}
        </button>
        <button
          v-if="!connected"
          class="button button-primary button-large"
          type="button"
          :disabled="busy || !selectedPort"
          @click="connect"
        >
          <PlugZap :size="18"/>
          连接
        </button>
        <button
          v-else
          class="button button-secondary button-large"
          type="button"
          :disabled="busy"
          @click="disconnect"
        >
          <Cable :size="18"/>
          断开
        </button>
      </div>

      <p v-if="status.state === 'PERMISSION_REQUIRED'" class="inline-note">
        需要 USB 权限，请在系统中授权后重试。
      </p>
      <p v-if="error" class="inline-note error">{{ error }}</p>
    </template>
  </section>
</template>
