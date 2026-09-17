package com.absolutezero.usbrelaycloud.service;

import com.absolutezero.usbrelaycloud.common.PageResponse;
import com.absolutezero.usbrelaycloud.common.enums.CommandStatus;
import com.absolutezero.usbrelaycloud.common.enums.OnlineStatus;
import com.absolutezero.usbrelaycloud.common.enums.RelayStateValue;
import com.absolutezero.usbrelaycloud.dto.HeartbeatRequest;
import com.absolutezero.usbrelaycloud.entity.DeviceEntity;
import com.absolutezero.usbrelaycloud.entity.RelayStateEntity;
import com.absolutezero.usbrelaycloud.exception.ResourceNotFoundException;
import com.absolutezero.usbrelaycloud.mapper.DeviceMapper;
import com.absolutezero.usbrelaycloud.mapper.RelayStateMapper;
import com.absolutezero.usbrelaycloud.service.model.HeartbeatPersistenceResult;
import com.absolutezero.usbrelaycloud.vo.DeviceDetailResponse;
import com.absolutezero.usbrelaycloud.vo.DeviceResponse;
import com.absolutezero.usbrelaycloud.vo.HeartbeatResponse;
import com.absolutezero.usbrelaycloud.vo.RelayStateResponse;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class DeviceService {

    private static final int DEFAULT_PAGE_SIZE = 20;
    private static final int MAX_PAGE_SIZE = 100;

    private final DeviceMapper deviceMapper;
    private final RelayStateMapper relayStateMapper;
    private final DevicePersistenceService persistenceService;
    private final DeviceBroadcastService broadcastService;

    public DeviceService(
            DeviceMapper deviceMapper,
            RelayStateMapper relayStateMapper,
            DevicePersistenceService persistenceService,
            DeviceBroadcastService broadcastService
    ) {
        this.deviceMapper = deviceMapper;
        this.relayStateMapper = relayStateMapper;
        this.persistenceService = persistenceService;
        this.broadcastService = broadcastService;
    }

    public PageResponse<DeviceResponse> list(int page, int pageSize) {
        int normalizedPage = Math.max(page, 1);
        int normalizedPageSize = normalizePageSize(pageSize);
        Page<DeviceEntity> sourcePage =
                new Page<>(normalizedPage, normalizedPageSize);
        Page<DeviceEntity> result = deviceMapper.selectPage(
                sourcePage,
                new LambdaQueryWrapper<DeviceEntity>()
                        .orderByDesc(DeviceEntity::getUpdatedAt)
        );
        return PageResponse.from(result, DeviceResponse::from);
    }

    public DeviceDetailResponse getDetail(String deviceId) {
        DeviceEntity device = requireDevice(deviceId);
        return new DeviceDetailResponse(
                DeviceResponse.from(device),
                states(deviceId)
        );
    }

    public List<RelayStateResponse> states(String deviceId) {
        requireDevice(deviceId);
        return relayStateMapper.selectByDeviceId(deviceId).stream()
                .map(RelayStateResponse::from)
                .toList();
    }

    public RelayStateResponse state(String deviceId, int channel) {
        requireDevice(deviceId);
        RelayStateEntity state =
                relayStateMapper.selectByDeviceChannel(deviceId, channel);
        if (state == null) {
            return unknownState(deviceId, channel);
        }
        return RelayStateResponse.from(state);
    }

    public HeartbeatResponse heartbeat(
            String deviceId,
            HeartbeatRequest request
    ) {
        HeartbeatPersistenceResult result =
                persistenceService.heartbeat(deviceId, request);
        DeviceResponse device = DeviceResponse.from(result.device());
        List<RelayStateResponse> states = result.states().stream()
                .map(RelayStateResponse::from)
                .toList();

        if (result.previousOnlineStatus() != OnlineStatus.ONLINE) {
            // The persistence transaction has already committed.
            broadcastService.broadcastDeviceStatus(result.device());
        }
        return new HeartbeatResponse(device, states);
    }

    public DeviceEntity requireDevice(String deviceId) {
        DeviceEntity device = deviceMapper.selectByDeviceId(deviceId);
        if (device == null) {
            throw new ResourceNotFoundException(
                    "device not found: " + deviceId
            );
        }
        return device;
    }

    private RelayStateResponse unknownState(String deviceId, int channel) {
        return new RelayStateResponse(
                deviceId,
                channel,
                RelayStateValue.UNKNOWN,
                CommandStatus.FAILED,
                RelayStateValue.UNKNOWN,
                null,
                null,
                null
        );
    }

    private int normalizePageSize(int pageSize) {
        if (pageSize <= 0) {
            return DEFAULT_PAGE_SIZE;
        }
        return Math.min(pageSize, MAX_PAGE_SIZE);
    }
}
