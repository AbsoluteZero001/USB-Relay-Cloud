import {apiGet, apiPost} from "./http";
import type {CurrentUser, LoginResponse} from "@/types/api";

/**
 * POST /api/auth/login → 返回 accessToken (Bearer)。
 */
export function login(
    username: string,
    password: string,
): Promise<LoginResponse> {
    return apiPost<LoginResponse>(
        "/api/auth/login",
        {username, password},
    );
}

/**
 * GET /api/auth/me → 当前登录用户信息。
 */
export function fetchCurrentUser(): Promise<CurrentUser> {
    return apiGet<CurrentUser>("/api/auth/me");
}
