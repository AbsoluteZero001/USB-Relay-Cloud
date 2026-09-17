package com.absolutezero.usbrelaycloud.common;

import java.time.Instant;

public record ApiResponse<T>(
        boolean success,
        String code,
        String message,
        T data,
        Instant timestamp
) {

    public static <T> ApiResponse<T> success(T data) {
        return new ApiResponse<>(true, "OK", "success", data, Instant.now());
    }

    public static <T> ApiResponse<T> failure(
            String code,
            String message,
            T data
    ) {
        return new ApiResponse<>(false, code, message, data, Instant.now());
    }
}
