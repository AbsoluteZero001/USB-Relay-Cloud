package com.absolutezero.usbrelaycloud.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;

public enum EventSource {
    ANDROID("ANDROID"),
    WEB("WEB"),
    ELECTRON("ELECTRON"),
    SYSTEM("SYSTEM");

    @EnumValue
    private final String value;

    EventSource(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }
}
