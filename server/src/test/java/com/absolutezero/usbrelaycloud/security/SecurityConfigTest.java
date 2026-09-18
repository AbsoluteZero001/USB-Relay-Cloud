package com.absolutezero.usbrelaycloud.security;

import com.absolutezero.usbrelaycloud.mapper.SysUserMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 集成测试 SecurityConfig + AuthController + JwtService +
 * BootstrapAdminInitializer，覆盖典型 401/200 流。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SecurityConfigTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private SysUserMapper sysUserMapper;

    @Test
    void healthEndpointIsPublic() throws Exception {
        mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }

    @Test
    void devicesEndpointRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/devices"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"))
                .andExpect(jsonPath("$.message").value("请先登录"));
    }

    @Test
    void devicesListWithAdminTokenReturnsOk() throws Exception {
        // Bootstrap admin 通过 JwtAuthenticationFilter 写入 SecurityContext，
        // CurrentUserResolver.require() 解析出 ADMIN，list() 全量返回（此处 DB
        // 尚无 device，所以应是空 PageResponse 200 OK）。
        String token = loginAsBootstrapAdmin();
        mockMvc.perform(get("/api/devices")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.records").exists());
    }

    @Test
    void deviceDetailForUnknownDeviceReturns404() throws Exception {
        String token = loginAsBootstrapAdmin();
        mockMvc.perform(get("/api/devices/unknown-device")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());
    }

    @Test
    void loginWithBootstrapAdminReturnsToken() throws Exception {
        assertThat(sysUserMapper.selectByUsername("test-admin"))
                .as("Bootstrap admin should be created at startup")
                .isNotNull();

        MvcResult result = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "username": "test-admin",
                                  "password": "test-pass-123"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.accessToken").isString())
                .andExpect(jsonPath("$.data.tokenType").value("Bearer"))
                .andExpect(jsonPath("$.data.expiresIn")
                        .value(3600))
                .andReturn();

        String body = result.getResponse().getContentAsString();
        String token = extract(body, "accessToken");

        mockMvc.perform(get("/api/auth/me")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.username")
                        .value("test-admin"))
                .andExpect(jsonPath("$.data.globalRole").value("ADMIN"));
    }

    @Test
    void loginWithWrongPasswordReturns401() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "username": "test-admin",
                                  "password": "definitely-wrong"
                                }
                                """))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code")
                        .value("INVALID_CREDENTIALS"))
                .andExpect(jsonPath("$.message")
                        .value("用户名或密码错误"));
    }

    @Test
    void loginWithBlankUsernameFailsValidation() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "username": "",
                                  "password": "x"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code")
                        .value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.data.username").exists());
    }

    @Test
    void meWithoutTokenReturns401() throws Exception {
        mockMvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    void meWithInvalidTokenReturns401() throws Exception {
        mockMvc.perform(get("/api/auth/me")
                        .header("Authorization", "Bearer not-a-real-jwt"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    /**
     * 从 MockMvc JSON 响应里取出 accessToken 字段值。
     * 不引入 JSON 库依赖，用字符串匹配即可（token 是无特殊字符的 JWT）。
     */
    private static String extract(String body, String field) {
        String key = "\"" + field + "\":\"";
        int start = body.indexOf(key);
        if (start < 0) {
            throw new AssertionError(
                    "field " + field + " not found in body: " + body
            );
        }
        start += key.length();
        int end = body.indexOf('"', start);
        if (end < 0) {
            throw new AssertionError(
                    "unterminated token in body: " + body
            );
        }
        return body.substring(start, end);
    }

    /**
     * 使用 Bootstrap admin 登录并返回 accessToken。
     */
    private String loginAsBootstrapAdmin() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "username": "test-admin",
                                  "password": "test-pass-123"
                                }
                                """))
                .andExpect(status().isOk())
                .andReturn();
        return extract(
                result.getResponse().getContentAsString(),
                "accessToken"
        );
    }
}
