package com.absolutezero.usbrelaycloud.security;

import com.absolutezero.usbrelaycloud.common.enums.GlobalRole;
import com.absolutezero.usbrelaycloud.common.enums.UserStatus;
import com.absolutezero.usbrelaycloud.dto.LoginRequest;
import com.absolutezero.usbrelaycloud.entity.SysUserEntity;
import com.absolutezero.usbrelaycloud.exception.BusinessException;
import com.absolutezero.usbrelaycloud.mapper.SysUserMapper;
import com.absolutezero.usbrelaycloud.vo.LoginResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    private SysUserMapper sysUserMapper;

    private PasswordEncoder passwordEncoder;
    private JwtService jwtService;
    private AuthService authService;

    @BeforeEach
    void setUp() {
        passwordEncoder = new BCryptPasswordEncoder();
        org.springframework.core.env.Environment env =
                org.mockito.Mockito.mock(
                        org.springframework.core.env.Environment.class
                );
        when(env.getActiveProfiles())
                .thenReturn(new String[]{"test"});
        jwtService = new JwtService(
                new com.absolutezero.usbrelaycloud.config.JwtProperties(
                        "test-jwt-secret-at-least-32-characters-long",
                        java.time.Duration.ofHours(1)
                ),
                env,
                java.time.Clock.systemUTC()
        );
        authService = new AuthService(
                sysUserMapper, passwordEncoder, jwtService
        );
    }

    @Test
    void loginWithValidCredentialsReturnsBearerToken() {
        SysUserEntity user = new SysUserEntity();
        user.setId(7L);
        user.setUsername("alice");
        user.setPasswordHash(
                passwordEncoder.encode("secret-123")
        );
        user.setGlobalRole(GlobalRole.ADMIN);
        user.setStatus(UserStatus.ACTIVE);
        when(sysUserMapper.selectByUsername("alice")).thenReturn(user);

        LoginResponse response = authService.login(
                new LoginRequest("alice", "secret-123")
        );

        assertThat(response.tokenType()).isEqualTo("Bearer");
        assertThat(response.accessToken()).isNotBlank();
        assertThat(response.expiresIn()).isEqualTo(3600L);
    }

    @Test
    void loginWithWrongPasswordThrowsUnauthorized() {
        SysUserEntity user = new SysUserEntity();
        user.setId(7L);
        user.setUsername("alice");
        user.setPasswordHash(
                passwordEncoder.encode("secret-123")
        );
        user.setGlobalRole(GlobalRole.USER);
        user.setStatus(UserStatus.ACTIVE);
        when(sysUserMapper.selectByUsername("alice")).thenReturn(user);

        assertThatThrownBy(() -> authService.login(
                new LoginRequest("alice", "wrong")
        )).isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException b = (BusinessException) ex;
                    assertThat(b.getCode())
                            .isEqualTo("INVALID_CREDENTIALS");
                    assertThat(b.getStatus())
                            .isEqualTo(HttpStatus.UNAUTHORIZED);
                });
    }

    @Test
    void loginWithUnknownUserThrowsUnauthorized() {
        when(sysUserMapper.selectByUsername(eq("ghost")))
                .thenReturn(null);

        assertThatThrownBy(() -> authService.login(
                new LoginRequest("ghost", "anything")
        )).isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException b = (BusinessException) ex;
                    assertThat(b.getCode())
                            .isEqualTo("INVALID_CREDENTIALS");
                    assertThat(b.getStatus())
                            .isEqualTo(HttpStatus.UNAUTHORIZED);
                });
    }

    @Test
    void loginWithDisabledUserThrowsUnauthorized() {
        SysUserEntity user = new SysUserEntity();
        user.setId(7L);
        user.setUsername("alice");
        user.setPasswordHash(
                passwordEncoder.encode("secret-123")
        );
        user.setGlobalRole(GlobalRole.USER);
        user.setStatus(UserStatus.DISABLED);
        when(sysUserMapper.selectByUsername("alice")).thenReturn(user);

        assertThatThrownBy(() -> authService.login(
                new LoginRequest("alice", "secret-123")
        )).isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException b = (BusinessException) ex;
                    assertThat(b.getCode()).isEqualTo("USER_DISABLED");
                    assertThat(b.getStatus())
                            .isEqualTo(HttpStatus.UNAUTHORIZED);
                });
    }
}
