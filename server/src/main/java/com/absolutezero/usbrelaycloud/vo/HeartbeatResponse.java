package com.absolutezero.usbrelaycloud.vo;

import java.util.List;

public record HeartbeatResponse(
        DeviceResponse device,
        List<RelayStateResponse> states
) {
}
