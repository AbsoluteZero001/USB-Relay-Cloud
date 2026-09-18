package com.absolutezero.usbrelaycloud.service;

import com.absolutezero.usbrelaycloud.common.enums.CommandStatus;
import com.absolutezero.usbrelaycloud.dto.RelayEventCreateRequest;
import com.absolutezero.usbrelaycloud.entity.RelayEventEntity;
import com.absolutezero.usbrelaycloud.mapper.DeviceMapper;
import com.absolutezero.usbrelaycloud.mapper.RelayEventMapper;
import com.absolutezero.usbrelaycloud.mapper.RelayStateMapper;
import com.absolutezero.usbrelaycloud.service.model.EventPersistenceResult;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;

@Service
public class RelayEventPersistenceService {

    private final DeviceMapper deviceMapper;
    private final RelayEventMapper relayEventMapper;
    private final RelayStateMapper relayStateMapper;
    private final Clock clock;

    public RelayEventPersistenceService(
            DeviceMapper deviceMapper,
            RelayEventMapper relayEventMapper,
            RelayStateMapper relayStateMapper,
            Clock clock
    ) {
        this.deviceMapper = deviceMapper;
        this.relayEventMapper = relayEventMapper;
        this.relayStateMapper = relayStateMapper;
        this.clock = clock;
    }

    /**
     * The device row lock serializes concurrent uploads for the same device.
     * The unique event_id plus INSERT IGNORE makes retries safe.
     */
    @Transactional
    public EventPersistenceResult recordEvent(
            String deviceId,
            RelayEventCreateRequest request
    ) {
        Instant now = clock.instant();
        deviceMapper.upsertActiveDevice(
                deviceId,
                deviceId,
                "USB_RELAY",
                now
        );
        deviceMapper.selectByDeviceIdForUpdate(deviceId);

        RelayEventEntity existing =
                relayEventMapper.selectByEventId(request.eventId());
        if (existing != null) {
            return new EventPersistenceResult(existing, false);
        }

        RelayEventEntity event = new RelayEventEntity();
        event.setEventId(request.eventId());
        event.setDeviceId(deviceId);
        event.setChannel(request.channel());
        event.setAction(request.action());
        event.setPreviousState(request.previousState());
        event.setCurrentState(request.currentState());
        event.setCommandStatus(request.commandStatus());
        event.setSource(request.source());
        event.setClientId(request.clientId());
        event.setCreatedAt(now);

        int inserted = relayEventMapper.insertIgnore(event);
        if (inserted == 0) {
            RelayEventEntity duplicate =
                    relayEventMapper.selectByEventId(request.eventId());
            return new EventPersistenceResult(duplicate, false);
        }

        RelayEventEntity persisted =
                relayEventMapper.selectByEventId(request.eventId());
        // 仅 commandStatus = SUCCESS 才更新 relay_state；
        // FAILED 事件不污染设备状态（spec §19，hardwareState 在无硬件
        // 回读前必须保持 UNKNOWN）。
        if (request.commandStatus() == CommandStatus.SUCCESS) {
            relayStateMapper.upsertLastCommand(
                    deviceId,
                    request.channel(),
                    request.currentState(),
                    request.commandStatus(),
                    request.eventId(),
                    persisted.getId(),
                    now
            );
        }
        return new EventPersistenceResult(persisted, true);
    }
}
