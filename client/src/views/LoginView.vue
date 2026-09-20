<script setup lang="ts">
import {computed, ref, watch} from "vue";
import {useRouter} from "vue-router";

import {getApiErrorMessage} from "@/api/http";
import {useAuthStore} from "@/stores/authStore";
import {useConnectionStore} from "@/stores/connectionStore";
import {useDeviceStore} from "@/stores/deviceStore";

type LoginStage =
    | "idle"
    | "authenticating"
    | "syncing"
    | "connecting"
    | "success";

const STAGE_RANK: Record<LoginStage, number> = {
  idle: 0,
  authenticating: 1,
  syncing: 2,
  connecting: 3,
  success: 4,
};

const STAGE_PERCENT: Record<LoginStage, number> = {
  idle: 0,
  authenticating: 15,
  syncing: 55,
  connecting: 85,
  success: 100,
};

const STAGE_LABEL: Record<Exclude<LoginStage, "idle">, string> = {
  authenticating: "正在验证账号…",
  syncing: "正在同步设备…",
  connecting: "正在建立实时连接…",
  success: "登录成功",
};

const authStore = useAuthStore();
const connectionStore = useConnectionStore();
const deviceStore = useDeviceStore();
const router = useRouter();

const username = ref("");
const password = ref("");
const inProgress = ref(false);
const errorMessage = ref<string | null>(null);
const stage = ref<LoginStage>("idle");

const progressPercent = computed(() => STAGE_PERCENT[stage.value]);
const progressLabel = computed(() =>
    stage.value === "idle" ? "" : STAGE_LABEL[stage.value],
);
const progressVisible = computed(() => stage.value !== "idle");

function advanceStage(next: LoginStage): void {
  // 阶段只增不减，避免真实状态短暂抖动导致进度回退。
  if (STAGE_RANK[next] > STAGE_RANK[stage.value]) {
    stage.value = next;
  }
}

// 阶段完全由真实 store 状态推导：
// authStore.loading        → 验证账号（POST /login + GET /me）
// deviceStore.loading      → App.vue bootstrap 正在同步设备
// WebSocket connecting 等  → bootstrap 已真实发起实时连接
function deriveStage(): LoginStage {
  const wsStatus = connectionStore.webSocketStatus;
  if (wsStatus === "connected") return "connecting";
  if (wsStatus === "connecting" || wsStatus === "reconnecting") {
    return "connecting";
  }
  if (deviceStore.loading) return "syncing";
  if (authStore.loading) return "authenticating";
  return "idle";
}

// flush: "sync" 确保 loading 状态的真实跳变沿不被遗漏。
watch(
    () =>
        [
          authStore.loading,
          deviceStore.loading,
          connectionStore.webSocketStatus,
        ] as const,
    () => advanceStage(deriveStage()),
    {flush: "sync"},
);

let redirectTarget = "/";
let finishing = false;

async function finishLogin(): Promise<void> {
  if (finishing) return;
  finishing = true;
  stage.value = "success";
  await router.replace(redirectTarget);
}

// WebSocket 连接不是登录成功的强制条件：真实连接“已发起”即进入控制台，
// 握手结果由布局中的连接状态徽标继续展示，保持原有业务语义。
watch(stage, (next) => {
  if (
      inProgress.value &&
      (next === "connecting" || next === "success")
  ) {
    void finishLogin();
  }
}, {flush: "sync"});

// 兜底：bootstrap 设备同步失败时 WebSocket 不会发起，但登录本身已成功。
watch(() => deviceStore.error, (error) => {
  if (inProgress.value && error) {
    void finishLogin();
  }
}, {flush: "sync"});

// 兜底：登录后 token 被立即判定失效（bootstrap refreshUser 未授权）。
watch(() => authStore.isAuthenticated, (authenticated) => {
  if (!authenticated && inProgress.value) {
    if (!errorMessage.value) {
      errorMessage.value = "登录已失效，请重新登录";
    }
    inProgress.value = false;
  }
}, {flush: "sync"});

async function handleSubmit(): Promise<void> {
  if (!username.value || !password.value) {
    errorMessage.value = "请输入用户名和密码";
    return;
  }
  // 每次登录从 idle(0%) 重新开始。
  finishing = false;
  stage.value = "idle";
  inProgress.value = true;
  errorMessage.value = null;
  redirectTarget =
      (router.currentRoute.value.query.redirect as string | undefined) ?? "/";
  advanceStage("authenticating");
  try {
    await authStore.login(username.value, password.value);
    // token 写入后 App.vue 自动 bootstrap（设备同步 → 发起 WebSocket），
    // 后续阶段由上面的真实状态监听推进，此处不做任何时间驱动的假进度。
  } catch (error) {
    // 停止在真实失败阶段，保留真实错误原因，允许重新登录。
    errorMessage.value = getApiErrorMessage(error);
    inProgress.value = false;
  }
}
</script>

<template>
  <main class="login">
    <form class="login__card" @submit.prevent="handleSubmit">
      <h1 class="login__title">USB Relay Cloud</h1>
      <p class="login__subtitle">登录控制台</p>

      <label class="login__field">
        <span>用户名</span>
        <input
            v-model="username"
            type="text"
            autocomplete="username"
            :disabled="inProgress"
            placeholder="请输入用户名"
        />
      </label>

      <label class="login__field">
        <span>密码</span>
        <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            :disabled="inProgress"
            placeholder="请输入密码"
        />
      </label>

      <div
          v-if="progressVisible"
          class="login__progress"
          role="progressbar"
          :aria-valuenow="progressPercent"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="progressLabel"
      >
        <div class="login__progress-head">
          <span class="login__progress-label">{{ progressLabel }}</span>
          <span class="login__progress-percent">{{ progressPercent }}%</span>
        </div>
        <div class="login__progress-track">
          <div
              class="login__progress-fill"
              :class="{'is-success': stage === 'success'}"
              :style="{width: `${progressPercent}%`}"
          />
        </div>
      </div>

      <p v-if="errorMessage" class="login__error">{{ errorMessage }}</p>
      <p v-else-if="authStore.error" class="login__error">
        {{ authStore.error }}
      </p>

      <button
          type="submit"
          class="login__submit"
          :disabled="inProgress"
      >
        {{ inProgress ? "登录中…" : "登录" }}
      </button>
    </form>
  </main>
</template>

<style scoped>
.login {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f7fa;
  padding: 1rem;
}

.login__card {
  width: 100%;
  max-width: 360px;
  background: #fff;
  border-radius: 12px;
  padding: 2rem 1.5rem;
  box-shadow: 0 8px 32px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.login__title {
  margin: 0;
  font-size: 1.5rem;
  text-align: center;
  color: #1f2937;
}

.login__subtitle {
  margin: 0 0 0.5rem;
  text-align: center;
  color: #6b7280;
  font-size: 0.95rem;
}

.login__field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.9rem;
  color: #374151;
}

.login__field input {
  padding: 0.6rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 1rem;
  outline: none;
  transition: border-color 0.15s ease;
}

.login__field input:focus {
  border-color: #2563eb;
}

.login__progress {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.login__progress-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.8rem;
  color: #6b7280;
}

.login__progress-percent {
  font-variant-numeric: tabular-nums;
  color: #4b5563;
}

.login__progress-track {
  width: 100%;
  height: 7px;
  border-radius: 999px;
  background: #e5e7eb;
  overflow: hidden;
}

.login__progress-fill {
  height: 100%;
  border-radius: 999px;
  background: #2563eb;
  transition: width 0.35s ease, background-color 0.2s ease;
}

.login__progress-fill.is-success {
  background: #16a34a;
}

.login__error {
  margin: 0;
  color: #dc2626;
  font-size: 0.85rem;
  text-align: center;
}

.login__submit {
  margin-top: 0.5rem;
  padding: 0.7rem 1rem;
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
  transition: background 0.15s ease;
}

.login__submit:hover:not(:disabled) {
  background: #1d4ed8;
}

.login__submit:disabled {
  background: #93c5fd;
  cursor: not-allowed;
}
</style>
