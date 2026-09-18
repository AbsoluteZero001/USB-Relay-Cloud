package com.absolutezero.usbrelaycloud.websocket;

import com.absolutezero.usbrelaycloud.common.enums.CommandStatus;
import com.absolutezero.usbrelaycloud.common.enums.EventSource;
import com.absolutezero.usbrelaycloud.common.enums.OnlineStatus;
import com.absolutezero.usbrelaycloud.common.enums.RelayAction;
import com.absolutezero.usbrelaycloud.common.enums.RelayStateValue;
import com.absolutezero.usbrelaycloud.entity.DeviceEntity;
import com.absolutezero.usbrelaycloud.entity.RelayEventEntity;

import java.time.Instant;

public record RelayWebSocketMessage(
        String type,
        Long sequence,
        String eventId,
        String deviceId,
        String deviceName,
        Integer channel,
        RelayStateValue commandedState,
        CommandStatus commandStatus,
        RelayStateValue hardwareState,
        RelayStateValue previousState,
        RelayStateValue currentState,
        RelayAction action,
        EventSource source,
        String clientId,
        OnlineStatus onlineStatus,
        Instant timestamp,
        String message
) {

    public static RelayWebSocketMessage connected(
            long afterSequence,
            Instant timestamp
    ) {
        return new RelayWebSocketMessage(
                "CONNECTED",
                afterSequence,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                timestamp,
                "websocket connected"
        );
    }

    public static RelayWebSocketMessage relayStateChanged(
            RelayEventEntity event
    ) {
        return new RelayWebSocketMessage(
                "RELAY_STATE_CHANGED",
                event.getId(),
                event.getEventId(),
                event.getDeviceId(),
                null,
                event.getChannel(),
                event.getCurrentState(),
                event.getCommandStatus(),
                RelayStateValue.UNKNOWN,
                event.getPreviousState(),
                event.getCurrentState(),
                event.getAction(),
                event.getSource(),
                event.getClientId(),
                null,
                event.getCreatedAt(),
                null
        );
    }

    public static RelayWebSocketMessage deviceStatusChanged(
            DeviceEntity device
    ) {
        return new RelayWebSocketMessage(
                "DEVICE_STATUS_CHANGED",
                null,
                null,
                device.getDeviceId(),
                device.getDeviceName(),
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                device.getOnlineStatus(),
                device.getUpdatedAt(),
                null
        );
    }

    public static RelayWebSocketMessage syncComplete(
            long latestSequence,
            int replayedEvents
    ) {
        return new RelayWebSocketMessage(
                "SYNC_COMPLETE",
                latestSequence,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                Instant.now(),
                "replayed " + replayedEvents + " event(s)"
        );
    }

    /**
     * 客户端 AUTH 帧验证通过。message 携带用户名便于调试。
     */
    public static RelayWebSocketMessage authenticated(String username) {
        return new RelayWebSocketMessage(
                "AUTHENTICATED",
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                Instant.now(),
                "authenticated as " + username
        );
    }

    /**
     * 客户端 AUTH 帧验证失败。reason 为失败原因（中文 UI 文案）。
     */
    public static RelayWebSocketMessage authFailed(String reason) {
        return new RelayWebSocketMessage(
                "AUTH_FAILED",
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                Instant.now(),
                reason
        );
    }

    /**
     * 通用 ERROR 消息（如认证超时、协议错误）。
     */
    public static RelayWebSocketMessage error(String message) {
        return new RelayWebSocketMessage(
                "ERROR",
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                Instant.now(),
                message
        );
    }
}
