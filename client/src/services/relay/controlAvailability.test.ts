import {describe, expect, it} from "vitest";

import {resolveControlAvailability} from "./controlAvailability";
import type {
    HardwareConnectionState,
    HardwareStatus,
} from "./hardware/HardwareStatus";
import type {RelayStateValue} from "@/types/api";

function status(
    state: HardwareConnectionState,
    options: {
        commandedState?: RelayStateValue;
        executing?: boolean;
        errorCode?: string | null;
        errorDetail?: string | null;
    } = {},
): HardwareStatus {
    return {
        state,
        matchedProfile: null,
        commandedState: options.commandedState ?? "UNKNOWN",
        commandStatus: null,
        executing: options.executing ?? false,
        lastPorts: [],
        errorCode: options.errorCode ?? null,
        errorDetail: options.errorDetail ?? null,
    };
}

describe("resolveControlAvailability", () => {
    it("DETECTED（只识别到设备、串口未打开）不允许控制", () => {
        const result = resolveControlAvailability(status("DETECTED"));

        expect(result.canControl).toBe(false);
        expect(result.reason).toBe("SERIAL_NOT_CONNECTED");
        expect(result.message).toContain("点击「连接」");
    });

    it("CONNECTED + UNKNOWN 允许控制（未知不等于禁止）", () => {
        const result = resolveControlAvailability(
            status("CONNECTED", {commandedState: "UNKNOWN"}),
        );

        expect(result.canControl).toBe(true);
        expect(result.reason).toBeNull();
        expect(result.message).toContain("当前状态未知");
    });

    it("CONNECTED + OFF 允许控制", () => {
        expect(
            resolveControlAvailability(
                status("CONNECTED", {commandedState: "OFF"}),
            ).canControl,
        ).toBe(true);
    });

    it("CONNECTED + ON 允许控制", () => {
        expect(
            resolveControlAvailability(
                status("CONNECTED", {commandedState: "ON"}),
            ).canControl,
        ).toBe(true);
    });

    it("写入中（writeInProgress）临时禁止控制", () => {
        const result = resolveControlAvailability(
            status("CONNECTED", {commandedState: "ON", executing: true}),
        );

        expect(result.canControl).toBe(false);
        expect(result.writeInProgress).toBe(true);
        expect(result.reason).toBe("WRITE_IN_PROGRESS");
    });

    it("NO_DEVICE 不允许控制", () => {
        const result = resolveControlAvailability(status("NO_DEVICE"));

        expect(result.canControl).toBe(false);
        expect(result.reason).toBe("NO_DEVICE");
    });

    it("PERMISSION_REQUIRED 不允许控制并提示授权", () => {
        const result = resolveControlAvailability(
            status("PERMISSION_REQUIRED"),
        );

        expect(result.canControl).toBe(false);
        expect(result.reason).toBe("PERMISSION_REQUIRED");
        expect(result.message).toContain("USB 权限");
    });

    it("ERROR 不允许控制并透出具体错误", () => {
        const result = resolveControlAvailability(
            status("ERROR", {errorDetail: "UsbManager.openDevice() 返回空值"}),
        );

        expect(result.canControl).toBe(false);
        expect(result.reason).toBe("SERIAL_ERROR");
        expect(result.message).toBe("UsbManager.openDevice() 返回空值");
    });

    it("UNSUPPORTED 不允许控制", () => {
        const result = resolveControlAvailability(
            status("UNSUPPORTED", {errorDetail: "检测到 USB 设备，但未找到兼容串口驱动"}),
        );

        expect(result.canControl).toBe(false);
        expect(result.reason).toBe("DEVICE_UNSUPPORTED");
        expect(result.message).toContain("兼容串口驱动");
    });

    it("DISCONNECTED 不允许控制", () => {
        const result = resolveControlAvailability(status("DISCONNECTED"));

        expect(result.canControl).toBe(false);
        expect(result.reason).toBe("SERIAL_NOT_CONNECTED");
    });

    it("物理拔出（SERIAL_DEVICE_DISCONNECTED）→ reason=SERIAL_DISCONNECTED", () => {
        const result = resolveControlAvailability(
            status("DISCONNECTED", {
                errorCode: "SERIAL_DEVICE_DISCONNECTED",
                errorDetail: "USB 串口设备已拔出",
            }),
        );

        expect(result.canControl).toBe(false);
        expect(result.reason).toBe("SERIAL_DISCONNECTED");
        expect(result.message).toContain("请重新插入设备并连接");
    });

    it("写入过程中断开（ERROR + SERIAL_DEVICE_DISCONNECTED）同样是 SERIAL_DISCONNECTED", () => {
        const result = resolveControlAvailability(
            status("ERROR", {
                errorCode: "SERIAL_DEVICE_DISCONNECTED",
                errorDetail: "USB 串口设备已拔出",
            }),
        );

        expect(result.canControl).toBe(false);
        expect(result.reason).toBe("SERIAL_DISCONNECTED");
    });
});
