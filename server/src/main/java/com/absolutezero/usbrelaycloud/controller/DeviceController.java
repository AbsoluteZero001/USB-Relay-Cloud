package com.absolutezero.usbrelaycloud.controller;

import com.absolutezero.usbrelaycloud.common.ApiResponse;
import com.absolutezero.usbrelaycloud.common.PageResponse;
import com.absolutezero.usbrelaycloud.common.enums.EventSource;
import com.absolutezero.usbrelaycloud.common.enums.RelayAction;
import com.absolutezero.usbrelaycloud.dto.HardwareEventCreateRequest;
import com.absolutezero.usbrelaycloud.dto.HeartbeatRequest;
import com.absolutezero.usbrelaycloud.dto.RelayEventCreateRequest;
import com.absolutezero.usbrelaycloud.service.DeviceService;
import com.absolutezero.usbrelaycloud.service.HardwareEventService;
import com.absolutezero.usbrelaycloud.service.RelayEventService;
import com.absolutezero.usbrelaycloud.vo.*;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;

@RestController
@RequestMapping("/api/devices")
public class DeviceController {

    private final DeviceService deviceService;
    private final RelayEventService relayEventService;
    private final HardwareEventService hardwareEventService;

    public DeviceController(
            DeviceService deviceService,
            RelayEventService relayEventService,
            HardwareEventService hardwareEventService
    ) {
        this.deviceService = deviceService;
        this.relayEventService = relayEventService;
        this.hardwareEventService = hardwareEventService;
    }

    @GetMapping
    public ApiResponse<PageResponse<DeviceResponse>> listDevices(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize
    ) {
        return ApiResponse.success(deviceService.list(page, pageSize));
    }

    @GetMapping("/{deviceId}")
    public ApiResponse<DeviceDetailResponse> getDevice(
            @PathVariable String deviceId
    ) {
        return ApiResponse.success(deviceService.getDetail(deviceId));
    }

    @GetMapping("/{deviceId}/state")
    public ApiResponse<RelayStateResponse> getState(
            @PathVariable String deviceId,
            @RequestParam(defaultValue = "1") int channel
    ) {
        return ApiResponse.success(deviceService.state(deviceId, channel));
    }

    @GetMapping("/{deviceId}/events")
    public ApiResponse<PageResponse<RelayEventResponse>> listEvents(
            @PathVariable String deviceId,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(required = false) Long afterSequence,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
            Instant from,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
            Instant to,
            @RequestParam(required = false) RelayAction action,
            @RequestParam(required = false) EventSource source
    ) {
        deviceService.requireAccess(deviceId);
        return ApiResponse.success(
                relayEventService.list(
                        deviceId,
                        page,
                        pageSize,
                        afterSequence,
                        from,
                        to,
                        action,
                        source
                )
        );
    }

    @PostMapping("/{deviceId}/events")
    public ApiResponse<RelayEventResponse> createEvent(
            @PathVariable String deviceId,
            @Valid @RequestBody RelayEventCreateRequest request
    ) {
        // 写操作：需要 OWNER 或 CONTROL 权限，ADMIN 全放行
        deviceService.requireControlAccess(deviceId);
        return ApiResponse.success(
                relayEventService.record(deviceId, request)
        );
    }

    @GetMapping("/{deviceId}/hardware-events")
    public ApiResponse<PageResponse<HardwareEventResponse>> listHardwareEvents(
            @PathVariable String deviceId,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
            Instant from,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
            Instant to
    ) {
        deviceService.requireAccess(deviceId);
        return ApiResponse.success(
                hardwareEventService.list(deviceId, page, pageSize, from, to)
        );
    }

    @PostMapping("/{deviceId}/hardware-events")
    public ApiResponse<HardwareEventResponse> createHardwareEvent(
            @PathVariable String deviceId,
            @Valid @RequestBody HardwareEventCreateRequest request
    ) {
        // 硬件生命周期事件：需要 OWNER 或 CONTROL 权限，ADMIN 全放行。
        // 与 relay 事件共用权限模型，但不更新 relay_state。
        deviceService.requireControlAccess(deviceId);
        return ApiResponse.success(
                hardwareEventService.record(deviceId, request)
        );
    }

    @PostMapping("/{deviceId}/heartbeat")
    public ApiResponse<HeartbeatResponse> heartbeat(
            @PathVariable String deviceId,
            @Valid @RequestBody HeartbeatRequest request
    ) {
        return ApiResponse.success(
                deviceService.heartbeat(deviceId, request)
        );
    }
}
