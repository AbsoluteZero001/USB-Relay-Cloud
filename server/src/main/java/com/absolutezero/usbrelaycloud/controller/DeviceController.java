package com.absolutezero.usbrelaycloud.controller;

import com.absolutezero.usbrelaycloud.common.ApiResponse;
import com.absolutezero.usbrelaycloud.common.PageResponse;
import com.absolutezero.usbrelaycloud.common.enums.EventSource;
import com.absolutezero.usbrelaycloud.common.enums.RelayAction;
import com.absolutezero.usbrelaycloud.dto.HeartbeatRequest;
import com.absolutezero.usbrelaycloud.dto.RelayEventCreateRequest;
import com.absolutezero.usbrelaycloud.service.DeviceService;
import com.absolutezero.usbrelaycloud.service.RelayEventService;
import com.absolutezero.usbrelaycloud.vo.DeviceDetailResponse;
import com.absolutezero.usbrelaycloud.vo.DeviceResponse;
import com.absolutezero.usbrelaycloud.vo.HeartbeatResponse;
import com.absolutezero.usbrelaycloud.vo.RelayEventResponse;
import com.absolutezero.usbrelaycloud.vo.RelayStateResponse;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;

@RestController
@RequestMapping("/api/devices")
public class DeviceController {

    private final DeviceService deviceService;
    private final RelayEventService relayEventService;

    public DeviceController(
            DeviceService deviceService,
            RelayEventService relayEventService
    ) {
        this.deviceService = deviceService;
        this.relayEventService = relayEventService;
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
        deviceService.requireDevice(deviceId);
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
        return ApiResponse.success(
                relayEventService.record(deviceId, request)
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
