-- 测试用 H2 (MySQL 模式) schema，需与 Flyway V1+V2 保持字段一致。
-- 删除顺序遵循外键反向依赖。

DROP TABLE IF EXISTS device_user;
DROP TABLE IF EXISTS relay_event;
DROP TABLE IF EXISTS relay_state;
DROP TABLE IF EXISTS sys_user;
DROP TABLE IF EXISTS device;

CREATE TABLE device (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(64) NOT NULL UNIQUE,
    device_name VARCHAR(128) NOT NULL,
    device_type VARCHAR(32) NOT NULL,
    online_status VARCHAR(16) NOT NULL,
    last_seen TIMESTAMP(3),
    created_at TIMESTAMP(3) NOT NULL,
    updated_at TIMESTAMP(3) NOT NULL
);

CREATE TABLE sys_user
(
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    username      VARCHAR(64)  NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    global_role   VARCHAR(16)  NOT NULL,
    status        VARCHAR(16)  NOT NULL,
    created_at    TIMESTAMP(3) NOT NULL,
    updated_at    TIMESTAMP(3) NOT NULL
);

CREATE TABLE relay_state (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(64) NOT NULL,
    channel SMALLINT NOT NULL,
    commanded_state VARCHAR(16) NOT NULL,
    command_status VARCHAR(16) NOT NULL,
    hardware_state VARCHAR(16) NOT NULL,
    last_event_id VARCHAR(36),
    last_event_sequence BIGINT,
    updated_at TIMESTAMP(3) NOT NULL,
    CONSTRAINT uk_relay_state_device_channel UNIQUE (device_id, channel),
    CONSTRAINT fk_relay_state_device FOREIGN KEY (device_id)
        REFERENCES device (device_id)
);

CREATE TABLE relay_event (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_id VARCHAR(36) NOT NULL UNIQUE,
    device_id VARCHAR(64) NOT NULL,
    channel SMALLINT NOT NULL,
    action VARCHAR(16) NOT NULL,
    previous_state VARCHAR(16) NOT NULL,
    current_state VARCHAR(16) NOT NULL,
    command_status VARCHAR(16) NOT NULL,
    source VARCHAR(32) NOT NULL,
    client_id VARCHAR(128) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL,
    CONSTRAINT fk_relay_event_device FOREIGN KEY (device_id)
        REFERENCES device (device_id)
);

CREATE TABLE device_user
(
    id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id    BIGINT       NOT NULL,
    device_id  VARCHAR(64)  NOT NULL,
    role       VARCHAR(16)  NOT NULL,
    created_at TIMESTAMP(3) NOT NULL,
    CONSTRAINT uk_device_user_user_device UNIQUE (user_id, device_id),
    CONSTRAINT fk_device_user_user FOREIGN KEY (user_id)
        REFERENCES sys_user (id),
    CONSTRAINT fk_device_user_device FOREIGN KEY (device_id)
        REFERENCES device (device_id)
);
