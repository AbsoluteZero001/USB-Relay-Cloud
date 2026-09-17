package com.absolutezero.usbrelaycloud.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;

public enum RelayStateValue {
    ON("ON"),
    OFF("OFF"),
    UNKNOWN("UNKNOWN");

    @EnumValue
    private final String value;

    RelayStateValue(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }
}
