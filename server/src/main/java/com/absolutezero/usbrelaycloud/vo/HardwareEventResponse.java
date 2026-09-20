package com.absolutezero.usbrelaycloud.vo;

import com.absolutezero.usbrelaycloud.common.enums.EventSource;
import com.absolutezero.usbrelaycloud.common.enums.HardwareEventType;
import com.absolutezero.usbrelaycloud.entity.HardwareEventEntity;

import java.math.BigDecimal;
import java.time.Instant;

public record HardwareEventResponse(
        long sequence,
        String eventId,
        String deviceId,
        HardwareEventType eventType,
        EventSource source,
        String clientId,
        String profileName,
        String serialDevice,
        String vendorId,
        String productId,
        Integer baudRate,
        Integer dataBits,
        BigDecimal stopBits,
        String parity,
        Integer channel,
        Long actorUserId,
        String actorUsername,
        String actorClientId,
        String executorClientId,
        String errorCode,
        String errorMessage,
        Instant createdAt,
        boolean idempotentReplay
) {

    public static HardwareEventResponse from(
            HardwareEventEntity entity,
            boolean idempotentReplay
    ) {
        return new HardwareEventResponse(
                entity.getId(),
                entity.getEventId(),
                entity.getDeviceId(),
                entity.getEventType(),
                entity.getSource(),
                entity.getClientId(),
                entity.getProfileName(),
                entity.getSerialDevice(),
                entity.getVendorId(),
                entity.getProductId(),
                entity.getBaudRate(),
                entity.getDataBits(),
                entity.getStopBits(),
                entity.getParity(),
                entity.getChannel(),
                entity.getActorUserId(),
                entity.getActorUsername(),
                entity.getActorClientId(),
                entity.getExecutorClientId(),
                entity.getErrorCode(),
                entity.getErrorMessage(),
                entity.getCreatedAt(),
                idempotentReplay
        );
    }
}
