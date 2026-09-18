package com.absolutezero.usbrelaycloud;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 排除 UserDetailsServiceAutoConfiguration：本项目使用无状态 JWT，
 * 不需要 Spring Boot 默认的 InMemoryUserDetailsManager（避免启动时
 * 打印随机 user 密码，以及避免误用默认账号）。
 */
@EnableScheduling
@ConfigurationPropertiesScan
@MapperScan("com.absolutezero.usbrelaycloud.mapper")
@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
public class UsbRelayCloudApplication {

    public static void main(String[] args) {
        SpringApplication.run(UsbRelayCloudApplication.class, args);
    }
}
