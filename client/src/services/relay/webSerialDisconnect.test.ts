import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

import {resolveControlAvailability} from "./controlAvailability";
import {LocalRelayProvider} from "./providers/LocalRelayProvider";
import type {RelayProviderCommand} from "./providers/RelayProvider";
import {WebSerialRelayAdapter} from "./serial/WebSerialRelayAdapter";
import {
    FakeSerialApi,
    FakeSerialPort,
    installSerialApi,
    removeSerialApi,
} from "@/test/fakes/webSerial";
import type {RelayAction} from "@/types/api";

let api: FakeSerialApi;

function command(action: RelayAction): RelayProviderCommand {
    return {
        eventId: "00000000-0000-4000-8000-000000000001",
        deviceId: null,
        channel: 1,
        action,
        previousState: "UNKNOWN",
        clientId: "web-test-client",
    };
}

async function connectedProvider(): Promise<{
    port: FakeSerialPort;
    adapter: WebSerialRelayAdapter;
    provider: LocalRelayProvider;
    portId: string;
}> {
    const port = new FakeSerialPort(0x1a86, 0x7523);
    api.ports.push(port);
    const adapter = new WebSerialRelayAdapter();
    const provider = new LocalRelayProvider(adapter);
    // 注册监听 → 适配器开始监听 navigator.serial 的 connect / disconnect
    provider.onHardwareStatusChange(() => undefined);
    const matched = await provider.scanAndMatch();
    const portId = matched[0]?.port.port;
    if (!portId) throw new Error("expected a matched port");
    await provider.connect(portId);
    return {port, adapter, provider, portId};
}

beforeEach(() => {
    api = installSerialApi();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
    removeSerialApi();
});

describe("Web Serial 物理拔出 → Provider / UI 状态", () => {
    it("CONNECTED 时 canControl=true", async () => {
        const {provider} = await connectedProvider();

        const availability = resolveControlAvailability(
            provider.getHardwareStatus(),
        );

        expect(provider.isHardwareConnected()).toBe(true);
        expect(availability.canControl).toBe(true);
    });

    it("disconnect(activePort) → DISCONNECTED + canControl=false(SERIAL_DISCONNECTED)", async () => {
        const {port, provider} = await connectedProvider();

        port.unplug();
        api.emit("disconnect", port);

        // 拔出后会自动重扫（异步）；最终状态必须是 DISCONNECTED
        await vi.waitFor(() => {
            expect(provider.getHardwareStatus().state).toBe("DISCONNECTED");
        });
        const status = provider.getHardwareStatus();
        expect(status.state).toBe("DISCONNECTED");
        expect(status.commandedState).toBe("UNKNOWN");
        expect(status.errorCode).toBe("SERIAL_DEVICE_DISCONNECTED");
        expect(provider.isHardwareConnected()).toBe(false);

        const availability = resolveControlAvailability(status);
        expect(availability.canControl).toBe(false);
        expect(availability.reason).toBe("SERIAL_DISCONNECTED");
        expect(availability.message).toContain("请重新插入设备并连接");
    });

    it("拔出后自动重扫不会把状态变回 CONNECTED/DETECTED（幽灵端口）", async () => {
        const {port, provider} = await connectedProvider();

        port.unplug();
        api.emit("disconnect", port);

        await vi.waitFor(() => {
            expect(provider.getHardwareStatus().state).toBe("DISCONNECTED");
        });
        const status = provider.getHardwareStatus();
        expect(status.lastPorts).toHaveLength(1);
        // 设备仍然保留在列表里，但被标记为物理已拔出
        expect(status.lastPorts[0]?.physicallyPresent).toBe(false);
        expect(resolveControlAvailability(status).canControl).toBe(false);
    });

    it("拔出后点击 ON：不写串口、不产生成功状态", async () => {
        const {port, provider} = await connectedProvider();
        port.unplug();
        api.emit("disconnect", port);

        await expect(provider.execute(command("ON"))).rejects.toThrow(
            /未连接/,
        );

        expect(port.writeAttempts).toEqual([]);
        expect(provider.getLastCommand().commandedState).toBe("UNKNOWN");
        expect(provider.getLastCommand().commandStatus).toBeNull();
        expect(provider.isHardwareConnected()).toBe(false);
    });

    it("write 过程中物理断开 → 写入 reject、状态 DISCONNECTED、relayState 保持 UNKNOWN", async () => {
        const {port, provider} = await connectedProvider();
        port.writeError = new DOMException(
            "The device has been lost",
            "NetworkError",
        );

        await expect(provider.execute(command("ON"))).rejects.toThrow(
            /已断开/,
        );

        const status = provider.getHardwareStatus();
        expect(port.writeAttempts).toEqual([[0xa0, 0x01, 0x01, 0xa2]]);
        expect(status.state).toBe("DISCONNECTED");
        expect(status.commandedState).toBe("UNKNOWN");
        expect(status.matchedProfile).toBeNull();
        expect(provider.getLastCommand().commandStatus).toBe("FAILED");
        expect(resolveControlAvailability(status).canControl).toBe(false);
        // writer 锁必须被释放
        expect(port.writerReleases).toBeGreaterThan(0);
    });

    it("拔出其他端口不影响当前连接", async () => {
        const {provider} = await connectedProvider();
        const other = new FakeSerialPort(0x1a86, 0x5523);
        api.ports.push(other);

        other.unplug();
        api.emit("disconnect", other);

        await vi.waitFor(() => {
            expect(provider.getHardwareStatus().lastPorts).toHaveLength(2);
        });
        expect(provider.isHardwareConnected()).toBe(true);
        expect(
            resolveControlAvailability(provider.getHardwareStatus()).canControl,
        ).toBe(true);
    });

    it("重新插入 → 只到 DETECTED，重新 open 成功后才 CONNECTED", async () => {
        const {port, provider, portId} = await connectedProvider();
        port.unplug();
        api.emit("disconnect", port);
        await vi.waitFor(() => {
            expect(provider.getHardwareStatus().state).toBe("DISCONNECTED");
        });

        // 重新插入：connect 事件只清除「已拔出」标记并刷新列表
        port.replug();
        api.emit("connect", port);

        await vi.waitFor(() => {
            expect(provider.getHardwareStatus().state).toBe("DETECTED");
        });
        expect(provider.isHardwareConnected()).toBe(false);
        expect(
            resolveControlAvailability(provider.getHardwareStatus()).canControl,
        ).toBe(false);

        // 用户点击连接 → 只有 open() 真正成功才回到 CONNECTED
        await provider.connect(portId);

        expect(provider.isHardwareConnected()).toBe(true);
        expect(
            resolveControlAvailability(provider.getHardwareStatus()).canControl,
        ).toBe(true);
    });

    it("幽灵端口点击连接：open 失败不能假装 CONNECTED", async () => {
        const {port, provider, portId} = await connectedProvider();
        port.unplug();
        api.emit("disconnect", port);
        await vi.waitFor(() => {
            expect(provider.getHardwareStatus().lastPorts[0]?.physicallyPresent)
                .toBe(false);
        });

        await expect(provider.connect(portId)).rejects.toThrow(/已拔出/);

        expect(provider.isHardwareConnected()).toBe(false);
        expect(provider.getHardwareStatus().state).toBe("DISCONNECTED");
    });
});
