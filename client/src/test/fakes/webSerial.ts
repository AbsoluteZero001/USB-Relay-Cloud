import {vi} from "vitest";

/**
 * 可模拟物理插拔的 Web Serial 测试替身（仅供测试使用）。
 *
 * 与真实浏览器行为对齐的点：
 * - 端口 `open()` 后才有 `writable`；物理拔出后 `writable` 变 null
 * - 设备不存在时 `open()` / `close()` 抛 NotFoundError
 * - connect / disconnect 事件把端口放在 `event.port` 上（不是 event.target）
 */
export class FakeSerialWriter {
    released = 0;
    aborted = 0;

    constructor(private readonly port: FakeSerialPort) {
    }

    async write(data: Uint8Array): Promise<void> {
        this.port.writeAttempts.push(Array.from(data));
        if (this.port.writeError) {
            throw this.port.writeError;
        }
    }

    async abort(): Promise<void> {
        this.aborted += 1;
    }

    releaseLock(): void {
        this.released += 1;
        this.port.writerReleases += 1;
    }
}

export class FakeSerialPort {
    opened = false;
    physicallyPresent = true;
    writeError: unknown = null;
    readonly writeAttempts: number[][] = [];
    readonly writers: FakeSerialWriter[] = [];
    writerReleases = 0;
    closeAttempts = 0;

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

    get writable(): {getWriter: () => FakeSerialWriter} | null {
        if (!this.opened || !this.physicallyPresent) {
            return null;
        }
        return {
            getWriter: () => {
                const writer = new FakeSerialWriter(this);
                this.writers.push(writer);
                return writer;
            },
        };
    }

    async open(): Promise<void> {
        if (!this.physicallyPresent) {
            throw new DOMException("device not found", "NotFoundError");
        }
        this.opened = true;
    }

    async close(): Promise<void> {
        this.closeAttempts += 1;
        if (!this.physicallyPresent) {
            // 真实浏览器在设备拔出后 close() 会抛错
            throw new DOMException("device not found", "NotFoundError");
        }
        this.opened = false;
    }

    unplug(): void {
        this.physicallyPresent = false;
        this.opened = false;
    }

    replug(): void {
        this.physicallyPresent = true;
    }
}

export class FakeSerialApi {
    readonly ports: FakeSerialPort[] = [];
    requestResult: FakeSerialPort | null = null;
    requestRejects: unknown = null;
    private readonly listeners = new Map<string, Set<(event: Event) => void>>();

    getPorts = vi.fn(async (): Promise<FakeSerialPort[]> => [...this.ports]);

    requestPort = vi.fn(async (): Promise<FakeSerialPort> => {
        if (this.requestRejects) throw this.requestRejects;
        const port = this.requestResult ?? new FakeSerialPort(0x1a86, 0x7523);
        this.ports.push(port);
        return port;
    });

    addEventListener = vi.fn(
        (type: string, listener: (event: Event) => void) => {
            const set = this.listeners.get(type) ?? new Set();
            set.add(listener);
            this.listeners.set(type, set);
        },
    );

    removeEventListener = vi.fn(
        (type: string, listener: (event: Event) => void) => {
            this.listeners.get(type)?.delete(listener);
        },
    );

    /** 模拟浏览器派发 connect / disconnect（端口在 event.port 上）。 */
    emit(type: "connect" | "disconnect", port: FakeSerialPort): void {
        const event = {type, port} as unknown as Event;
        for (const listener of this.listeners.get(type) ?? []) {
            listener(event);
        }
    }
}

export function asSerialPort(port: FakeSerialPort): SerialPort {
    return port as unknown as SerialPort;
}

export function installSerialApi(): FakeSerialApi {
    const api = new FakeSerialApi();
    Object.defineProperty(navigator, "serial", {
        configurable: true,
        value: api,
    });
    return api;
}

export function removeSerialApi(): void {
    delete (navigator as {serial?: unknown}).serial;
}
