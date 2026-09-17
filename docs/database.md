# Database Design

## 1. General Rules

- Database: MySQL 8
- Character set: `utf8mb4`
- Collation: `utf8mb4_0900_ai_ci`
- Time storage: UTC
- API serialization: ISO-8601
- Migration: Flyway
- Initial migration: `server/src/main/resources/db/migration/V1__initialize_relay_cloud.sql`

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

The state row is UPSERTed only when a new event is inserted.

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

## 5. Idempotency Guarantee

The unique `event_id` is the source of truth. A repeated upload:

1. locks the device row
2. attempts `INSERT IGNORE`
3. sees zero affected rows
4. reads the original row
5. skips `relay_state`
6. skips broadcast

This is safe against mobile retries and concurrent duplicate requests.

## 6. Retention

Phase one has no automatic `relay_event` deletion. If retention is added
later, use an explicit archival process and preserve audit requirements.
