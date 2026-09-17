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
}
