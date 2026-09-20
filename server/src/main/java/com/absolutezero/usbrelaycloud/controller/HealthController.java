package com.absolutezero.usbrelaycloud.controller;

import com.absolutezero.usbrelaycloud.common.ApiResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 公开健康检查端点，供客户端在登录前测试服务器连通性。
 * <p>
 * 同时提供两个路径，避免运维/客户端使用不同 URL 时出现「一个 200、一个 401」：
 * <ul>
 *   <li>{@code GET /api/health}（正式路径）</li>
 *   <li>{@code GET /api/public/health}（公开别名）</li>
 * </ul>
 * 尾部斜杠变体也显式注册：Spring Security 6 不再自动匹配尾斜杠，
 * 未注册时 {@code /api/health/} 会掉进 anyRequest().authenticated() 返回 401。
 * <p>
 * 该端点不读取 Authorization 头，也不需要任何 token。
 */
@RestController
public class HealthController {

    @GetMapping({
            "/api/health",
            "/api/health/",
            "/api/public/health",
            "/api/public/health/",
    })
    public ApiResponse<Map<String, String>> health() {
        Map<String, String> payload = new LinkedHashMap<>();
        payload.put("status", "UP");
        payload.put("service", "usb-relay-cloud-server");
        payload.put("timestamp", Instant.now().toString());
        return ApiResponse.success(payload);
    }
}
