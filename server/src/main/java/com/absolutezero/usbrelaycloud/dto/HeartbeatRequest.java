package com.absolutezero.usbrelaycloud.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record HeartbeatRequest(
        @NotBlank
        @Size(max = 128)
        String deviceName,

        @NotBlank
        @Size(max = 32)
        String deviceType,

        @NotBlank
        @Size(max = 128)
        String clientId
) {
}
