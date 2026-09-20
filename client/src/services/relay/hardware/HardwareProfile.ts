import type {SerialFlowControl, SerialParity, SerialPortInfo} from "../serial/types";

/**
 * 受支持的 USB 继电器硬件配置。
 *
 * 仅当扫描到的 USB 设备能匹配到某个 HardwareProfile 时，才允许进入
 * CONNECTED 状态并控制继电器。任何未匹配的 USB 设备只能标记为 UNSUPPORTED。
 */
export interface RelayHardwareProfile {
    /** 配置唯一标识，例如 "lcus1-ch340" */
    id: string;
    /** 人类可读名称，用于 UI 展示 */
    name: string;
    /** USB 桥接芯片标识，例如 "CH340" */
    usbChip: string;
    /** 受支持的 USB 厂商 ID（大写 4 位十六进制字符串，例如 "1A86"） */
    vendorIds: string[];
    /** 受支持的 USB 产品 ID（大写 4 位十六进制字符串，例如 "7523"） */
    productIds: string[];
    baudRate: number;
    dataBits: 5 | 6 | 7 | 8;
    stopBits: 1 | 1.5 | 2;
    parity: SerialParity;
    flowControl: SerialFlowControl;
    /** 继电器通道数，LCUS-1 为单路 */
    channels: number;
    /** 协议标识，用于日志 */
    protocol: string;
    /** 开启指令字节序列（硬件已验证，不得随意修改） */
    onCommand: Uint8Array;
    /** 关闭指令字节序列（硬件已验证，不得随意修改） */
    offCommand: Uint8Array;
    /**
     * 是否支持硬件状态回读。
     * LCUS-1 没有已验证的回读协议，因此始终为 false，
     * 硬件真实状态只能保持 UNKNOWN，不得伪造。
     */
    supportsStateReadback: boolean;
}

/**
 * LCUS-1 单路 USB 继电器 + CH340 USB-SERIAL 桥接的已验证配置。
 *
 * 仓库中已确认的识别值：
 * - CH340 vendorId = 0x1A86 → "1A86"
 * - CH340 productId = 0x7523 → "7523"
 * （见 AndroidUsbRelayPlugin.kt / WebSerialRelayAdapter.ts / UsbRelayPlugin.kt）
 *
 * 串口参数与指令字节来自此前真机闭环验证，禁止凭空修改：
 * - 9600 8N1
 * - ON  = A0 01 01 A2
 * - OFF = A0 01 00 A1
 */
export const LCUS1_CH340_PROFILE: RelayHardwareProfile = {
    id: "lcus1-ch340",
    name: "LCUS-1 单路 USB 继电器",
    usbChip: "CH340",
    vendorIds: ["1A86"],
    productIds: ["7523"],
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: "none",
    flowControl: "none",
    channels: 1,
    protocol: "LCUS1",
    onCommand: new Uint8Array([0xa0, 0x01, 0x01, 0xa2]),
    offCommand: new Uint8Array([0xa0, 0x01, 0x00, 0xa1]),
    supportsStateReadback: false,
};

/** 当前受支持的全部硬件配置，按优先级排列。 */
export const SUPPORTED_PROFILES: RelayHardwareProfile[] = [LCUS1_CH340_PROFILE];

/**
 * 将 USB vendorId / productId 统一规范化为大写 4 位十六进制字符串（如 "1A86"）。
 *
 * 接受以下输入：
 * - number：当作十进制整数转换（6790 → "1A86"，29987 → "7523"）。
 *   适用于某些原生桥把 VID 作为数字透传的场景。
 * - 字符串 "0x1a86" / "0X1A86"：去除前缀后按十六进制处理。
 * - 字符串 "1a86" / "1A86" / "7523"：按十六进制处理（适配器实际产物）。
 *
 * 注意：纯数字字符串（如 "7523"）按十六进制处理而不是十进制——
 * 因为仓库内 AndroidUsbRelayAdapter / WebSerialRelayAdapter 产出的 PortInfo
 * 始终是 hex4 字符串（"1A86"/"7523"），若把 "7523" 当十进制会错算成 "1D63"。
 * 真正的十进制只在数值类型输入时出现。
 */
export function normalizeUsbId(value: unknown): string | null {
    if (value == null) {
        return null;
    }
    let hex: string;
    if (typeof value === "number") {
        if (!Number.isFinite(value) || value < 0) {
            return null;
        }
        hex = Math.trunc(value).toString(16);
    } else if (typeof value === "string") {
        let trimmed = value.trim();
        if (/^0x/i.test(trimmed)) {
            trimmed = trimmed.slice(2);
        }
        if (trimmed.length === 0) {
            return null;
        }
        hex = trimmed;
    } else {
        return null;
    }
    if (!/^[0-9a-fA-F]+$/.test(hex)) {
        return null;
    }
    return hex.toUpperCase().padStart(4, "0");
}

/**
 * 将扫描到的串口设备与受支持的 HardwareProfile 进行匹配。
 *
 * 匹配依据：USB vendorId / productId（大写 4 位十六进制）。
 * 任何字段缺失或不匹配均返回 null，调用方应将其标记为 UNSUPPORTED。
 */
export function matchHardwareProfile(
    port: SerialPortInfo,
): RelayHardwareProfile | null {
    const vid = normalizeUsbId(port.vendorId);
    const pid = normalizeUsbId(port.productId);
    if (!vid || !pid) {
        return null;
    }
    for (const profile of SUPPORTED_PROFILES) {
        if (profile.vendorIds.includes(vid) && profile.productIds.includes(pid)) {
            return profile;
        }
    }
    return null;
}
