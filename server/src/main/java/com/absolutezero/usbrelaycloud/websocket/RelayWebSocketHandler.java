package com.absolutezero.usbrelaycloud.websocket;

import com.absolutezero.usbrelaycloud.common.enums.GlobalRole;
import com.absolutezero.usbrelaycloud.entity.DeviceEntity;
import com.absolutezero.usbrelaycloud.entity.HardwareEventEntity;
import com.absolutezero.usbrelaycloud.entity.RelayEventEntity;
import com.absolutezero.usbrelaycloud.mapper.DeviceUserMapper;
import com.absolutezero.usbrelaycloud.mapper.RelayEventMapper;
import com.absolutezero.usbrelaycloud.security.AuthenticatedUser;
import com.absolutezero.usbrelaycloud.security.JwtService;
import com.absolutezero.usbrelaycloud.service.DeviceBroadcastService;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.JwtException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.web.util.UriComponentsBuilder;

import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/**
 * Phase 6：WebSocket 握手后强制 AUTH 帧认证。
 * <p>
 * 协议：
 * 1. 客户端连接 /ws/relay?afterSequence=N
 * 2. 服务端发送 CONNECTED 帧（不含任何业务数据）
 * 3. 客户端 5s 内发送 {"type":"AUTH","token":"&lt;jwt&gt;"}
 * 4. 验证通过 → 服务端发送 AUTHENTICATED → gap replay → SYNC_COMPLETE
 * 验证失败 → AUTH_FAILED 并关闭连接
 * 5. 5s 内未发送 AUTH → ERROR "authentication timeout" 并关闭
 * <p>
 * 广播过滤：ADMIN 全量；非 ADMIN 仅推其 device_user 授权的设备事件。
 * 支持一个 user 多 session（每个 session 独立认证）。
 */
@Component
public class RelayWebSocketHandler extends TextWebSocketHandler
        implements DeviceBroadcastService {

    private static final Logger log =
            LoggerFactory.getLogger(RelayWebSocketHandler.class);
    private static final int BACKFILL_LIMIT = 1_000;
    private static final int SEND_TIME_LIMIT_MS = 5_000;
    private static final int BUFFER_SIZE_LIMIT = 64 * 1024;
    private static final long AUTH_TIMEOUT_SECONDS = 5L;
    private static final CloseStatus NOT_AUTHENTICATED =
            CloseStatus.POLICY_VIOLATION.withReason("not authenticated");
    private static final CloseStatus AUTH_FAILED_CLOSE =
            CloseStatus.POLICY_VIOLATION.withReason("auth failed");
    private static final CloseStatus PROTOCOL_ERROR_CLOSE =
            CloseStatus.PROTOCOL_ERROR;

    private final ObjectMapper objectMapper;
    private final RelayEventMapper relayEventMapper;
    private final JwtService jwtService;
    private final DeviceUserMapper deviceUserMapper;
    private final ScheduledExecutorService authScheduler;

    private final Map<String, WebSocketSession> sessions =
            new ConcurrentHashMap<>();
    /**
     * 每个 session 对应的已认证用户；null 表示尚未认证。
     */
    private final Map<String, AuthenticatedUser> sessionUsers =
            new ConcurrentHashMap<>();
    /**
     * 非 ADMIN session 可访问的 deviceId 集合；ADMIN 不在此 map 中。
     */
    private final Map<String, Set<String>> sessionDeviceIds =
            new ConcurrentHashMap<>();
    /**
     * 每个 session 的 AUTH 超时任务。
     */
    private final Map<String, ScheduledFuture<?>> sessionTimeouts =
            new ConcurrentHashMap<>();

    public RelayWebSocketHandler(
            ObjectMapper objectMapper,
            RelayEventMapper relayEventMapper,
            JwtService jwtService,
            DeviceUserMapper deviceUserMapper,
            ScheduledExecutorService authScheduler
    ) {
        this.objectMapper = objectMapper;
        this.relayEventMapper = relayEventMapper;
        this.jwtService = jwtService;
        this.deviceUserMapper = deviceUserMapper;
        this.authScheduler = authScheduler;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession rawSession)
            throws Exception {
        WebSocketSession session = new ConcurrentWebSocketSessionDecorator(
                rawSession,
                SEND_TIME_LIMIT_MS,
                BUFFER_SIZE_LIMIT
        );
        long afterSequence = resolveAfterSequence(rawSession);
        sessions.put(session.getId(), session);

        send(
                session,
                RelayWebSocketMessage.connected(
                        afterSequence,
                        Instant.now()
                )
        );

        scheduleAuthTimeout(session);
    }

    @Override
    protected void handleTextMessage(
            WebSocketSession session,
            TextMessage message
    ) {
        String payload = message.getPayload();
        AuthenticatedUser existing = sessionUsers.get(session.getId());
        if (existing != null) {
            // 已认证后不再接受任何客户端业务帧（V1 无 client→server 命令）
            return;
        }

        AuthFrame frame;
        try {
            frame = objectMapper.readValue(payload, AuthFrame.class);
        } catch (IOException e) {
            sendQuietly(session,
                    RelayWebSocketMessage.error("无法解析 AUTH 帧"));
            closeQuietly(session, PROTOCOL_ERROR_CLOSE);
            return;
        }
        if (frame == null || !"AUTH".equals(frame.type())
                || frame.token() == null || frame.token().isBlank()) {
            sendQuietly(session,
                    RelayWebSocketMessage.error("期望 AUTH 帧"));
            closeQuietly(session, PROTOCOL_ERROR_CLOSE);
            return;
        }

        AuthenticatedUser user;
        try {
            user = jwtService.parse(frame.token());
        } catch (JwtException | IllegalArgumentException e) {
            log.debug("WS AUTH rejected: {}", e.getMessage());
            sendQuietly(session,
                    RelayWebSocketMessage.authFailed("JWT 无效或已过期"));
            closeQuietly(session, AUTH_FAILED_CLOSE);
            return;
        }
        if (user.username() == null || user.globalRole() == null) {
            sendQuietly(session,
                    RelayWebSocketMessage.authFailed("JWT 缺少必要 claims"));
            closeQuietly(session, AUTH_FAILED_CLOSE);
            return;
        }

        cancelAuthTimeout(session.getId());
        sessionUsers.put(session.getId(), user);
        if (!GlobalRole.ADMIN.name().equals(user.globalRole())) {
            List<String> deviceIds =
                    deviceUserMapper.selectDeviceIdsByUser(user.userId());
            sessionDeviceIds.put(
                    session.getId(),
                    deviceIds == null ? Set.of() : Set.copyOf(deviceIds)
            );
        }

        sendQuietly(session,
                RelayWebSocketMessage.authenticated(user.username()));

        long afterSequence = resolveAfterSequence(session);
        replayGapForSession(session, user, afterSequence);
    }

    @Override
    public void afterConnectionClosed(
            WebSocketSession session,
            CloseStatus status
    ) {
        cleanupSession(session.getId());
    }

    @Override
    public void handleTransportError(
            WebSocketSession session,
            Throwable exception
    ) {
        cleanupSession(session.getId());
        try {
            session.close(CloseStatus.SERVER_ERROR);
        } catch (IOException ignored) {
            // The socket is already gone.
        }
    }

    @Override
    public void broadcastRelayEvent(RelayEventEntity event) {
        RelayWebSocketMessage message =
                RelayWebSocketMessage.relayStateChanged(event);
        sessions.values().forEach(session -> {
            if (canReceive(session.getId(), event.getDeviceId())) {
                sendQuietly(session, message);
            }
        });
    }

    @Override
    public void broadcastDeviceStatus(DeviceEntity device) {
        RelayWebSocketMessage message =
                RelayWebSocketMessage.deviceStatusChanged(device);
        sessions.values().forEach(session -> {
            if (canReceive(session.getId(), device.getDeviceId())) {
                sendQuietly(session, message);
            }
        });
    }

    @Override
    public void broadcastHardwareEvent(HardwareEventEntity event) {
        RelayWebSocketMessage message =
                RelayWebSocketMessage.hardwareEvent(event);
        sessions.values().forEach(session -> {
            if (canReceive(session.getId(), event.getDeviceId())) {
                sendQuietly(session, message);
            }
        });
    }

    int sessionCount() {
        return sessions.size();
    }

    /**
     * 仅用于测试：返回已认证 session 数量。
     */
    int authenticatedSessionCount() {
        return sessionUsers.size();
    }

    private void scheduleAuthTimeout(WebSocketSession session) {
        String id = session.getId();
        ScheduledFuture<?> future = authScheduler.schedule(
                () -> {
                    if (sessionUsers.get(id) == null) {
                        sendQuietly(session,
                                RelayWebSocketMessage.error(
                                        "authentication timeout"));
                        closeQuietly(session, NOT_AUTHENTICATED);
                    }
                },
                AUTH_TIMEOUT_SECONDS,
                TimeUnit.SECONDS
        );
        sessionTimeouts.put(id, future);
    }

    private void cancelAuthTimeout(String sessionId) {
        ScheduledFuture<?> future = sessionTimeouts.remove(sessionId);
        if (future != null) {
            future.cancel(false);
        }
    }

    private void cleanupSession(String sessionId) {
        sessions.remove(sessionId);
        sessionUsers.remove(sessionId);
        sessionDeviceIds.remove(sessionId);
        cancelAuthTimeout(sessionId);
    }

    /**
     * 鉴权 + 设备权限过滤后，对当前 session 做增量 replay。
     * ADMIN 拉全量；非 ADMIN 仅拉其 device_user 授权范围内的事件。
     */
    private void replayGapForSession(
            WebSocketSession session,
            AuthenticatedUser user,
            long afterSequence
    ) {
        List<RelayEventEntity> replay;
        if (GlobalRole.ADMIN.name().equals(user.globalRole())) {
            replay = relayEventMapper.selectAfterSequence(
                    afterSequence,
                    BACKFILL_LIMIT
            );
        } else {
            Set<String> deviceIds = sessionDeviceIds.get(session.getId());
            if (deviceIds == null || deviceIds.isEmpty()) {
                replay = List.of();
            } else {
                replay = relayEventMapper.selectAfterSequenceForDevices(
                        afterSequence,
                        deviceIds,
                        BACKFILL_LIMIT
                );
            }
        }
        long latestSequence = afterSequence;
        for (RelayEventEntity event : replay) {
            sendQuietly(session,
                    RelayWebSocketMessage.relayStateChanged(event));
            latestSequence = Math.max(latestSequence, event.getId());
        }
        sendQuietly(session,
                RelayWebSocketMessage.syncComplete(
                        latestSequence,
                        replay.size()
                ));
    }

    /**
     * 当前 session 是否可以接收给定 deviceId 的事件广播。
     */
    private boolean canReceive(String sessionId, String deviceId) {
        AuthenticatedUser user = sessionUsers.get(sessionId);
        if (user == null) {
            // 未认证 session 不发任何业务数据
            return false;
        }
        if (GlobalRole.ADMIN.name().equals(user.globalRole())) {
            return true;
        }
        Set<String> deviceIds = sessionDeviceIds.get(sessionId);
        return deviceIds != null && deviceIds.contains(deviceId);
    }

    private long resolveAfterSequence(WebSocketSession session) {
        String rawUri = session.getUri() == null
                ? ""
                : session.getUri().toString();
        String value = UriComponentsBuilder.fromUriString(rawUri)
                .build()
                .getQueryParams()
                .getFirst("afterSequence");
        if (value == null || value.isBlank()) {
            return 0L;
        }
        try {
            return Math.max(Long.parseLong(value), 0L);
        } catch (NumberFormatException ignored) {
            return 0L;
        }
    }

    private void sendQuietly(
            WebSocketSession session,
            RelayWebSocketMessage message
    ) {
        try {
            send(session, message);
        } catch (IOException exception) {
            cleanupSession(session.getId());
        }
    }

    private void send(
            WebSocketSession session,
            RelayWebSocketMessage message
    ) throws IOException {
        session.sendMessage(
                new TextMessage(objectMapper.writeValueAsString(message))
        );
    }

    private void closeQuietly(WebSocketSession session, CloseStatus status) {
        try {
            session.close(status);
        } catch (IOException ignored) {
            // ignore
        }
        cleanupSession(session.getId());
    }

    /**
     * 客户端→服务端的 AUTH 帧载体。
     */
    private record AuthFrame(String type, String token) {
    }
}
