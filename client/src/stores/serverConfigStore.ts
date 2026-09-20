import {defineStore} from "pinia";

import {
    clearConfiguredServerBaseUrl,
    DEFAULT_SERVER_URL,
    getApiBaseUrl,
    getConfiguredServerBaseUrl,
    getDefaultServerBaseUrl,
    getEffectiveServerBaseUrl,
    getServerConfigSource,
    getWebSocketBaseUrl,
    isNativeAndroid,
    saveConfiguredServerBaseUrl,
} from "@/config/runtimeConfig";

/**
 * 服务器地址统一配置源。
 *
 * 优先级（runtimeConfig 已实现）：
 *   用户本地保存的地址  >  VITE_DEFAULT_SERVER_BASE_URL  >  相对路径 fallback
 *
 * 所有 REST / WebSocket 地址必须通过本 store 派生，禁止在模块初始化时
 * 写死服务器地址。切换地址后立即生效，无需重启应用。
 */
export const useServerConfigStore = defineStore("serverConfig", {
    state: () => ({
        // 持久化到 localStorage 的用户自定义地址；空串表示未设置。
        configuredServerBaseUrl: getConfiguredServerBaseUrl(),
    }),

    getters: {
        /** 当前生效的服务器根地址（含优先级计算）。 */
        effectiveServerBaseUrl(state): string {
            return state.configuredServerBaseUrl
                || getEffectiveServerBaseUrl();
        },

        /**
         * 派生的 REST API 基础地址。
         *
         * 显式读取 configuredServerBaseUrl，保证切换地址后 Pinia 的
         * computed 缓存立即失效（无响应式依赖的 getter 会被永久缓存）。
         */
        apiBaseUrl(state): string {
            void state.configuredServerBaseUrl;
            return getApiBaseUrl();
        },

        /** 派生的 WebSocket 地址。 */
        wsBaseUrl(state): string {
            void state.configuredServerBaseUrl;
            return getWebSocketBaseUrl();
        },

        /** 是否为用户自定义地址（非构建时默认值）。 */
        isCustomized(state): boolean {
            return state.configuredServerBaseUrl.length > 0;
        },

        /** 构建期 / 平台默认地址（未保存自定义地址时使用）。 */
        defaultServerBaseUrl(): string {
            return getDefaultServerBaseUrl();
        },

        /** 平台内置默认值，用于「恢复默认」提示。 */
        platformDefaultServerUrl(): string {
            return DEFAULT_SERVER_URL;
        },

        isAndroidNative(): boolean {
            return isNativeAndroid();
        },

        /** 当前地址来源，用于 UI 展示。 */
        sourceLabel(state): string {
            if (state.configuredServerBaseUrl) {
                return "本地已保存";
            }
            switch (getServerConfigSource()) {
                case "build-default":
                    return "构建时默认值";
                case "android-default":
                    return "Android 默认值";
                case "same-origin":
                    return "当前页面同源地址";
                case "custom":
                    return "本地已保存";
            }
        },
    },

    actions: {
        /**
         * 保存服务器地址。
         *
         * 若地址发生变化且当前已登录：清除旧服务器 token、断开 WebSocket，
         * 回到登录页。未登录时仅更新地址。
         *
         * @returns 归一化后的地址；若输入非法抛出 Error。
         */
        setServerBaseUrl(value: string): string {
            const normalized = saveConfiguredServerBaseUrl(value);
            this.configuredServerBaseUrl = normalized;
            return normalized;
        },

        /** 恢复为构建时默认服务器地址（清除 localStorage 中的自定义值）。 */
        resetServerBaseUrl(): void {
            clearConfiguredServerBaseUrl();
            this.configuredServerBaseUrl = "";
        },

        /** 从 localStorage 重新加载（用于跨标签同步等场景）。 */
        reload(): void {
            this.configuredServerBaseUrl = getConfiguredServerBaseUrl();
        },
    },
});
