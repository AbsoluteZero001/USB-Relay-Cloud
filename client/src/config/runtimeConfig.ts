import {Capacitor} from "@capacitor/core";

/**
 * 唯一的默认服务器地址来源。
 *
 * 仅作为「用户从未保存过服务器地址」时的回退：
 * - Android / Capacitor 原生 App：默认指向公网服务
 * - Web（Nginx 同源部署）：默认走同源相对路径，不硬编码域名
 *
 * 任何业务代码都不得再复制这个地址，必须通过本模块 / serverConfigStore 派生。
 */
export const DEFAULT_SERVER_URL = "https://relay.evezero.cn";

const SERVER_BASE_URL_KEY = "usb-relay-cloud.server-base-url";
const WS_PATH = "/ws/relay";

export type ServerConfigSource =
    | "custom"
    | "build-default"
    | "android-default"
    | "same-origin";

function trimTrailingSlash(value: string): string {
    return value.replace(/\/+$/, "");
}

/**
 * 判断当前是否运行在 Capacitor Android 原生容器内。
 *
 * 注意：Android WebView 里 `navigator.serial` 不存在，绝不能把它判定成
 * 浏览器 Web Serial 环境，原生容器必须走 Capacitor 插件。
 */
export function isNativeAndroid(): boolean {
    try {
        return Capacitor.isNativePlatform()
            && Capacitor.getPlatform() === "android";
    } catch {
        return false;
    }
}

export function normalizeServerBaseUrl(value: string): string {
    const normalized = trimTrailingSlash(value.trim());
    if (!normalized) return "";
    let url: URL;
    try {
        url = new URL(normalized);
    } catch {
        throw new Error("服务器地址格式不正确，请填写完整地址");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("服务器地址必须以 http:// 或 https:// 开头");
    }
    if (!url.hostname) {
        throw new Error("服务器地址缺少主机名");
    }
    return trimTrailingSlash(url.toString());
}

export function getConfiguredServerBaseUrl(): string {
    if (typeof localStorage === "undefined") return "";
    try {
        const raw = localStorage.getItem(SERVER_BASE_URL_KEY);
        return raw ? normalizeServerBaseUrl(raw) : "";
    } catch {
        return "";
    }
}

export function saveConfiguredServerBaseUrl(value: string): string {
    const normalized = normalizeServerBaseUrl(value);
    if (normalized) {
        localStorage.setItem(SERVER_BASE_URL_KEY, normalized);
    } else {
        localStorage.removeItem(SERVER_BASE_URL_KEY);
    }
    return normalized;
}

export function clearConfiguredServerBaseUrl(): void {
    if (typeof localStorage !== "undefined") {
        localStorage.removeItem(SERVER_BASE_URL_KEY);
    }
}

/**
 * 构建期烘焙的默认服务器地址（绝对 URL）。
 *
 * 优先级：
 *   1. VITE_DEFAULT_SERVER_BASE_URL（构建期注入，可覆盖）
 *   2. Android 原生容器 → DEFAULT_SERVER_URL
 *   3. Web → 空串，表示同源相对路径
 */
export function getDefaultServerBaseUrl(): string {
    const value = import.meta.env.VITE_DEFAULT_SERVER_BASE_URL;
    if (typeof value === "string" && value.trim()) {
        return normalizeServerBaseUrl(value);
    }
    return isNativeAndroid() ? DEFAULT_SERVER_URL : "";
}

/** 用户保存值优先，其次构建期 / 平台默认值。 */
export function getEffectiveServerBaseUrl(): string {
    return getConfiguredServerBaseUrl() || getDefaultServerBaseUrl();
}

export function getServerConfigSource(): ServerConfigSource {
    if (getConfiguredServerBaseUrl()) {
        return "custom";
    }
    const value = import.meta.env.VITE_DEFAULT_SERVER_BASE_URL;
    if (typeof value === "string" && value.trim()) {
        return "build-default";
    }
    return isNativeAndroid() ? "android-default" : "same-origin";
}

function currentOrigin(): string {
    if (typeof window === "undefined") return "";
    const origin = window.location?.origin ?? "";
    return origin.startsWith("http://") || origin.startsWith("https://")
        ? origin
        : "";
}

/** 把 http(s) 根地址转换为 ws(s) 地址；子路径会被保留。 */
export function toWebSocketUrl(serverBaseUrl: string): string {
    const base = trimTrailingSlash(serverBaseUrl);
    if (!base) return "";
    const protocol = base.startsWith("https://") ? "wss:" : "ws:";
    return `${protocol}//${base.replace(/^https?:\/\//, "")}${WS_PATH}`;
}

/**
 * 统一的 REST 基础地址：`<serverUrl>/api`。
 *
 * 未配置任何服务器地址时（浏览器同源部署）回退到相对路径 `/api`，
 * 绝不返回 undefined —— 否则 axios 会把请求打到 WebView 自身的
 * `https://localhost/` 上（Android 端历史故障之一）。
 */
export function getApiBaseUrl(): string {
    const serverBaseUrl = getEffectiveServerBaseUrl();
    if (serverBaseUrl) {
        return `${serverBaseUrl}/api`;
    }
    const configured = import.meta.env.VITE_API_BASE_URL;
    if (typeof configured === "string" && configured.trim()) {
        return trimTrailingSlash(configured.trim());
    }
    const origin = currentOrigin();
    return origin ? `${origin}/api` : "/api";
}

/** 统一的 WebSocket 地址：http → ws、https → wss，路径固定 /ws/relay。 */
export function getWebSocketBaseUrl(): string {
    const serverBaseUrl = getEffectiveServerBaseUrl();
    if (serverBaseUrl) {
        return toWebSocketUrl(serverBaseUrl);
    }
    const configured = import.meta.env.VITE_WS_BASE_URL;
    if (typeof configured === "string" && configured.trim()) {
        return configured.trim();
    }
    const origin = currentOrigin();
    return origin ? toWebSocketUrl(origin) : "ws://localhost/ws/relay";
}
