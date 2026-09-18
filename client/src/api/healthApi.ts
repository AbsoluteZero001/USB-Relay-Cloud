import axios, {type AxiosError} from "axios";

import {getApiBaseUrl} from "@/config/runtimeConfig";
import type {ApiResponse} from "@/types/api";

export type ConnectionTestStatus =
    | "ok"
    | "auth_failed"
    | "unreachable"
    | "timeout"
    | "error";

export interface ConnectionTestOutcome {
    status: ConnectionTestStatus;
    message?: string;
}

/**
 * 通过 GET /api/health 测试服务器连通性。
 * /api/health 在 Spring Security 中应配置为 permitAll，
 * 因此该接口不依赖 JWT，可在登录前使用。
 */
export async function testServerConnection(): Promise<ConnectionTestOutcome> {
    try {
        await axios.get<ApiResponse<unknown>>(
            `${getApiBaseUrl()}/health`,
            {timeout: 8_000},
        );
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
            return "网络超时";
        case "error":
            return outcome.message ?? "连接失败";
    }
}
