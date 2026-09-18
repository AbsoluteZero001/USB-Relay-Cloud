package com.absolutezero.usbrelaycloud.vo;

/**
 * 当前登录用户信息（GET /api/auth/me）。
 */
public record CurrentUserResponse(
        Long userId,
        String username,
        String globalRole
) {
}
