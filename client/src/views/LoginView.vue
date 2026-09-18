<script setup lang="ts">
import {ref} from "vue";
import {useRouter} from "vue-router";

import {useAuthStore} from "@/stores/authStore";
import {getApiErrorMessage} from "@/api/http";

const authStore = useAuthStore();
const router = useRouter();

const username = ref("");
const password = ref("");
const submitting = ref(false);
const errorMessage = ref<string | null>(null);

async function handleSubmit(): Promise<void> {
  if (!username.value || !password.value) {
    errorMessage.value = "请输入用户名和密码";
    return;
  }
  submitting.value = true;
  errorMessage.value = null;
  try {
    await authStore.login(username.value, password.value);
    const redirect =
        (router.currentRoute.value.query.redirect as string | undefined) ?? "/";
    await router.replace(redirect);
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error);
  } finally {
    submitting.value = false;
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
            :disabled="submitting"
            placeholder="请输入用户名"
        />
      </label>

      <label class="login__field">
        <span>密码</span>
        <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            :disabled="submitting"
            placeholder="请输入密码"
        />
      </label>

      <p v-if="errorMessage" class="login__error">{{ errorMessage }}</p>
      <p v-else-if="authStore.error" class="login__error">
        {{ authStore.error }}
      </p>

      <button
          type="submit"
          class="login__submit"
          :disabled="submitting"
      >
        {{ submitting ? "登录中…" : "登录" }}
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
