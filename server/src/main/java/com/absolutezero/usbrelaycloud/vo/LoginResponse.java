package com.absolutezero.usbrelaycloud.vo;

/**
 * 登录成功响应。
 *
 * @param accessToken JWT access token
 * @param tokenType   固定为 Bearer
 * @param expiresIn   token 有效期（秒）
 */
public record LoginResponse(
        String accessToken,
        String tokenType,
        long expiresIn
) {
}
