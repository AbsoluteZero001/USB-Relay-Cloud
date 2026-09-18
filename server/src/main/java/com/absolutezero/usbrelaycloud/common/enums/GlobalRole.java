package com.absolutezero.usbrelaycloud.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;

/**
 * 系统用户全局角色（API/DB 字段保持英文）。
 */
public enum GlobalRole {
    ADMIN("ADMIN"),
    USER("USER");

    @EnumValue
    private final String value;

    GlobalRole(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }
}
