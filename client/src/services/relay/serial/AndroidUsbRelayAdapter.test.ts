import {beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({
    capacitorState: {native: true, platform: "android"},
    usbRelay: {
        getDevices: vi.fn(),
        requestPermission: vi.fn(),
        open: vi.fn(),
        write: vi.fn(),
        close: vi.fn(),
        getStatus: vi.fn(),
        addListener: vi.fn(),
    },
}));

vi.mock("@capacitor/core", () => ({
    Capacitor: {
        isNativePlatform: () => mocks.capacitorState.native,
        getPlatform: () => mocks.capacitorState.platform,
    },
}));

vi.mock("./UsbRelayPlugin", () => ({
    UsbRelay: mocks.usbRelay,
}));

import {AndroidUsbRelayAdapter} from "./AndroidUsbRelayAdapter";
import type {NativeUsbDevice} from "./UsbRelayPlugin";
import type {SerialDeviceChange} from "./types";

function device(overrides: Partial<NativeUsbDevice> = {}): NativeUsbDevice {
    return {
        deviceId: "1",
        vendorId: "1A86",
        productId: "7523",
        manufacturer: "QinHeng Electronics",
        productName: "USB-SERIAL CH340",
        serialNumber: null,
        driverName: "CH340",
        portCount: 1,
        supported: true,
        hasPermission: false,
        ...overrides,
    };
}

function decodeBase64(value: string): number[] {
    return Array.from(atob(value), (char) => char.charCodeAt(0));
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.capacitorState.native = true;
    mocks.capacitorState.platform = "android";
    mocks.usbRelay.addListener.mockResolvedValue({remove: vi.fn()});
});

describe("AndroidUsbRelayAdapter", () => {
    it("is only supported inside the Capacitor Android container", () => {
        const adapter = new AndroidUsbRelayAdapter();
        expect(adapter.isSupported()).toBe(true);

        mocks.capacitorState.native = false;
        mocks.capacitorState.platform = "web";
        expect(adapter.isSupported()).toBe(false);
    });

    it("returns every UsbManager device, including unsupported ones", async () => {
        mocks.usbRelay.getDevices.mockResolvedValue({
            devices: [
                device(),
                device({
                    deviceId: "2",
                    vendorId: "9999",
                    productId: "0001",
                    driverName: null,
                    supported: false,
                    productName: "未知 USB 设备",
                }),
            ],
        });
        const adapter = new AndroidUsbRelayAdapter();

        const ports = await adapter.listPorts();

        expect(ports).toHaveLength(2);
        expect(ports[0]).toMatchObject({
            port: "1",
            vendorId: "1A86",
            productId: "7523",
            driverName: "CH340",
            supported: true,
            hasPermission: false,
        });
        // 没有兼容驱动的设备也必须出现在列表里，由 UI 明确提示。
        expect(ports[1]).toMatchObject({
            port: "2",
            driverName: null,
            supported: false,
        });
    });

    it("requests permission and opens the port with 9600 8N1", async () => {
        mocks.usbRelay.getDevices.mockResolvedValue({devices: [device()]});
        mocks.usbRelay.requestPermission.mockResolvedValue({
            granted: true,
            deviceId: "1",
        });
        mocks.usbRelay.open.mockResolvedValue(undefined);
        const adapter = new AndroidUsbRelayAdapter();

        await adapter.connect("1", {
            baudRate: 9600,
            dataBits: 8,
            stopBits: 1,
            parity: "none",
            flowControl: "none",
        });

        expect(mocks.usbRelay.requestPermission).toHaveBeenCalledWith({
            deviceId: "1",
        });
        expect(mocks.usbRelay.open).toHaveBeenCalledWith({
            deviceId: "1",
            baudRate: 9600,
            dataBits: 8,
            stopBits: 1,
            parity: "none",
            flowControl: "none",
        });
        expect(adapter.getStatus()).toMatchObject({
            state: "connected",
            connected: true,
            baudRate: 9600,
        });
    });

    it("writes the verified LCUS-1 byte sequence as base64", async () => {
        mocks.usbRelay.getDevices.mockResolvedValue({devices: [device()]});
        mocks.usbRelay.requestPermission.mockResolvedValue({
            granted: true,
            deviceId: "1",
        });
        mocks.usbRelay.open.mockResolvedValue(undefined);
        mocks.usbRelay.write.mockResolvedValue(undefined);
        const adapter = new AndroidUsbRelayAdapter();

        await adapter.connect("1", {
            baudRate: 9600,
            dataBits: 8,
            stopBits: 1,
            parity: "none",
            flowControl: "none",
        });
        await adapter.send(new Uint8Array([0xa0, 0x01, 0x01, 0xa2]));

        const payload = mocks.usbRelay.write.mock.calls[0]?.[0] as {
            dataBase64: string;
        };
        expect(decodeBase64(payload.dataBase64)).toEqual([0xa0, 0x01, 0x01, 0xa2]);
    });

    it("reports a denied permission instead of pretending to be connected", async () => {
        mocks.usbRelay.getDevices.mockResolvedValue({devices: [device()]});
        mocks.usbRelay.requestPermission.mockResolvedValue({
            granted: false,
            deviceId: "1",
        });
        const adapter = new AndroidUsbRelayAdapter();

        await expect(adapter.connect("1", {
            baudRate: 9600,
            dataBits: 8,
            stopBits: 1,
            parity: "none",
            flowControl: "none",
        })).rejects.toThrow(/权限/);

        expect(mocks.usbRelay.open).not.toHaveBeenCalled();
        expect(adapter.getStatus().state).toBe("error");
    });

    it("forwards native attach/detach events to device-change listeners", async () => {
        const listeners = new Map<string, (payload: never) => void>();
        mocks.usbRelay.addListener.mockImplementation(
            async (eventName: string, listener: (payload: never) => void) => {
                listeners.set(eventName, listener);
                return {remove: vi.fn()};
            },
        );
        const adapter = new AndroidUsbRelayAdapter();
        const changes: SerialDeviceChange[] = [];
        adapter.onDeviceChange((change) => changes.push(change));
        await vi.waitFor(() => {
            expect(listeners.has("deviceAttached")).toBe(true);
        });

        listeners.get("deviceAttached")?.({
            device: device(),
        } as never);
        listeners.get("deviceDetached")?.({
            device: device(),
        } as never);

        expect(changes.map((change) => change.type))
            .toEqual(["attached", "detached"]);
        expect(changes[0]?.port?.vendorId).toBe("1A86");
    });
});
