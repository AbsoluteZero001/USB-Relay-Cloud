<script setup lang="ts">
import {Cable, PlugZap, RefreshCw, Usb} from "@lucide/vue";
import {computed, onBeforeUnmount, onMounted, ref, watch} from "vue";

import {getApiErrorMessage} from "@/api/http";
import {relayService} from "@/services/relay";
import {
  describeUnsupportedPort,
  hardwareStateLabel,
  matchHardwareProfile,
  type HardwareStatus,
  type RelayHardwareProfile,
} from "@/services/relay/hardware";
import type {HardwareLogEntry} from "@/services/relay/diagnostics";
import type {SerialPortInfo} from "@/services/relay/serial/types";

const props = defineProps<{
  deviceId: string | null;
  hardwareStatus: HardwareStatus;
}>();

interface PortEntry {
  port: SerialPortInfo;
  profile: RelayHardwareProfile | null;
}

const platform = relayService.getPlatform();
const runtime = relayService.getRuntime();
const supported = computed(() => relayService.isLocalControlSupported());
const canPickNewDevice = computed(() => relayService.supportsPortRequest());
const status = computed(() => props.hardwareStatus);

const selectedPort = ref("");
const error = ref<string | null>(null);
const notice = ref<string | null>(null);
const busy = ref(false);
const diagnostics = ref<readonly HardwareLogEntry[]>([]);
const showDiagnostics = ref(false);

const connected = computed(() => status.value.state === "CONNECTED");
const matchedProfile = computed(() => status.value.matchedProfile);
const stateLabel = computed(() => hardwareStateLabel(status.value.state));

/**
 * 设备列表直接来自 hardwareStatus.lastPorts：
 * USB 插入 / 拔出后 Provider 会自动重新扫描并推送新状态，UI 无需手动刷新。
 */
const portEntries = computed<PortEntry[]>(() =>
  status.value.lastPorts.map((port) => ({
    port,
    profile: matchHardwareProfile(port),
  })),
);

const supportedEntries = computed(() =>
  portEntries.value.filter((entry) => entry.profile),
);

const selectedEntry = computed<PortEntry | null>(
  () => portEntries.value.find((entry) => entry.port.port === selectedPort.value) ?? null,
);

const selectedProfile = computed(
  () => selectedEntry.value?.profile ?? matchedProfile.value,
);

const selectedNeedsPermission = computed(
  () => selectedEntry.value?.port.hasPermission === false,
);

const isWebRuntime = computed(() => runtime === "web");
const webSerialSupported = computed(
  () => typeof navigator !== "undefined" && "serial" in navigator,
);

const unsupportedHint = computed(() => {
  if (!supported.value) return null;
  if (portEntries.value.length === 0) {
    if (isWebRuntime.value) {
      return webSerialSupported.value
        ? "没有已授权串口设备。首次使用请点击「选择串口设备」，"
          + "在浏览器原生窗口中选择 CH340。"
        : "当前浏览器不支持 Web Serial，请使用最新版 Chrome / Edge，"
          + "或者使用 Android / Electron 客户端连接本地硬件。";
    }
    return "未检测到 USB 设备。请确认 OTG 已连接、LCUS-1 + CH340 已插入。";
  }
  if (supportedEntries.value.length === 0) {
    const first = portEntries.value[0];
    return first
      ? `${describeUnsupportedPort(first.port)}（需要 CH340 + LCUS-1）`
      : status.value.errorDetail;
  }
  return null;
});

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

function permissionLabel(port: SerialPortInfo): string {
  if (port.hasPermission === true) return "已授权";
  if (port.hasPermission === false) return "未授权";
  return "无需授权";
}

function driverLabel(port: SerialPortInfo): string {
  if (port.driverName) return port.driverName;
  if (port.supported === false) return "未找到兼容串口驱动";
  return "未知";
}

/** 选择默认项：当前连接设备 > 唯一受支持设备 > 第一个设备。 */
function syncSelection(): void {
  const entries = portEntries.value;
  if (entries.length === 0) {
    selectedPort.value = "";
    return;
  }
  if (selectedPort.value && entries.some(
    (entry) => entry.port.port === selectedPort.value,
  )) {
    return;
  }
  const current = entries.find((entry) => entry.port.isCurrent);
  const supportedOnly = entries.length === 1 ? entries[0] : undefined;
  const firstSupported = supportedEntries.value[0];
  selectedPort.value =
    current?.port.port
    ?? supportedOnly?.port.port
    ?? firstSupported?.port.port
    ?? entries[0]?.port.port
    ?? "";
}

watch(portEntries, syncSelection, {immediate: true});

async function scan(): Promise<void> {
  if (!supported.value || busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    await relayService.scanAndMatch();
    syncSelection();
    if (supportedEntries.value.length === 1 && !connected.value) {
      notice.value = "已自动选择唯一受支持的 USB 继电器";
    }
  } catch (caught) {
    error.value = getApiErrorMessage(caught);
  } finally {
    busy.value = false;
  }
}

/**
 * 选择新设备。
 *
 * Web：调用 navigator.serial.requestPort()，必须在用户点击事件中同步触发。
 * Android：列出 USB 设备并申请 UsbManager 权限（系统授权弹窗）。
 */
async function pickPort(): Promise<void> {
  if (!supported.value || !canPickNewDevice.value || busy.value) return;
  busy.value = true;
  error.value = null;
  notice.value = null;
  try {
    const port = await relayService.requestLocalPort();
    selectedPort.value = port.port;
    await relayService.scanAndMatch();
    syncSelection();
    notice.value = "设备已选择，请点击「连接」";
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
  notice.value = null;
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
  notice.value = null;
  try {
    await relayService.disconnectLocal();
  } catch (caught) {
    error.value = getApiErrorMessage(caught);
  } finally {
    busy.value = false;
  }
}

let unsubscribeDiagnostics: (() => void) | null = null;

function onDebugToggle(event: Event): void {
  const element = event.target as HTMLDetailsElement | null;
  showDiagnostics.value = !!element?.open;
}

onMounted(() => {
  unsubscribeDiagnostics = relayService.onDiagnostics((entries) => {
    diagnostics.value = entries;
  });
  void scan();
});

onBeforeUnmount(() => {
  unsubscribeDiagnostics?.();
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
        <Usb :size="14"/>
        {{ supported ? stateLabel : "不可用" }}
      </span>
    </div>

    <div v-if="!supported" class="empty-inline">
      当前平台未提供可用的本地串口适配器。仅可查看云端状态与日志。
    </div>

    <template v-else>
      <p class="usb-platform-line">
        运行平台：<strong>{{ platform.platform }}</strong>
        · Capacitor.isNativePlatform：{{ platform.capacitorNative }}
        · 检测到设备：{{ portEntries.length }}
      </p>

      <label class="field-group field-group-large">
        <span>{{ isWebRuntime ? "已授权串口设备" : "USB 设备" }}</span>
        <select
            v-model="selectedPort"
            :disabled="connected || busy"
            class="select-large"
        >
          <option value="" disabled>选择 USB 设备</option>
          <option
              v-for="entry in portEntries"
              :key="entry.port.port"
              :value="entry.port.port"
          >
            {{ entry.port.device }}
            · VID:{{ entry.port.vendorId ?? "—" }}/PID:{{ entry.port.productId ?? "—" }}
            · {{ driverLabel(entry.port) }}
            · {{ permissionLabel(entry.port) }}
            {{ entry.profile ? " · 受支持" : "" }}
          </option>
        </select>
      </label>

      <div v-if="selectedEntry" class="param-grid">
        <div class="param-item">
          <dt>设备</dt>
          <dd>{{ selectedEntry.port.device }}</dd>
        </div>
        <div class="param-item">
          <dt>VID / PID</dt>
          <dd>
            {{ selectedEntry.port.vendorId ?? "—" }} /
            {{ selectedEntry.port.productId ?? "—" }}
          </dd>
        </div>
        <div class="param-item">
          <dt>USB 驱动</dt>
          <dd>{{ driverLabel(selectedEntry.port) }}</dd>
        </div>
        <div class="param-item">
          <dt>USB 权限</dt>
          <dd>{{ permissionLabel(selectedEntry.port) }}</dd>
        </div>
        <div class="param-item">
          <dt>HardwareProfile</dt>
          <dd>{{ selectedProfile?.name ?? "未匹配" }}</dd>
        </div>
        <div class="param-item">
          <dt>串口参数</dt>
          <dd>
            {{
              selectedProfile
                  ? `${selectedProfile.baudRate} · ${selectedProfile.dataBits}`
                  + `${
                      selectedProfile.parity === "none"
                          ? "N"
                          : selectedProfile.parity.toUpperCase()[0]
                  }${selectedProfile.stopBits}`
                  : "—"
            }}
          </dd>
        </div>
        <div class="param-item">
          <dt>通道</dt>
          <dd>{{ selectedProfile?.channels ?? "—" }}</dd>
        </div>
      </div>

      <div class="button-row button-row-large">
        <button
            class="button button-secondary button-large"
            type="button"
            :disabled="busy"
            @click="scan"
        >
          <RefreshCw :size="18" :class="{spin: busy}"/>
          {{ connected ? "重新扫描" : (isWebRuntime ? "扫描已授权设备" : "扫描 USB 设备") }}
        </button>
        <button
            v-if="!connected && isWebRuntime"
            class="button button-secondary button-large"
            type="button"
            :disabled="busy || !webSerialSupported"
            @click="pickPort"
        >
          <Usb :size="18"/>
          选择串口设备
        </button>
        <button
            v-if="!connected"
            class="button button-primary button-large"
            type="button"
            :disabled="busy || !selectedPort || (selectedEntry?.port.supported === false)"
            @click="connect"
        >
          <PlugZap :size="18"/>
          {{ selectedNeedsPermission ? "授权并连接" : "连接" }}
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

      <p v-if="unsupportedHint" class="inline-note">{{ unsupportedHint }}</p>
      <p v-if="status.state === 'PERMISSION_REQUIRED'" class="inline-note">
        需要 USB 权限，请在系统授权窗口中允许后重试。
      </p>
      <p v-if="notice" class="inline-note success">{{ notice }}</p>
      <p v-if="error" class="inline-note error">{{ error }}</p>

      <details class="usb-debug" @toggle="onDebugToggle">
        <summary>调试信息</summary>
        <div v-if="showDiagnostics" class="usb-debug__body">
          <dl class="usb-debug__platform">
            <div>
              <dt>平台</dt>
              <dd>{{ platform.platform }}</dd>
            </div>
            <div>
              <dt>Capacitor</dt>
              <dd>native={{ platform.capacitorNative }} · {{ platform.capacitorPlatform }}</dd>
            </div>
            <div>
              <dt>Web Serial</dt>
              <dd>{{ webSerialSupported ? "可用" : "不可用" }}</dd>
            </div>
            <div>
              <dt>设备数量</dt>
              <dd>{{ portEntries.length }}</dd>
            </div>
          </dl>
          <ul class="usb-debug__log">
            <li v-for="entry in diagnostics.slice(-20)" :key="entry.id" :class="entry.level">
              <span class="usb-debug__time">{{ entry.at.slice(11, 19) }}</span>
              <span class="usb-debug__message">{{ entry.message }}</span>
              <span v-if="entry.detail" class="usb-debug__detail">{{ entry.detail }}</span>
            </li>
            <li v-if="!diagnostics.length" class="usb-debug__empty">暂无日志</li>
          </ul>
          <button
              class="button button-secondary usb-debug__clear"
              type="button"
              @click="relayService.clearDiagnostics()"
          >
            清空调试日志
          </button>
        </div>
      </details>
    </template>
  </section>
</template>

<style scoped>
.usb-platform-line {
  margin: 0;
  font-size: 0.78rem;
  color: #6b7280;
}

.usb-debug {
  margin-top: 0.5rem;
  font-size: 0.78rem;
  color: #4b5563;
}

.usb-debug summary {
  cursor: pointer;
  user-select: none;
}

.usb-debug__body {
  margin-top: 0.5rem;
  padding: 0.75rem;
  background: #f9fafb;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.usb-debug__platform {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.35rem 0.75rem;
}

.usb-debug__platform dt {
  font-size: 0.7rem;
  color: #9ca3af;
}

.usb-debug__platform dd {
  margin: 0;
  word-break: break-all;
}

.usb-debug__log {
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 220px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
}

.usb-debug__log li {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  padding-left: 0.4rem;
  border-left: 2px solid #d1d5db;
}

.usb-debug__log li.warn {
  border-left-color: #f59e0b;
}

.usb-debug__log li.error {
  border-left-color: #dc2626;
  color: #b91c1c;
}

.usb-debug__time {
  color: #9ca3af;
}

.usb-debug__detail {
  white-space: pre-wrap;
  word-break: break-all;
  color: #6b7280;
}

.usb-debug__empty {
  color: #9ca3af;
}

.usb-debug__clear {
  align-self: flex-start;
  font-size: 0.78rem;
  padding: 0.35rem 0.6rem;
}
</style>
