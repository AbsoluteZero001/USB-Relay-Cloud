package com.absolutezero.usbrelaycloud.dto;

import com.absolutezero.usbrelaycloud.common.enums.CommandStatus;
import com.absolutezero.usbrelaycloud.common.enums.EventSource;
import com.absolutezero.usbrelaycloud.common.enums.RelayAction;
import com.absolutezero.usbrelaycloud.common.enums.RelayStateValue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record RelayEventCreateRequest(
        @NotBlank
        @Pattern(
                regexp = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$",
                message = "must be a UUID"
        )
        String eventId,

        @NotNull
        @Min(1)
        @Max(16)
        Integer channel,

        @NotNull
        RelayAction action,

        @NotNull
        RelayStateValue previousState,

        @NotNull
        RelayStateValue currentState,

        @NotNull
        CommandStatus commandStatus,

        @NotNull
        EventSource source,

        @NotBlank
        @Size(max = 128)
        String clientId
) {
}
