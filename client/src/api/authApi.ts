import {apiGet, apiPost} from "./http";
import type {CurrentUser, LoginResponse} from "@/types/api";

/**
 * POST /api/auth/login → 返回 accessToken (Bearer)。
 * baseURL 已含 /api，业务层只写 /auth/login。
 */
export function login(
    username: string,
    password: string,
): Promise<LoginResponse> {
    return apiPost<LoginResponse>(
        "/auth/login",
        {username, password},
    );
}

/**
 * GET /api/auth/me → 当前登录用户信息。
 * baseURL 已含 /api，业务层只写 /auth/me。
 */
export function fetchCurrentUser(): Promise<CurrentUser> {
    return apiGet<CurrentUser>("/auth/me");
}
