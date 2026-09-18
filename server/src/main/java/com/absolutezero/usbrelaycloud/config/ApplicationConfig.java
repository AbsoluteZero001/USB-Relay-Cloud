package com.absolutezero.usbrelaycloud.config;

import jakarta.annotation.PreDestroy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

@Configuration
public class ApplicationConfig {

    private ScheduledExecutorService webSocketAuthScheduler;

    @Bean
    Clock utcClock() {
        return Clock.systemUTC();
    }

    /**
     * 专用于 WebSocket AUTH 超时检查的调度器。
     * 守护线程，关闭时优雅退出。
     */
    @Bean(destroyMethod = "")
    public ScheduledExecutorService webSocketAuthScheduler() {
        webSocketAuthScheduler = Executors.newSingleThreadScheduledExecutor(
                Thread.ofPlatform()
                        .name("ws-auth-timeout", 1)
                        .daemon(true)
                        .factory()
        );
        return webSocketAuthScheduler;
    }

    @PreDestroy
    void shutdownScheduler() {
        if (webSocketAuthScheduler != null) {
            webSocketAuthScheduler.shutdown();
            try {
                if (!webSocketAuthScheduler.awaitTermination(
                        2, TimeUnit.SECONDS)) {
                    webSocketAuthScheduler.shutdownNow();
                }
            } catch (InterruptedException e) {
                webSocketAuthScheduler.shutdownNow();
                Thread.currentThread().interrupt();
            }
        }
    }
}
