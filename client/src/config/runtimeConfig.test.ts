import {afterEach, describe, expect, it, vi} from "vitest";

import {
    clearConfiguredServerBaseUrl,
    DEFAULT_SERVER_URL,
    getApiBaseUrl,
    getConfiguredServerBaseUrl,
    getDefaultServerBaseUrl,
    getServerConfigSource,
    getWebSocketBaseUrl,
    isNativeAndroid,
    normalizeServerBaseUrl,
    saveConfiguredServerBaseUrl,
    toWebSocketUrl,
} from "./runtimeConfig";

const capacitorState = {native: false, platform: "web"};

vi.mock("@capacitor/core", () => ({
    Capacitor: {
        isNativePlatform: () => capacitorState.native,
        getPlatform: () => capacitorState.platform,
    },
}));

afterEach(() => {
    clearConfiguredServerBaseUrl();
    capacitorState.native = false;
    capacitorState.platform = "web";
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

    it("falls back to the same-origin API path on web", () => {
        expect(getDefaultServerBaseUrl()).toBe("");
        expect(getServerConfigSource()).toBe("same-origin");
        expect(getApiBaseUrl()).toBe(`${window.location.origin}/api`);
        expect(getWebSocketBaseUrl())
            .toBe(`ws://${window.location.host}/ws/relay`);
    });

    it("uses the public default server url inside the Android app", () => {
        capacitorState.native = true;
        capacitorState.platform = "android";

        expect(isNativeAndroid()).toBe(true);
        expect(getDefaultServerBaseUrl()).toBe(DEFAULT_SERVER_URL);
        expect(getServerConfigSource()).toBe("android-default");
        expect(getApiBaseUrl()).toBe(`${DEFAULT_SERVER_URL}/api`);
        expect(getWebSocketBaseUrl())
            .toBe("wss://relay.evezero.cn/ws/relay");
    });

    it("prefers the user saved server url over the android default", () => {
        capacitorState.native = true;
        capacitorState.platform = "android";
        saveConfiguredServerBaseUrl("http://192.168.1.100:8080");

        expect(getServerConfigSource()).toBe("custom");
        expect(getApiBaseUrl()).toBe("http://192.168.1.100:8080/api");
        expect(getWebSocketBaseUrl())
            .toBe("ws://192.168.1.100:8080/ws/relay");
    });

    it("normalizes trailing slashes and derives ws urls", () => {
        expect(normalizeServerBaseUrl(" https://relay.example.com/ "))
            .toBe("https://relay.example.com");
        expect(toWebSocketUrl("https://relay.example.com"))
            .toBe("wss://relay.example.com/ws/relay");
        expect(toWebSocketUrl("http://relay.example.com:8080"))
            .toBe("ws://relay.example.com:8080/ws/relay");
    });

    it("keeps a sub path when deriving the websocket url", () => {
        saveConfiguredServerBaseUrl("https://relay.example.com/cloud");
        expect(getApiBaseUrl()).toBe("https://relay.example.com/cloud/api");
        expect(getWebSocketBaseUrl())
            .toBe("wss://relay.example.com/cloud/ws/relay");
    });
});
