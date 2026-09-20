// USB Relay Cloud 闭环验证脚本（Phase 11，适配 JWT）
//
// 流程：
//   1. POST /api/auth/login → 获取 accessToken
//   2. 无 token 访问 /api/devices → 期望 401
//   3. WS 连接 → 发送 AUTH 帧 → 等待 AUTHENTICATED
//   4. POST /api/devices/{id}/events（Bearer）→ 200，idempotentReplay=false
//   5. 重放相同 eventId → 200，idempotentReplay=true（幂等）
//   6. WS 实时收到 RELAY_STATE_CHANGED
//   7. GET /state → commandedState=ON, hardwareState=UNKNOWN
//   8. 第二条 WS 连接 afterSequence=0 → gap replay 收到该事件 + SYNC_COMPLETE
//
// 用法：
//   API_BASE_URL=http://127.0.0.1:8088/api \
//   WS_BASE_URL=ws://127.0.0.1:8088/ws/relay \
//   ADMIN_USERNAME=admin ADMIN_PASSWORD=... \
//   node deploy/scripts/verify-closed-loop.mjs

import assert from "node:assert/strict";

const apiBase =
    process.env.API_BASE_URL ?? "http://127.0.0.1:8088/api";
const wsBase =
    process.env.WS_BASE_URL ?? "ws://127.0.0.1:8088/ws/relay";
const deviceId = process.env.DEVICE_ID ?? "relay-001";
const adminUsername =
    process.env.ADMIN_USERNAME ?? "admin";
const adminPassword = process.env.ADMIN_PASSWORD ?? "";
const eventId = crypto.randomUUID();

if (!adminPassword) {
    console.error(
        "ADMIN_PASSWORD environment variable is required " +
        "(must match APP_BOOTSTRAP_ADMIN_PASSWORD)",
    );
    process.exit(1);
}

function apiUrl(path) {
  return `${apiBase.replace(/\/$/, "")}${path}`;
}

async function login(username, password) {
    const response = await fetch(apiUrl("/auth/login"), {
        method: "POST",
    headers: { "Content-Type": "application/json" },
        body: JSON.stringify({username, password}),
    });
    const body = await response.json();
    if (!response.ok || !body.success) {
        throw new Error(
            `login failed: ${response.status} ${body.code} ${body.message}`,
        );
    }
    return body.data.accessToken;
}

async function request(path, token, options = {}) {
    const headers = {
        "Content-Type": "application/json",
        ...(token ? {Authorization: `Bearer ${token}`} : {}),
        ...(options.headers ?? {}),
    };
    const response = await fetch(apiUrl(path), {
    ...options,
        headers,
  });
  const body = await response.json();
  if (!response.ok || !body.success) {
    throw new Error(
        `${options.method ?? "GET"} ${path} failed: ` +
        `${response.status} ${body.code} ${body.message}`,
    );
  }
  return body.data;
}

async function expectUnauthorized(path) {
    const response = await fetch(apiUrl(path), {
        headers: {"Content-Type": "application/json"},
    });
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.success, false);
    assert.equal(body.code, "UNAUTHORIZED");
}

function openWebSocketWithAuth(token, afterSequence = 0) {
    return new Promise((resolve, reject) => {
        const url = `${wsBase.replace(/\/$/, "")}?afterSequence=${afterSequence}`;
        const socket = new WebSocket(url);
        const timeout = setTimeout(() => {
            reject(new Error("websocket open+auth timeout"));
            socket.close();
        }, 10_000);

        socket.addEventListener("open", () => {
            socket.send(JSON.stringify({type: "AUTH", token}));
        });
        socket.addEventListener("message", (event) => {
            const message = JSON.parse(event.data);
            if (message.type === "AUTHENTICATED") {
                clearTimeout(timeout);
                resolve(socket);
            } else if (message.type === "AUTH_FAILED") {
                clearTimeout(timeout);
                reject(new Error(`AUTH_FAILED: ${message.message}`));
                socket.close();
            }
        });
        socket.addEventListener("error", () => {
            clearTimeout(timeout);
            reject(new Error("websocket connection failed"));
        });
    });
}

function waitForRelayMessage(socket, expectedEventId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("timed out waiting for RELAY_STATE_CHANGED"));
    }, 10_000);
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (
        message.type === "RELAY_STATE_CHANGED" &&
        message.eventId === expectedEventId
      ) {
        clearTimeout(timeout);
        resolve(message);
      }
    });
    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("websocket connection failed"));
    });
  });
}

function waitForBackfill(socket, expectedEventId) {
  return new Promise((resolve, reject) => {
    let replayed = false;
    const timeout = setTimeout(() => {
      reject(new Error("timed out waiting for websocket backfill"));
    }, 10_000);
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (
        message.type === "RELAY_STATE_CHANGED" &&
        message.eventId === expectedEventId
      ) {
        replayed = true;
      }
      if (message.type === "SYNC_COMPLETE") {
        clearTimeout(timeout);
        if (replayed) {
          resolve(true);
        } else {
          reject(new Error("SYNC_COMPLETE arrived without replayed event"));
        }
      }
    });
    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("websocket backfill connection failed"));
    });
  });
}

// 1. 登录获取 JWT
const token = await login(adminUsername, adminPassword);

// 2. 无 token 访问受保护端点 → 期望 401 UNAUTHORIZED
await expectUnauthorized("/devices");

// 3. 建立 WS 并发送 AUTH 帧
const socket = await openWebSocketWithAuth(token, 0);

// 3.5 先 heartbeat 注册设备（设备不存在时由 ADMIN 自注册）
await request(
    `/devices/${deviceId}/heartbeat`,
    token,
    {
        method: "POST",
        body: JSON.stringify({
            deviceName: deviceId,
            deviceType: "USB_RELAY",
            clientId: "android-tablet-001",
        }),
    },
);

// 4. 提交事件（Bearer），同时监听 WS 实时推送
const pushed = waitForRelayMessage(socket, eventId);
const payload = {
  eventId,
  channel: 1,
  action: "ON",
  previousState: "OFF",
  currentState: "ON",
  commandStatus: "SUCCESS",
  source: "ANDROID",
  clientId: "android-tablet-001",
};

const created = await request(
    `/devices/${deviceId}/events`,
    token,
    {method: "POST", body: JSON.stringify(payload)},
);

// 5. 重放相同 eventId → 幂等
const replay = await request(
    `/devices/${deviceId}/events`,
    token,
    {method: "POST", body: JSON.stringify(payload)},
);

// 6. 等待 WS 实时推送
const realtime = await pushed;

// 7. 校验状态与日志
const state = await request(`/devices/${deviceId}/state`, token);
const events = await request(
  `/devices/${deviceId}/events?page=1&pageSize=10`,
    token,
);
const heartbeat = await request(
    `/devices/${deviceId}/heartbeat`,
    token,
    {
        method: "POST",
        body: JSON.stringify({
            deviceName: deviceId,
            deviceType: "USB_RELAY",
            clientId: "android-tablet-001",
        }),
    },
);
const devices = await request("/devices?page=1&pageSize=20", token);
const detail = await request(`/devices/${deviceId}`, token);
const filteredEvents = await request(
  `/devices/${deviceId}/events?page=1&pageSize=10&action=ON&source=ANDROID`,
    token,
);

assert.equal(created.eventId, eventId);
assert.equal(created.idempotentReplay, false);
assert.equal(replay.idempotentReplay, true);
assert.equal(realtime.commandedState, "ON");
assert.equal(realtime.hardwareState, "UNKNOWN");
assert.equal(state.commandedState, "ON");
assert.equal(state.hardwareState, "UNKNOWN");
assert.equal(
  events.records.filter((event) => event.eventId === eventId).length,
  1,
);
assert.equal(heartbeat.device.onlineStatus, "ONLINE");
assert.ok(
  devices.records.some((device) => device.deviceId === deviceId),
);
assert.equal(detail.device.deviceId, deviceId);
assert.ok(
  filteredEvents.records.every(
    (event) => event.action === "ON" && event.source === "ANDROID",
  ),
);

socket.close();

// 8. 第二条 WS 连接（afterSequence=0）→ gap replay
const backfillSocket = await openWebSocketWithAuth(token, 0);
const backfillVerified = await waitForBackfill(backfillSocket, eventId);
backfillSocket.close();

console.log(
  JSON.stringify(
    {
      ok: true,
      eventId,
      sequence: created.sequence,
      websocketType: realtime.type,
      idempotentReplay: replay.idempotentReplay,
      commandedState: state.commandedState,
      hardwareState: state.hardwareState,
      websocketBackfill: backfillVerified,
      heartbeatStatus: heartbeat.device.onlineStatus,
      deviceListed: true,
      eventFiltersVerified: true,
        authFlowVerified: true,
    },
    null,
    2,
  ),
);
