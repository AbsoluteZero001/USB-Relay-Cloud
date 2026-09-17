import {afterEach, describe, expect, it} from "vitest";

import {
    clearConfiguredServerBaseUrl,
    getApiBaseUrl,
    getConfiguredServerBaseUrl,
    getWebSocketBaseUrl,
    saveConfiguredServerBaseUrl,
} from "./runtimeConfig";

afterEach(() => {
    clearConfiguredServerBaseUrl();
});

describe("runtime cloud configuration", () => {
    it("derives REST and WebSocket URLs from an HTTPS server origin", () => {
        saveConfiguredServerBaseUrl("https://relay.example.com/");

        expect(getConfiguredServerBaseUrl())
            .toBe("https://relay.example.com");
        expect(getApiBaseUrl())
            .toBe("https://relay.example.com/api");
        expect(getWebSocketBaseUrl())
            .toBe("wss://relay.example.com/ws/relay");
    });

    it("derives ws for an HTTP development server", () => {
        saveConfiguredServerBaseUrl("http://192.168.1.10:8080");

        expect(getApiBaseUrl())
            .toBe("http://192.168.1.10:8080/api");
        expect(getWebSocketBaseUrl())
            .toBe("ws://192.168.1.10:8080/ws/relay");
    });

    it("rejects non-http protocols", () => {
        expect(() => saveConfiguredServerBaseUrl("capacitor://localhost"))
            .toThrow("http://");
    });
});
