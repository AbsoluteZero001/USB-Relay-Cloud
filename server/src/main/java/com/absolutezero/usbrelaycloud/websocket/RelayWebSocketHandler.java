package com.absolutezero.usbrelaycloud.websocket;

import com.absolutezero.usbrelaycloud.entity.DeviceEntity;
import com.absolutezero.usbrelaycloud.entity.RelayEventEntity;
import com.absolutezero.usbrelaycloud.mapper.RelayEventMapper;
import com.absolutezero.usbrelaycloud.service.DeviceBroadcastService;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import java.util.concurrent.ConcurrentHashMap;

@Component
public class RelayWebSocketHandler extends TextWebSocketHandler
        implements DeviceBroadcastService {

    private static final int BACKFILL_LIMIT = 1_000;
    private static final int SEND_TIME_LIMIT_MS = 5_000;
    private static final int BUFFER_SIZE_LIMIT = 64 * 1024;

    private final ObjectMapper objectMapper;
    private final RelayEventMapper relayEventMapper;
    private final Map<String, WebSocketSession> sessions =
            new ConcurrentHashMap<>();

    public RelayWebSocketHandler(
            ObjectMapper objectMapper,
            RelayEventMapper relayEventMapper
    ) {
        this.objectMapper = objectMapper;
        this.relayEventMapper = relayEventMapper;
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

        List<RelayEventEntity> replay =
                relayEventMapper.selectAfterSequence(
                        afterSequence,
                        BACKFILL_LIMIT
                );
        long latestSequence = afterSequence;
        for (RelayEventEntity event : replay) {
            send(
                    session,
                    RelayWebSocketMessage.relayStateChanged(event)
            );
            latestSequence = Math.max(latestSequence, event.getId());
        }
        send(
                session,
                RelayWebSocketMessage.syncComplete(
                        latestSequence,
                        replay.size()
                )
        );
    }

    @Override
    protected void handleTextMessage(
            WebSocketSession session,
            TextMessage message
    ) {
        // Phase one has no client-to-server realtime commands.
    }

    @Override
    public void afterConnectionClosed(
            WebSocketSession session,
            CloseStatus status
    ) {
        sessions.remove(session.getId());
    }

    @Override
    public void handleTransportError(
            WebSocketSession session,
            Throwable exception
    ) {
        sessions.remove(session.getId());
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
        sessions.values().forEach(session -> sendQuietly(session, message));
    }

    @Override
    public void broadcastDeviceStatus(DeviceEntity device) {
        RelayWebSocketMessage message =
                RelayWebSocketMessage.deviceStatusChanged(device);
        sessions.values().forEach(session -> sendQuietly(session, message));
    }

    int sessionCount() {
        return sessions.size();
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
            sessions.remove(session.getId());
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
}
