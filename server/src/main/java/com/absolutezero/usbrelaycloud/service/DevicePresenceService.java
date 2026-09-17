package com.absolutezero.usbrelaycloud.service;

import com.absolutezero.usbrelaycloud.config.PresenceProperties;
import com.absolutezero.usbrelaycloud.entity.DeviceEntity;
import com.absolutezero.usbrelaycloud.mapper.DeviceMapper;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.util.List;

@Service
public class DevicePresenceService {

    private static final int BATCH_SIZE = 100;

    private final DeviceMapper deviceMapper;
    private final DevicePersistenceService persistenceService;
    private final DeviceBroadcastService broadcastService;
    private final PresenceProperties properties;
    private final Clock clock;

    public DevicePresenceService(
            DeviceMapper deviceMapper,
            DevicePersistenceService persistenceService,
            DeviceBroadcastService broadcastService,
            PresenceProperties properties,
            Clock clock
    ) {
        this.deviceMapper = deviceMapper;
        this.persistenceService = persistenceService;
        this.broadcastService = broadcastService;
        this.properties = properties;
        this.clock = clock;
    }

    @Scheduled(fixedDelayString = "${usb-relay.presence.scan-interval:30s}")
    public void markStaleDevicesOffline() {
        Instant now = clock.instant();
        Instant threshold = now.minus(properties.offlineAfter());
        List<DeviceEntity> stale =
                deviceMapper.selectStaleOnlineDevices(threshold, BATCH_SIZE);
        for (DeviceEntity device : stale) {
            if (persistenceService.markOffline(device.getDeviceId(), now)) {
                device.setOnlineStatus(
                        com.absolutezero.usbrelaycloud.common.enums
                                .OnlineStatus.OFFLINE
                );
                device.setUpdatedAt(now);
                broadcastService.broadcastDeviceStatus(device);
            }
        }
    }
}
