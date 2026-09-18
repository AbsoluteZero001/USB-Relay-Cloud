package com.absolutezero.usbrelaycloud.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 登录请求。username/password 均为必填。
 */
public record LoginRequest(
        @NotBlank(message = "username is required")
        String username,
        @NotBlank(message = "password is required")
        String password
) {
}
