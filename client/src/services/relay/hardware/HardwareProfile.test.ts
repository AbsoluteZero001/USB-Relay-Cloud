import {describe, expect, it} from "vitest";

import {LCUS1_CH340_PROFILE, matchHardwareProfile, normalizeUsbId,} from "./HardwareProfile";
import type {SerialPortInfo} from "../serial/types";

function port(vid: unknown, pid: unknown): SerialPortInfo {
    return {
        port: "1",
        device: "USB-SERIAL CH340",
        description: "USB-SERIAL CH340",
        manufacturer: null,
        hwid: null,
        vendorId: vid as string | null,
        productId: pid as string | null,
        serialNumber: null,
        isCurrent: false,
    };
}

describe("normalizeUsbId", () => {
    it("converts decimal numbers to uppercase hex4", () => {
        // spec 测试 1：VID decimal -> hex
        expect(normalizeUsbId(6790)).toBe("1A86");
        expect(normalizeUsbId(29987)).toBe("7523");
    });

    it("strips 0x prefix from hex strings", () => {
        // spec 测试 2
        expect(normalizeUsbId("0x1a86")).toBe("1A86");
        expect(normalizeUsbId("0X1A86")).toBe("1A86");
    });

    it("uppercases and pads hex strings", () => {
        // spec 测试 3
        expect(normalizeUsbId("1a86")).toBe("1A86");
        expect(normalizeUsbId("1A86")).toBe("1A86");
        // 适配器实际产出的 hex4 不被误判为十进制
        expect(normalizeUsbId("7523")).toBe("7523");
    });

    it("returns null for empty / invalid input", () => {
        expect(normalizeUsbId(null)).toBeNull();
        expect(normalizeUsbId("")).toBeNull();
        expect(normalizeUsbId("0x")).toBeNull();
        expect(normalizeUsbId("nope")).toBeNull();
        expect(normalizeUsbId(-1)).toBeNull();
    });
});

describe("matchHardwareProfile", () => {
    it("matches CH340 VID/PID to LCUS1_CH340_PROFILE", () => {
        // spec 测试 4
        expect(matchHardwareProfile(port("1A86", "7523"))).toBe(
            LCUS1_CH340_PROFILE,
        );
        // 不同大小写 / 前缀也应匹配
        expect(matchHardwareProfile(port("1a86", "7523"))).toBe(
            LCUS1_CH340_PROFILE,
        );
        expect(matchHardwareProfile(port("0x1A86", "0x7523"))).toBe(
            LCUS1_CH340_PROFILE,
        );
    });

    it("matches even when productName / manufacturer are missing", () => {
        // spec 测试 5：driverName 只作辅助，VID/PID 是主条件
        const p = port("1A86", "7523");
        p.manufacturer = null;
        p.description = "USB Serial Device";
        expect(matchHardwareProfile(p)).toBe(LCUS1_CH340_PROFILE);
    });

    it("returns null for non-matching VID/PID (UNSUPPORTED)", () => {
        // spec 测试 6
        expect(matchHardwareProfile(port("9999", "0001"))).toBeNull();
        expect(matchHardwareProfile(port(null, "7523"))).toBeNull();
        expect(matchHardwareProfile(port("1A86", null))).toBeNull();
    });
});
