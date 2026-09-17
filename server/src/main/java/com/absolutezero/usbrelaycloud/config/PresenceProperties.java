package com.absolutezero.usbrelaycloud.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties(prefix = "usb-relay.presence")
public record PresenceProperties(
        Duration offlineAfter,
        Duration scanInterval
) {
}
