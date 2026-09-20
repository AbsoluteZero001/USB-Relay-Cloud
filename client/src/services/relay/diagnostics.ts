import {Capacitor} from "@capacitor/core";

/**
 * 硬件层调试日志。
 *
 * 目的：扫描 / 授权 / 打开 / 写入失败时不再只抛一句「扫描失败」，
 * 而是把平台、设备数量、VID/PID、驱动、权限、串口参数、写入结果和
 * 原始异常都记录下来，供 UI 直接展示给现场排查的人。
 *
 * 该模块必须保持零依赖（除 Capacitor），避免与 adapter 形成循环引用。
 */
export type HardwareLogLevel = "info" | "warn" | "error";

export interface HardwareLogEntry {
    id: number;
    at: string;
    level: HardwareLogLevel;
    message: string;
    detail: string | null;
}

const MAX_ENTRIES = 200;

const entries: HardwareLogEntry[] = [];
const listeners = new Set<(entries: readonly HardwareLogEntry[]) => void>();
let nextId = 1;

function snapshot(): readonly HardwareLogEntry[] {
    return entries.slice();
}

function emit(): void {
    const current = snapshot();
    for (const listener of listeners) {
        listener(current);
    }
}

export function formatHardwareError(error: unknown): string {
    if (error instanceof Error) {
        return error.message || error.name;
    }
    if (typeof error === "string") {
        return error;
    }
    if (error && typeof error === "object") {
        const record = error as Record<string, unknown>;
        const code = typeof record.code === "string" ? record.code : null;
        const message = typeof record.message === "string"
            ? record.message
            : null;
        const detail = typeof record.detail === "string"
            ? record.detail
            : null;
        const parts = [code, message ?? detail].filter(
            (part): part is string => !!part,
        );
        if (parts.length) return parts.join(" · ");
        try {
            return JSON.stringify(error);
        } catch {
            return "未知硬件错误";
        }
    }
    return String(error);
}

export const hardwareLog = {
    record(
        level: HardwareLogLevel,
        message: string,
        detail?: string | null,
    ): void {
        entries.push({
            id: nextId++,
            at: new Date().toISOString(),
            level,
            message,
            detail: detail ?? null,
        });
        while (entries.length > MAX_ENTRIES) {
            entries.shift();
        }
        // 同步输出到控制台，Android 上可用 chrome://inspect 直接看到。
        const line = `[UsbRelay] ${message}`;
        if (level === "error") {
            console.error(line, detail ?? "");
        } else if (level === "warn") {
            console.warn(line, detail ?? "");
        } else {
            console.info(line, detail ?? "");
        }
        emit();
    },

    info(message: string, detail?: string | null): void {
        this.record("info", message, detail);
    },

    warn(message: string, detail?: string | null): void {
        this.record("warn", message, detail);
    },

    error(message: string, detail?: string | null): void {
        this.record("error", message, detail);
    },

    list(): readonly HardwareLogEntry[] {
        return snapshot();
    },

    clear(): void {
        entries.length = 0;
        emit();
    },

    subscribe(
        listener: (entries: readonly HardwareLogEntry[]) => void,
    ): () => void {
        listeners.add(listener);
        listener(snapshot());
        return () => listeners.delete(listener);
    },
};

export interface PlatformDebugInfo {
    platform: "android" | "electron" | "web";
    capacitorNative: boolean;
    capacitorPlatform: string;
    userAgent: string;
}

/**
 * 当前运行平台判定。与 serial/index.ts 的 getRelayRuntime() 保持一致，
 * 但额外暴露 Capacitor 判定结果，方便区分「PC 浏览器 / Android WebView /
 * Electron / Capacitor Android」四种环境。
 */
export function getPlatformDebugInfo(): PlatformDebugInfo {
    let native = false;
    let platform = "web";
    try {
        native = Capacitor.isNativePlatform();
        platform = Capacitor.getPlatform();
    } catch {
        native = false;
    }
    const isElectron =
        typeof window !== "undefined" && !!window.desktopAPI?.isElectron;
    return {
        platform: native && platform === "android"
            ? "android"
            : isElectron
                ? "electron"
                : "web",
        capacitorNative: native,
        capacitorPlatform: platform,
        userAgent: typeof navigator === "undefined"
            ? ""
            : navigator.userAgent,
    };
}
