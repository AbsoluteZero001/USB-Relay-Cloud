package com.absolutezero.usbrelaycloud.dto;

import com.absolutezero.usbrelaycloud.common.enums.EventSource;
import com.absolutezero.usbrelaycloud.common.enums.HardwareEventType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

public record HardwareEventCreateRequest(
        @NotBlank
        @Pattern(
                regexp = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$",
                message = "must be a UUID"
        )
        String eventId,

        @NotNull
        HardwareEventType eventType,

        @NotNull
        EventSource source,

        @NotBlank
        @Size(max = 128)
        String clientId,

        @Size(max = 64)
        String profileName,

        @Size(max = 128)
        String serialDevice,

        @Size(max = 8)
        String vendorId,

        @Size(max = 8)
        String productId,

        Integer baudRate,

        Integer dataBits,

        BigDecimal stopBits,

        @Size(max = 8)
        String parity,

        Integer channel,

        Long actorUserId,

        @Size(max = 64)
        String actorUsername,

        @Size(max = 128)
        String actorClientId,

        @Size(max = 128)
        String executorClientId,

        @Size(max = 64)
        String errorCode,

        @Size(max = 512)
        String errorMessage
) {
}
