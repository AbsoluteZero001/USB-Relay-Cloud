package com.absolutezero.usbrelaycloud.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;

public enum OnlineStatus {
    ONLINE("ONLINE"),
    OFFLINE("OFFLINE");

    @EnumValue
    private final String value;

    OnlineStatus(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }
}
