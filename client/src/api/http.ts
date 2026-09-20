import axios, {AxiosError, type AxiosResponse} from "axios";

import {getStoredToken} from "@/config/authStorage";
import {getApiBaseUrl} from "@/config/runtimeConfig";
import {
    classifyNetworkError,
    isNetworkFailureCode,
    networkFailureMessage,
    type NetworkFailureKind,
} from "./networkErrors";
import type {ApiResponse} from "@/types/api";

export class ApiError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly details: unknown;

  constructor(
    message: string,
    code = "UNKNOWN_ERROR",
    status: number | null = null,
    details: unknown = null,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const http = axios.create({
  timeout: 10_000,
  headers: {
    "Content-Type": "application/json",
  },
});

// JWT 拦截器：所有 REST 请求自动附加 Authorization: Bearer <token>
http.interceptors.request.use((config) => {
    const token = getStoredToken();
    if (token) {
        config.headers = config.headers ?? {};
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

/**
 * 判断是否为网络层错误（无响应）。
 * 401/403 等认证错误属于“有响应”的业务错误，不算网络不可达。
 */
function isNetworkUnreachable(error: AxiosError<unknown>): boolean {
    if (error.response) return false;
    // 无响应且没有具体 code（部分 WebView / 代理会这样抛）同样按网络层错误处理。
    return !error.code || isNetworkFailureCode(error.code);
}

const NETWORK_ERROR_CODE: Record<NetworkFailureKind, string> = {
    dns: "NETWORK_DNS_ERROR",
    refused: "NETWORK_CONNECTION_REFUSED",
    timeout: "NETWORK_TIMEOUT",
    ssl: "NETWORK_SSL_ERROR",
    cors: "NETWORK_CORS_OR_NETWORK_ERROR",
    unreachable: "NETWORK_UNREACHABLE",
};

function readErrorResponse(error: AxiosError<ApiResponse<unknown>>): ApiError {
  const response = error.response;
  const payload = response?.data;
  if (payload && typeof payload === "object") {
    return new ApiError(
      payload.message || error.message,
      payload.code || "HTTP_ERROR",
      response?.status ?? null,
      payload.data ?? null,
    );
  }
    // 无响应：网络不可达 / DNS / 超时 / SSL 等
    if (isNetworkUnreachable(error)) {
        const kind = classifyNetworkError(error);
        return new ApiError(
            networkFailureMessage(kind),
            NETWORK_ERROR_CODE[kind],
            null,
            {
                kind,
                axiosCode: error.code ?? null,
                rawMessage: error.message,
            },
        );
    }
  return new ApiError(
    error.message || "网络请求失败",
    "NETWORK_ERROR",
    response?.status ?? null,
  );
}

async function unwrap<T>(
  request: Promise<AxiosResponse<ApiResponse<T>>>,
): Promise<T> {
  try {
    const response = await request;
    if (!response.data.success) {
      throw new ApiError(
        response.data.message,
        response.data.code,
        response.status,
        response.data.data,
      );
    }
    return response.data.data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (axios.isAxiosError<ApiResponse<unknown>>(error)) {
      throw readErrorResponse(error);
    }
    throw new ApiError(
      error instanceof Error ? error.message : "未知网络错误",
    );
  }
}

export function apiGet<T>(
  url: string,
  params?: Record<string, unknown>,
): Promise<T> {
    return unwrap(
        http.get<ApiResponse<T>>(url, {
            baseURL: getApiBaseUrl(),
            params,
        }),
    );
}

export function apiPost<T>(
  url: string,
  body?: unknown,
): Promise<T> {
    return unwrap(
        http.post<ApiResponse<T>>(url, body, {
            baseURL: getApiBaseUrl(),
        }),
    );
}

export function getApiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return error instanceof Error ? error.message : "请求失败";
}

/**
 * 判断错误是否为网络不可达类错误（无 HTTP 响应）。
 * 用于登录页区分“服务器连接问题”与“认证失败”。
 */
export function isNetworkUnreachableError(error: unknown): boolean {
    if (error instanceof ApiError) {
        return error.code.startsWith("NETWORK_");
    }
    if (axios.isAxiosError(error)) {
        return isNetworkUnreachable(error);
    }
    return false;
}
