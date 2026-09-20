import {beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => {
    const state: {interceptor?: (config: unknown) => unknown} = {};
    const instance = {
        get: vi.fn(),
        interceptors: {
            request: {
                use: vi.fn((interceptor: (config: unknown) => unknown) => {
                    // 模块加载期捕获，避免 vitest restoreMocks 清掉调用记录
                    state.interceptor = interceptor;
                }),
            },
        },
    };
    return {
        instance,
        state,
        axios: {
            create: vi.fn(() => instance),
            isAxiosError: (error: unknown) =>
                Boolean(
                    error
                    && typeof error === "object"
                    && (error as {isAxiosError?: boolean}).isAxiosError,
                ),
        },
    };
});

vi.mock("axios", () => ({default: mocks.axios}));

import {
    AUTH_REQUIRED_MESSAGE,
    connectionTestLabel,
    testServerConnection,
} from "./healthApi";

function httpError(
    status: number,
    code = "ERR_BAD_REQUEST",
): Record<string, unknown> {
    return {
        isAxiosError: true,
        code,
        message: `Request failed with status code ${status}`,
        response: {status, data: {success: false, code: "UNAUTHORIZED"}},
    };
}

function networkError(code: string, message = "Network Error") {
    return {isAxiosError: true, code, message};
}

beforeEach(() => {
    mocks.instance.get.mockReset();
});

describe("testServerConnection", () => {
    it("reports 连接成功 for HTTP 200 with status UP", async () => {
        mocks.instance.get.mockResolvedValue({
            status: 200,
            data: {success: true, data: {status: "UP"}},
        });

        const outcome = await testServerConnection("https://relay.example.com");

        expect(outcome.status).toBe("ok");
        expect(outcome.httpStatus).toBe(200);
        expect(connectionTestLabel(outcome)).toBe("连接成功");
    });

    it("calls {serverBaseUrl}/api/health without any token", async () => {
        mocks.instance.get.mockResolvedValue({
            status: 200,
            data: {success: true, data: {status: "UP"}},
        });

        await testServerConnection("https://relay.example.com/");

        expect(mocks.instance.get).toHaveBeenCalledTimes(1);
        const [url, options] = mocks.instance.get.mock.calls[0] ?? [];
        expect(url).toBe("https://relay.example.com/api/health");
        expect(options).toMatchObject({withCredentials: false});
        expect(
            (options as {headers?: Record<string, unknown>}).headers
                ?.Authorization,
        ).toBeUndefined();
        expect(
            (options as {headers?: Record<string, unknown>}).headers
                ?.authorization,
        ).toBeUndefined();
    });

    it("reads the dynamically configured address when no url is passed", async () => {
        mocks.instance.get.mockResolvedValue({
            status: 200,
            data: {success: true, data: {status: "UP"}},
        });

        await testServerConnection();

        const [url] = mocks.instance.get.mock.calls[0] ?? [];
        expect(String(url)).toMatch(/^https?:\/\/[^/]+\/api\/health$/);
    });

    it("reports HTTP 401 as auth_required instead of a network error", async () => {
        mocks.instance.get.mockRejectedValue(httpError(401));

        const outcome = await testServerConnection("https://relay.example.com");

        expect(outcome.status).toBe("auth_required");
        expect(outcome.httpStatus).toBe(401);
        const label = connectionTestLabel(outcome);
        expect(label).toBe(AUTH_REQUIRED_MESSAGE);
        expect(label).toContain("需要认证");
        expect(label).not.toContain("网络不可达");
    });

    it("reports HTTP 403 with a CORS / whitelist hint", async () => {
        mocks.instance.get.mockRejectedValue(httpError(403));

        const outcome = await testServerConnection("https://relay.example.com");

        expect(outcome.status).toBe("forbidden");
        expect(outcome.httpStatus).toBe(403);
        expect(connectionTestLabel(outcome)).toContain("CORS");
    });

    it("reports HTTP 5xx as a server error", async () => {
        mocks.instance.get.mockRejectedValue(httpError(500));

        const outcome = await testServerConnection("https://relay.example.com");

        expect(outcome.status).toBe("server_error");
        expect(outcome.httpStatus).toBe(500);
    });

    it("reports a timeout when the request never completes", async () => {
        mocks.instance.get.mockRejectedValue(
            networkError("ECONNABORTED", "timeout of 8000ms exceeded"),
        );

        const outcome = await testServerConnection("https://relay.example.com");

        expect(outcome.status).toBe("timeout");
        expect(outcome.httpStatus).toBeNull();
    });

    it("reports a real fetch failure as a network/CORS error", async () => {
        mocks.instance.get.mockRejectedValue(networkError("ERR_NETWORK"));

        const outcome = await testServerConnection("https://relay.example.com");

        expect(outcome.status).toBe("cors");
        expect(outcome.httpStatus).toBeNull();
        expect(connectionTestLabel(outcome)).toContain("CORS");
    });

    it("reports a DNS failure separately", async () => {
        mocks.instance.get.mockRejectedValue(
            networkError("ERR_NAME_NOT_RESOLVED"),
        );

        const outcome = await testServerConnection("https://relay.example.com");

        expect(outcome.status).toBe("dns_error");
        expect(connectionTestLabel(outcome)).toContain("DNS");
    });

    it("reports HTTP 200 with an unhealthy payload", async () => {
        mocks.instance.get.mockResolvedValue({
            status: 200,
            data: {success: true, data: {status: "DOWN"}},
        });

        const outcome = await testServerConnection("https://relay.example.com");

        expect(outcome.status).toBe("not_healthy");
        expect(connectionTestLabel(outcome)).toContain("DOWN");
    });
});

describe("health check axios instance", () => {
    it("installs a request interceptor that strips Authorization", () => {
        const interceptor = mocks.state.interceptor;
        expect(interceptor).toBeTypeOf("function");

        const deleted: string[] = [];
        const config = {
            headers: {
                delete: (name: string) => {
                    deleted.push(name);
                },
            },
        };

        const result = interceptor?.(config);

        expect(result).toBe(config);
        expect(deleted).toContain("Authorization");
    });
});
