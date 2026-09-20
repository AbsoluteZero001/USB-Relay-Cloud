<script setup lang="ts">
import {ArrowLeft, CheckCircle2, RotateCcw, Save, Wifi, XCircle,} from "@lucide/vue";
import {computed, reactive, ref} from "vue";
import {useRouter} from "vue-router";

import {connectionTestLabel, testServerConnection,} from "@/api/healthApi";
import {normalizeServerBaseUrl} from "@/config/runtimeConfig";
import {relayWebSocket} from "@/services/websocket";
import {useAuthStore} from "@/stores/authStore";
import {useServerConfigStore} from "@/stores/serverConfigStore";

const router = useRouter();
const authStore = useAuthStore();
const serverConfig = useServerConfigStore();

const form = reactive({
  serverBaseUrl: serverConfig.effectiveServerBaseUrl,
});

const saving = ref(false);
const testing = ref(false);
const message = ref<string | null>(null);
const error = ref<string | null>(null);
const validationError = ref<string | null>(null);

function validateInput(): boolean {
  const value = form.serverBaseUrl.trim();
  if (!value) {
    validationError.value = "服务器地址不能为空";
    return false;
  }
  try {
    normalizeServerBaseUrl(value);
    validationError.value = null;
    return true;
  } catch (e) {
    validationError.value =
        e instanceof Error ? e.message : "服务器地址格式不正确";
    return false;
  }
}

function onInput(): void {
  if (validationError.value) {
    validateInput();
  }
}

async function testConnection(): Promise<void> {
  if (!validateInput()) return;
  testing.value = true;
  message.value = null;
  error.value = null;
  try {
    // 直接传入输入框地址测试，不修改已保存的配置。
    const outcome = await testServerConnection(form.serverBaseUrl);
    if (outcome.status === "ok") {
      message.value = "连接成功";
    } else {
      error.value = connectionTestLabel(outcome);
    }
  } finally {
    testing.value = false;
  }
}

/**
 * 保存服务器地址。
 *
 * 若地址发生变化且当前已登录：清除旧 token、断开 WebSocket，回到登录页。
 * 未登录时仅更新地址。
 */
async function save(): Promise<void> {
  if (!validateInput()) return;
  saving.value = true;
  message.value = null;
  error.value = null;
  try {
    const oldUrl = serverConfig.effectiveServerBaseUrl;
    const newUrl = serverConfig.setServerBaseUrl(form.serverBaseUrl);
    const changed = oldUrl !== newUrl;
    if (changed && authStore.isAuthenticated) {
      // 旧服务器的 token 对新服务器无效，清除并断开连接。
      relayWebSocket.disconnect();
      authStore.logout();
      message.value = "服务器地址已更新，请重新登录";
      // 短暂停留让用户看到提示，再跳转登录页。
      await new Promise((resolve) => setTimeout(resolve, 800));
      await router.replace("/login");
    } else {
      message.value = "服务器地址已保存";
    }
  } catch (caught) {
    error.value =
        caught instanceof Error ? caught.message : "保存失败";
  } finally {
    saving.value = false;
  }
}

function restoreDefault(): void {
  serverConfig.resetServerBaseUrl();
  form.serverBaseUrl = serverConfig.effectiveServerBaseUrl;
  validationError.value = null;
  message.value = "已恢复默认服务器地址";
  error.value = null;
}

function goBack(): void {
  router.back();
}

const apiBaseUrl = computed(() => serverConfig.apiBaseUrl);
const wsBaseUrl = computed(() => serverConfig.wsBaseUrl);
</script>

<template>
  <main class="server-settings">
    <div class="server-settings__card">
      <button
          type="button"
          class="server-settings__back"
          @click="goBack"
      >
        <ArrowLeft :size="16"/>
        返回
      </button>

      <h1 class="server-settings__title">服务器设置</h1>
      <p class="server-settings__subtitle">
        配置云端服务器地址，无需登录即可修改。
      </p>

      <label class="field-group">
        <span>服务器地址</span>
        <input
            v-model.trim="form.serverBaseUrl"
            type="text"
            placeholder="例如：https://relay.evezero.cn"
            autocomplete="off"
            spellcheck="false"
            :class="{'is-error': validationError}"
            @input="onInput"
        />
      </label>
      <p v-if="validationError" class="field-error">
        {{ validationError }}
      </p>
      <p class="field-hint">
        支持 http:// 或 https://，例如 https://relay.evezero.cn、
        http://192.168.1.100:8080
      </p>

      <div class="button-row">
        <button
            class="button button-primary"
            type="button"
            :disabled="saving"
            @click="save"
        >
          <Save :size="16"/>
          保存
        </button>
        <button
            class="button button-secondary"
            type="button"
            :disabled="testing"
            @click="testConnection"
        >
          <Wifi :size="16"/>
          测试连接
        </button>
        <button
            class="button button-secondary"
            type="button"
            :disabled="!serverConfig.isCustomized"
            @click="restoreDefault"
        >
          <RotateCcw :size="16"/>
          恢复默认
        </button>
      </div>

      <div v-if="message" class="result-line result-line--ok">
        <CheckCircle2 :size="16"/>
        <span>{{ message }}</span>
      </div>
      <div v-if="error" class="result-line result-line--error">
        <XCircle :size="16"/>
        <span>{{ error }}</span>
      </div>

      <dl class="address-list">
        <div>
          <dt>REST API</dt>
          <dd>{{ apiBaseUrl }}</dd>
        </div>
        <div>
          <dt>WebSocket</dt>
          <dd>{{ wsBaseUrl }}</dd>
        </div>
        <div>
          <dt>当前来源</dt>
          <dd>
            {{
              serverConfig.isCustomized
                  ? "本地已保存"
                  : "构建时默认值"
            }}
          </dd>
        </div>
      </dl>
    </div>
  </main>
</template>

<style scoped>
.server-settings {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f7fa;
  padding: 1rem;
}

.server-settings__card {
  width: 100%;
  max-width: 420px;
  background: #fff;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 8px 32px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.server-settings__back {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  background: none;
  border: none;
  color: #6b7280;
  font-size: 0.85rem;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  margin-left: -0.5rem;
  border-radius: 6px;
  transition: background 0.15s ease, color 0.15s ease;
}

.server-settings__back:hover {
  background: #f3f4f6;
  color: #374151;
}

.server-settings__title {
  margin: 0;
  font-size: 1.25rem;
  color: #1f2937;
}

.server-settings__subtitle {
  margin: -0.5rem 0 0;
  color: #6b7280;
  font-size: 0.85rem;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.9rem;
  color: #374151;
}

.field-group input {
  padding: 0.6rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 1rem;
  outline: none;
  transition: border-color 0.15s ease;
  font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
}

.field-group input:focus {
  border-color: #2563eb;
}

.field-group input.is-error {
  border-color: #dc2626;
}

.field-error {
  margin: 0;
  color: #dc2626;
  font-size: 0.8rem;
}

.field-hint {
  margin: -0.5rem 0 0;
  color: #9ca3af;
  font-size: 0.75rem;
  line-height: 1.4;
}

.button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.button {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.55rem 0.9rem;
  border: none;
  border-radius: 8px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: background 0.15s ease, opacity 0.15s ease;
}

.button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.button-primary {
  background: #2563eb;
  color: #fff;
}

.button-primary:hover:not(:disabled) {
  background: #1d4ed8;
}

.button-secondary {
  background: #f3f4f6;
  color: #374151;
}

.button-secondary:hover:not(:disabled) {
  background: #e5e7eb;
}

.result-line {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  padding: 0.5rem 0.75rem;
  border-radius: 8px;
}

.result-line--ok {
  background: #f0fdf4;
  color: #15803d;
}

.result-line--error {
  background: #fef2f2;
  color: #b91c1c;
}

.address-list {
  margin: 0.5rem 0 0;
  padding: 0.75rem;
  background: #f9fafb;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.address-list > div {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.address-list dt {
  font-size: 0.7rem;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.address-list dd {
  margin: 0;
  font-size: 0.8rem;
  color: #374151;
  word-break: break-all;
  font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
}
</style>
