import axios, {
    type AxiosError,
    type AxiosHeaders,
    type AxiosInstance,
    type InternalAxiosRequestConfig,
} from "axios";

import {getApiBaseUrl} from "@/config/runtimeConfig";
import {classifyNetworkError, networkFailureMessage} from "./networkErrors";
import type {ApiResponse} from "@/types/api";

export type ConnectionTestStatus =
    | "ok"
    | "auth_required"
    | "forbidden"
    | "server_error"
    | "not_healthy"
    | "dns_error"
    | "refused"
    | "timeout"
    | "ssl_error"
    | "cors"
    | "unreachable"
    | "error";

export interface ConnectionTestOutcome {
    status: ConnectionTestStatus;
    /** 真实 HTTP 状态码；无响应（网络层失败）时为 null。 */
    httpStatus: number | null;
    message?: string;
}

const AUTH_REQUIRED_MESSAGE =
    "服务器可以访问，但健康检查接口需要认证，请检查服务端安全配置。";

function stripAuthorization(
    config: InternalAxiosRequestConfig,
): InternalAxiosRequestConfig {
    const headers = config.headers as AxiosHeaders | undefined;
    if (headers && typeof headers.delete === "function") {
        headers.delete("Authorization");
        headers.delete("authorization");
    }
    return config;
}

/**
 * 健康检查专用 axios 实例。
 *
 * 关键点：
 * - 不使用 `http.ts` 的业务实例，因此不会挂载 JWT 请求拦截器，
 *   也不会被任何 401 自动登出 / 跳转登录逻辑包装
 * - 永不携带 Authorization / refresh token（连通性测试不是登录测试）
 * - withCredentials=false，避免把 Cookie 一起发给被测服务器
 */
export const healthHttp: AxiosInstance = axios.create({
    timeout: 8_000,
    withCredentials: false,
    headers: {
        Accept: "application/json",
    },
});

healthHttp.interceptors.request.use(stripAuthorization);

/**
 * 通过 GET {serverBaseUrl}/api/health 测试服务器连通性。
 *
 * 该接口在服务端必须 permitAll，因此不需要登录状态。
 * HTTP 状态码会被如实区分：401 表示「服务器能连上，但健康检查被鉴权拦截」，
 * 绝不等同于网络不可达。
 *
 * @param serverBaseUrl 可选：要测试的服务器根地址（不含 /api）。
 *                      不传则使用当前生效的动态地址。
 */
export async function testServerConnection(
    serverBaseUrl?: string,
): Promise<ConnectionTestOutcome> {
    const root = (serverBaseUrl ?? "").trim().replace(/\/+$/, "");
    const url = root ? `${root}/api/health` : `${getApiBaseUrl()}/health`;
    try {
        const response = await healthHttp.get<
            ApiResponse<{status?: string; service?: string}>
        >(url, {withCredentials: false});
        const payloadStatus = response.data?.data?.status;
        if (payloadStatus && payloadStatus !== "UP") {
            return {
                status: "not_healthy",
                httpStatus: response.status,
                message: `服务器返回 HTTP 200，但 status=${payloadStatus}`,
            };
        }
        return {status: "ok", httpStatus: response.status};
    } catch (error) {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError<ApiResponse<unknown>>;
            return interpretHealthError(axiosError);
        }
        return {
            status: "error",
            httpStatus: null,
            message: error instanceof Error ? error.message : "连接测试失败",
        };
    }
}

function interpretHealthError(
    error: AxiosError<ApiResponse<unknown>>,
): ConnectionTestOutcome {
    const httpStatus = error.response?.status ?? null;
    if (httpStatus === 401) {
        return {
            status: "auth_required",
            httpStatus,
            message: AUTH_REQUIRED_MESSAGE,
        };
    }
    if (httpStatus === 403) {
        return {
            status: "forbidden",
            httpStatus,
            message:
                "服务器可以访问，但该来源被拒绝（HTTP 403），"
                + "请检查服务端 CORS 白名单是否包含当前来源。",
        };
    }
    if (httpStatus !== null && httpStatus >= 500) {
        return {
            status: "server_error",
            httpStatus,
            message: `服务器返回 ${httpStatus}（服务端错误）`,
        };
    }
    if (httpStatus !== null) {
        return {
            status: "error",
            httpStatus,
            message: `服务器返回 ${httpStatus}`,
        };
    }
    // 无响应：DNS / 连接拒绝 / 超时 / 证书 / CORS（浏览器不区分 CORS 与网络不可达）
    const kind = classifyNetworkError(error);
    const message = networkFailureMessage(kind);
    switch (kind) {
        case "dns":
            return {status: "dns_error", httpStatus: null, message};
        case "refused":
            return {status: "refused", httpStatus: null, message};
        case "timeout":
            return {status: "timeout", httpStatus: null, message};
        case "ssl":
            return {status: "ssl_error", httpStatus: null, message};
        case "cors":
            return {status: "cors", httpStatus: null, message};
        default:
            return {status: "unreachable", httpStatus: null, message};
    }
}

export function connectionTestLabel(outcome: ConnectionTestOutcome): string {
    if (outcome.message) {
        return outcome.message;
    }
    switch (outcome.status) {
        case "ok":
            return "连接成功";
        case "auth_required":
            return AUTH_REQUIRED_MESSAGE;
        case "forbidden":
            return "服务器可以访问，但该来源被拒绝（HTTP 403）";
        case "server_error":
            return "服务器返回 5xx（服务端错误）";
        case "not_healthy":
            return "服务器已响应，但健康检查状态异常";
        case "dns_error":
            return "DNS 解析失败";
        case "refused":
            return "无法连接服务器（连接被拒绝）";
        case "timeout":
            return "连接超时";
        case "ssl_error":
            return "HTTPS 证书错误";
        case "cors":
            return "无法连接服务器：可能是 CORS / WebView 网络限制";
        case "unreachable":
            return "服务器不可达";
        case "error":
            return "连接失败";
    }
}

export {AUTH_REQUIRED_MESSAGE};
