package com.absolutezero.usbrelaycloud.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;

/**
 * 系统用户状态（API/DB 字段保持英文）。
 */
public enum UserStatus {
    ACTIVE("ACTIVE"),
    DISABLED("DISABLED");

    @EnumValue
    private final String value;

    UserStatus(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }
}
