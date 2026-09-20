-- V3：硬件生命周期事件表。
-- 与 relay_event 完全独立，用于记录 USB 插拔 / 连接 / 断开 / 失败等硬件事件。
-- USB 拔出只写入 hardware_event，绝不伪造 relay OFF。

CREATE TABLE hardware_event
(
    id                 BIGINT       NOT NULL AUTO_INCREMENT,
    event_id           VARCHAR(36)  NOT NULL,
    device_id          VARCHAR(64)  NOT NULL,
    event_type         VARCHAR(32)  NOT NULL,
    source             VARCHAR(32)  NOT NULL,
    client_id          VARCHAR(128) NOT NULL,
    -- 硬件上下文（可选，V1 不强制）
    profile_name       VARCHAR(64) NULL,
    serial_device      VARCHAR(128) NULL,
    vendor_id          VARCHAR(8) NULL,
    product_id         VARCHAR(8) NULL,
    baud_rate          INT NULL,
    data_bits          TINYINT NULL,
    stop_bits          DECIMAL(3, 1) NULL,
    parity             VARCHAR(8) NULL,
    channel            SMALLINT UNSIGNED NULL,
    -- V2 审计字段预留（V1 可为 NULL）
    actor_user_id      BIGINT NULL,
    actor_username     VARCHAR(64) NULL,
    actor_client_id    VARCHAR(128) NULL,
    executor_client_id VARCHAR(128) NULL,
    -- 失败原因（USB_OPEN_FAILED / USB_WRITE_FAILED 等）
    error_code         VARCHAR(64) NULL,
    error_message      VARCHAR(512) NULL,
    created_at         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_hardware_event_event_id (event_id),
    KEY                idx_hardware_event_device_created_at (device_id, created_at),
    KEY                idx_hardware_event_event_type (event_type),
    CONSTRAINT fk_hardware_event_device
        FOREIGN KEY (device_id) REFERENCES device (device_id)
            ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
