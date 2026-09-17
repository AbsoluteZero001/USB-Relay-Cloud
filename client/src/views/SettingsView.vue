<script setup lang="ts">
import {
  Cloud,
  Cpu,
  HeartPulse,
  ShieldCheck,
  Usb,
} from "@lucide/vue";
import { computed, reactive, ref } from "vue";

import { getApiErrorMessage } from "@/api/http";
import { relayService } from "@/services/relay";
import { useConnectionStore } from "@/stores/connectionStore";
import { useDeviceStore } from "@/stores/deviceStore";

const connectionStore = useConnectionStore();
const deviceStore = useDeviceStore();
const runtime = relayService.getRuntime();
const saving = ref(false);
const message = ref<string | null>(null);
const error = ref<string | null>(null);
const form = reactive({
  deviceId: "relay-001",
  deviceName: "Relay-001",
  deviceType: "USB_RELAY",
  clientId: "web-console-001",
});

const apiBaseUrl = computed(() => import.meta.env.VITE_API_BASE_URL);
const wsBaseUrl = computed(() => import.meta.env.VITE_WS_BASE_URL);

async function heartbeat(): Promise<void> {
  saving.value = true;
  message.value = null;
  error.value = null;
  try {
    await deviceStore.heartbeat(form.deviceId, {
      deviceName: form.deviceName,
      deviceType: form.deviceType,
      clientId: form.clientId,
    });
    deviceStore.selectDevice(form.deviceId);
    message.value = "设备心跳已保存";
  } catch (caught) {
    error.value = getApiErrorMessage(caught);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="settings-page">
    <section class="settings-section">
      <div class="settings-icon">
        <Cpu :size="20" />
      </div>
      <div class="settings-content">
        <span class="section-kicker">Device registration</span>
        <h2>Heartbeat</h2>
        <div class="form-grid">
          <label>
            <span>Device ID</span>
            <input v-model.trim="form.deviceId" />
          </label>
          <label>
            <span>Device Name</span>
            <input v-model.trim="form.deviceName" />
          </label>
          <label>
            <span>Device Type</span>
            <input v-model.trim="form.deviceType" />
          </label>
          <label>
            <span>Client ID</span>
            <input v-model.trim="form.clientId" />
          </label>
        </div>
        <div class="button-row">
          <button
            class="button button-primary"
            type="button"
            :disabled="
              saving ||
              !form.deviceId ||
              !form.deviceName ||
              !form.deviceType ||
              !form.clientId
            "
            @click="heartbeat"
          >
            <HeartPulse :size="16" />
            Send Heartbeat
          </button>
        </div>
        <p v-if="message" class="inline-note success">{{ message }}</p>
        <p v-if="error" class="inline-note error">{{ error }}</p>
      </div>
    </section>

    <section class="settings-section">
      <div class="settings-icon">
        <Cloud :size="20" />
      </div>
      <div class="settings-content">
        <span class="section-kicker">Connection</span>
        <h2>Cloud endpoints</h2>
        <dl class="settings-list">
          <div>
            <dt>REST API</dt>
            <dd>{{ apiBaseUrl }}</dd>
          </div>
          <div>
            <dt>WebSocket</dt>
            <dd>{{ wsBaseUrl }}</dd>
          </div>
          <div>
            <dt>Realtime status</dt>
            <dd>{{ connectionStore.webSocketStatus }}</dd>
          </div>
          <div>
            <dt>Last realtime message</dt>
            <dd>
              {{
                connectionStore.lastWebSocketMessageAt
                  ? new Date(
                      connectionStore.lastWebSocketMessageAt,
                    ).toLocaleString("zh-CN", { hour12: false })
                  : "—"
              }}
            </dd>
          </div>
        </dl>
      </div>
    </section>

    <section class="settings-section">
      <div class="settings-icon">
        <Usb :size="20" />
      </div>
      <div class="settings-content">
        <span class="section-kicker">Local runtime</span>
        <h2>Relay adapter</h2>
        <dl class="settings-list">
          <div>
            <dt>Runtime</dt>
            <dd>{{ runtime }}</dd>
          </div>
          <div>
            <dt>Local control</dt>
            <dd>
              {{
                relayService.isLocalControlSupported()
                  ? "available"
                  : "unavailable"
              }}
            </dd>
          </div>
          <div>
            <dt>Hardware state</dt>
            <dd>UNKNOWN</dd>
          </div>
        </dl>
      </div>
    </section>

    <section class="settings-section">
      <div class="settings-icon">
        <ShieldCheck :size="20" />
      </div>
      <div class="settings-content">
        <span class="section-kicker">Safety boundary</span>
        <h2>LCUS-1</h2>
        <p class="settings-copy">
          串口写入成功仅表示 commandedState 已发送。当前没有经过验证的
          LCUS-1 硬件状态回读协议，因此 hardwareState 始终为 UNKNOWN。
        </p>
      </div>
    </section>
  </div>
</template>
