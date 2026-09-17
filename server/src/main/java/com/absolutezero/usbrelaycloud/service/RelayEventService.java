package com.absolutezero.usbrelaycloud.service;

import com.absolutezero.usbrelaycloud.common.PageResponse;
import com.absolutezero.usbrelaycloud.common.enums.EventSource;
import com.absolutezero.usbrelaycloud.common.enums.RelayAction;
import com.absolutezero.usbrelaycloud.common.enums.RelayStateValue;
import com.absolutezero.usbrelaycloud.dto.RelayEventCreateRequest;
import com.absolutezero.usbrelaycloud.entity.RelayEventEntity;
import com.absolutezero.usbrelaycloud.exception.BusinessException;
import com.absolutezero.usbrelaycloud.mapper.RelayEventMapper;
import com.absolutezero.usbrelaycloud.service.model.EventPersistenceResult;
import com.absolutezero.usbrelaycloud.vo.RelayEventResponse;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;

@Service
public class RelayEventService {

    private static final int DEFAULT_PAGE_SIZE = 20;
    private static final int MAX_PAGE_SIZE = 100;
    private static final int MAX_SYNC_EVENTS = 1_000;

    private final RelayEventPersistenceService persistenceService;
    private final RelayEventMapper relayEventMapper;
    private final DeviceBroadcastService broadcastService;

    public RelayEventService(
            RelayEventPersistenceService persistenceService,
            RelayEventMapper relayEventMapper,
            DeviceBroadcastService broadcastService
    ) {
        this.persistenceService = persistenceService;
        this.relayEventMapper = relayEventMapper;
        this.broadcastService = broadcastService;
    }

    public RelayEventResponse record(
            String deviceId,
            RelayEventCreateRequest request
    ) {
        validateActionAndState(request);

        EventPersistenceResult result =
                persistenceService.recordEvent(deviceId, request);
        if (result.created()) {
            // recordEvent has returned, so the transaction is committed.
            broadcastService.broadcastRelayEvent(result.event());
        }
        return RelayEventResponse.from(
                result.event(),
                !result.created()
        );
    }

    public PageResponse<RelayEventResponse> list(
            String deviceId,
            int page,
            int pageSize,
            Long afterSequence,
            Instant from,
            Instant to,
            RelayAction action,
            EventSource source
    ) {
        int normalizedPage = Math.max(page, 1);
        int normalizedPageSize = normalizePageSize(pageSize);
        Page<RelayEventEntity> sourcePage =
                new Page<>(normalizedPage, normalizedPageSize);
        Page<RelayEventEntity> result = relayEventMapper.selectEventPage(
                sourcePage,
                deviceId,
                afterSequence,
                from,
                to,
                action,
                source
        );
        return PageResponse.from(
                result,
                entity -> RelayEventResponse.from(entity, false)
        );
    }

    public List<RelayEventEntity> findAfterSequence(
            long afterSequence,
            int limit
    ) {
        if (afterSequence < 0) {
            return List.of();
        }
        int safeLimit = Math.min(Math.max(limit, 1), MAX_SYNC_EVENTS);
        return relayEventMapper.selectAfterSequence(afterSequence, safeLimit);
    }

    private void validateActionAndState(RelayEventCreateRequest request) {
        boolean valid = switch (request.action()) {
            case ON -> request.currentState() == RelayStateValue.ON;
            case OFF -> request.currentState() == RelayStateValue.OFF;
        };
        if (!valid) {
            throw new BusinessException(
                    "INVALID_RELAY_EVENT",
                    "action and currentState must both be ON or both be OFF",
                    HttpStatus.BAD_REQUEST
            );
        }
    }

    private int normalizePageSize(int pageSize) {
        if (pageSize <= 0) {
            return DEFAULT_PAGE_SIZE;
        }
        return Math.min(pageSize, MAX_PAGE_SIZE);
    }
}
