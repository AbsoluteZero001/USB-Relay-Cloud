import {beforeEach, describe, expect, it, vi} from "vitest";

const hoisted = vi.hoisted(() => {
    const sent: number[][] = [];
    const state = {
        connected: false,
        withDevice: true,
        sendFails: false,
        dropConnectionOnSendFailure: false,
    };
    const adapter = {
        name: "FakeAndroid",
        isSupported: () => true,
        async listPorts() {
            return state.withDevice ? [ch340Port()] : [];
        },
        async connect() {
            state.connected = true;
        },
        async disconnect() {
            state.connected = false;
        },
        async send(data: Uint8Array) {
            if (state.sendFails) {
                if (state.dropConnectionOnSendFailure) {
                    state.connected = false;
                }
                throw new Error("串口写入失败");
            }
            sent.push(Array.from(data));
        },
        getStatus() {
            return {
                state: state.connected ? "connected" : "disconnected",
                port: state.connected ? "1" : null,
                device: state.connected ? "1" : null,
                baudRate: 9600,
                connected: state.connected,
                errorCode: null,
                detail: null,
            };
        },
        onStatusChange() {
            return () => undefined;
        },
    };
    function ch340Port() {
        return {
            port: "1",
            device: "1 · USB-SERIAL CH340",
            description: "USB-SERIAL CH340",
            manufacturer: "QinHeng Electronics",
            hwid: "USB\\VID_1A86&PID_7523",
            vendorId: "1A86",
            productId: "7523",
            serialNumber: null,
            isCurrent: state.connected,
            driverName: "CH340",
            supported: true,
            hasPermission: true,
        };
    }
    return {
        adapter,
        sent,
        state,
        createRelayEvent: vi.fn(),
        createHardwareEvent: vi.fn(),
    };
});

vi.mock("./serial", () => ({
    createSerialAdapter: () => hoisted.adapter,
    getRelayRuntime: () => "android",
}));

vi.mock("@/api/eventApi", () => ({
    createRelayEvent: hoisted.createRelayEvent,
}));

vi.mock("@/api/hardwareEventApi", () => ({
    createHardwareEvent: hoisted.createHardwareEvent,
}));

import {RelayService} from "./RelayService";
import type {RelayEvent} from "@/types/api";

function relayEvent(action: "ON" | "OFF"): RelayEvent {
    return {
        sequence: 1,
        eventId: "00000000-0000-4000-8000-000000000001",
        deviceId: "relay-001",
        channel: 1,
        action,
        previousState: "UNKNOWN",
        currentState: action,
        commandStatus: "SUCCESS",
        source: "ANDROID",
        clientId: "test-client",
        hardwareState: "UNKNOWN",
        createdAt: "2026-09-20T10:00:00Z",
        idempotentReplay: false,
    };
}

beforeEach(() => {
    localStorage.clear();
    hoisted.sent.length = 0;
    hoisted.state.connected = false;
    hoisted.state.withDevice = true;
    hoisted.state.sendFails = false;
    hoisted.state.dropConnectionOnSendFailure = false;
    hoisted.createRelayEvent.mockReset();
    hoisted.createRelayEvent.mockResolvedValue(relayEvent("ON"));
    hoisted.createHardwareEvent.mockReset();
    hoisted.createHardwareEvent.mockResolvedValue(undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});

async function connectedService(): Promise<RelayService> {
    const service = new RelayService();
    await service.scanAndMatch();
    await service.connectLocal("1");
    expect(service.isHardwareConnected()).toBe(true);
    return service;
}

describe("RelayService 本地硬件与云端解耦", () => {
    it("本地未连接时不写串口，返回 FAILED", async () => {
        const service = new RelayService();

        const result = await service.executeLocalCommand("relay-001", 1, "ON");

        expect(result.localWriteSucceeded).toBe(false);
        expect(result.commandStatus).toBe("FAILED");
        expect(hoisted.sent).toEqual([]);
    });

    it("没有云端设备（deviceId=null）时仍然写 USB，并跳过云端上传", async () => {
        const service = await connectedService();

        const result = await service.executeLocalCommand(null, 1, "ON");

        expect(hoisted.sent).toEqual([[0xa0, 0x01, 0x01, 0xa2]]);
        expect(result.localWriteSucceeded).toBe(true);
        expect(result.commandStatus).toBe("SUCCESS");
        expect(result.commandedState).toBe("ON");
        expect(result.cloudSyncStatus).toBe("NOT_REQUIRED");
        expect(result.deviceId).toBeNull();
        expect(hoisted.createRelayEvent).not.toHaveBeenCalled();
        expect(service.outboxSize()).toBe(0);
    });

    it("云端 POST 失败不阻止本地写入成功，事件留在 outbox 等待重试", async () => {
        const service = await connectedService();
        hoisted.createRelayEvent.mockRejectedValue(new Error("无法连接服务器"));

        const result = await service.executeLocalCommand("relay-001", 1, "ON");

        expect(hoisted.sent).toEqual([[0xa0, 0x01, 0x01, 0xa2]]);
        expect(result.localWriteSucceeded).toBe(true);
        expect(result.commandStatus).toBe("SUCCESS");
        expect(result.cloudSyncStatus).toBe("FAILED");
        expect(result.cloudSyncMessage).toContain("无法连接服务器");
        expect(service.outboxSize()).toBe(1);
    });

    it("云端同步成功时事件出队", async () => {
        const service = await connectedService();

        const result = await service.executeLocalCommand("relay-001", 1, "OFF");

        expect(hoisted.sent).toEqual([[0xa0, 0x01, 0x00, 0xa1]]);
        expect(result.cloudSyncStatus).toBe("SUCCESS");
        expect(result.cloudEvent).not.toBeNull();
        expect(service.outboxSize()).toBe(0);
    });

    it("本地写入失败时保持原状态，不产生 SUCCESS", async () => {
        const service = await connectedService();
        hoisted.state.sendFails = true;

        const result = await service.executeLocalCommand("relay-001", 1, "ON");

        expect(result.localWriteSucceeded).toBe(false);
        expect(result.commandStatus).toBe("FAILED");
        expect(result.commandedState).toBe("UNKNOWN");
        expect(hoisted.sent).toEqual([]);
    });

    it("写入失败且设备已断开 → 不上传任何 relay_event（无假日志/假广播）", async () => {
        const service = await connectedService();
        hoisted.state.sendFails = true;
        hoisted.state.dropConnectionOnSendFailure = true;

        const result = await service.executeLocalCommand("relay-001", 1, "ON");

        expect(result.localWriteSucceeded).toBe(false);
        expect(result.commandStatus).toBe("FAILED");
        expect(result.cloudSyncStatus).toBe("NOT_REQUIRED");
        expect(hoisted.createRelayEvent).not.toHaveBeenCalled();
        expect(service.outboxSize()).toBe(0);
    });

    it("串口仍在的写入失败才上传 FAILED 审计事件（currentState=action，服务端不更新 relay_state）", async () => {
        const service = await connectedService();
        hoisted.state.sendFails = true;
        hoisted.createRelayEvent.mockResolvedValue(relayEvent("ON"));

        const result = await service.executeLocalCommand("relay-001", 1, "ON");

        expect(hoisted.createRelayEvent).toHaveBeenCalledTimes(1);
        const payload = hoisted.createRelayEvent.mock.calls[0]?.[1] as {
            commandStatus: string;
            action: string;
            currentState: string;
            previousState: string;
        };
        expect(payload).toMatchObject({
            commandStatus: "FAILED",
            action: "ON",
            // 服务端校验要求 currentState === action；FAILED 不更新 relay_state
            currentState: "ON",
            previousState: "UNKNOWN",
        });
        expect(result.commandStatus).toBe("FAILED");
        expect(result.localWriteSucceeded).toBe(false);
    });
});
