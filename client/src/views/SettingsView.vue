<script setup lang="ts">
import {Cloud, Cpu, HeartPulse, RotateCcw, Save, ShieldCheck, Usb, Wifi,} from "@lucide/vue";
import {computed, reactive, ref} from "vue";
import {useRouter} from "vue-router";

import {connectionTestLabel, testServerConnection,} from "@/api/healthApi";
import {getApiErrorMessage} from "@/api/http";
import {relayService} from "@/services/relay";
import {relayWebSocket} from "@/services/websocket";
import {useAuthStore} from "@/stores/authStore";
import {useConnectionStore} from "@/stores/connectionStore";
import {useDeviceStore} from "@/stores/deviceStore";
import {useEventStore} from "@/stores/eventStore";
import {useServerConfigStore} from "@/stores/serverConfigStore";
import {webSocketStatusLabel} from "@/utils/format";

const router = useRouter();
const authStore = useAuthStore();
const connectionStore = useConnectionStore();
const deviceStore = useDeviceStore();
const eventStore = useEventStore();
const serverConfig = useServerConfigStore();
const runtime = relayService.getRuntime();
const saving = ref(false);
const testing = ref(false);
const message = ref<string | null>(null);
const error = ref<string | null>(null);
const configVersion = ref(0);
const serverBaseUrl = ref(serverConfig.effectiveServerBaseUrl);
const form = reactive({
  deviceId: "relay-001",
  deviceName: "Relay-001",
  deviceType: "USB_RELAY",
  clientId: "web-console-001",
});

const apiBaseUrl = computed(() => {
  void configVersion.value;
  return serverConfig.apiBaseUrl;
});
const wsBaseUrl = computed(() => {
  void configVersion.value;
  return serverConfig.wsBaseUrl;
});

/**
 * 当服务器地址发生变化时，旧 token 对新服务器无效。
 * 清除 token、断开 WebSocket，回到登录页。
 */
function handleServerChanged(): void {
  relayWebSocket.disconnect();
  authStore.logout();
  void router.replace("/login");
}

async function saveServerAddress(): Promise<void> {
  saving.value = true;
  message.value = null;
  error.value = null;
  try {
    const oldUrl = serverConfig.effectiveServerBaseUrl;
    serverBaseUrl.value = serverConfig.setServerBaseUrl(serverBaseUrl.value);
    configVersion.value += 1;
    if (oldUrl !== serverBaseUrl.value) {
      // 服务器已更换：清 token、断 WS、回登录页。
      handleServerChanged();
      return;
    }
    // 地址未变，仅重连实时通道。
    relayWebSocket.disconnect();
    relayWebSocket.connect(eventStore.latestSequence);
    await deviceStore.loadDevices();
    message.value = "服务器地址已保存，实时连接正在重新建立";
  } catch (caught) {
    error.value = getApiErrorMessage(caught);
  } finally {
    saving.value = false;
  }
}

async function restoreDefaultServerAddress(): Promise<void> {
  const oldUrl = serverConfig.effectiveServerBaseUrl;
  serverConfig.resetServerBaseUrl();
  serverBaseUrl.value = serverConfig.effectiveServerBaseUrl;
  configVersion.value += 1;
  if (oldUrl !== serverBaseUrl.value) {
    handleServerChanged();
    return;
  }
  relayWebSocket.disconnect();
  relayWebSocket.connect(eventStore.latestSequence);
  await deviceStore.loadDevices();
  message.value = "已恢复构建时的默认服务器地址";
}

async function testCloudConnection(): Promise<void> {
  testing.value = true;
  message.value = null;
  error.value = null;
  try {
    const outcome = await testServerConnection();
    if (outcome.status === "ok") {
      message.value = "连接成功";
    } else {
      error.value = connectionTestLabel(outcome);
    }
  } finally {
    testing.value = false;
  }
}

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
        <Cloud :size="20"/>
      </div>
      <div class="settings-content">
        <span class="section-kicker">云端连接</span>
        <h2>服务器地址</h2>
        <label class="field-group">
          <span>服务器根地址</span>
          <input
              v-model.trim="serverBaseUrl"
              placeholder="例如：https://relay.example.com"
          />
        </label>
        <p class="inline-note">
          留空时使用构建配置。Android APK 必须填写可访问的
          HTTPS/WSS 服务器地址。
        </p>
        <div class="button-row">
          <button
              class="button button-primary"
              type="button"
              :disabled="saving"
              @click="saveServerAddress"
          >
            <Save :size="16"/>
            保存并重连
          </button>
          <button
              class="button button-secondary"
              type="button"
              :disabled="testing"
              @click="testCloudConnection"
          >
            <Wifi :size="16"/>
            测试连接
          </button>
          <button
              class="button button-secondary"
              type="button"
              @click="restoreDefaultServerAddress"
          >
            <RotateCcw :size="16"/>
            恢复默认
          </button>
        </div>

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
            <dt>实时连接状态</dt>
            <dd>
              {{
                webSocketStatusLabel(
                    connectionStore.webSocketStatus,
                )
              }}
            </dd>
          </div>
          <div>
            <dt>最近实时消息</dt>
            <dd>
              {{
                connectionStore.lastWebSocketMessageAt
                    ? new Date(
                        connectionStore.lastWebSocketMessageAt,
                    ).toLocaleString("zh-CN", {hour12: false})
                    : "—"
              }}
            </dd>
          </div>
        </dl>
        <p v-if="message" class="inline-note success">{{ message }}</p>
        <p v-if="error" class="inline-note error">{{ error }}</p>
      </div>
    </section>

    <section class="settings-section">
      <div class="settings-icon">
        <Cpu :size="20" />
      </div>
      <div class="settings-content">
        <span class="section-kicker">设备注册</span>
        <h2>心跳上报</h2>
        <div class="form-grid">
          <label>
            <span>设备 ID</span>
            <input v-model.trim="form.deviceId" />
          </label>
          <label>
            <span>设备名称</span>
            <input v-model.trim="form.deviceName" />
          </label>
          <label>
            <span>设备类型</span>
            <input v-model.trim="form.deviceType" />
          </label>
          <label>
            <span>客户端 ID</span>
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
            发送心跳
          </button>
        </div>
      </div>
    </section>

    <section class="settings-section">
      <div class="settings-icon">
        <Usb :size="20" />
      </div>
      <div class="settings-content">
        <span class="section-kicker">本地运行环境</span>
        <h2>继电器适配器</h2>
        <dl class="settings-list">
          <div>
            <dt>运行平台</dt>
            <dd>{{ runtime }}</dd>
          </div>
          <div>
            <dt>本地控制</dt>
            <dd>
              {{
                relayService.isLocalControlSupported()
                    ? "可用"
                    : "不可用"
              }}
            </dd>
          </div>
          <div>
            <dt>硬件状态</dt>
            <dd>未知</dd>
          </div>
        </dl>
      </div>
    </section>

    <section class="settings-section">
      <div class="settings-icon">
        <ShieldCheck :size="20" />
      </div>
      <div class="settings-content">
        <span class="section-kicker">安全边界</span>
        <h2>LCUS-1 状态说明</h2>
        <p class="settings-copy">
          串口写入成功只表示 commandedState 已发送。当前没有经过验证的
          LCUS-1 硬件状态回读协议，因此 hardwareState 始终为未知。
        </p>
      </div>
    </section>
  </div>
</template>
