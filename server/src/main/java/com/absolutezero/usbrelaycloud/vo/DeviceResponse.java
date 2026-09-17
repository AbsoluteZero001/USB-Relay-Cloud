package com.absolutezero.usbrelaycloud.vo;

import com.absolutezero.usbrelaycloud.common.enums.OnlineStatus;
import com.absolutezero.usbrelaycloud.entity.DeviceEntity;

import java.time.Instant;

public record DeviceResponse(
        Long id,
        String deviceId,
        String deviceName,
        String deviceType,
        OnlineStatus onlineStatus,
        Instant lastSeen,
        Instant createdAt,
        Instant updatedAt
) {

    public static DeviceResponse from(DeviceEntity entity) {
        return new DeviceResponse(
                entity.getId(),
                entity.getDeviceId(),
                entity.getDeviceName(),
                entity.getDeviceType(),
                entity.getOnlineStatus(),
                entity.getLastSeen(),
                entity.getCreatedAt(),
                entity.getUpdatedAt()
        );
    }
}
