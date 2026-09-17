package com.absolutezero.usbrelaycloud.service;

import com.absolutezero.usbrelaycloud.common.enums.OnlineStatus;
import com.absolutezero.usbrelaycloud.dto.HeartbeatRequest;
import com.absolutezero.usbrelaycloud.entity.DeviceEntity;
import com.absolutezero.usbrelaycloud.mapper.DeviceMapper;
import com.absolutezero.usbrelaycloud.mapper.RelayStateMapper;
import com.absolutezero.usbrelaycloud.service.model.HeartbeatPersistenceResult;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;

@Service
public class DevicePersistenceService {

    private final DeviceMapper deviceMapper;
    private final RelayStateMapper relayStateMapper;
    private final Clock clock;

    public DevicePersistenceService(
            DeviceMapper deviceMapper,
            RelayStateMapper relayStateMapper,
            Clock clock
    ) {
        this.deviceMapper = deviceMapper;
        this.relayStateMapper = relayStateMapper;
        this.clock = clock;
    }

    @Transactional
    public HeartbeatPersistenceResult heartbeat(
            String deviceId,
            HeartbeatRequest request
    ) {
        Instant now = clock.instant();
        DeviceEntity previous = deviceMapper.selectByDeviceIdForUpdate(deviceId);
        OnlineStatus previousStatus =
                previous == null ? null : previous.getOnlineStatus();

        deviceMapper.upsertActiveDevice(
                deviceId,
                request.deviceName(),
                request.deviceType(),
                now
        );
        DeviceEntity current = deviceMapper.selectByDeviceIdForUpdate(deviceId);
        return new HeartbeatPersistenceResult(
                current,
                relayStateMapper.selectByDeviceId(deviceId),
                previousStatus
        );
    }

    @Transactional
    public boolean markOffline(String deviceId, Instant updatedAt) {
        return deviceMapper.markOffline(deviceId, updatedAt) > 0;
    }
}
