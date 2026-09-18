-- V2: 用户与设备权限表
-- 注意：禁止在本文件中插入任何明文密码或默认账号；
--       管理员账号由 BootstrapAdminInitializer 在启动时
--       通过环境变量 APP_BOOTSTRAP_ADMIN_USERNAME /
--       APP_BOOTSTRAP_ADMIN_PASSWORD 创建（BCrypt 哈希）。

CREATE TABLE sys_user
(
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    username      VARCHAR(64)  NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    global_role   VARCHAR(16)  NOT NULL,
    status        VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE',
    created_at    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_sys_user_username (username),
    KEY           idx_sys_user_global_role (global_role),
    KEY           idx_sys_user_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE device_user
(
    id         BIGINT       NOT NULL AUTO_INCREMENT,
    user_id    BIGINT       NOT NULL,
    device_id  VARCHAR(64)  NOT NULL,
    role       VARCHAR(16)  NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_device_user_user_device (user_id, device_id),
    KEY        idx_device_user_device (device_id),
    KEY        idx_device_user_user (user_id),
    CONSTRAINT fk_device_user_user
        FOREIGN KEY (user_id) REFERENCES sys_user (id)
            ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_device_user_device
        FOREIGN KEY (device_id) REFERENCES device (device_id)
            ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
