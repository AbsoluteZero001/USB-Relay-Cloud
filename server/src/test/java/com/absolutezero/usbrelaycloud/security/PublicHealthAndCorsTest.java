package com.absolutezero.usbrelaycloud.security;

import com.absolutezero.usbrelaycloud.config.CorsConfig;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 公开健康检查 + CORS 回归测试。
 * <p>
 * 使用显式白名单（而不是测试 profile 默认的 *），用来证明：
 * - /api/health 及其别名 / 尾斜杠变体在未登录、无 Authorization 头时返回 200
 * - Capacitor Android WebView 的 Origin（https://localhost）被自动放行
 * - 运维配置的域名仍然生效，未知 Origin 仍被拒绝
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "usb-relay.cors.allowed-origins=https://relay.evezero.cn")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PublicHealthAndCorsTest {

    private static final String CAPACITOR_ORIGIN =
            CorsConfig.CAPACITOR_ANDROID_ORIGIN;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private TestRestTemplate restTemplate;

    @Test
    @DisplayName("GET /api/health 不需要认证")
    void healthIsPublicWithoutAuthorizationHeader() throws Exception {
        mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.status").value("UP"))
                .andExpect(jsonPath("$.data.service")
                        .value("usb-relay-cloud-server"))
                .andExpect(jsonPath("$.data.timestamp").exists());
    }

    @Test
    @DisplayName("GET /api/health/ 尾斜杠变体同样公开（历史 401 场景）")
    void healthWithTrailingSlashIsPublic() throws Exception {
        mockMvc.perform(get("/api/health/"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("UP"));
    }

    @Test
    @DisplayName("GET /api/public/health 公开别名可用")
    void publicHealthAliasIsPublic() throws Exception {
        mockMvc.perform(get("/api/public/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("UP"));
    }

    @Test
    @DisplayName("健康检查忽略 Authorization 头（JWT Filter 不得拦截公开路径）")
    void healthIgnoresInvalidAuthorizationHeader() throws Exception {
        mockMvc.perform(get("/api/health")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer not-a-jwt"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }

    @Test
    @DisplayName("Capacitor WebView Origin 可以直接读取健康检查")
    void capacitorOriginCanReadHealth() throws Exception {
        mockMvc.perform(get("/api/health")
                        .header(HttpHeaders.ORIGIN, CAPACITOR_ORIGIN))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN,
                        CAPACITOR_ORIGIN));
    }

    @Test
    @DisplayName("Capacitor WebView 的 OPTIONS 预检返回 200 且允许 GET")
    void capacitorOriginPreflightIsAllowed() throws Exception {
        mockMvc.perform(options("/api/health")
                        .header(HttpHeaders.ORIGIN, CAPACITOR_ORIGIN)
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET")
                        .header(
                                HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS,
                                "content-type"))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN,
                        CAPACITOR_ORIGIN))
                .andExpect(header().string(
                        HttpHeaders.ACCESS_CONTROL_ALLOW_METHODS,
                        containsString("GET")))
                .andExpect(header().string(
                        HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS,
                        "true"));
    }

    @Test
    @DisplayName("登录接口的预检允许 Authorization 与 Content-Type 头")
    void loginPreflightAllowsAuthorizationAndContentType() throws Exception {
        mockMvc.perform(options("/api/auth/login")
                        .header(HttpHeaders.ORIGIN, CAPACITOR_ORIGIN)
                        .header(
                                HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD,
                                "POST")
                        .header(
                                HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS,
                                "authorization,content-type,accept"))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN,
                        CAPACITOR_ORIGIN))
                .andExpect(header().string(
                        HttpHeaders.ACCESS_CONTROL_ALLOW_HEADERS,
                        containsString("authorization")));
    }

    @Test
    @DisplayName("运维配置的公网域名仍然被允许")
    void configuredPublicOriginIsAllowed() throws Exception {
        mockMvc.perform(get("/api/health")
                        .header(
                                HttpHeaders.ORIGIN,
                                "https://relay.evezero.cn"))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN,
                        "https://relay.evezero.cn"));
    }

    @Test
    @DisplayName("未知 Origin 仍被拒绝，白名单不被通配稀释")
    void unknownOriginIsRejected() throws Exception {
        mockMvc.perform(get("/api/health")
                        .header(HttpHeaders.ORIGIN, "https://evil.example.com"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("受保护端点的预检不是 401（由 CORS 层先处理）")
    void preflightOnProtectedEndpointIsNotUnauthorized() throws Exception {
        mockMvc.perform(options("/api/devices")
                        .header(HttpHeaders.ORIGIN, CAPACITOR_ORIGIN)
                        .header(
                                HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD,
                                "GET")
                        .header(
                                HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS,
                                "authorization"))
                .andExpect(status().isOk());
    }

    // ------------------------------------------------------------------
    // 真实 HTTP 层验证：内嵌 Tomcat + TestRestTemplate
    // MockMvc 不经过真实网络与真实 CORS 响应头，这里再跑一遍关键路径。
    // ------------------------------------------------------------------

    @Test
    @DisplayName("真实 HTTP：未登录 GET /api/health 返回 200")
    void realHttpHealthIsPublic() {
        ResponseEntity<String> response =
                restTemplate.getForEntity("/api/health", String.class);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody()).contains("\"status\":\"UP\"");
    }

    @Test
    @DisplayName("真实 HTTP：/api/health/ 与 /api/public/health 都不是 401")
    void realHttpHealthAliasesArePublic() {
        assertThat(restTemplate.getForEntity("/api/health/", String.class)
                .getStatusCode().value()).isEqualTo(200);
        assertThat(restTemplate.getForEntity("/api/public/health", String.class)
                .getStatusCode().value()).isEqualTo(200);
    }

    @Test
    @DisplayName("真实 HTTP：Capacitor Origin 收到回显的 CORS 响应头")
    void realHttpCapacitorOriginIsAllowed() {
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.ORIGIN, CAPACITOR_ORIGIN);

        ResponseEntity<String> response = restTemplate.exchange(
                "/api/health",
                HttpMethod.GET,
                new HttpEntity<>(headers),
                String.class);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getHeaders()
                .getFirst(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN))
                .isEqualTo(CAPACITOR_ORIGIN);
        assertThat(response.getHeaders()
                .getFirst(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN))
                .isNotEqualTo("*");
    }

    @Test
    @DisplayName("真实 HTTP：Capacitor Origin 的 OPTIONS 预检返回 200")
    void realHttpCapacitorPreflightIsAllowed() {
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.ORIGIN, CAPACITOR_ORIGIN);
        headers.set(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST");
        headers.set(
                HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS,
                "authorization,content-type");

        ResponseEntity<String> response = restTemplate.exchange(
                "/api/auth/login",
                HttpMethod.OPTIONS,
                new HttpEntity<>(headers),
                String.class);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getHeaders()
                .getFirst(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN))
                .isEqualTo(CAPACITOR_ORIGIN);
        assertThat(response.getHeaders()
                .getFirst(HttpHeaders.ACCESS_CONTROL_ALLOW_HEADERS))
                .containsIgnoringCase("authorization");
    }

    @Test
    @DisplayName("真实 HTTP：未知 Origin 被 CORS 拒绝（403）")
    void realHttpUnknownOriginIsRejected() {
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.ORIGIN, "https://evil.example.com");

        ResponseEntity<String> response = restTemplate.exchange(
                "/api/health",
                HttpMethod.GET,
                new HttpEntity<>(headers),
                String.class);

        assertThat(response.getStatusCode().value()).isEqualTo(403);
    }
}
