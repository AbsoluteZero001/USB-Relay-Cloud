# REST and WebSocket API

## 1. Base Rules

REST base path:

```text
/api
```

WebSocket path:

```text
/ws/relay
```

All REST responses use:

```json
{
  "success": true,
  "code": "OK",
  "message": "success",
  "data": {},
  "timestamp": "2026-09-17T14:32:18Z"
}
```

Errors keep the same envelope and use a non-2xx HTTP status.

### Authentication

Except `/api/health` and `/api/auth/login`, all REST endpoints require
a JWT bearer token in the `Authorization` header:

```text
Authorization: Bearer <accessToken>
```

Missing or invalid tokens return `401 UNAUTHORIZED`. Insufficient
role returns `403 FORBIDDEN`.

- `ADMIN` global role can access every device
- `USER` global role can only access devices granted in `device_user`
- `OWNER` / `CONTROL` can read and upload events
- `VIEWER` can only read; event upload returns `403`

## 2. Auth

### Login

```http
POST /api/auth/login
```

Request:

```json
{
  "username": "admin",
  "password": "..."
}
```

Response data:

```json
{
  "accessToken": "eyJhbGciOi...",
  "tokenType": "Bearer",
  "expiresIn": 3600
}
```

Invalid credentials return `401 INVALID_CREDENTIALS`. Disabled users
return `401 USER_DISABLED`.

### Current user

```http
GET /api/auth/me
```

Response data:

```json
{
  "userId": 1,
  "username": "admin",
  "globalRole": "ADMIN"
}
```

## 3. Devices

### List devices

```http
GET /api/devices?page=1&pageSize=20
```

ADMIN sees all devices. Non-ADMIN sees only devices where a
`device_user` row exists for their `user_id`.

### Device detail

```http
GET /api/devices/{deviceId}
```

Returns the device and all known relay states. Requires any
device role (`OWNER` / `CONTROL` / `VIEWER`).

### Current relay state

```http
GET /api/devices/{deviceId}/state?channel=1
```

Example data:

```json
{
  "deviceId": "relay-001",
  "channel": 1,
  "commandedState": "ON",
  "commandStatus": "SUCCESS",
  "hardwareState": "UNKNOWN",
  "lastEventId": "dc0a6953-a5a0-45a8-931f-17971b7d9e84",
  "lastEventSequence": 1,
  "updatedAt": "2026-09-17T14:32:18Z"
}
```

## 4. Events

### Query events

```http
GET /api/devices/{deviceId}/events
```

Supported query parameters:

| Parameter | Meaning |
| --- | --- |
| `page` | One-based page number |
| `pageSize` | 1 to 100 |
| `afterSequence` | Return events with `sequence > value` |
| `from` | ISO-8601 lower time bound |
| `to` | ISO-8601 upper time bound |
| `action` | `ON` or `OFF` |
| `source` | `ANDROID`, `WEB`, `ELECTRON`, `SYSTEM` |

Requires any device role. `VIEWER` is allowed to read events.

### Upload event

```http
POST /api/devices/relay-001/events
```

Requires `OWNER` or `CONTROL` device role. `VIEWER` returns `403`.

Request:

```json
{
  "eventId": "dc0a6953-a5a0-45a8-931f-17971b7d9e84",
  "channel": 1,
  "action": "ON",
  "previousState": "OFF",
  "currentState": "ON",
  "commandStatus": "SUCCESS",
  "source": "ANDROID",
  "clientId": "android-tablet-001"
}
```

Rules:

- `eventId` must be a UUID
- `channel` is 1 to 16
- `action` and `currentState` must match
- `eventId` is idempotent
- `commandStatus = FAILED` does not update `relay_state` (spec §19)

The response adds `hardwareState: "UNKNOWN"` and
`idempotentReplay`.

## 5. Heartbeat

```http
POST /api/devices/relay-001/heartbeat
```

Requires `OWNER` or `CONTROL` device role.

Request:

```json
{
  "deviceName": "Relay-001",
  "deviceType": "USB_RELAY",
  "clientId": "android-tablet-001"
}
```

The server creates the device if it does not exist, marks it online,
updates `last_seen`, and returns current relay states.

## 6. Health

```http
GET /api/health
```

Public, no authentication required.

## 7. WebSocket

Connect:

```text
ws://host:8088/ws/relay?afterSequence=123
```

or under TLS:

```text
wss://host:8088/ws/relay?afterSequence=123
```

The server registers the session and sends `CONNECTED`. The client
must then send an `AUTH` frame within 5 seconds:

```json
{ "type": "AUTH", "token": "<accessToken>" }
```

On success the server replies `AUTHENTICATED` and starts replay/live
delivery. On failure or timeout the server replies `AUTH_FAILED` /
`ERROR` and closes the connection.

### `CONNECTED`

```json
{
  "type": "CONNECTED",
  "sequence": 123,
  "timestamp": "2026-09-17T14:32:18Z",
  "message": "websocket connected"
}
```

### `AUTHENTICATED`

```json
{
  "type": "AUTHENTICATED",
  "message": "authenticated as admin",
  "timestamp": "2026-09-17T14:32:18Z"
}
```

### `AUTH_FAILED`

```json
{
  "type": "AUTH_FAILED",
  "message": "invalid token",
  "timestamp": "2026-09-17T14:32:18Z"
}
```

The server closes the connection after sending `AUTH_FAILED`. The
client must not attempt reconnect with the same token.

### `RELAY_STATE_CHANGED`

```json
{
  "type": "RELAY_STATE_CHANGED",
  "sequence": 124,
  "eventId": "dc0a6953-a5a0-45a8-931f-17971b7d9e84",
  "deviceId": "relay-001",
  "channel": 1,
  "commandedState": "ON",
  "commandStatus": "SUCCESS",
  "hardwareState": "UNKNOWN",
  "previousState": "OFF",
  "currentState": "ON",
  "action": "ON",
  "source": "ANDROID",
  "clientId": "android-tablet-001",
  "timestamp": "2026-09-17T14:32:18Z"
}
```

### `DEVICE_STATUS_CHANGED`

```json
{
  "type": "DEVICE_STATUS_CHANGED",
  "deviceId": "relay-001",
  "deviceName": "Relay-001",
  "onlineStatus": "OFFLINE",
  "timestamp": "2026-09-17T14:35:00Z"
}
```

### `SYNC_COMPLETE`

```json
{
  "type": "SYNC_COMPLETE",
  "sequence": 124,
  "timestamp": "2026-09-17T14:32:19Z",
  "message": "replayed 2 event(s)"
}
```

### `ERROR`

```json
{
  "type": "ERROR",
  "message": "authentication timeout",
  "timestamp": "2026-09-17T14:32:23Z"
}
```

Sent when the 5 second auth window elapses without a valid `AUTH`
frame. The server closes the connection right after.

### Delivery filtering

- `ADMIN` sessions receive every `RELAY_STATE_CHANGED` /
  `DEVICE_STATUS_CHANGED` event across all devices
- non-`ADMIN` sessions only receive events for devices listed in
  their `device_user` grants
- gap replay is filtered the same way

Clients deduplicate relay events by `eventId`.
