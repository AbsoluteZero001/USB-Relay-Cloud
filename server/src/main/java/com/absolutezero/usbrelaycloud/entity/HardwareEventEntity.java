package com.absolutezero.usbrelaycloud.entity;

import com.absolutezero.usbrelaycloud.common.enums.EventSource;
import com.absolutezero.usbrelaycloud.common.enums.HardwareEventType;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * 硬件生命周期事件实体。
 * 记录 USB 插入 / 连接 / 断开 / 拔出 / 失败等，独立于继电器指令事件。
 */
@TableName("hardware_event")
public class HardwareEventEntity {

    @TableId(type = IdType.AUTO)
    private Long id;
    private String eventId;
    private String deviceId;
    private HardwareEventType eventType;
    private EventSource source;
    private String clientId;
    private String profileName;
    private String serialDevice;
    private String vendorId;
    private String productId;
    private Integer baudRate;
    private Integer dataBits;
    private BigDecimal stopBits;
    private String parity;
    private Integer channel;
    private Long actorUserId;
    private String actorUsername;
    private String actorClientId;
    private String executorClientId;
    private String errorCode;
    private String errorMessage;
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

    public HardwareEventType getEventType() {
        return eventType;
    }

    public void setEventType(HardwareEventType eventType) {
        this.eventType = eventType;
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

    public String getProfileName() {
        return profileName;
    }

    public void setProfileName(String profileName) {
        this.profileName = profileName;
    }

    public String getSerialDevice() {
        return serialDevice;
    }

    public void setSerialDevice(String serialDevice) {
        this.serialDevice = serialDevice;
    }

    public String getVendorId() {
        return vendorId;
    }

    public void setVendorId(String vendorId) {
        this.vendorId = vendorId;
    }

    public String getProductId() {
        return productId;
    }

    public void setProductId(String productId) {
        this.productId = productId;
    }

    public Integer getBaudRate() {
        return baudRate;
    }

    public void setBaudRate(Integer baudRate) {
        this.baudRate = baudRate;
    }

    public Integer getDataBits() {
        return dataBits;
    }

    public void setDataBits(Integer dataBits) {
        this.dataBits = dataBits;
    }

    public BigDecimal getStopBits() {
        return stopBits;
    }

    public void setStopBits(BigDecimal stopBits) {
        this.stopBits = stopBits;
    }

    public String getParity() {
        return parity;
    }

    public void setParity(String parity) {
        this.parity = parity;
    }

    public Integer getChannel() {
        return channel;
    }

    public void setChannel(Integer channel) {
        this.channel = channel;
    }

    public Long getActorUserId() {
        return actorUserId;
    }

    public void setActorUserId(Long actorUserId) {
        this.actorUserId = actorUserId;
    }

    public String getActorUsername() {
        return actorUsername;
    }

    public void setActorUsername(String actorUsername) {
        this.actorUsername = actorUsername;
    }

    public String getActorClientId() {
        return actorClientId;
    }

    public void setActorClientId(String actorClientId) {
        this.actorClientId = actorClientId;
    }

    public String getExecutorClientId() {
        return executorClientId;
    }

    public void setExecutorClientId(String executorClientId) {
        this.executorClientId = executorClientId;
    }

    public String getErrorCode() {
        return errorCode;
    }

    public void setErrorCode(String errorCode) {
        this.errorCode = errorCode;
    }

    public String getErrorMessage() {
        return errorMessage;
    }

    public void setErrorMessage(String errorMessage) {
        this.errorMessage = errorMessage;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
