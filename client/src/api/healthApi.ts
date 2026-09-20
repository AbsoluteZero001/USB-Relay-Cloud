import axios, {type AxiosError} from "axios";

import {getApiBaseUrl} from "@/config/runtimeConfig";
import type {ApiResponse} from "@/types/api";

export type ConnectionTestStatus =
    | "ok"
    | "auth_failed"
    | "unreachable"
    | "timeout"
    | "ssl_error"
    | "error";

export interface ConnectionTestOutcome {
    status: ConnectionTestStatus;
    message?: string;
}

/**
 * 通过 GET /api/health 测试服务器连通性。
 * /api/health 在 Spring Security 中应配置为 permitAll，
 * 因此该接口不依赖 JWT，可在登录前使用。
 *
 * @param serverBaseUrl 可选：指定要测试的服务器根地址（不含 /api）。
 *                      不传则使用当前生效的 getApiBaseUrl()。
 */
export async function testServerConnection(
    serverBaseUrl?: string,
): Promise<ConnectionTestOutcome> {
    const apiBase = serverBaseUrl
        ? `${serverBaseUrl.replace(/\/+$/, "")}/api`
        : getApiBaseUrl();
    try {
        await axios.get<ApiResponse<unknown>>(`${apiBase}/health`, {
            timeout: 8_000,
        });
        return {status: "ok"};
    } catch (error) {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError<ApiResponse<unknown>>;
            if (axiosError.response?.status === 401) {
                return {status: "auth_failed"};
            }
            if (
                axiosError.code === "ECONNABORTED" ||
                axiosError.code === "ETIMEDOUT"
            ) {
                return {status: "timeout"};
            }
            if (
                axiosError.code === "ERR_NETWORK" &&
                (axiosError.message.includes("SSL") ||
                    axiosError.message.includes("certificate") ||
                    axiosError.message.includes("TLS") ||
                    axiosError.message.includes("HTTPS"))
            ) {
                return {
                    status: "ssl_error",
                    message: "SSL / HTTPS 握手失败",
                };
            }
            if (axiosError.response) {
                return {
                    status: "error",
                    message: `服务器返回 ${axiosError.response.status}`,
                };
            }
            return {status: "unreachable"};
        }
        return {status: "unreachable"};
    }
}

export function connectionTestLabel(outcome: ConnectionTestOutcome): string {
    switch (outcome.status) {
        case "ok":
            return "连接成功";
        case "auth_failed":
            return "认证失败";
        case "unreachable":
            return "服务器不可达";
        case "timeout":
            return "请求超时";
        case "ssl_error":
            return outcome.message ?? "SSL / HTTPS 错误";
        case "error":
            return outcome.message ?? "连接失败";
    }
}
