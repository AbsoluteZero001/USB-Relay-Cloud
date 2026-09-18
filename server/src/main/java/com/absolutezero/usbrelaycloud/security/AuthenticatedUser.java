package com.absolutezero.usbrelaycloud.security;

import java.io.Serializable;

/**
 * 已认证用户的 SecurityContext principal。
 * 字段对应 JWT claims；globalRole 为 GlobalRole 枚举名（ADMIN/USER）。
 */
public record AuthenticatedUser(
        Long userId,
        String username,
        String globalRole
) implements Serializable {
}
