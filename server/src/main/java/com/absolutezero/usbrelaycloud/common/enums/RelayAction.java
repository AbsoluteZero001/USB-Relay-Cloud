package com.absolutezero.usbrelaycloud.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;

public enum RelayAction {
    ON("ON"),
    OFF("OFF");

    @EnumValue
    private final String value;

    RelayAction(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }
}
