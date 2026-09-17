package com.absolutezero.usbrelaycloud.service.model;

import com.absolutezero.usbrelaycloud.common.enums.OnlineStatus;
import com.absolutezero.usbrelaycloud.entity.DeviceEntity;
import com.absolutezero.usbrelaycloud.entity.RelayStateEntity;

import java.util.List;

public record HeartbeatPersistenceResult(
        DeviceEntity device,
        List<RelayStateEntity> states,
        OnlineStatus previousOnlineStatus
) {
}
