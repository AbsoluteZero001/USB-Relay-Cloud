package com.absolutezero.usbrelaycloud.service;

import com.absolutezero.usbrelaycloud.entity.DeviceEntity;
import com.absolutezero.usbrelaycloud.entity.HardwareEventEntity;
import com.absolutezero.usbrelaycloud.entity.RelayEventEntity;

public interface DeviceBroadcastService {

    void broadcastRelayEvent(RelayEventEntity event);

    void broadcastDeviceStatus(DeviceEntity device);

    void broadcastHardwareEvent(HardwareEventEntity event);
}
