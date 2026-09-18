package com.absolutezero.usbrelaycloud.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * JWT 配置。secret 来自环境变量 JWT_SECRET；
 * 在 prod profile 下，secret 为空或长度 &lt; 32 字符时，
 * JwtService 构造阶段会直接拒绝启动。
 */
@ConfigurationProperties(prefix = "usb-relay.jwt")
public record JwtProperties(
        String secret,
        Duration expiration
) {
}
