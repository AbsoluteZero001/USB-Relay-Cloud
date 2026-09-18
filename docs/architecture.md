# USB Relay Cloud Architecture

## 1. Scope

USB Relay Cloud is a Device -> Cloud -> Client IoT relay platform.
Phase one deliberately uses a modular monolith:

- one Spring Boot server
- one MySQL database
- one Vue codebase for browser, Capacitor Android, and future Electron
- raw REST plus raw WebSocket

MQTT, Kafka, Redis, OAuth2, complex RBAC, microservices, OTA, and
Cloud-to-Device remote control are not part of phase one. The module
boundaries below leave room for them.

Phase one supports two equivalent production deployments:

- **Part A — Docker Compose**: one `docker compose up` brings up
  MySQL + Spring Boot + Nginx, with Spring Boot 8080 and MySQL 3306
  on the Docker internal network only.
- **Part B — Native Ubuntu**: Spring Boot runs as a `systemd` service
  under a non-root user, MySQL is a host service, and Nginx is a host
  reverse proxy. Spring Boot 8080 and MySQL 3306 bind only to
  `127.0.0.1`.

Both variants expose only the Nginx port to the public internet. See
[docs/deployment.md](deployment.md) for the full procedure.

## 2. Three Layers

### Device

The Android device is the local USB Host:

```text
Android UI
  -> RelayService
  -> LocalRelayProvider
  -> AndroidUsbRelayAdapter
  -> Capacitor UsbRelay plugin
  -> Android USB Host API
  -> CH340
  -> LCUS-1
```

The browser and future Electron app use the same upper layers:

```text
RelayService
  -> LocalRelayProvider
  -> WebSerialRelayAdapter / ElectronSerialRelayAdapter
```

The Vue page never imports `navigator.serial`, Capacitor, Node SerialPort,
or Kotlin APIs directly.

### Cloud

The Spring Boot server owns:

- device registration and presence
- append-only relay events
- last commanded relay state
- transaction boundaries
- REST contracts
- WebSocket fan-out
- Flyway database migrations

`relay_event` is the audit record. `relay_state` is a materialized current
view for fast dashboard reads.

### Client

The shared Vue client contains:

- API and response types
- Pinia stores
- WebSocket reconnect and parsing
- `RelayService`
- one responsive page set

PC uses a persistent sidebar. Mobile uses a bottom navigation bar. The
mobile layout is not a scaled desktop shell.

## 3. Command and Event Flow

### Local control

```text
User taps ON/OFF
  -> RelayService.executeLocalCommand()
  -> LocalRelayProvider
  -> serial adapter sends raw bytes
  -> serial write succeeds
  -> client UUID eventId is created
  -> POST /api/devices/{deviceId}/events
  -> MySQL transaction
  -> WebSocket broadcast
```

A failed serial write does not upload a successful command event.

### Server transaction

The server performs these operations in one transaction:

1. upsert and lock the `device` row
2. `INSERT IGNORE` into `relay_event`
3. if the event is new, UPSERT `relay_state`
4. commit

Only after the transaction method returns does the server broadcast.
There is no WebSocket-first path.

### Idempotency

`relay_event.event_id` is unique. If the same event ID is uploaded again:

- no duplicate audit row is created
- `relay_state` is not changed a second time
- the server returns the original event with `idempotentReplay=true`
- no WebSocket broadcast is repeated

## 4. State Semantics

LCUS-1 does not currently have a verified hardware state readback
protocol. A successful serial write only proves that bytes were accepted
by the local serial transport.

The model therefore separates:

- `commandedState`: ON or OFF
- `commandStatus`: SUCCESS or FAILED
- `hardwareState`: always UNKNOWN in phase one

The UI labels the value as `Last Command`, not a confirmed physical
contact state.

## 5. Realtime Recovery

REST is used for initial state and history. WebSocket carries incremental
updates.

Client startup:

1. fetch devices
2. fetch current state
3. fetch recent events
4. open WebSocket with `afterSequence`
5. apply replay events
6. apply live events

Server connection behavior:

1. register the socket in the live-session map
2. send `CONNECTED`
3. query events with `id > afterSequence`
4. send each replay as `RELAY_STATE_CHANGED`
5. send `SYNC_COMPLETE`

An event can race between registration and replay query. It may arrive
once live and once in replay; the client deduplicates by `eventId`.
This simple sequence scheme closes the REST/WS gap without making
WebSocket responsible for full history.

Reconnect uses exponential backoff with a 30 second cap.

## 6. Provider Model

```text
RelayService
  ├── CloudRelayProvider
  │     └── reserved for future Cloud -> Device commands
  └── LocalRelayProvider
        ├── AndroidUsbRelayAdapter
        ├── ElectronSerialRelayAdapter
        └── WebSerialRelayAdapter
```

`CloudRelayProvider` intentionally rejects command execution in phase one.
It is an extension point, not a completed remote-control feature.

## 7. Security Boundary

Authentication and authorization are implemented:

- `POST /api/auth/login` validates username + BCrypt password and
  returns a short-lived JWT access token
- all REST endpoints except `/api/health` and `/api/auth/login`
  require `Authorization: Bearer <token>`
- WebSocket requires an `AUTH` frame within 5 seconds of `CONNECTED`
  or the server closes the socket
- `ADMIN` global role bypasses device-level checks
- `USER` global role must have a `device_user` grant (`OWNER` /
  `CONTROL` / `VIEWER`) for the requested device
- `VIEWER` can read but cannot upload events or heartbeat
- JWT secret comes only from `JWT_SECRET` env var; in `prod` profile
  the server refuses to boot with a secret shorter than 32 characters
- bootstrap admin is created only when `sys_user` is empty AND both
  `APP_BOOTSTRAP_ADMIN_USERNAME` and `APP_BOOTSTRAP_ADMIN_PASSWORD`
  are provided; no hardcoded default password

Other boundaries:

- UI does not access native serial APIs
- Android native bridge accepts Base64 bytes, not shell commands
- secrets come from environment variables only
- production traffic is expected to terminate TLS at Nginx or a cloud
  load balancer
- Nginx proxies REST and WebSocket separately
- Spring Boot 8080 and MySQL 3306 never bind to a public interface.
  In Docker Compose they live on the container internal network; in
  Native Ubuntu they bind to `127.0.0.1` only. Only the Nginx port
  (default `8088` in Docker, `80`/`443` in Native) is exposed

Not implemented: Refresh Token rotation, OAuth2 / SSO, multi-tenant
isolation, complex RBAC beyond the global + device role pair, and
Cloud-to-Device remote control. These are explicit future extensions.

## 8. Future Extensions

The package and interface boundaries allow later introduction of:

- Refresh Token rotation and SSO / OAuth2
- multiple users or tenants with stricter isolation
- Cloud-to-Device command queue
- MQTT/EMQX as an additional transport
- Redis for presence and fan-out
- OTA
- event outbox or message broker

Those additions should not require moving LCUS-1 byte protocol knowledge
into controllers or Vue pages.
