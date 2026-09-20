import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

import {WebSerialRelayAdapter} from "./WebSerialRelayAdapter";
import type {SerialDeviceChange} from "./types";

class FakeSerialPort {
    opened = false;
    readonly written: number[][] = [];

    constructor(
        private readonly vendorId?: number,
        private readonly productId?: number,
    ) {
    }

    getInfo(): {usbVendorId?: number; usbProductId?: number} {
        return {
            usbVendorId: this.vendorId,
            usbProductId: this.productId,
        };
    }

    async open(): Promise<void> {
        this.opened = true;
    }

    async close(): Promise<void> {
        this.opened = false;
    }

    get writable(): {getWriter: () => {
        write: (data: Uint8Array) => Promise<void>;
        releaseLock: () => void;
    }} {
        return {
            getWriter: () => ({
                write: async (data: Uint8Array) => {
                    this.written.push(Array.from(data));
                },
                releaseLock: () => undefined,
            }),
        };
    }
}

interface FakeSerialApi {
    getPorts: ReturnType<typeof vi.fn>;
    requestPort: ReturnType<typeof vi.fn>;
    addEventListener: ReturnType<typeof vi.fn>;
}

let serial: FakeSerialApi | null = null;

function installSerialApi(): FakeSerialApi {
    const api: FakeSerialApi = {
        getPorts: vi.fn().mockResolvedValue([]),
        requestPort: vi.fn(),
        addEventListener: vi.fn(),
    };
    serial = api;
    Object.defineProperty(navigator, "serial", {
        configurable: true,
        value: api,
    });
    return api;
}

function removeSerialApi(): void {
    serial = null;
    delete (navigator as {serial?: unknown}).serial;
}

function asSerialPort(port: FakeSerialPort): SerialPort {
    return port as unknown as SerialPort;
}

beforeEach(() => {
    installSerialApi();
});

afterEach(() => {
    removeSerialApi();
});

describe("WebSerialRelayAdapter", () => {
    it("only lists previously granted ports and never auto-opens the picker", async () => {
        const api = installSerialApi();
        const ch340 = new FakeSerialPort(0x1a86, 0x7523);
        api.getPorts.mockResolvedValue([ch340]);
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
        // 规范要求：requestPort() 必须由明确的用户手势触发，禁止自动调用。
        expect(api.requestPort).not.toHaveBeenCalled();
    });

    it("asks the browser for a device only when requestPort() is called", async () => {
        const api = installSerialApi();
        const ch340 = new FakeSerialPort(0x1a86, 0x7523);
        api.requestPort.mockResolvedValue(ch340);
        const adapter = new WebSerialRelayAdapter();

        const port = await adapter.requestPort();

        expect(api.requestPort).toHaveBeenCalledTimes(1);
        expect(port).toMatchObject({
            vendorId: "1A86",
            productId: "7523",
            description: "USB-SERIAL CH340",
        });
    });

    it("connects with 9600 8N1 and writes the LCUS-1 bytes", async () => {
        const api = installSerialApi();
        const ch340 = new FakeSerialPort(0x1a86, 0x7523);
        api.getPorts.mockResolvedValue([ch340]);
        const adapter = new WebSerialRelayAdapter();
        const [info] = await adapter.listPorts();
        if (!info) throw new Error("expected a serial port");

        await adapter.connect(info.port, {
            baudRate: 9600,
            dataBits: 8,
            stopBits: 1,
            parity: "none",
            flowControl: "none",
        });
        await adapter.send(new Uint8Array([0xa0, 0x01, 0x00, 0xa1]));

        expect(ch340.opened).toBe(true);
        expect(ch340.written).toEqual([[0xa0, 0x01, 0x00, 0xa1]]);
        expect(adapter.getStatus()).toMatchObject({
            state: "connected",
            connected: true,
        });
    });

    it("reports a clear message when Web Serial is unavailable", async () => {
        removeSerialApi();
        const adapter = new WebSerialRelayAdapter();

        expect(adapter.isSupported()).toBe(false);
        await expect(adapter.listPorts()).rejects.toThrow(
            /不支持 Web Serial/,
        );
        await expect(adapter.requestPort()).rejects.toThrow(
            /Android \/ Electron/,
        );
    });

    it("forwards browser connect/disconnect events", async () => {
        const api = installSerialApi();
        const ch340 = new FakeSerialPort(0x1a86, 0x7523);
        const adapter = new WebSerialRelayAdapter();
        const changes: SerialDeviceChange[] = [];
        adapter.onDeviceChange((change) => changes.push(change));
        api.getPorts.mockResolvedValue([ch340]);
        await adapter.listPorts();

        const handlers = new Map<string, (event: Event) => void>();
        for (const call of api.addEventListener.mock.calls) {
            handlers.set(call[0] as string, call[1] as (event: Event) => void);
        }
        expect(handlers.has("connect")).toBe(true);
        expect(handlers.has("disconnect")).toBe(true);

        handlers.get("connect")?.({target: asSerialPort(ch340)} as unknown as Event);
        await vi.waitFor(() => {
            expect(changes).toHaveLength(1);
        });
        expect(changes[0]).toMatchObject({
            type: "attached",
            port: {vendorId: "1A86"},
        });
    });
});
