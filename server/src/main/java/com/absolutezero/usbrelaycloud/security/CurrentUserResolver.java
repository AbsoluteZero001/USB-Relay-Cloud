package com.absolutezero.usbrelaycloud.security;

import com.absolutezero.usbrelaycloud.exception.BusinessException;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

/**
 * 从 SecurityContext 取出当前已认证用户。
 * 由 JwtAuthenticationFilter 在请求进入时写入 SecurityContext。
 * 未登录或 principal 类型不匹配时抛 BusinessException(401)，
 * 由 GlobalExceptionHandler 转换为 ApiResponse JSON。
 * <p>
 * 之所以不直接通过参数注入 Authentication，是为了避免改动
 * DeviceController/DeviceService 既有方法签名，从而不打散
 * 现有 MockMvc standalone 测试。
 */
@Component
public class CurrentUserResolver {

    public AuthenticatedUser require() {
        Authentication auth = SecurityContextHolder.getContext()
                .getAuthentication();
        if (auth == null
                || !(auth.getPrincipal() instanceof AuthenticatedUser user)) {
            throw new BusinessException(
                    "UNAUTHORIZED",
                    "请先登录",
                    HttpStatus.UNAUTHORIZED
            );
        }
        return user;
    }
}
