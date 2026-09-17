import { defineStore } from "pinia";

import {
  fetchDevice,
  fetchDevices,
  sendHeartbeat,
} from "@/api/deviceApi";
import { getApiErrorMessage } from "@/api/http";
import type {
  Device,
  HeartbeatPayload,
  OnlineStatus,
  RelayState,
} from "@/types/api";

interface DeviceState {
  devices: Device[];
  selectedDeviceId: string | null;
  states: Record<string, RelayState[]>;
  loading: boolean;
  error: string | null;
}

export const useDeviceStore = defineStore("device", {
  state: (): DeviceState => ({
    devices: [],
    selectedDeviceId: null,
    states: {},
    loading: false,
    error: null,
  }),

  getters: {
    selectedDevice(state): Device | null {
      return (
        state.devices.find(
          (device) => device.deviceId === state.selectedDeviceId,
        ) ?? null
      );
    },
    selectedStates(state): RelayState[] {
      return state.selectedDeviceId
        ? state.states[state.selectedDeviceId] ?? []
        : [];
    },
  },

  actions: {
    async loadDevices(): Promise<Device[]> {
      this.loading = true;
      this.error = null;
      try {
        const page = await fetchDevices();
        this.devices = page.records;
        if (
          !this.selectedDeviceId ||
          !this.devices.some(
            (device) => device.deviceId === this.selectedDeviceId,
          )
        ) {
          this.selectedDeviceId = this.devices[0]?.deviceId ?? null;
        }
        return this.devices;
      } catch (error) {
        this.error = getApiErrorMessage(error);
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async loadDevice(deviceId: string): Promise<void> {
      this.loading = true;
      this.error = null;
      try {
        const detail = await fetchDevice(deviceId);
        this.upsertDevice(detail.device);
        this.states[deviceId] = detail.states;
      } catch (error) {
        this.error = getApiErrorMessage(error);
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async heartbeat(
      deviceId: string,
      payload: HeartbeatPayload,
    ): Promise<void> {
      const response = await sendHeartbeat(deviceId, payload);
      this.upsertDevice(response.device);
      this.states[deviceId] = response.states;
    },

    selectDevice(deviceId: string): void {
      this.selectedDeviceId = deviceId;
    },

    upsertDevice(device: Device): void {
      const index = this.devices.findIndex(
        (candidate) => candidate.deviceId === device.deviceId,
      );
      if (index >= 0) {
        this.devices[index] = device;
      } else {
        this.devices.unshift(device);
      }
      if (!this.selectedDeviceId) {
        this.selectedDeviceId = device.deviceId;
      }
    },

    setOnlineStatus(
      deviceId: string,
      onlineStatus: OnlineStatus,
      updatedAt?: string,
    ): void {
      const device = this.devices.find(
        (candidate) => candidate.deviceId === deviceId,
      );
      if (device) {
        device.onlineStatus = onlineStatus;
        if (updatedAt) {
          device.updatedAt = updatedAt;
        }
      }
    },

    ensureDevicePlaceholder(deviceId: string): void {
      if (this.devices.some((device) => device.deviceId === deviceId)) {
        return;
      }
      const timestamp = new Date().toISOString();
      this.upsertDevice({
        id: 0,
        deviceId,
        deviceName: deviceId,
        deviceType: "USB_RELAY",
        onlineStatus: "ONLINE",
        lastSeen: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    },
  },
});
