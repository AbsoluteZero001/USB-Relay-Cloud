import axios, {AxiosError, type AxiosResponse} from "axios";

import {getStoredToken} from "@/config/authStorage";
import {getApiBaseUrl} from "@/config/runtimeConfig";
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
