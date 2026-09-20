import axios, {type AxiosError} from "axios";

import {getApiBaseUrl} from "@/config/runtimeConfig";
import {classifyNetworkError, networkFailureMessage} from "./networkErrors";
import type {ApiResponse} from "@/types/api";

export type ConnectionTestStatus =
    | "ok"
    | "auth_failed"
    | "forbidden"
    | "server_error"
    | "unreachable"
    | "dns_error"
    | "refused"
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
            const httpStatus = axiosError.response?.status;
            if (httpStatus === 401) {
                return {status: "auth_failed"};
            }
            if (httpStatus === 403) {
                return {status: "forbidden", message: "服务器返回 403（无访问权限）"};
            }
            if (httpStatus && httpStatus >= 500) {
                return {
                    status: "server_error",
                    message: `服务器返回 ${httpStatus}（服务端错误）`,
                };
            }
            if (httpStatus) {
                return {
                    status: "error",
                    message: `服务器返回 ${httpStatus}`,
                };
            }
            // 无响应：细分 DNS / 连接拒绝 / 超时 / 证书 / CORS
            const kind = classifyNetworkError(axiosError);
            const message = networkFailureMessage(kind);
            switch (kind) {
                case "dns":
                    return {status: "dns_error", message};
                case "refused":
                    return {status: "refused", message};
                case "timeout":
                    return {status: "timeout", message};
                case "ssl":
                    return {status: "ssl_error", message};
                default:
                    return {status: "unreachable", message};
            }
        }
        return {status: "unreachable"};
    }
}

export function connectionTestLabel(outcome: ConnectionTestOutcome): string {
    switch (outcome.status) {
        case "ok":
            return "连接成功";
        case "auth_failed":
            return "服务器返回 401（认证失败）";
        case "forbidden":
            return outcome.message ?? "服务器返回 403（无访问权限）";
        case "server_error":
            return outcome.message ?? "服务器返回 5xx（服务端错误）";
        case "unreachable":
            return outcome.message ?? "服务器不可达";
        case "dns_error":
            return outcome.message ?? "DNS 解析失败";
        case "refused":
            return outcome.message ?? "无法连接服务器（连接被拒绝）";
        case "timeout":
            return outcome.message ?? "连接超时";
        case "ssl_error":
            return outcome.message ?? "SSL / HTTPS 错误";
        case "error":
            return outcome.message ?? "连接失败";
    }
}
