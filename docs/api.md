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

## 2. Devices

### List devices

```http
GET /api/devices?page=1&pageSize=20
```

### Device detail

```http
GET /api/devices/{deviceId}
```

Returns the device and all known relay states.

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

## 3. Events

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

### Upload event

```http
POST /api/devices/relay-001/events
```

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

The response adds `hardwareState: "UNKNOWN"` and
`idempotentReplay`.

## 4. Heartbeat

```http
POST /api/devices/relay-001/heartbeat
```

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

## 5. Health

```http
GET /api/health
```

## 6. WebSocket

Connect:

```text
ws://host/ws/relay?afterSequence=123
```

or under TLS:

```text
wss://host/ws/relay?afterSequence=123
```

The server registers the session, sends replay events after the supplied
sequence, then sends live messages.

### `CONNECTED`

```json
{
  "type": "CONNECTED",
  "sequence": 123,
  "timestamp": "2026-09-17T14:32:18Z",
  "message": "websocket connected"
}
```

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

Clients deduplicate relay events by `eventId`.
