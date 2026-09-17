import { Capacitor } from "@capacitor/core";

import { AndroidUsbRelayAdapter } from "./AndroidUsbRelayAdapter";
import { ElectronSerialRelayAdapter } from "./ElectronSerialRelayAdapter";
import type { SerialAdapter } from "./SerialAdapter";
import { WebSerialRelayAdapter } from "./WebSerialRelayAdapter";

export type RelayRuntime = "android" | "electron" | "web";

export function getRelayRuntime(): RelayRuntime {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
    return "android";
  }
  if (typeof window !== "undefined" && window.desktopAPI?.isElectron) {
    return "electron";
  }
  return "web";
}

export function createSerialAdapter(): SerialAdapter {
  const runtime = getRelayRuntime();
  if (runtime === "android") {
    return new AndroidUsbRelayAdapter();
  }
  if (runtime === "electron") {
    return new ElectronSerialRelayAdapter();
  }
  return new WebSerialRelayAdapter();
}

export type {
  SerialAdapter,
  RequestableSerialAdapter,
} from "./SerialAdapter";
export { isRequestable } from "./SerialAdapter";
export type {
  SerialConnectionState,
  SerialFlowControl,
  SerialOpenOptions,
  SerialParity,
  SerialPortInfo,
  SerialStatus,
} from "./types";
