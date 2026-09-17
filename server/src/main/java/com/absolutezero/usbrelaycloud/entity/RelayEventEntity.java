package com.absolutezero.usbrelaycloud.entity;

import com.absolutezero.usbrelaycloud.common.enums.CommandStatus;
import com.absolutezero.usbrelaycloud.common.enums.EventSource;
import com.absolutezero.usbrelaycloud.common.enums.RelayAction;
import com.absolutezero.usbrelaycloud.common.enums.RelayStateValue;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.time.Instant;

@TableName("relay_event")
public class RelayEventEntity {

    @TableId(type = IdType.AUTO)
    private Long id;
    private String eventId;
    private String deviceId;
    private Integer channel;
    private RelayAction action;
    private RelayStateValue previousState;
    private RelayStateValue currentState;
    private CommandStatus commandStatus;
    private EventSource source;
    private String clientId;
    private Instant createdAt;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getEventId() {
        return eventId;
    }

    public void setEventId(String eventId) {
        this.eventId = eventId;
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

    public RelayAction getAction() {
        return action;
    }

    public void setAction(RelayAction action) {
        this.action = action;
    }

    public RelayStateValue getPreviousState() {
        return previousState;
    }

    public void setPreviousState(RelayStateValue previousState) {
        this.previousState = previousState;
    }

    public RelayStateValue getCurrentState() {
        return currentState;
    }

    public void setCurrentState(RelayStateValue currentState) {
        this.currentState = currentState;
    }

    public CommandStatus getCommandStatus() {
        return commandStatus;
    }

    public void setCommandStatus(CommandStatus commandStatus) {
        this.commandStatus = commandStatus;
    }

    public EventSource getSource() {
        return source;
    }

    public void setSource(EventSource source) {
        this.source = source;
    }

    public String getClientId() {
        return clientId;
    }

    public void setClientId(String clientId) {
        this.clientId = clientId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
