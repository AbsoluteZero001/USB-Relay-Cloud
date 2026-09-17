import { describe, expect, it } from "vitest";

import { LocalRelayProvider } from "./LocalRelayProvider";

import type { SerialAdapter } from "../serial/SerialAdapter";
import type {
  SerialOpenOptions,
  SerialPortInfo,
  SerialStatus,
} from "../serial/types";

class FakeSerialAdapter implements SerialAdapter {
  readonly name = "FakeAndroid";
  readonly sent: number[][] = [];
  private status: SerialStatus = {
    state: "connected",
    port: "1",
    device: "CH340",
    baudRate: 9600,
    connected: true,
    errorCode: null,
    detail: null,
  };

  isSupported(): boolean {
    return true;
  }

  listPorts(): Promise<SerialPortInfo[]> {
    return Promise.resolve([]);
  }

  connect(
    _portId: string,
    _options: SerialOpenOptions,
  ): Promise<void> {
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    return Promise.resolve();
  }

  send(data: Uint8Array): Promise<void> {
    this.sent.push(Array.from(data));
    return Promise.resolve();
  }

  getStatus(): SerialStatus {
    return this.status;
  }
}

describe("LocalRelayProvider protocol", () => {
  it("keeps the verified LCUS-1 ON/OFF HEX bytes unchanged", async () => {
    const adapter = new FakeSerialAdapter();
    const provider = new LocalRelayProvider(adapter);

    await provider.execute({
      eventId: "00000000-0000-4000-8000-000000000001",
      deviceId: "relay-001",
      channel: 1,
      action: "ON",
      previousState: "OFF",
      clientId: "android-tablet-001",
    });
    await provider.execute({
      eventId: "00000000-0000-4000-8000-000000000002",
      deviceId: "relay-001",
      channel: 1,
      action: "OFF",
      previousState: "ON",
      clientId: "android-tablet-001",
    });

    expect(adapter.sent).toEqual([
      [0xa0, 0x01, 0x01, 0xa2],
      [0xa0, 0x01, 0x00, 0xa1],
    ]);
    expect(provider.getLastCommand()).toEqual({
      commandedState: "OFF",
      commandStatus: "SUCCESS",
      hardwareState: "UNKNOWN",
    });
  });
});
