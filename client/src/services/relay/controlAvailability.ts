import type {HardwareStatus} from "./hardware/HardwareStatus";

/**
 * 继电器开关是否可以操作。
 *
 * 设计原则（本地硬件与 Cloud Sync 解耦）：
 *   canControl = 本地串口已 CONNECTED && 没有正在写入的指令
 *
 * 明确不参与判断的因素：
 * - 云端是否注册了 device / 是否选中了云端设备
 * - relay_state 是否存在、当前 commandedState 是否为 UNKNOWN
 * - WebSocket 是否在线、是否收到过 heartbeat、设备是否 ONLINE
 *
 * 历史 Bug：开关要求 `!!deviceId`（云端设备 ID），Android 上 USB 已经
 * 识别并连接，但账号里没有注册云端设备时开关永远 disabled。
 */
export type ControlBlockedReason =
    | "PLATFORM_UNSUPPORTED"
    | "NO_DEVICE"
    | "SERIAL_NOT_CONNECTED"
    | "PERMISSION_REQUIRED"
    | "DEVICE_UNSUPPORTED"
    | "WRITE_IN_PROGRESS"
    | "SERIAL_DISCONNECTED"
    | "SERIAL_ERROR";

/** 物理拔出 / 串口被关闭时使用的原因码。 */
export const SERIAL_DISCONNECTED_REASON = "SERIAL_DISCONNECTED";

/** 适配器在物理拔出时写入 SerialStatus.errorCode 的值。 */
export const SERIAL_DEVICE_DISCONNECTED_CODE = "SERIAL_DEVICE_DISCONNECTED";

const SERIAL_DISCONNECTED_MESSAGE =
    "USB 设备已拔出，请重新插入设备并连接。";

export interface ControlAvailability {
    canControl: boolean;
    writeInProgress: boolean;
    /** 不可控制时的原因码；可控制时为 null。 */
    reason: ControlBlockedReason | null;
    /** 面向用户的中文原因说明。 */
    message: string;
}

export function resolveControlAvailability(
    status: HardwareStatus,
): ControlAvailability {
    const connected = status.state === "CONNECTED";
    const writeInProgress = status.executing;

    if (connected) {
        if (writeInProgress) {
            return blocked(
                "WRITE_IN_PROGRESS",
                "正在写入串口指令，请稍候…",
                true,
            );
        }
        return {
            canControl: true,
            writeInProgress: false,
            reason: null,
            message:
                status.commandedState === "UNKNOWN"
                    ? "当前状态未知，可发送控制指令"
                    : `本地串口已连接，当前 ${status.commandedState}`,
        };
    }

    switch (status.state) {
        case "PERMISSION_REQUIRED":
            return blocked(
                "PERMISSION_REQUIRED",
                "需要 USB 权限：请在上方 USB 面板点击「授权并连接」",
            );
        case "UNSUPPORTED":
            return blocked(
                "DEVICE_UNSUPPORTED",
                status.errorDetail ?? "未匹配到可用的继电器配置",
            );
        case "DETECTED":
        case "SCANNING":
        case "CONNECTING":
            return blocked(
                "SERIAL_NOT_CONNECTED",
                "已检测到设备，请在上方 USB 面板点击「连接」打开串口",
            );
        case "ERROR":
            if (status.errorCode === SERIAL_DEVICE_DISCONNECTED_CODE) {
                return blocked(
                    "SERIAL_DISCONNECTED",
                    SERIAL_DISCONNECTED_MESSAGE,
                );
            }
            return blocked(
                "SERIAL_ERROR",
                status.errorDetail ?? "串口错误，请重新扫描并连接",
            );
        case "NO_DEVICE":
            return blocked(
                "NO_DEVICE",
                "未检测到 USB 设备，请插入 LCUS-1 + CH340 后重新扫描",
            );
        default:
            if (status.errorCode === SERIAL_DEVICE_DISCONNECTED_CODE) {
                return blocked(
                    "SERIAL_DISCONNECTED",
                    SERIAL_DISCONNECTED_MESSAGE,
                );
            }
            return blocked(
                "SERIAL_NOT_CONNECTED",
                "本地串口未连接，无法控制",
            );
    }
}

function blocked(
    reason: ControlBlockedReason,
    message: string,
    writeInProgress = false,
): ControlAvailability {
    return {canControl: false, writeInProgress, reason, message};
}
