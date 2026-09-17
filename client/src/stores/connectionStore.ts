import { defineStore } from "pinia";

import type { WebSocketStatus } from "@/types/api";

interface ConnectionState {
  webSocketStatus: WebSocketStatus;
  lastWebSocketMessageAt: string | null;
  lastError: string | null;
}

export const useConnectionStore = defineStore("connection", {
  state: (): ConnectionState => ({
    webSocketStatus: "idle",
    lastWebSocketMessageAt: null,
    lastError: null,
  }),

  actions: {
    setWebSocketStatus(status: WebSocketStatus): void {
      this.webSocketStatus = status;
      if (status === "connected") {
        this.lastError = null;
      }
    },

    markMessageReceived(): void {
      this.lastWebSocketMessageAt = new Date().toISOString();
    },

    setError(message: string | null): void {
      this.lastError = message;
    },
  },
});
