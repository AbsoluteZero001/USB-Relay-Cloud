package com.absolutezero.usbrelaycloud.dto;

import com.absolutezero.usbrelaycloud.common.enums.RelayAction;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * Reserved contract for the later Cloud -> Device remote command phase.
 * It is intentionally not wired to a controller in phase one.
 */
public record RelayCommandRequest(
        @NotBlank
        String commandId,

        @NotBlank
        String deviceId,

        @NotNull
        @Min(1)
        Integer channel,

        @NotNull
        RelayAction action
) {
}
