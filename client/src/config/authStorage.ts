/**
 * JWT token 与当前用户的 localStorage 持久化。
 *
 * 独立于 Pinia 的纯模块，便于 Axios 拦截器与 WebSocket 客户端
 * 在 Store 之外读取 token（避免循环依赖）。
 */

const TOKEN_KEY = "usb-relay-cloud-auth-token";
const USER_KEY = "usb-relay-cloud-auth-user";

export interface StoredUser {
    userId: number;
    username: string;
    globalRole: string;
}

export function getStoredToken(): string | null {
    try {
        return localStorage.getItem(TOKEN_KEY);
    } catch {
        return null;
    }
}

export function setStoredToken(token: string): void {
    try {
        localStorage.setItem(TOKEN_KEY, token);
    } catch {
        // localStorage 不可用时静默失败；本次会话仍可使用内存中的 token
    }
}

export function clearStoredToken(): void {
    try {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
    } catch {
        // ignore
    }
}

export function getStoredUser(): StoredUser | null {
    try {
        const raw = localStorage.getItem(USER_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (
            parsed &&
            typeof parsed === "object" &&
            typeof parsed.userId === "number" &&
            typeof parsed.username === "string" &&
            typeof parsed.globalRole === "string"
        ) {
            return parsed as StoredUser;
        }
        return null;
    } catch {
        return null;
    }
}

export function setStoredUser(user: StoredUser): void {
    try {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {
        // ignore
    }
}
