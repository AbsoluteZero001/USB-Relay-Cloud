package com.absolutezero.usbrelaycloud.exception;

import com.absolutezero.usbrelaycloud.common.ApiResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.LinkedHashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log =
            LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResponse<Void>> handleBusiness(
            BusinessException exception
    ) {
        return ResponseEntity.status(exception.getStatus())
                .body(
                        ApiResponse.failure(
                                exception.getCode(),
                                exception.getMessage(),
                                null
                        )
                );
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Map<String, String>>> handleValidation(
            MethodArgumentNotValidException exception
    ) {
        Map<String, String> fields = new LinkedHashMap<>();
        for (FieldError error : exception.getBindingResult()
                .getFieldErrors()) {
            fields.putIfAbsent(
                    error.getField(),
                    error.getDefaultMessage()
            );
        }
        return ResponseEntity.badRequest()
                .body(
                        ApiResponse.failure(
                                "VALIDATION_ERROR",
                                "request validation failed",
                                fields
                        )
                );
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiResponse<Void>> handleUnreadable(
            HttpMessageNotReadableException exception
    ) {
        return ResponseEntity.badRequest()
                .body(
                        ApiResponse.failure(
                                "INVALID_REQUEST_BODY",
                                "request body is invalid",
                                null
                        )
                );
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleUnexpected(
            Exception exception
    ) {
        log.error("Unhandled server error", exception);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(
                        ApiResponse.failure(
                                "INTERNAL_ERROR",
                                "internal server error",
                                null
                        )
                );
    }
}
