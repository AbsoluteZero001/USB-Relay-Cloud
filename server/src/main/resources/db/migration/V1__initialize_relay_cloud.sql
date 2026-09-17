CREATE TABLE device (
    id BIGINT NOT NULL AUTO_INCREMENT,
    device_id VARCHAR(64) NOT NULL,
    device_name VARCHAR(128) NOT NULL,
    device_type VARCHAR(32) NOT NULL,
    online_status VARCHAR(16) NOT NULL DEFAULT 'OFFLINE',
    last_seen TIMESTAMP(3) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_device_device_id (device_id),
    KEY idx_device_online_status (online_status),
    KEY idx_device_last_seen (last_seen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE relay_state (
    id BIGINT NOT NULL AUTO_INCREMENT,
    device_id VARCHAR(64) NOT NULL,
    channel SMALLINT UNSIGNED NOT NULL,
    commanded_state VARCHAR(16) NOT NULL,
    command_status VARCHAR(16) NOT NULL,
    hardware_state VARCHAR(16) NOT NULL DEFAULT 'UNKNOWN',
    last_event_id VARCHAR(36) NULL,
    last_event_sequence BIGINT NULL,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_relay_state_device_channel (device_id, channel),
    CONSTRAINT fk_relay_state_device
        FOREIGN KEY (device_id) REFERENCES device (device_id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE relay_event (
    id BIGINT NOT NULL AUTO_INCREMENT,
    event_id VARCHAR(36) NOT NULL,
    device_id VARCHAR(64) NOT NULL,
    channel SMALLINT UNSIGNED NOT NULL,
    action VARCHAR(16) NOT NULL,
    previous_state VARCHAR(16) NOT NULL,
    current_state VARCHAR(16) NOT NULL,
    command_status VARCHAR(16) NOT NULL,
    source VARCHAR(32) NOT NULL,
    client_id VARCHAR(128) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_relay_event_event_id (event_id),
    KEY idx_relay_event_device_sequence (device_id, id),
    KEY idx_relay_event_device_created_at (device_id, created_at),
    KEY idx_relay_event_action (action),
    KEY idx_relay_event_source (source),
    CONSTRAINT fk_relay_event_device
        FOREIGN KEY (device_id) REFERENCES device (device_id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
