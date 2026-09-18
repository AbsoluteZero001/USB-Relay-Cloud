package com.absolutezero.usbrelaycloud.security;

import com.absolutezero.usbrelaycloud.config.JwtProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.Date;

/**
 * JWT 签发与解析。
 * <p>
 * 在 prod profile 下，若 secret 为空或长度 &lt; 32 字符，构造阶段直接抛出
 * IllegalStateException 拒绝启动；dev/test 缺省时使用固定弱密钥便于本地启动。
 */
@Component
public class JwtService {

    private static final String DEV_FALLBACK_SECRET =
            "dev-only-jwt-secret-32chars-min-do-not-use-in-prod";
    private static final int MIN_SECRET_LENGTH = 32;

    private final SecretKey key;
    private final Duration expiration;
    private final Clock clock;

    public JwtService(
            JwtProperties properties,
            Environment environment,
            Clock clock
    ) {
        this.clock = clock;
        this.expiration =
                properties.expiration() == null
                        ? Duration.ofHours(1)
                        : properties.expiration();
        boolean isProd = Arrays.asList(environment.getActiveProfiles())
                .contains("prod");
        String secret = properties.secret();
        if (secret == null || secret.isBlank()
                || secret.length() < MIN_SECRET_LENGTH) {
            if (isProd) {
                throw new IllegalStateException(
                        "usb-relay.jwt.secret (env JWT_SECRET) must be set "
                                + "to a " + MIN_SECRET_LENGTH
                                + "+ char string in prod profile");
            }
            secret = DEV_FALLBACK_SECRET;
        }
        this.key = Keys.hmacShaKeyFor(
                secret.getBytes(StandardCharsets.UTF_8)
        );
    }

    /**
     * 签发 access token。subject=username，claims 包含
     * uid（用户主键）与 role（GlobalRole 枚举名）。
     */
    public String generate(AuthenticatedUser user) {
        Instant now = clock.instant();
        return Jwts.builder()
                .subject(user.username())
                .claim("uid", user.userId())
                .claim("role", user.globalRole())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(expiration)))
                .signWith(key)
                .compact();
    }

    /**
     * 解析并验证 token。验证失败抛 JwtException，
     * 由调用方决定 401 处理。
     */
    public AuthenticatedUser parse(String token) throws JwtException {
        Claims claims = Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
        Number uid = claims.get("uid", Number.class);
        return new AuthenticatedUser(
                uid == null ? null : uid.longValue(),
                claims.getSubject(),
                claims.get("role", String.class)
        );
    }

    public Duration expiration() {
        return expiration;
    }
}
