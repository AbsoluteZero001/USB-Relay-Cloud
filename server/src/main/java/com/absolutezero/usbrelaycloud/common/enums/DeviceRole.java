package com.absolutezero.usbrelaycloud.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;

/**
 * 设备级权限角色（API/DB 字段保持英文）。
 *
 * <ul>
 *   <li>OWNER：查看/控制/管理设备权限</li>
 *   <li>CONTROL：查看/控制</li>
 *   <li>VIEWER：只读</li>
 * </ul>
 * <p>
 * Phase 4 仅建表与基础查询；权限校验在 Phase 5 接入。
 */
public enum DeviceRole {
    OWNER("OWNER"),
    CONTROL("CONTROL"),
    VIEWER("VIEWER");

    @EnumValue
    private final String value;

    DeviceRole(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }
}
