package com.absolutezero.usbrelaycloud;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

@EnableScheduling
@ConfigurationPropertiesScan
@MapperScan("com.absolutezero.usbrelaycloud.mapper")
@SpringBootApplication
public class UsbRelayCloudApplication {

    public static void main(String[] args) {
        SpringApplication.run(UsbRelayCloudApplication.class, args);
    }
}
