package com.absolutezero.usbrelaycloud.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;

public enum CommandStatus {
    SUCCESS("SUCCESS"),
    FAILED("FAILED");

    @EnumValue
    private final String value;

    CommandStatus(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }
}
