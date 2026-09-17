package com.absolutezero.usbrelaycloud.vo;

import com.absolutezero.usbrelaycloud.common.enums.CommandStatus;
import com.absolutezero.usbrelaycloud.common.enums.EventSource;
import com.absolutezero.usbrelaycloud.common.enums.RelayAction;
import com.absolutezero.usbrelaycloud.common.enums.RelayStateValue;
import com.absolutezero.usbrelaycloud.entity.RelayEventEntity;

import java.time.Instant;

public record RelayEventResponse(
        long sequence,
        String eventId,
        String deviceId,
        int channel,
        RelayAction action,
        RelayStateValue previousState,
        RelayStateValue currentState,
        CommandStatus commandStatus,
        EventSource source,
        String clientId,
        RelayStateValue hardwareState,
        Instant createdAt,
        boolean idempotentReplay
) {

    public static RelayEventResponse from(
            RelayEventEntity entity,
            boolean idempotentReplay
    ) {
        return new RelayEventResponse(
                entity.getId(),
                entity.getEventId(),
                entity.getDeviceId(),
                entity.getChannel(),
                entity.getAction(),
                entity.getPreviousState(),
                entity.getCurrentState(),
                entity.getCommandStatus(),
                entity.getSource(),
                entity.getClientId(),
                RelayStateValue.UNKNOWN,
                entity.getCreatedAt(),
                idempotentReplay
        );
    }
}
