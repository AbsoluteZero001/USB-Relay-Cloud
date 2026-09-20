import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

import {WebSerialRelayAdapter} from "./WebSerialRelayAdapter";
import type {SerialDeviceChange} from "./types";
import {
    FakeSerialApi,
    FakeSerialPort,
    installSerialApi,
    removeSerialApi,
} from "@/test/fakes/webSerial";

async function connectedAdapter(
    port: FakeSerialPort,
    api: FakeSerialApi,
): Promise<{adapter: WebSerialRelayAdapter; portId: string}> {
    api.ports.push(port);
    const adapter = new WebSerialRelayAdapter();
    // 生产代码由 Provider 订阅状态后才注册 navigator.serial 监听
    adapter.onStatusChange(() => undefined);
    const [info] = await adapter.listPorts();
    if (!info) throw new Error("expected a serial port");
    await adapter.connect(info.port, {
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: "none",
        flowControl: "none",
    });
    return {adapter, portId: info.port};
}

beforeEach(() => {
    installSerialApi();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
    removeSerialApi();
});

describe("WebSerialRelayAdapter 设备发现", () => {
    it("getPorts() 只刷新已授权设备，绝不自动打开选择窗口", async () => {
        const api = installSerialApi();
        api.ports.push(new FakeSerialPort(0x1a86, 0x7523));
        const adapter = new WebSerialRelayAdapter();

        const ports = await adapter.listPorts();

        expect(ports).toHaveLength(1);
        expect(ports[0]).toMatchObject({
            vendorId: "1A86",
            productId: "7523",
            driverName: "CH340",
            supported: true,
            hasPermission: true,
        });
        expect(api.requestPort).not.toHaveBeenCalled();
    });

    it("只有 requestPort() 才触发浏览器选择窗口", async () => {
        const api = installSerialApi();
        api.requestResult = new FakeSerialPort(0x1a86, 0x5523);
        const adapter = new WebSerialRelayAdapter();

        const port = await adapter.requestPort();

        expect(api.requestPort).toHaveBeenCalledTimes(1);
        expect(port).toMatchObject({
            vendorId: "1A86",
            productId: "5523",
            description: "USB-SERIAL CH340",
        });
    });

    it("requestPort() 成功后设备进入已授权列表", async () => {
        const api = installSerialApi();
        const adapter = new WebSerialRelayAdapter();

        const picked = await adapter.requestPort();
        const granted = await adapter.listPorts();

        expect(granted.map((port) => port.port)).toContain(picked.port);
        expect(api.getPorts).toHaveBeenCalled();
    });

    it("浏览器不支持 Web Serial 时给出明确提示", async () => {
        removeSerialApi();
        const adapter = new WebSerialRelayAdapter();

        expect(adapter.isSupported()).toBe(false);
        await expect(adapter.listPorts()).rejects.toThrow(/不支持 Web Serial/);
        await expect(adapter.requestPort()).rejects.toThrow(
            /Android \/ Electron/,
        );
    });
});

describe("WebSerialRelayAdapter 物理拔出", () => {
    it("disconnect(activePort) → DISCONNECTED 并清理资源", async () => {
        const api = installSerialApi();
        const port = new FakeSerialPort(0x1a86, 0x7523);
        const {adapter} = await connectedAdapter(port, api);
        expect(adapter.isPhysicallyConnected()).toBe(true);

        port.unplug();
        api.emit("disconnect", port);

        const status = adapter.getStatus();
        expect(status.connected).toBe(false);
        expect(status.state).toBe("error");
        expect(status.errorCode).toBe("SERIAL_DEVICE_DISCONNECTED");
        expect(adapter.isPhysicallyConnected()).toBe(false);
        // 允许 close() 抛错，但必须真的尝试关闭（清理是异步的）
        await vi.waitFor(() => {
            expect(port.closeAttempts).toBeGreaterThan(0);
        });
    });

    it("拔出其他非 activePort 不影响当前连接", async () => {
        const api = installSerialApi();
        const active = new FakeSerialPort(0x1a86, 0x7523);
        const other = new FakeSerialPort(0x1a86, 0x5523);
        const {adapter} = await connectedAdapter(active, api);
        api.ports.push(other);

        other.unplug();
        api.emit("disconnect", other);

        expect(adapter.isPhysicallyConnected()).toBe(true);
        expect(adapter.getStatus().connected).toBe(true);
    });

    it("拔出后 write 不再执行，抛「已断开」错误", async () => {
        const api = installSerialApi();
        const port = new FakeSerialPort(0x1a86, 0x7523);
        const {adapter} = await connectedAdapter(port, api);

        port.unplug();
        api.emit("disconnect", port);

        await expect(
            adapter.send(new Uint8Array([0xa0, 0x01, 0x01, 0xa2])),
        ).rejects.toThrow(/已断开/);
        expect(port.writeAttempts).toEqual([]);
    });

    it("write 过程中物理断开 → 抛错、状态 DISCONNECTED、释放 writer 锁", async () => {
        const api = installSerialApi();
        const port = new FakeSerialPort(0x1a86, 0x7523);
        const {adapter} = await connectedAdapter(port, api);
        port.writeError = new DOMException(
            "The device has been lost",
            "NetworkError",
        );

        await expect(
            adapter.send(new Uint8Array([0xa0, 0x01, 0x01, 0xa2])),
        ).rejects.toThrow(/已断开/);

        expect(port.writeAttempts).toEqual([[0xa0, 0x01, 0x01, 0xa2]]);
        expect(adapter.getStatus()).toMatchObject({
            connected: false,
            errorCode: "SERIAL_DEVICE_DISCONNECTED",
        });
        expect(port.writerReleases).toBeGreaterThan(0);
        expect(port.closeAttempts).toBeGreaterThan(0);
    });

    it("disconnect() 用户主动断开后状态为 disconnected 且锁被释放", async () => {
        const api = installSerialApi();
        const port = new FakeSerialPort(0x1a86, 0x7523);
        const {adapter} = await connectedAdapter(port, api);
        await adapter.send(new Uint8Array([0xa0, 0x01, 0x00, 0xa1]));

        await adapter.disconnect();

        expect(port.opened).toBe(false);
        expect(adapter.getStatus()).toMatchObject({
            state: "disconnected",
            connected: false,
        });
        expect(port.writerReleases).toBeGreaterThan(0);
        await expect(adapter.send(new Uint8Array([0xa0]))).rejects.toThrow(
            /尚未连接/,
        );
    });

    it("幽灵端口：物理不存在时 connect() 必须失败，不能变成 CONNECTED", async () => {
        const api = installSerialApi();
        const port = new FakeSerialPort(0x1a86, 0x7523);
        api.ports.push(port);
        const adapter = new WebSerialRelayAdapter();
        const [info] = await adapter.listPorts();
        if (!info) throw new Error("expected a serial port");
        port.unplug();

        await expect(adapter.connect(info.port, {
            baudRate: 9600,
            dataBits: 8,
            stopBits: 1,
            parity: "none",
            flowControl: "none",
        })).rejects.toThrow();

        expect(adapter.getStatus().connected).toBe(false);
        expect(adapter.isPhysicallyConnected()).toBe(false);
    });

    it("插拔事件转发给上层（event.port 形式）", async () => {
        const api = installSerialApi();
        const port = new FakeSerialPort(0x1a86, 0x7523);
        api.ports.push(port);
        const adapter = new WebSerialRelayAdapter();
        const changes: SerialDeviceChange[] = [];
        adapter.onDeviceChange((change) => changes.push(change));

        api.emit("connect", port);
        api.emit("disconnect", port);

        expect(changes.map((change) => change.type))
            .toEqual(["attached", "detached"]);
        expect(changes[0]?.port).toMatchObject({vendorId: "1A86"});
        expect(changes[1]?.port).toMatchObject({vendorId: "1A86"});
    });
});
