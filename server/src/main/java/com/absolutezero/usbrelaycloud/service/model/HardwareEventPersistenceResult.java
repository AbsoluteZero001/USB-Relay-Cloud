package com.absolutezero.usbrelaycloud.service.model;

import com.absolutezero.usbrelaycloud.entity.HardwareEventEntity;

public record HardwareEventPersistenceResult(
        HardwareEventEntity event,
        boolean created
) {
}
