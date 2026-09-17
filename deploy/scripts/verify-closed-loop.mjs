import assert from "node:assert/strict";

const apiBase = process.env.API_BASE_URL ?? "http://127.0.0.1:8080/api";
const wsBase =
  process.env.WS_BASE_URL ?? "ws://127.0.0.1:8080/ws/relay";
const deviceId = process.env.DEVICE_ID ?? "relay-001";
const eventId = crypto.randomUUID();

function apiUrl(path) {
  return `${apiBase.replace(/\/$/, "")}${path}`;
}

async function request(path, options) {
  const response = await fetch(apiUrl(path), {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const body = await response.json();
  if (!response.ok || !body.success) {
    throw new Error(
      `${options?.method ?? "GET"} ${path} failed: ` +
        `${response.status} ${body.code} ${body.message}`,
    );
  }
  return body.data;
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

const socket = new WebSocket(
  `${wsBase.replace(/\/$/, "")}?afterSequence=0`,
);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener(
    "error",
    () => reject(new Error("failed to open websocket")),
    { once: true },
  );
});

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

const created = await request(`/devices/${deviceId}/events`, {
  method: "POST",
  body: JSON.stringify(payload),
});
const replay = await request(`/devices/${deviceId}/events`, {
  method: "POST",
  body: JSON.stringify(payload),
});
const realtime = await pushed;
const state = await request(`/devices/${deviceId}/state`);
const events = await request(
  `/devices/${deviceId}/events?page=1&pageSize=10`,
);
const heartbeat = await request(`/devices/${deviceId}/heartbeat`, {
  method: "POST",
  body: JSON.stringify({
    deviceName: deviceId,
    deviceType: "USB_RELAY",
    clientId: "android-tablet-001",
  }),
});
const devices = await request("/devices?page=1&pageSize=20");
const detail = await request(`/devices/${deviceId}`);
const filteredEvents = await request(
  `/devices/${deviceId}/events?page=1&pageSize=10&action=ON&source=ANDROID`,
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

const backfillSocket = new WebSocket(
  `${wsBase.replace(/\/$/, "")}?afterSequence=0`,
);
await new Promise((resolve, reject) => {
  backfillSocket.addEventListener("open", resolve, { once: true });
  backfillSocket.addEventListener(
    "error",
    () => reject(new Error("failed to open backfill websocket")),
    { once: true },
  );
});
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
    },
    null,
    2,
  ),
);
