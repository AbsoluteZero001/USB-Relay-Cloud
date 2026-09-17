DROP TABLE IF EXISTS relay_event;
DROP TABLE IF EXISTS relay_state;
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
