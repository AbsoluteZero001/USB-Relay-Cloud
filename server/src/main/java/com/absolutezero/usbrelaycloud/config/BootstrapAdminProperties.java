package com.absolutezero.usbrelaycloud.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 初始管理员账号配置。username/password 仅来自环境变量
 * APP_BOOTSTRAP_ADMIN_USERNAME / APP_BOOTSTRAP_ADMIN_PASSWORD。
 * 若两者任一为空，则不创建管理员账号（绝不生成弱默认密码）。
 */
@ConfigurationProperties(prefix = "usb-relay.bootstrap.admin")
public record BootstrapAdminProperties(
        String username,
        String password
) {
}
