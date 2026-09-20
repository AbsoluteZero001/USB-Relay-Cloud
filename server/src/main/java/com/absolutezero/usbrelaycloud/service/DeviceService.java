package com.absolutezero.usbrelaycloud.service;

import com.absolutezero.usbrelaycloud.common.PageResponse;
import com.absolutezero.usbrelaycloud.common.enums.CommandStatus;
import com.absolutezero.usbrelaycloud.common.enums.GlobalRole;
import com.absolutezero.usbrelaycloud.common.enums.OnlineStatus;
import com.absolutezero.usbrelaycloud.common.enums.RelayStateValue;
import com.absolutezero.usbrelaycloud.dto.HeartbeatRequest;
import com.absolutezero.usbrelaycloud.entity.DeviceEntity;
import com.absolutezero.usbrelaycloud.entity.DeviceUserEntity;
import com.absolutezero.usbrelaycloud.entity.RelayStateEntity;
import com.absolutezero.usbrelaycloud.exception.BusinessException;
import com.absolutezero.usbrelaycloud.exception.ResourceNotFoundException;
import com.absolutezero.usbrelaycloud.mapper.DeviceMapper;
import com.absolutezero.usbrelaycloud.mapper.DeviceUserMapper;
import com.absolutezero.usbrelaycloud.mapper.RelayStateMapper;
import com.absolutezero.usbrelaycloud.security.AuthenticatedUser;
import com.absolutezero.usbrelaycloud.security.CurrentUserResolver;
import com.absolutezero.usbrelaycloud.service.model.HeartbeatPersistenceResult;
import com.absolutezero.usbrelaycloud.vo.DeviceDetailResponse;
import com.absolutezero.usbrelaycloud.vo.DeviceResponse;
import com.absolutezero.usbrelaycloud.vo.HeartbeatResponse;
import com.absolutezero.usbrelaycloud.vo.RelayStateResponse;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.List;

@Service
public class DeviceService {

    private static final int DEFAULT_PAGE_SIZE = 20;
    private static final int MAX_PAGE_SIZE = 100;

    private final DeviceMapper deviceMapper;
    private final RelayStateMapper relayStateMapper;
    private final DevicePersistenceService persistenceService;
    private final DeviceBroadcastService broadcastService;
    private final DeviceUserMapper deviceUserMapper;
    private final CurrentUserResolver currentUserResolver;

    public DeviceService(
            DeviceMapper deviceMapper,
            RelayStateMapper relayStateMapper,
            DevicePersistenceService persistenceService,
            DeviceBroadcastService broadcastService,
            DeviceUserMapper deviceUserMapper,
            CurrentUserResolver currentUserResolver
    ) {
        this.deviceMapper = deviceMapper;
        this.relayStateMapper = relayStateMapper;
        this.persistenceService = persistenceService;
        this.broadcastService = broadcastService;
        this.deviceUserMapper = deviceUserMapper;
        this.currentUserResolver = currentUserResolver;
    }

    /**
     * 分页列出当前用户可访问的设备：
     * ADMIN 全量；普通 USER 仅返回 device_user 中授权的设备。
     */
    public PageResponse<DeviceResponse> list(int page, int pageSize) {
        AuthenticatedUser user = currentUserResolver.require();
        int normalizedPage = Math.max(page, 1);
        int normalizedPageSize = normalizePageSize(pageSize);
        Page<DeviceEntity> sourcePage =
                new Page<>(normalizedPage, normalizedPageSize);

        if (GlobalRole.ADMIN.name().equals(user.globalRole())) {
            Page<DeviceEntity> result = deviceMapper.selectPage(
                    sourcePage,
                    new LambdaQueryWrapper<DeviceEntity>()
                            .orderByDesc(DeviceEntity::getUpdatedAt)
            );
            return PageResponse.from(result, DeviceResponse::from);
        }

        List<String> deviceIds =
                deviceUserMapper.selectDeviceIdsByUser(user.userId());
        if (deviceIds.isEmpty()) {
            Page<DeviceEntity> empty = new Page<>(
                    normalizedPage, normalizedPageSize
            );
            empty.setRecords(Collections.emptyList());
            empty.setTotal(0);
            return PageResponse.from(empty, DeviceResponse::from);
        }
        Page<DeviceEntity> result = deviceMapper.selectPage(
                sourcePage,
                new LambdaQueryWrapper<DeviceEntity>()
                        .in(DeviceEntity::getDeviceId, deviceIds)
                        .orderByDesc(DeviceEntity::getUpdatedAt)
        );
        return PageResponse.from(result, DeviceResponse::from);
    }

    public DeviceDetailResponse getDetail(String deviceId) {
        requireAccess(deviceId);
        DeviceEntity device = deviceMapper.selectByDeviceId(deviceId);
        return new DeviceDetailResponse(
                DeviceResponse.from(device),
                states(deviceId)
        );
    }

    public List<RelayStateResponse> states(String deviceId) {
        requireAccess(deviceId);
        return relayStateMapper.selectByDeviceId(deviceId).stream()
                .map(RelayStateResponse::from)
                .toList();
    }

    public RelayStateResponse state(String deviceId, int channel) {
        requireAccess(deviceId);
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
        // 设备自注册：设备不存在时允许 ADMIN 创建；普通用户只能操作已有授权设备。
        DeviceEntity existing = deviceMapper.selectByDeviceId(deviceId);
        if (existing == null) {
            AuthenticatedUser user = currentUserResolver.require();
            if (!GlobalRole.ADMIN.name().equals(user.globalRole())) {
                throw new ResourceNotFoundException(
                        "device not found: " + deviceId
                );
            }
            // ADMIN 放行，由 persistenceService.upsertActiveDevice 创建设备
        } else {
            requireAccess(deviceId);
        }

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

    /**
     * 设备级访问控制：
     * - 设备不存在 → 404 ResourceNotFound
     * - 当前用户为 ADMIN → 放行
     * - 否则需 device_user 中存在 (user_id, device_id) 授权记录，
     * 任意 role（OWNER/CONTROL/VIEWER）均视为可读/可查询。
     * - 写操作（POST events）由调用方自行判断 role：
     * VIEWER 不能写 → 抛 FORBIDDEN。
     * <p>
     * 默认 requireAccess 仅校验“能否访问该设备”，不区分 role，
     * 用于读类端点。写类端点请使用 {@link #requireControlAccess}。
     */
    public void requireAccess(String deviceId) {
        DeviceEntity device = deviceMapper.selectByDeviceId(deviceId);
        if (device == null) {
            throw new ResourceNotFoundException(
                    "device not found: " + deviceId
            );
        }
        AuthenticatedUser user = currentUserResolver.require();
        if (GlobalRole.ADMIN.name().equals(user.globalRole())) {
            return;
        }
        DeviceUserEntity grant = deviceUserMapper.selectByUserAndDevice(
                user.userId(),
                deviceId
        );
        if (grant == null) {
            throw new BusinessException(
                    "FORBIDDEN",
                    "无权访问该设备",
                    HttpStatus.FORBIDDEN
            );
        }
    }

    /**
     * 控制类写操作权限：
     * ADMIN / 设备 role ∈ {OWNER, CONTROL} 可写；
     * VIEWER 抛 FORBIDDEN。
     * 设备不存在 → 404。
     */
    public void requireControlAccess(String deviceId) {
        DeviceEntity device = deviceMapper.selectByDeviceId(deviceId);
        if (device == null) {
            throw new ResourceNotFoundException(
                    "device not found: " + deviceId
            );
        }
        AuthenticatedUser user = currentUserResolver.require();
        if (GlobalRole.ADMIN.name().equals(user.globalRole())) {
            return;
        }
        DeviceUserEntity grant = deviceUserMapper.selectByUserAndDevice(
                user.userId(),
                deviceId
        );
        if (grant == null) {
            throw new BusinessException(
                    "FORBIDDEN",
                    "无权访问该设备",
                    HttpStatus.FORBIDDEN
            );
        }
        switch (grant.getRole()) {
            case OWNER, CONTROL -> { /* allowed */ }
            case VIEWER -> throw new BusinessException(
                    "FORBIDDEN",
                    "只读权限，无法执行控制操作",
                    HttpStatus.FORBIDDEN
            );
        }
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
