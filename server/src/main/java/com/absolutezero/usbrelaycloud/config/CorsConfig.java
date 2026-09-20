package com.absolutezero.usbrelaycloud.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * REST 跨域配置。
 * <p>
 * 白名单 = 环境变量 APP_CORS_ALLOWED_ORIGINS + 内置容器 Origin。
 * <p>
 * 内置 Origin 是 App 自带的、随 APK 分发的固定值，不是运维配置：
 * Capacitor Android WebView 默认 {@code androidScheme=https}、
 * {@code hostname=localhost}（见 @capacitor/android CapConfig），
 * 即 {@code https://localhost}；另外兼容 http scheme 与自定义 scheme。
 * 缺少这些 Origin 时，Android App 的所有 REST 请求都会被
 * "Invalid CORS request" 403 拒绝，在 axios 里表现为 NetworkError。
 * <p>
 * 使用 allowedOriginPatterns（而不是 allowedOrigins("*")）配合
 * allowCredentials(true)：Spring 会回显请求来源，
 * 不会产生 Access-Control-Allow-Origin: * 与 credentials 冲突的问题。
 */
@Configuration
public class CorsConfig implements WebMvcConfigurer {

    /** Capacitor Android WebView 实际使用的 Origin（默认配置）。 */
    public static final String CAPACITOR_ANDROID_ORIGIN = "https://localhost";

    /** App 容器 / 本地开发服务器的固定来源，始终放行。 */
    static final String[] BUILT_IN_ORIGINS = {
            CAPACITOR_ANDROID_ORIGIN,
            // Capacitor 可配置为 http scheme
            "http://localhost",
            // Capacitor 可配置为自定义 scheme
            "capacitor://localhost",
            // README 中记录的 Vite 开发地址
            "http://localhost:5173",
            "http://127.0.0.1:5173",
    };

    private static final String[] ALLOWED_METHODS = {
            "GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS",
    };

    private static final String[] ALLOWED_HEADERS = {
            "Authorization",
            "Content-Type",
            "Accept",
            "Origin",
            "X-Requested-With",
    };

    private static final String[] EXPOSED_HEADERS = {"Authorization"};

    private final CorsProperties corsProperties;

    public CorsConfig(CorsProperties corsProperties) {
        this.corsProperties = corsProperties;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOriginPatterns(resolveOriginPatterns())
                .allowedMethods(ALLOWED_METHODS)
                .allowedHeaders(ALLOWED_HEADERS)
                .exposedHeaders(EXPOSED_HEADERS)
                .allowCredentials(true)
                .maxAge(3600);
    }

    /**
     * 合并「环境变量白名单」与「App 内置 Origin」，保持顺序且去重。
     * 未配置时回退 {@code *}（本地开发），此时内置 Origin 已被通配覆盖。
     */
    String[] resolveOriginPatterns() {
        String[] configured = corsProperties.allowedOrigins();
        if (configured == null || configured.length == 0) {
            configured = new String[]{"*"};
        }
        Set<String> merged = new LinkedHashSet<>();
        List<String> trimmed = new ArrayList<>();
        for (String origin : configured) {
            if (origin == null || origin.isBlank()) {
                continue;
            }
            trimmed.add(origin.trim());
        }
        if (trimmed.isEmpty()) {
            trimmed.add("*");
        }
        merged.addAll(trimmed);
        merged.addAll(List.of(BUILT_IN_ORIGINS));
        return merged.toArray(new String[0]);
    }
}
