package com.absolutezero.usbrelaycloud.vo;

import java.util.List;

public record DeviceDetailResponse(
        DeviceResponse device,
        List<RelayStateResponse> states
) {
}
