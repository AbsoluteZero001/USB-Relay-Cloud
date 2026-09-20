package com.absolutezero.usbrelaycloud.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/**
 * Spring Security 主配置：无状态 JWT。
 * <p>
 * 公开端点：/api/health（含 /api/health/ 与 /api/public/** 别名）、
 * /api/auth/login、/ws/relay（握手，握手后通过 AUTH 帧再次校验）、
 * 以及 CORS 预检 OPTIONS 与 /error 错误转发。
 * 其余 /api/** 与受保护接口需携带合法 Bearer token。
 * <p>
 * 401/403 由 JwtAuthenticationEntryPoint / JwtAccessDeniedHandler
 * 统一返回 ApiResponse JSON。
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    /**
     * 无需认证即可访问的路径。
     * <p>
     * 说明：
     * - Spring Security 6 不再做「尾部斜杠自动匹配」，
     *   /api/health/ 必须显式列出，否则会掉进 anyRequest().authenticated()
     *   并被 AuthenticationEntryPoint 包装成 401「请先登录」。
     * - /error 用于错误转发：若不放行，公开端点上抛出的异常会被改写成 401。
     */
    private static final String[] PUBLIC_ENDPOINTS = {
            "/api/health",
            "/api/health/",
            "/api/public/**",
            "/api/auth/login",
            "/ws/relay",
            "/error",
    };

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final JwtAuthenticationEntryPoint entryPoint;
    private final JwtAccessDeniedHandler accessDeniedHandler;

    public SecurityConfig(
            JwtAuthenticationFilter jwtAuthenticationFilter,
            JwtAuthenticationEntryPoint entryPoint,
            JwtAccessDeniedHandler accessDeniedHandler
    ) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
        this.entryPoint = entryPoint;
        this.accessDeniedHandler = accessDeniedHandler;
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .cors(org.springframework.security.config.Customizer
                        .withDefaults())
                .sessionManagement(session -> session
                        .sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(eh -> eh
                        .authenticationEntryPoint(entryPoint)
                        .accessDeniedHandler(accessDeniedHandler))
                .authorizeHttpRequests(auth -> auth
                        // CORS 预检请求不带 Authorization，必须先于鉴权放行
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers(PUBLIC_ENDPOINTS).permitAll()
                        .anyRequest().authenticated())
                .addFilterBefore(
                        jwtAuthenticationFilter,
                        UsernamePasswordAuthenticationFilter.class
                );
        return http.build();
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
