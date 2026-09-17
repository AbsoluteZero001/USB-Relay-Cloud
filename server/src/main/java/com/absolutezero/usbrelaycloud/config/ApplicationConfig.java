package com.absolutezero.usbrelaycloud.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

@Configuration
public class ApplicationConfig {

    @Bean
    Clock utcClock() {
        return Clock.systemUTC();
    }
}
