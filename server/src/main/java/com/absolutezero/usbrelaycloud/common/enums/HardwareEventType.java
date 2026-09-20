package com.absolutezero.usbrelaycloud.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;

/**
 * 硬件生命周期事件类型。
 * <p>
 * 与 relay_event（继电器 ON/OFF 指令）相互独立，不伪造为继电器状态变更。
 * USB 拔出只记录 USB_DETACHED / USB_DISCONNECTED，绝不同时写入 relay OFF。
 */
public enum HardwareEventType {
    USB_ATTACHED("USB_ATTACHED"),
    USB_CONNECTED("USB_CONNECTED"),
    USB_DISCONNECTED("USB_DISCONNECTED"),
    USB_DETACHED("USB_DETACHED"),
    USB_PERMISSION_GRANTED("USB_PERMISSION_GRANTED"),
    USB_PERMISSION_DENIED("USB_PERMISSION_DENIED"),
    USB_OPEN_FAILED("USB_OPEN_FAILED"),
    USB_WRITE_FAILED("USB_WRITE_FAILED"),
    UNSUPPORTED_DEVICE("UNSUPPORTED_DEVICE");

    @EnumValue
    private final String value;

    HardwareEventType(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }
}
