# Database Design

## 1. General Rules

- Database: MySQL 8
- Character set: `utf8mb4`
- Collation: `utf8mb4_0900_ai_ci`
- Time storage: UTC
- API serialization: ISO-8601
- Migration: Flyway
- Migrations:
    - `server/src/main/resources/db/migration/V1__initialize_relay_cloud.sql`
    - `server/src/main/resources/db/migration/V2__add_authentication.sql`

Do not execute production schema changes manually. Add a new immutable
Flyway migration.

## 2. `device`

Stores one logical relay device.

| Column | Type | Rules | Meaning |
| --- | --- | --- | --- |
| `id` | BIGINT | PK, auto increment | Internal ID |
| `device_id` | VARCHAR(64) | UNIQUE, NOT NULL | Stable public ID such as `relay-001` |
| `device_name` | VARCHAR(128) | NOT NULL | Display name |
| `device_type` | VARCHAR(32) | NOT NULL | Initial value: `USB_RELAY` |
| `online_status` | VARCHAR(16) | NOT NULL | `ONLINE` or `OFFLINE` |
| `last_seen` | TIMESTAMP(3) | nullable | Last heartbeat or event upload |
| `created_at` | TIMESTAMP(3) | NOT NULL | Creation time |
| `updated_at` | TIMESTAMP(3) | NOT NULL | Last update time |

Presence is refreshed by heartbeat and event upload. A scheduled scan
marks stale online devices offline.

## 3. `relay_state`

Stores the latest server-side view for each device channel.

| Column | Type | Rules | Meaning |
| --- | --- | --- | --- |
| `id` | BIGINT | PK | Internal ID |
| `device_id` | VARCHAR(64) | FK, NOT NULL | Logical device |
| `channel` | SMALLINT UNSIGNED | NOT NULL | Relay channel |
| `commanded_state` | VARCHAR(16) | NOT NULL | `ON` or `OFF` |
| `command_status` | VARCHAR(16) | NOT NULL | `SUCCESS` or `FAILED` |
| `hardware_state` | VARCHAR(16) | NOT NULL | `UNKNOWN` in phase one |
| `last_event_id` | VARCHAR(36) | nullable | Last event UUID |
| `last_event_sequence` | BIGINT | nullable | Last event row ID |
| `updated_at` | TIMESTAMP(3) | NOT NULL | Last state update |

Unique key:

```text
(device_id, channel)
```

The state row is UPSERTed only when a new event is inserted AND its
`command_status = SUCCESS`. FAILED events are appended to
`relay_event` but do not mutate `relay_state` (spec §19).

## 4. `relay_event`

Append-only audit table. Normal application behavior does not update or
delete rows.

| Column | Type | Rules | Meaning |
| --- | --- | --- | --- |
| `id` | BIGINT | PK, auto increment | Globally increasing event sequence |
| `event_id` | VARCHAR(36) | UNIQUE, NOT NULL | Client-generated UUID |
| `device_id` | VARCHAR(64) | FK, NOT NULL | Device |
| `channel` | SMALLINT UNSIGNED | NOT NULL | Relay channel |
| `action` | VARCHAR(16) | NOT NULL | `ON` or `OFF` |
| `previous_state` | VARCHAR(16) | NOT NULL | `ON`, `OFF`, or `UNKNOWN` |
| `current_state` | VARCHAR(16) | NOT NULL | `ON`, `OFF`, or `UNKNOWN` |
| `command_status` | VARCHAR(16) | NOT NULL | `SUCCESS` or `FAILED` |
| `source` | VARCHAR(32) | NOT NULL | `ANDROID`, `WEB`, `ELECTRON`, `SYSTEM` |
| `client_id` | VARCHAR(128) | NOT NULL | Uploading client |
| `created_at` | TIMESTAMP(3) | NOT NULL | Server receive time |

Indexes:

- unique `event_id`
- `(device_id, id)` for sequence catch-up
- `(device_id, created_at)` for time filters
- `action`
- `source`

`id` is exposed as `sequence`. It is used for incremental WebSocket
replay, not as a business event identifier.

## 5. `sys_user`

System login user. Created by `V2__add_authentication.sql`.

| Column          | Type         | Rules              | Meaning                       |
|-----------------|--------------|--------------------|-------------------------------|
| `id`            | BIGINT       | PK, auto increment | Internal ID                   |
| `username`      | VARCHAR(64)  | UNIQUE, NOT NULL   | Login name                    |
| `password_hash` | VARCHAR(72)  | NOT NULL           | BCrypt hash (never plaintext) |
| `global_role`   | VARCHAR(16)  | NOT NULL           | `ADMIN` or `USER`             |
| `status`        | VARCHAR(16)  | NOT NULL           | `ACTIVE` or `DISABLED`        |
| `created_at`    | TIMESTAMP(3) | NOT NULL           | Creation time                 |
| `updated_at`    | TIMESTAMP(3) | NOT NULL           | Last update time              |

Bootstrap admin: when `sys_user` is empty at server startup and both
`APP_BOOTSTRAP_ADMIN_USERNAME` and `APP_BOOTSTRAP_ADMIN_PASSWORD` are
set, `BootstrapAdminInitializer` creates one `ADMIN` row with a BCrypt
hash. If users already exist the initializer is a no-op. It never
creates a default user from a hardcoded password.

## 6. `device_user`

Per-device authorization grant. Created by
`V2__add_authentication.sql`.

| Column       | Type         | Rules                              | Meaning                         |
|--------------|--------------|------------------------------------|---------------------------------|
| `id`         | BIGINT       | PK, auto increment                 | Internal ID                     |
| `user_id`    | BIGINT       | FK -> `sys_user.id`, NOT NULL      | Granted user                    |
| `device_id`  | VARCHAR(64)  | FK -> `device.device_id`, NOT NULL | Granted device                  |
| `role`       | VARCHAR(16)  | NOT NULL                           | `OWNER`, `CONTROL`, or `VIEWER` |
| `created_at` | TIMESTAMP(3) | NOT NULL                           | Grant time                      |

Unique key:

```text
(user_id, device_id)
```

Authorization rules:

- `ADMIN` global role bypasses `device_user` and sees all devices
- `USER` global role must have a `device_user` row to access a device
- `OWNER` / `CONTROL` can read and upload events / heartbeat
- `VIEWER` can only read; event upload returns `403`

## 7. Idempotency Guarantee

The unique `event_id` is the source of truth. A repeated upload:

1. locks the device row
2. attempts `INSERT IGNORE`
3. sees zero affected rows
4. reads the original row
5. skips `relay_state`
6. skips broadcast

This is safe against mobile retries and concurrent duplicate requests.

## 8. Retention

Phase one has no automatic `relay_event` deletion. If retention is added
later, use an explicit archival process and preserve audit requirements.
