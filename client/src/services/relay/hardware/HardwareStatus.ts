import type {RelayHardwareProfile} from "./HardwareProfile";
import type {SerialPortInfo,} from "../serial/types";
import type {CommandStatus, RelayStateValue,} from "@/types/api";

/**
 * 本地 USB 硬件连接状态机。
 *
 * 只有进入 CONNECTED 才表示：
 * - USB 设备存在
 * - 权限已授权
 * - 串口成功打开
 * - 串口参数成功应用
 * - HardwareProfile 匹配成功
 *
 * 任何非 CONNECTED 状态下，继电器控制滑块必须 disabled。
 */
export type HardwareConnectionState =
    | "DISCONNECTED"
    | "SCANNING"
    | "DETECTED"
    | "UNSUPPORTED"
    | "PERMISSION_REQUIRED"
    | "CONNECTING"
    | "CONNECTED"
    | "ERROR";

export interface HardwareStatus {
    /** 硬件连接状态机当前状态 */
    state: HardwareConnectionState;
    /** 当前匹配到的硬件配置；未匹配或未连接时为 null */
    matchedProfile: RelayHardwareProfile | null;
    /** 本地最后一次成功指令的 commandedState（硬件真实状态始终 UNKNOWN） */
    commandedState: RelayStateValue;
    /** 本地最后一次指令的执行状态 */
    commandStatus: CommandStatus | null;
    /** 是否有指令正在执行（并发锁） */
    executing: boolean;
    /** 最近一次扫描到的串口列表，用于 UI 选择 */
    lastPorts: SerialPortInfo[];
    /** 错误码（仅在 ERROR / 失败时有值） */
    errorCode: string | null;
    /** 错误细节（人类可读） */
    errorDetail: string | null;
}

export function hardwareStateLabel(state: HardwareConnectionState): string {
    switch (state) {
        case "DISCONNECTED":
            return "未连接";
        case "SCANNING":
            return "扫描中";
        case "DETECTED":
            return "已检测";
        case "UNSUPPORTED":
            return "不受支持";
        case "PERMISSION_REQUIRED":
            return "需要 USB 权限";
        case "CONNECTING":
            return "正在连接";
        case "CONNECTED":
            return "已连接";
        case "ERROR":
            return "错误";
    }
}
