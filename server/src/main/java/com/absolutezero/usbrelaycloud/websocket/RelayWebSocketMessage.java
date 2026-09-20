package com.absolutezero.usbrelaycloud.websocket;

import com.absolutezero.usbrelaycloud.common.enums.*;
import com.absolutezero.usbrelaycloud.entity.DeviceEntity;
import com.absolutezero.usbrelaycloud.entity.HardwareEventEntity;
import com.absolutezero.usbrelaycloud.entity.RelayEventEntity;

import java.math.BigDecimal;
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
        String message,
        // 硬件生命周期事件专用字段（HARDWARE_EVENT 类型）
        HardwareEventType hardwareEventType,
        String hardwareProfileName,
        String hardwareSerialDevice,
        String hardwareVendorId,
        String hardwareProductId,
        Integer hardwareBaudRate,
        Integer hardwareDataBits,
        BigDecimal hardwareStopBits,
        String hardwareParity,
        String hardwareErrorCode,
        String hardwareErrorMessage
) {

    public static RelayWebSocketMessage connected(
            long afterSequence,
            Instant timestamp
    ) {
        return new RelayWebSocketMessage(
                "CONNECTED",
                afterSequence,
                null, null, null, null, null, null, null,
                null, null, null, null, null, null,
                timestamp,
                "websocket connected",
                null, null, null, null, null, null, null, null, null, null, null
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
                null,
                null, null, null, null, null, null, null, null, null, null, null
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
                null, null, null, null, null, null, null, null, null,
                device.getOnlineStatus(),
                device.getUpdatedAt(),
                null,
                null, null, null, null, null, null, null, null, null, null, null
        );
    }

    public static RelayWebSocketMessage syncComplete(
            long latestSequence,
            int replayedEvents
    ) {
        return new RelayWebSocketMessage(
                "SYNC_COMPLETE",
                latestSequence,
                null, null, null, null, null, null, null,
                null, null, null, null, null, null,
                Instant.now(),
                "replayed " + replayedEvents + " event(s)",
                null, null, null, null, null, null, null, null, null, null, null
        );
    }

    public static RelayWebSocketMessage authenticated(String username) {
        return new RelayWebSocketMessage(
                "AUTHENTICATED",
                null, null, null, null, null, null, null,
                null, null, null, null, null, null, null,
                Instant.now(),
                "authenticated as " + username,
                null, null, null, null, null, null, null, null, null, null, null
        );
    }

    public static RelayWebSocketMessage authFailed(String reason) {
        return new RelayWebSocketMessage(
                "AUTH_FAILED",
                null, null, null, null, null, null, null,
                null, null, null, null, null, null, null,
                Instant.now(),
                reason,
                null, null, null, null, null, null, null, null, null, null, null
        );
    }

    public static RelayWebSocketMessage error(String message) {
        return new RelayWebSocketMessage(
                "ERROR",
                null, null, null, null, null, null, null,
                null, null, null, null, null, null, null,
                Instant.now(),
                message,
                null, null, null, null, null, null, null, null, null, null, null
        );
    }

    /**
     * 硬件生命周期事件广播（USB 插入 / 连接 / 断开 / 拔出 / 失败等）。
     * 独立于继电器 ON/OFF 事件，不伪造继电器状态。
     */
    public static RelayWebSocketMessage hardwareEvent(
            HardwareEventEntity event
    ) {
        return new RelayWebSocketMessage(
                "HARDWARE_EVENT",
                event.getId(),
                event.getEventId(),
                event.getDeviceId(),
                null,
                event.getChannel(),
                null, null, null, null, null, null,
                event.getSource(),
                event.getClientId(),
                null,
                event.getCreatedAt(),
                null,
                event.getEventType(),
                event.getProfileName(),
                event.getSerialDevice(),
                event.getVendorId(),
                event.getProductId(),
                event.getBaudRate(),
                event.getDataBits(),
                event.getStopBits(),
                event.getParity(),
                event.getErrorCode(),
                event.getErrorMessage()
        );
    }
}
