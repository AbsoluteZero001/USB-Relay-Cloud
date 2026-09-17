package com.absolutezero.usbrelaycloud.service.model;

import com.absolutezero.usbrelaycloud.entity.RelayEventEntity;

public record EventPersistenceResult(
        RelayEventEntity event,
        boolean created
) {
}
