package com.absolutezero.usbrelaycloud.security;

import com.absolutezero.usbrelaycloud.common.enums.UserStatus;
import com.absolutezero.usbrelaycloud.dto.LoginRequest;
import com.absolutezero.usbrelaycloud.entity.SysUserEntity;
import com.absolutezero.usbrelaycloud.exception.BusinessException;
import com.absolutezero.usbrelaycloud.mapper.SysUserMapper;
import com.absolutezero.usbrelaycloud.vo.CurrentUserResponse;
import com.absolutezero.usbrelaycloud.vo.LoginResponse;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

/**
 * 登录鉴权服务。
 * <p>
 * 凭据无效或账号被禁用时抛 BusinessException(401)，
 * 由 GlobalExceptionHandler 转换为 ApiResponse JSON。
 */
@Service
public class AuthService {

    private final SysUserMapper sysUserMapper;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthService(
            SysUserMapper sysUserMapper,
            PasswordEncoder passwordEncoder,
            JwtService jwtService
    ) {
        this.sysUserMapper = sysUserMapper;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    public LoginResponse login(LoginRequest request) {
        SysUserEntity user = sysUserMapper.selectByUsername(
                request.username()
        );
        if (user == null
                || !passwordEncoder.matches(
                request.password(),
                user.getPasswordHash()
        )) {
            throw new BusinessException(
                    "INVALID_CREDENTIALS",
                    "用户名或密码错误",
                    HttpStatus.UNAUTHORIZED
            );
        }
        if (user.getStatus() != UserStatus.ACTIVE) {
            throw new BusinessException(
                    "USER_DISABLED",
                    "账号已被禁用",
                    HttpStatus.UNAUTHORIZED
            );
        }
        AuthenticatedUser principal = new AuthenticatedUser(
                user.getId(),
                user.getUsername(),
                user.getGlobalRole().name()
        );
        String token = jwtService.generate(principal);
        long expiresIn = jwtService.expiration().getSeconds();
        if (expiresIn <= 0) {
            expiresIn = 3600L;
        }
        return new LoginResponse(token, "Bearer", expiresIn);
    }

    public CurrentUserResponse currentUser(Authentication authentication) {
        Object principal = authentication == null
                ? null
                : authentication.getPrincipal();
        if (!(principal instanceof AuthenticatedUser user)) {
            throw new BusinessException(
                    "UNAUTHORIZED",
                    "请先登录",
                    HttpStatus.UNAUTHORIZED
            );
        }
        return new CurrentUserResponse(
                user.userId(),
                user.username(),
                user.globalRole()
        );
    }
}
