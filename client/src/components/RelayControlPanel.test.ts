import {mount} from "@vue/test-utils";
import {beforeEach, describe, expect, it, vi} from "vitest";

import RelayControlPanel from "./RelayControlPanel.vue";
import {relayService} from "@/services/relay";
import type {
    HardwareConnectionState,
    HardwareStatus,
} from "@/services/relay/hardware";
import type {
    RelayAction,
    RelayExecutionResult,
    RelayStateValue,
} from "@/types/api";

function hardwareStatus(
    state: HardwareConnectionState,
    options: {
        commandedState?: RelayStateValue;
        executing?: boolean;
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
        errorCode: null,
        errorDetail: options.errorDetail ?? null,
    };
}

function executionResult(
    action: RelayAction,
    deviceId: string | null,
    options: {
        localWriteSucceeded?: boolean;
        cloudSyncStatus?: RelayExecutionResult["cloudSyncStatus"];
        cloudSyncMessage?: string | null;
    } = {},
): RelayExecutionResult {
    const localWriteSucceeded = options.localWriteSucceeded ?? true;
    return {
        commandId: "11111111-1111-4111-8111-111111111111",
        deviceId,
        channel: 1,
        commandedState: localWriteSucceeded ? action : "UNKNOWN",
        commandStatus: localWriteSucceeded ? "SUCCESS" : "FAILED",
        hardwareState: "UNKNOWN",
        localWriteSucceeded,
        cloudSyncStatus: options.cloudSyncStatus
            ?? (deviceId ? "SUCCESS" : "NOT_REQUIRED"),
        cloudSyncMessage: options.cloudSyncMessage ?? null,
        cloudEvent: null,
    };
}

function mountPanel(
    hardwareStatusValue: HardwareStatus,
    deviceId: string | null = null,
) {
    return mount(RelayControlPanel, {
        props: {deviceId, hardwareStatus: hardwareStatusValue},
    });
}

function switchButton(wrapper: ReturnType<typeof mountPanel>) {
    return wrapper.get("button[role='switch']");
}

beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("RelayControlPanel 开关可用性", () => {
    it("DETECTED（仅识别到设备）时开关 disabled", () => {
        const wrapper = mountPanel(hardwareStatus("DETECTED"));

        expect((switchButton(wrapper).element as HTMLButtonElement).disabled)
            .toBe(true);
        expect(wrapper.get(".relay-switch-label").text()).toBe("未连接");
        expect(wrapper.text()).toContain("点击「连接」");
    });

    it("CONNECTED + UNKNOWN 时开关 enabled（状态未知也能控制）", () => {
        const wrapper = mountPanel(
            hardwareStatus("CONNECTED", {commandedState: "UNKNOWN"}),
        );

        expect((switchButton(wrapper).element as HTMLButtonElement).disabled)
            .toBe(false);
        expect(wrapper.get(".relay-switch-label").text()).toBe("未知");
        expect(wrapper.text()).toContain("当前状态未知，可发送控制指令");
    });

    it("CONNECTED + OFF 时开关 enabled 且显示 OFF", () => {
        const wrapper = mountPanel(
            hardwareStatus("CONNECTED", {commandedState: "OFF"}),
        );

        expect((switchButton(wrapper).element as HTMLButtonElement).disabled)
            .toBe(false);
        expect(wrapper.get(".relay-switch-label").text()).toBe("OFF");
        expect(switchButton(wrapper).classes()).toContain("is-off");
    });

    it("CONNECTED + ON 时开关 enabled 且显示 ON", () => {
        const wrapper = mountPanel(
            hardwareStatus("CONNECTED", {commandedState: "ON"}),
        );

        expect((switchButton(wrapper).element as HTMLButtonElement).disabled)
            .toBe(false);
        expect(wrapper.get(".relay-switch-label").text()).toBe("ON");
        expect(switchButton(wrapper).classes()).toContain("is-on");
    });

    it("写入进行中时临时 disabled", () => {
        const wrapper = mountPanel(
            hardwareStatus("CONNECTED", {
                commandedState: "ON",
                executing: true,
            }),
        );

        expect((switchButton(wrapper).element as HTMLButtonElement).disabled)
            .toBe(true);
        expect(switchButton(wrapper).classes()).toContain("busy");
        expect(wrapper.text()).toContain("正在写入串口指令");
    });

    it("NO_DEVICE 时 disabled 并提示未检测到设备", () => {
        const wrapper = mountPanel(hardwareStatus("NO_DEVICE"));

        expect((switchButton(wrapper).element as HTMLButtonElement).disabled)
            .toBe(true);
        expect(wrapper.text()).toContain("未检测到设备");
    });

    it("PERMISSION_REQUIRED 时 disabled 并提示授权", () => {
        const wrapper = mountPanel(hardwareStatus("PERMISSION_REQUIRED"));

        expect((switchButton(wrapper).element as HTMLButtonElement).disabled)
            .toBe(true);
        expect(wrapper.text()).toContain("USB 权限");
    });
});

describe("RelayControlPanel 本地控制与云端解耦", () => {
    it("云端无设备（deviceId=null）且本地 CONNECTED 时仍可点击，并发送 ON", async () => {
        const spy = vi
            .spyOn(relayService, "executeLocalCommand")
            .mockResolvedValue(executionResult("ON", null));
        const wrapper = mountPanel(
            hardwareStatus("CONNECTED", {commandedState: "UNKNOWN"}),
            null,
        );

        await switchButton(wrapper).trigger("click");

        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith(null, 1, "ON");
        expect(wrapper.text()).toContain("未关联云端设备");
    });

    it("CONNECTED + ON 时再次点击发送 OFF", async () => {
        const spy = vi
            .spyOn(relayService, "executeLocalCommand")
            .mockResolvedValue(executionResult("OFF", "relay-001"));
        const wrapper = mountPanel(
            hardwareStatus("CONNECTED", {commandedState: "ON"}),
            "relay-001",
        );

        await switchButton(wrapper).trigger("click");

        expect(spy).toHaveBeenCalledWith("relay-001", 1, "OFF");
        expect(wrapper.text()).toContain("云端已同步");
    });

    it("本地写入失败时显示错误且不伪造成功", async () => {
        vi.spyOn(relayService, "executeLocalCommand").mockResolvedValue(
            executionResult("ON", "relay-001", {
                localWriteSucceeded: false,
                cloudSyncStatus: "FAILED",
                cloudSyncMessage: "串口写入失败：device disconnected",
            }),
        );
        const wrapper = mountPanel(
            hardwareStatus("CONNECTED", {commandedState: "OFF"}),
            "relay-001",
        );

        await switchButton(wrapper).trigger("click");

        expect(wrapper.text()).toContain("串口写入失败");
        // 开关仍显示原状态 OFF（未乐观更新）
        expect(wrapper.get(".relay-switch-label").text()).toBe("OFF");
    });

    it("云端同步失败但本地写入成功时仍然算成功并提示", async () => {
        vi.spyOn(relayService, "executeLocalCommand").mockResolvedValue(
            executionResult("ON", "relay-001", {
                localWriteSucceeded: true,
                cloudSyncStatus: "FAILED",
                cloudSyncMessage: "无法连接服务器",
            }),
        );
        const wrapper = mountPanel(
            hardwareStatus("CONNECTED", {commandedState: "OFF"}),
            "relay-001",
        );

        await switchButton(wrapper).trigger("click");

        expect(wrapper.text()).toContain("已发送 ON");
        expect(wrapper.text()).toContain("无法连接服务器");
    });
});
