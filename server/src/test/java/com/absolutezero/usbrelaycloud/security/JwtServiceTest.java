package com.absolutezero.usbrelaycloud.security;

import com.absolutezero.usbrelaycloud.config.JwtProperties;
import io.jsonwebtoken.JwtException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.env.Environment;

import java.time.Clock;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class JwtServiceTest {

    private static final String VALID_SECRET =
            "test-jwt-secret-at-least-32-characters-long";

    private Environment environment;
    private JwtService jwtService;

    @BeforeEach
    void setUp() {
        environment = mock(Environment.class);
        when(environment.getActiveProfiles()).thenReturn(new String[]{"test"});
        jwtService = new JwtService(
                new JwtProperties(VALID_SECRET, Duration.ofMinutes(30)),
                environment,
                Clock.systemUTC()
        );
    }

    @Test
    void generatesTokenThatParsesBackToSameUser() {
        AuthenticatedUser user =
                new AuthenticatedUser(42L, "alice", "ADMIN");

        String token = jwtService.generate(user);

        assertThat(token).isNotBlank();
        AuthenticatedUser parsed = jwtService.parse(token);
        assertThat(parsed.userId()).isEqualTo(42L);
        assertThat(parsed.username()).isEqualTo("alice");
        assertThat(parsed.globalRole()).isEqualTo("ADMIN");
    }

    @Test
    void rejectsTamperedToken() {
        String token = jwtService.generate(
                new AuthenticatedUser(1L, "bob", "USER")
        );
        String tampered = token.substring(0, token.length() - 4) + "AAAA";

        assertThatThrownBy(() -> jwtService.parse(tampered))
                .isInstanceOf(JwtException.class);
    }

    @Test
    void rejectsUnsignedToken() {
        assertThatThrownBy(
                () -> jwtService.parse(
                        "eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0."
                )
        ).isInstanceOf(JwtException.class);
    }

    @Test
    void prodProfileRejectsBlankSecret() {
        when(environment.getActiveProfiles())
                .thenReturn(new String[]{"prod"});
        JwtProperties props =
                new JwtProperties("", Duration.ofHours(1));

        assertThatThrownBy(() -> new JwtService(
                props, environment, Clock.systemUTC()
        )).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("JWT_SECRET");
    }

    @Test
    void prodProfileRejectsShortSecret() {
        when(environment.getActiveProfiles())
                .thenReturn(new String[]{"prod"});
        JwtProperties props =
                new JwtProperties("short", Duration.ofHours(1));

        assertThatThrownBy(() -> new JwtService(
                props, environment, Clock.systemUTC()
        )).isInstanceOf(IllegalStateException.class);
    }
}
