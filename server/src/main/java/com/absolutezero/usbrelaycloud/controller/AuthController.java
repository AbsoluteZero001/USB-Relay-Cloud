package com.absolutezero.usbrelaycloud.controller;

import com.absolutezero.usbrelaycloud.common.ApiResponse;
import com.absolutezero.usbrelaycloud.dto.LoginRequest;
import com.absolutezero.usbrelaycloud.security.AuthService;
import com.absolutezero.usbrelaycloud.vo.CurrentUserResponse;
import com.absolutezero.usbrelaycloud.vo.LoginResponse;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    /**
     * POST /api/auth/login → 颁发 JWT。
     */
    @PostMapping("/login")
    public ApiResponse<LoginResponse> login(
            @Valid @RequestBody LoginRequest request
    ) {
        return ApiResponse.success(authService.login(request));
    }

    /**
     * GET /api/auth/me → 当前登录用户信息。
     */
    @GetMapping("/me")
    public ApiResponse<CurrentUserResponse> me(
            Authentication authentication
    ) {
        return ApiResponse.success(
                authService.currentUser(authentication)
        );
    }
}
