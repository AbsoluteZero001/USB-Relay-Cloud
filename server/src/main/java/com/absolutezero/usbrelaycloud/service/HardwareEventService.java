package com.absolutezero.usbrelaycloud.service;

import com.absolutezero.usbrelaycloud.common.PageResponse;
import com.absolutezero.usbrelaycloud.dto.HardwareEventCreateRequest;
import com.absolutezero.usbrelaycloud.entity.HardwareEventEntity;
import com.absolutezero.usbrelaycloud.mapper.DeviceMapper;
import com.absolutezero.usbrelaycloud.mapper.HardwareEventMapper;
import com.absolutezero.usbrelaycloud.service.model.HardwareEventPersistenceResult;
import com.absolutezero.usbrelaycloud.vo.HardwareEventResponse;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;

@Service
public class HardwareEventService {

    private static final int DEFAULT_PAGE_SIZE = 20;
    private static final int MAX_PAGE_SIZE = 100;

    private final DeviceMapper deviceMapper;
    private final HardwareEventMapper hardwareEventMapper;
    private final DeviceBroadcastService broadcastService;
    private final Clock clock;

    public HardwareEventService(
            DeviceMapper deviceMapper,
            HardwareEventMapper hardwareEventMapper,
            DeviceBroadcastService broadcastService,
            Clock clock
    ) {
        this.deviceMapper = deviceMapper;
        this.hardwareEventMapper = hardwareEventMapper;
        this.broadcastService = broadcastService;
        this.clock = clock;
    }

    public HardwareEventResponse record(
            String deviceId,
            HardwareEventCreateRequest request
    ) {
        HardwareEventPersistenceResult result = recordEvent(deviceId, request);
        if (result.created()) {
            broadcastService.broadcastHardwareEvent(result.event());
        }
        return HardwareEventResponse.from(result.event(), !result.created());
    }

    @Transactional
    public HardwareEventPersistenceResult recordEvent(
            String deviceId,
            HardwareEventCreateRequest request
    ) {
        Instant now = clock.instant();
        // 硬件事件也需要设备行存在（保证外键与权限），但不改变 online_status。
        deviceMapper.upsertActiveDevice(deviceId, deviceId, "USB_RELAY", now);
        deviceMapper.selectByDeviceIdForUpdate(deviceId);

        HardwareEventEntity existing =
                hardwareEventMapper.selectByEventId(request.eventId());
        if (existing != null) {
            return new HardwareEventPersistenceResult(existing, false);
        }

        HardwareEventEntity event = new HardwareEventEntity();
        event.setEventId(request.eventId());
        event.setDeviceId(deviceId);
        event.setEventType(request.eventType());
        event.setSource(request.source());
        event.setClientId(request.clientId());
        event.setProfileName(request.profileName());
        event.setSerialDevice(request.serialDevice());
        event.setVendorId(request.vendorId());
        event.setProductId(request.productId());
        event.setBaudRate(request.baudRate());
        event.setDataBits(request.dataBits());
        event.setStopBits(request.stopBits());
        event.setParity(request.parity());
        event.setChannel(request.channel());
        event.setActorUserId(request.actorUserId());
        event.setActorUsername(request.actorUsername());
        event.setActorClientId(request.actorClientId());
        event.setExecutorClientId(request.executorClientId());
        event.setErrorCode(request.errorCode());
        event.setErrorMessage(request.errorMessage());
        event.setCreatedAt(now);

        int inserted = hardwareEventMapper.insertIgnore(event);
        if (inserted == 0) {
            HardwareEventEntity duplicate =
                    hardwareEventMapper.selectByEventId(request.eventId());
            return new HardwareEventPersistenceResult(duplicate, false);
        }

        HardwareEventEntity persisted =
                hardwareEventMapper.selectByEventId(request.eventId());
        return new HardwareEventPersistenceResult(persisted, true);
    }

    public PageResponse<HardwareEventResponse> list(
            String deviceId,
            int page,
            int pageSize,
            Instant from,
            Instant to
    ) {
        int normalizedPage = Math.max(page, 1);
        int normalizedPageSize = normalizePageSize(pageSize);
        Page<HardwareEventEntity> sourcePage =
                new Page<>(normalizedPage, normalizedPageSize);
        Page<HardwareEventEntity> result = hardwareEventMapper.selectEventPage(
                sourcePage,
                deviceId,
                from,
                to
        );
        return PageResponse.from(
                result,
                entity -> HardwareEventResponse.from(entity, false)
        );
    }

    private int normalizePageSize(int pageSize) {
        if (pageSize <= 0) {
            return DEFAULT_PAGE_SIZE;
        }
        return Math.min(pageSize, MAX_PAGE_SIZE);
    }
}
