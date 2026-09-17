package com.absolutezero.usbrelaycloud.vo;

import com.absolutezero.usbrelaycloud.common.enums.CommandStatus;
import com.absolutezero.usbrelaycloud.common.enums.RelayStateValue;
import com.absolutezero.usbrelaycloud.entity.RelayStateEntity;

import java.time.Instant;

public record RelayStateResponse(
        String deviceId,
        int channel,
        RelayStateValue commandedState,
        CommandStatus commandStatus,
        RelayStateValue hardwareState,
        String lastEventId,
        Long lastEventSequence,
        Instant updatedAt
) {

    public static RelayStateResponse from(RelayStateEntity entity) {
        return new RelayStateResponse(
                entity.getDeviceId(),
                entity.getChannel(),
                entity.getCommandedState(),
                entity.getCommandStatus(),
                entity.getHardwareState(),
                entity.getLastEventId(),
                entity.getLastEventSequence(),
                entity.getUpdatedAt()
        );
    }
}
