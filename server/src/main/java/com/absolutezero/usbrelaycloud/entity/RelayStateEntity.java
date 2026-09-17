package com.absolutezero.usbrelaycloud.entity;

import com.absolutezero.usbrelaycloud.common.enums.CommandStatus;
import com.absolutezero.usbrelaycloud.common.enums.RelayStateValue;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.time.Instant;

@TableName("relay_state")
public class RelayStateEntity {

    @TableId(type = IdType.AUTO)
    private Long id;
    private String deviceId;
    private Integer channel;
    private RelayStateValue commandedState;
    private CommandStatus commandStatus;
    private RelayStateValue hardwareState;
    private String lastEventId;
    private Long lastEventSequence;
    private Instant updatedAt;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getDeviceId() {
        return deviceId;
    }

    public void setDeviceId(String deviceId) {
        this.deviceId = deviceId;
    }

    public Integer getChannel() {
        return channel;
    }

    public void setChannel(Integer channel) {
        this.channel = channel;
    }

    public RelayStateValue getCommandedState() {
        return commandedState;
    }

    public void setCommandedState(RelayStateValue commandedState) {
        this.commandedState = commandedState;
    }

    public CommandStatus getCommandStatus() {
        return commandStatus;
    }

    public void setCommandStatus(CommandStatus commandStatus) {
        this.commandStatus = commandStatus;
    }

    public RelayStateValue getHardwareState() {
        return hardwareState;
    }

    public void setHardwareState(RelayStateValue hardwareState) {
        this.hardwareState = hardwareState;
    }

    public String getLastEventId() {
        return lastEventId;
    }

    public void setLastEventId(String lastEventId) {
        this.lastEventId = lastEventId;
    }

    public Long getLastEventSequence() {
        return lastEventSequence;
    }

    public void setLastEventSequence(Long lastEventSequence) {
        this.lastEventSequence = lastEventSequence;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
