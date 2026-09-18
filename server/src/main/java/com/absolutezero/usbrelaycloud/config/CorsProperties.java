package com.absolutezero.usbrelaycloud.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * CORS 允许的来源白名单。
 * 来自环境变量 APP_CORS_ALLOWED_ORIGINS（回退到旧的
 * CORS_ALLOWED_ORIGIN_PATTERNS，最终回退为 *）。
 * 逗号分隔的多个 origin 会被 Spring 拆分为数组。
 */
@ConfigurationProperties(prefix = "usb-relay.cors")
public record CorsProperties(
        String[] allowedOrigins
) {
}
