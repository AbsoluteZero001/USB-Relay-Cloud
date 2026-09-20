const SERVER_BASE_URL_KEY = "usb-relay-cloud.server-base-url";

function trimTrailingSlash(value: string): string {
    return value.replace(/\/+$/, "");
}

function normalizeServerBaseUrl(value: string): string {
    const normalized = trimTrailingSlash(value.trim());
    if (!normalized) return "";
    const url = new URL(normalized);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("服务器地址必须以 http:// 或 https:// 开头");
    }
    return trimTrailingSlash(url.toString());
}

export function getConfiguredServerBaseUrl(): string {
    if (typeof localStorage === "undefined") return "";
    return localStorage.getItem(SERVER_BASE_URL_KEY) ?? "";
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
 * 仅用于未配置过服务器地址时的回退，例如 Android Debug APK 首次启动。
 * 通过 Vite env VITE_DEFAULT_SERVER_BASE_URL 注入；不设置则回退到
 * 原有的相对路径 VITE_API_BASE_URL（Nginx 同源部署）。
 */
function getDefaultServerBaseUrl(): string {
    const value = import.meta.env.VITE_DEFAULT_SERVER_BASE_URL;
    if (typeof value !== "string") return "";
    return trimTrailingSlash(value.trim());
}

export function getApiBaseUrl(): string {
    const serverBaseUrl = getConfiguredServerBaseUrl() || getDefaultServerBaseUrl();
    return serverBaseUrl
        ? `${serverBaseUrl}/api`
        : import.meta.env.VITE_API_BASE_URL;
}

export function getWebSocketBaseUrl(): string {
    const serverBaseUrl = getConfiguredServerBaseUrl() || getDefaultServerBaseUrl();
    if (!serverBaseUrl) {
        return import.meta.env.VITE_WS_BASE_URL;
    }
    const protocol = serverBaseUrl.startsWith("https://") ? "wss:" : "ws:";
    return `${protocol}//${serverBaseUrl.replace(/^https?:\/\//, "")}/ws/relay`;
}
