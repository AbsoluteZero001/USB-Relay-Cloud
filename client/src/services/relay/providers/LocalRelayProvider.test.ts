import {createPinia, setActivePinia} from "pinia";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {LocalRelayProvider} from "./LocalRelayProvider";
import {LCUS1_CH340_PROFILE} from "../hardware/HardwareProfile";
import {useRelayStore} from "@/stores/relayStore";
import type {RequestableSerialAdapter} from "../serial/SerialAdapter";
import type {
    SerialDeviceChange,
    SerialOpenOptions,
    SerialPortInfo,
    SerialStatus,
} from "../serial/types";
import type {HardwareEventType} from "@/types/api";
import type {RelayAction, RelayEvent, RelayStateValue,} from "@/types/api";

function ch340Port(overrides: Partial<SerialPortInfo> = {}): SerialPortInfo {
    return {
    port: "1",
        device: "1 · USB-SERIAL CH340",
        description: "USB-SERIAL CH340",
        manufacturer: "QinHeng Electronics",
        hwid: "VID_1A86&PID_7523",
        vendorId: "1A86",
        productId: "7523",
        serialNumber: null,
        isCurrent: false,
        driverName: "CH340",
        supported: true,
        hasPermission: false,
        ...overrides,
    };
}

function unsupportedPort(): SerialPortInfo {
    return ch340Port({
        vendorId: "9999",
        productId: "0001",
        description: "未知 USB 设备",
        device: "1 · 未知 USB 设备",
        hwid: "VID_9999&PID_0001",
        driverName: null,
        supported: false,
    });
}

function disconnectedStatus(): SerialStatus {
    return {
        state: "disconnected",
        port: null,
        device: null,
    baudRate: 9600,
        connected: false,
    errorCode: null,
    detail: null,
  };
}

/**
 * 可配置的串口适配器测试替身。
 * 支持受控的端口列表、写入失败、连接失败，以及 USB 拔出事件模拟。
 */
class FakeSerialAdapter implements RequestableSerialAdapter {
    readonly name = "FakeAndroid";
    readonly sent: number[][] = [];
    sendShouldFail = false;
    connectShouldFail = false;
    /** 模拟 AndroidUsbRelayAdapter.requestPermission 在授权后推送瞬时 "disconnected"。 */
    simulatePermissionTransient = false;
    private ports: SerialPortInfo[];
    private status: SerialStatus;
    private readonly listeners = new Set<(status: SerialStatus) => void>();
    private readonly deviceChangeListeners =
        new Set<(change: SerialDeviceChange) => void>();

    constructor(ports: SerialPortInfo[] = [ch340Port()]) {
        this.ports = ports;
        this.status = disconnectedStatus();
    }

  isSupported(): boolean {
    return true;
  }

    async listPorts(): Promise<SerialPortInfo[]> {
        return [...this.ports];
  }

    async requestPort(): Promise<SerialPortInfo> {
        const port = this.ports[0];
        if (!port) {
            throw new Error("没有可用串口");
        }
        return port;
    }

    async connect(
        portId: string,
        options: SerialOpenOptions,
  ): Promise<void> {
        if (this.connectShouldFail) {
            throw new Error("连接失败");
        }
        this.status = {
            state: "connecting",
            port: portId,
            device: portId,
            baudRate: options.baudRate,
            connected: false,
            errorCode: null,
            detail: null,
        };
        this.emit();
        if (this.simulatePermissionTransient) {
            this.status = {...this.status, state: "waiting_permission"};
            this.emit();
            // AndroidUsbRelayAdapter.requestPermission 授权后会推送一次瞬时 disconnected
            this.status = {...this.status, state: "disconnected"};
            this.emit();
        }
        this.status = {
            ...this.status,
            state: "connected",
            connected: true,
        };
        this.emit();
  }

    async disconnect(): Promise<void> {
        this.status = disconnectedStatus();
        this.emit();
  }

    async send(data: Uint8Array): Promise<void> {
        if (this.sendShouldFail) {
            throw new Error("写入失败");
        }
    this.sent.push(Array.from(data));
  }

  getStatus(): SerialStatus {
    return this.status;
  }

    onStatusChange(listener: (status: SerialStatus) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    onDeviceChange(
        listener: (change: SerialDeviceChange) => void,
    ): () => void {
        this.deviceChangeListeners.add(listener);
        return () => this.deviceChangeListeners.delete(listener);
    }

    /** 模拟 USB 插入：设备列表新增一台设备并广播 attached。 */
    simulateAttach(port: SerialPortInfo = ch340Port()): void {
        this.ports = [...this.ports, port];
        this.emitDeviceChange({type: "attached", port});
    }

    /** 模拟 USB 设备拔出（推送 error + SERIAL_DEVICE_DISCONNECTED）。 */
    simulateDetach(): void {
        const port = this.ports[0] ?? null;
        this.ports = [];
        this.status = {
            state: "error",
            port: null,
            device: null,
            baudRate: 9600,
            connected: false,
            errorCode: "SERIAL_DEVICE_DISCONNECTED",
            detail: "USB 串口设备已拔出",
        };
        this.emit();
        this.emitDeviceChange({type: "detached", port});
    }

    private emitDeviceChange(change: SerialDeviceChange): void {
        for (const listener of this.deviceChangeListeners) {
            listener(change);
        }
    }

    private emit(): void {
        const current = this.getStatus();
        for (const listener of this.listeners) {
            listener(current);
        }
    }
}

const baseCommand = {
    eventId: "00000000-0000-4000-8000-000000000001",
    deviceId: "relay-001",
    channel: 1,
    previousState: "UNKNOWN" as RelayStateValue,
    clientId: "android-tablet-001",
};

function command(
    action: RelayAction,
    overrides: Partial<typeof baseCommand> = {},
) {
    return {...baseCommand, action, ...overrides};
}

function successEvent(action: RelayAction, sequence: number): RelayEvent {
    return {
        sequence,
        eventId: `00000000-0000-4000-8000-${sequence.toString().padStart(12, "0")}`,
        deviceId: "relay-001",
        channel: 1,
        action,
        previousState: action === "ON" ? "OFF" : "ON",
        currentState: action,
        commandStatus: "SUCCESS",
        source: "ANDROID",
        clientId: "android-tablet-002",
        hardwareState: "UNKNOWN",
        createdAt: "2026-09-20T10:00:00Z",
        idempotentReplay: false,
    };
}

describe("LocalRelayProvider hardware gate", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    // spec §13.1：DISCONNECTED 时 ON 不允许写入、不产生 SUCCESS。
    it("rejects ON command while DISCONNECTED without touching hardware", async () => {
        const adapter = new FakeSerialAdapter();
        const provider = new LocalRelayProvider(adapter);
        provider.onHardwareStatusChange(() => {
        });

        await expect(provider.execute(command("ON"))).rejects.toThrow(
            /未连接/,
        );

        expect(adapter.sent).toEqual([]);
        expect(provider.getLastCommand().commandedState).toBe("UNKNOWN");
        expect(provider.getLastCommand().commandStatus).toBeNull();
        expect(provider.isHardwareConnected()).toBe(false);
    });

    // spec §13.2：UNSUPPORTED USB 不允许控制。
    it("marks unsupported USB devices and refuses to connect", async () => {
        const adapter = new FakeSerialAdapter([unsupportedPort()]);
        const provider = new LocalRelayProvider(adapter);
        provider.onHardwareStatusChange(() => {
        });

        const matched = await provider.scanAndMatch();
        expect(matched[0]?.profile).toBeNull();
        expect(provider.getHardwareStatus().state).toBe("UNSUPPORTED");

        await expect(provider.connect("1")).rejects.toThrow(
            /未找到兼容串口驱动|不受支持|未检测/,
        );
        expect(provider.isHardwareConnected()).toBe(false);
    });

    // spec §13.3 / §十四 场景 D：CONNECTED + write ON 成功。
    it("writes verified LCUS-1 bytes on success and updates commandedState", async () => {
        const adapter = new FakeSerialAdapter();
        const provider = new LocalRelayProvider(adapter);
        provider.onHardwareStatusChange(() => {
        });

        await provider.scanAndMatch();
        await provider.connect("1");
        expect(provider.isHardwareConnected()).toBe(true);

        const onResult = await provider.execute(command("ON"));
        const offResult = await provider.execute(
            command("OFF", {previousState: "ON"}),
        );

    expect(adapter.sent).toEqual([
      [0xa0, 0x01, 0x01, 0xa2],
      [0xa0, 0x01, 0x00, 0xa1],
    ]);
        expect(onResult.commandedState).toBe("ON");
        expect(offResult.commandedState).toBe("OFF");
    expect(provider.getLastCommand()).toEqual({
      commandedState: "OFF",
      commandStatus: "SUCCESS",
      hardwareState: "UNKNOWN",
    });
  });

    // 回归：Android 授权流程会在 connect 中推送瞬时 "disconnected"，
    // 旧实现据此清空 matchedProfile 导致永远无法进入 CONNECTED。
    it("survives the transient disconnected emitted during Android permission", async () => {
        const adapter = new FakeSerialAdapter();
        adapter.simulatePermissionTransient = true;
        const provider = new LocalRelayProvider(adapter);
        provider.onHardwareStatusChange(() => {
        });

        await provider.scanAndMatch();
        await provider.connect("1");

        expect(provider.isHardwareConnected()).toBe(true);
        expect(provider.getHardwareStatus().matchedProfile).toBe(
            LCUS1_CH340_PROFILE,
        );
        // 即便瞬时 disconnected 触发过 recompute，仍可正常执行指令。
        await provider.execute(command("ON"));
        expect(adapter.sent).toEqual([[0xa0, 0x01, 0x01, 0xa2]]);
    });

    // spec §13.4：CONNECTED + 写入失败 → FAILED，状态不变。
    it("keeps commandedState unchanged when write fails", async () => {
        const adapter = new FakeSerialAdapter();
        const provider = new LocalRelayProvider(adapter);
        provider.onHardwareStatusChange(() => {
        });

        await provider.scanAndMatch();
        await provider.connect("1");
        adapter.sendShouldFail = true;

        await expect(provider.execute(command("ON"))).rejects.toThrow(
            /写入失败/,
        );

        expect(adapter.sent).toEqual([]);
        expect(provider.getLastCommand().commandedState).toBe("UNKNOWN");
        expect(provider.getLastCommand().commandStatus).toBe("FAILED");
    });

    // spec §13.5 / §十一：USB 拔出 → DISCONNECTED，滑块禁用。
    it("transitions to DISCONNECTED on USB detach and resets local state", async () => {
        const adapter = new FakeSerialAdapter();
        const provider = new LocalRelayProvider(adapter);
        provider.onHardwareStatusChange(() => {
        });

        await provider.scanAndMatch();
        await provider.connect("1");
        await provider.execute(command("ON"));
        expect(provider.isHardwareConnected()).toBe(true);

        adapter.simulateDetach();

        // 拔出后 Provider 会自动重新扫描（异步），等待其完成。
        await vi.waitFor(() => {
            expect(provider.getHardwareStatus().lastPorts).toEqual([]);
        });
        expect(provider.getHardwareStatus().state).toBe("DISCONNECTED");
        expect(provider.getHardwareStatus().commandedState).toBe("UNKNOWN");
        expect(provider.isHardwareConnected()).toBe(false);

        await expect(provider.execute(command("OFF"))).rejects.toThrow(
            /未连接/,
        );
    });

    // USB 插入 → 自动重新扫描，UI 不需要用户退出 App。
    it("auto rescans when a USB device is attached", async () => {
        const adapter = new FakeSerialAdapter([]);
        const provider = new LocalRelayProvider(adapter);
        const hardwareEvents: HardwareEventType[] = [];
        provider.onHardwareStatusChange(() => {
        });
        provider.onHardwareEvent((eventType) => {
            hardwareEvents.push(eventType);
        });

        const empty = await provider.scanAndMatch();
        expect(empty).toEqual([]);
        expect(provider.getHardwareStatus().state).toBe("DISCONNECTED");

        adapter.simulateAttach();

        await vi.waitFor(() => {
            expect(provider.getHardwareStatus().lastPorts).toHaveLength(1);
        });
        expect(provider.getHardwareStatus().state).toBe("DETECTED");
        expect(provider.getHardwareStatus().matchedProfile).toBe(
            LCUS1_CH340_PROFILE,
        );
        expect(hardwareEvents).toContain("USB_ATTACHED");
    });

    // 重新扫描已连接的串口不能把 CONNECTED 降级为 DETECTED。
    it("keeps the connection alive when rescanning the connected port", async () => {
        const adapter = new FakeSerialAdapter();
        const provider = new LocalRelayProvider(adapter);
        provider.onHardwareStatusChange(() => {
        });

        await provider.scanAndMatch();
        await provider.connect("1");
        expect(provider.isHardwareConnected()).toBe(true);

        await provider.scanAndMatch();

        expect(provider.getHardwareStatus().state).toBe("CONNECTED");
        expect(provider.getHardwareStatus().matchedProfile).toBe(
            LCUS1_CH340_PROFILE,
        );
        await provider.execute(command("ON"));
        expect(adapter.sent).toEqual([[0xa0, 0x01, 0x01, 0xa2]]);
    });

    // spec §13.6 / §十二：WebSocket 远端 ON 不改变本地硬件连接状态。
    it("keeps local hardware state independent from relayStore cloud events", async () => {
        const adapter = new FakeSerialAdapter();
        const provider = new LocalRelayProvider(adapter);
        provider.onHardwareStatusChange(() => {
        });

        const relayStore = useRelayStore();
        relayStore.applyEvent(successEvent("ON", 5));

        // 云端 commandedState 已更新为 ON。
        expect(relayStore.stateFor("relay-001", 1)?.commandedState).toBe("ON");
        // 本地硬件连接状态不受影响，仍为 DISCONNECTED，滑块禁用。
        expect(provider.getHardwareStatus().state).toBe("DISCONNECTED");
        expect(provider.isHardwareConnected()).toBe(false);
    });

    // spec §13.7 / §九：连续快速操作，并发锁有效。
    it("serializes concurrent commands via the executing lock", async () => {
        const adapter = new FakeSerialAdapter();
        const provider = new LocalRelayProvider(adapter);
        provider.onHardwareStatusChange(() => {
        });

        await provider.scanAndMatch();
        await provider.connect("1");

        const results = await Promise.allSettled([
            provider.execute(command("ON")),
            provider.execute(command("ON", {
                eventId: "00000000-0000-4000-8000-000000000002",
            })),
        ]);

        const rejected = results.filter(
            (r) => r.status === "rejected",
        );
        expect(rejected).toHaveLength(1);
        // 仅一次 USB 写入。
        expect(adapter.sent).toEqual([[0xa0, 0x01, 0x01, 0xa2]]);
    });
});

describe("relayStore FAILED semantics", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it("FAILED cloud event does not advance commandedState", () => {
        const store = useRelayStore();
        // 先建立一个 SUCCESS ON 基线。
        store.applyEvent(successEvent("ON", 3));
        // 收到一条 FAILED ON 事件（远端写入失败）。
        const failedEvent: RelayEvent = {
            ...successEvent("ON", 4),
            commandStatus: "FAILED",
        };
        store.applyEvent(failedEvent);

        const state = store.stateFor("relay-001", 1);
        expect(state?.commandedState).toBe("ON");
        expect(state?.commandStatus).toBe("FAILED");
    });

    it("applyLocalCommand with FAILED keeps existing commandedState", () => {
        const store = useRelayStore();
        store.applyLocalCommand("relay-001", 1, "ON", "SUCCESS");
        store.applyLocalCommand("relay-001", 1, "OFF", "FAILED");

        const state = store.stateFor("relay-001", 1);
        expect(state?.commandedState).toBe("ON");
        expect(state?.commandStatus).toBe("FAILED");
    });
});
