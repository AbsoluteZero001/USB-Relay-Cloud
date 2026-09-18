# USB Relay Cloud

USB Relay Cloud 是一个 Device -> Cloud -> Client 架构的多端 USB 继电器平台。

第一阶段使用同一套 Vue 3 页面支持 Browser、Capacitor Android 和未来
Electron，云端使用 Spring Boot + MySQL，通过 REST 管理设备、状态和
append-only 日志，通过 WebSocket 实时同步其他在线客户端。

## 当前阶段

V1 已实现：

- Vue 3 + TypeScript + Vite + Pinia + Vue Router + Axios 客户端
- PC Sidebar 与 Mobile Bottom Navigation 两套真实响应式布局
- 全部用户可见界面中文化（API/DB/协议字段保持英文）
- Spring Boot 3 + Java 21 + MyBatis-Plus + MySQL 8
- Flyway 数据库迁移（V1 设备表 + V2 认证表）
- device / relay_state / relay_event / sys_user / device_user
- REST 设备、状态、事件、心跳接口
- Spring Security + BCrypt + JWT 认证
- 设备级权限（OWNER / CONTROL / VIEWER，ADMIN 全访问）
- WebSocket 重连、指数退避、事件去重和 sequence 补发
- WebSocket AUTH 帧强制认证 + 5s 超时 + 设备权限过滤
- eventId 幂等；FAILED 事件不污染 relay_state（spec §19）
- 客户端 EventOutbox：本地待同步队列，重连/启动自动重试
- 客户端可配置服务器地址（自动派生 REST / WS）
- Docker Compose、Nginx（Host 8088→Nginx80）、MySQL、Server 部署
- Native Ubuntu 部署（systemd + 裸 MySQL + 裸 Nginx + 可执行 JAR）
- Capacitor Android 工程与 Kotlin USB Host 插件迁移
- Web Serial、Android USB 与 Electron IPC 的 Provider/Adapter 边界

当前没有实现 Cloud-to-Device 远程控制、MQTT、消息队列、Redis、
微服务、Kubernetes、OTA 或多租户。

## 重要状态说明

已验证的 LCUS-1 指令为：

| 操作 | HEX |
| --- | --- |
| Relay 1 ON | `A0 01 01 A2` |
| Relay 1 OFF | `A0 01 00 A1` |

LCUS-1 当前没有经过验证的硬件状态回读协议。串口 write 成功只表示
软件已写入命令，不代表实体触点已确认状态。

因此数据模型始终区分：

- `commandedState`: `ON` / `OFF`
- `commandStatus`: `SUCCESS` / `FAILED`
- `hardwareState`: 第一阶段固定为 `UNKNOWN`

UI 使用 `Last Command`，不会把写入成功显示成硬件确认。

## 系统架构

```text
Android / Web / Electron
        |
        v
   RelayService
        |
        +--> LocalRelayProvider
        |      +--> AndroidUsbRelayAdapter
        |      +--> ElectronSerialRelayAdapter (reserved)
        |      +--> WebSerialRelayAdapter
        |
        +--> CloudRelayProvider (future remote commands)
        |
        v
HTTPS REST + WSS
        |
        v
Spring Boot
        |
        +--> MySQL transaction
        +--> WebSocket broadcast
```

事件闭环：

```text
local serial write success
  -> POST relay event
  -> MySQL transaction
  -> commit
  -> WebSocket broadcast
```

广播永远发生在数据库事务提交之后。

## 技术栈

### Client

- Vue 3 Composition API
- TypeScript
- Vite
- Pinia
- Vue Router
- Axios
- Capacitor Android
- Native WebSocket
- Vitest

### Android

- Capacitor 8
- Kotlin
- Android USB Host API
- `usb-serial-for-android`
- CH340 / LCUS-1 raw bytes

### Server

- Java 21
- Spring Boot 3.4
- Spring Web
- Spring WebSocket
- Bean Validation
- MyBatis-Plus
- MySQL 8
- Flyway
- Maven

### Deployment

- Docker
- Docker Compose
- Nginx
- Ubuntu 24.04
- Alibaba Cloud ECS

## 项目目录

```text
USB-Relay-Cloud/
├─ client/
│  ├─ src/
│  │  ├─ api/
│  │  ├─ assets/
│  │  ├─ components/
│  │  ├─ layouts/
│  │  ├─ router/
│  │  ├─ services/
│  │  ├─ stores/
│  │  ├─ types/
│  │  ├─ utils/
│  │  └─ views/
│  ├─ android/
│  ├─ electron/                 future bridge notes/contract
│  ├─ public/
│  ├─ package.json
│  ├─ vite.config.ts
│  └─ tsconfig.json
├─ server/
│  ├─ src/main/java/
│  ├─ src/main/resources/
│  ├─ src/test/
│  └─ pom.xml
├─ deploy/
│  ├─ docker-compose.yml
│  ├─ nginx/
│  └─ scripts/
├─ docs/
│  ├─ architecture.md
│  ├─ api.md
│  ├─ database.md
│  ├─ deployment.md
│  └─ protocol.md
└─ .github/workflows/ci.yml
```

## 本地开发

### 1. 环境

推荐：

- JDK 21
- Maven 3.9+
- Node.js 22+
- npm 10+
- MySQL 8，或 Docker Compose

### 2. 数据库和 Server

复制部署环境：

```powershell
Copy-Item deploy\.env.example deploy\.env
```

修改 `deploy/.env` 中的数据库密码。不要提交该文件。

仅启动 MySQL 和 Server：

```powershell
docker compose --env-file deploy\.env -f deploy\docker-compose.yml up -d --build mysql server
```

Server 地址：

```text
http://localhost:8080
```

Health：

```powershell
Invoke-RestMethod http://localhost:8080/api/health
```

如果不使用 Docker，直接运行 Spring Boot 前必须提供：

```text
DB_URL
DB_USERNAME
DB_PASSWORD
SERVER_PORT
JWT_SECRET                       # ≥ 32 字符，dev profile 有默认值仅供本地
APP_BOOTSTRAP_ADMIN_USERNAME     # 首次启动 sys_user 为空时创建管理员
APP_BOOTSTRAP_ADMIN_PASSWORD
APP_CORS_ALLOWED_ORIGINS         # 开发可用 *
```

例如：

```powershell
$env:DB_URL="jdbc:mysql://127.0.0.1:3306/usb_relay_cloud?useUnicode=true&characterEncoding=utf8&connectionTimeZone=UTC"
$env:DB_USERNAME="usb_relay"
$env:DB_PASSWORD="your-local-password"
$env:SERVER_PORT="8080"
$env:JWT_SECRET="dev-only-jwt-secret-32chars-min-do-not-use-in-prod"
$env:APP_BOOTSTRAP_ADMIN_USERNAME="admin"
$env:APP_BOOTSTRAP_ADMIN_PASSWORD="admin-pass-123"
$env:APP_CORS_ALLOWED_ORIGINS="*"
cd server
mvn spring-boot:run
```

### 3. Vue

```powershell
cd client
npm install
npm run dev
```

开发地址：

```text
http://localhost:5173
```

开发环境 API 和 WebSocket 地址在 `client/.env.development` 中配置。

常用验证：

```powershell
npm run typecheck
npm test
npm run build
```

### 4. 模拟完整闭环

Server、MySQL 和 WebSocket 启动后，运行：

```powershell
node deploy\scripts\verify-closed-loop.mjs
```

脚本会：

- 建立 WebSocket
- POST 一个 Relay Event
- 重复 POST 同一个 eventId
- 校验幂等重放
- 校验 WebSocket 实时广播
- 校验断线后的 sequence 补发
- 校验 state、device、event filter 和 heartbeat API

## MySQL

Flyway migration 位置：

```text
server/src/main/resources/db/migration/
```

核心表：

- `device` — 设备注册
- `relay_state` — 每设备最新指令状态（SUCCESS 才 UPSERT）
- `relay_event` — append-only 事件审计日志
- `sys_user` — 系统用户（global_role: ADMIN/USER）
- `device_user` — 设备级授权（role: OWNER/CONTROL/VIEWER）

详细字段和索引见 [docs/database.md](docs/database.md)。

`relay_event` 是 append-only 审计表。正常业务不 UPDATE、不 DELETE。
`relay_state` 的 `lastEventId` / `commandedState` / `commandStatus`
仅在事件 `commandStatus = SUCCESS` 时更新；FAILED 事件不污染状态（spec §19）。

## Spring Boot

Server 包结构：

```text
com.absolutezero.usbrelaycloud
├─ common
├─ config
├─ controller
├─ dto
├─ entity
├─ exception
├─ mapper
├─ service
├─ vo
└─ websocket
```

Controller 只负责参数和响应，事务逻辑位于 Service。

## REST 和 WebSocket

公开接口：

```text
GET  /api/health
POST /api/auth/login        # 用户名/密码 → accessToken
```

需要 `Authorization: Bearer <token>`：

```text
GET  /api/auth/me
GET  /api/devices
GET  /api/devices/{deviceId}
GET  /api/devices/{deviceId}/state
GET  /api/devices/{deviceId}/events
POST /api/devices/{deviceId}/events
POST /api/devices/{deviceId}/heartbeat
```

WebSocket：

```text
ws://host:8088/ws/relay?afterSequence=123
```

连接后必须在 5 秒内发送 AUTH 帧完成认证，否则服务器关闭连接：

```json
{ "type": "AUTH", "token": "<accessToken>" }
```

服务端消息类型：

- `CONNECTED` — 已连接，等待 AUTH
- `AUTHENTICATED` — 认证成功，之后开始下发业务消息
- `AUTH_FAILED` — 认证失败，连接即将关闭
- `RELAY_STATE_CHANGED` — 设备状态实时变更
- `DEVICE_STATUS_CHANGED` — 设备在线状态变更
- `SYNC_COMPLETE` — gap replay 补发完成
- `ERROR` — 鉴权超时或协议错误

非 ADMIN 用户只能收到自己有权限的设备事件；ADMIN 收到全部。
完整协议见 [docs/api.md](docs/api.md)。

## Android

Android 工程位于 `client/android`。

重要：旧版 `USB-Relay-Android` APK 只执行本地 USB 控制，不上传
Cloud。只有使用新 `USB-Relay-Cloud` 客户端构建的 APK 才会在串口写入
成功后上传事件并接收 WebSocket 实时更新。

同步步骤：

```powershell
cd client
npm run android:sync
```

构建 Debug APK：

```powershell
cd client\android
.\gradlew.bat assembleDebug
```

Android 迁移保留：

- USB Host 设备枚举
- CH340 识别
- USB 权限请求、拒绝和超时
- 串口打开与关闭
- Base64 原生字节传输
- 设备拔出事件
- 已实机验证的 LCUS-1 ON/OFF 字节

新 APK 首次打开后，在“设置 -> 服务器地址”填写部署地址，例如：

```text
https://relay.example.com
```

客户端会自动使用：

```text
https://relay.example.com/api
wss://relay.example.com/ws/relay
```

Debug 构建允许局域网 HTTP 调试；Release 构建要求 HTTPS/WSS。

当前 Android 代码尚未在本仓库完成真实 USB OTG + CH340 + LCUS-1
实机控制验证。

## 部署方案

V1 同时支持两套等价的生产部署方案。两套方案都遵守同样的安全约束：
对外只开放 Nginx 端口，Spring Boot 8080 与 MySQL 3306 不暴露公网，
`JWT_SECRET` ≥ 32 字符，FAILED 事件不污染状态，Cloud-to-Device 未实现。

### Part A — Docker Compose（推荐）

生产拓扑（仅 Nginx 80 通过 Host 8088 暴露公网）：

```text
Internet
  -> Host:8088 -> Nginx:80
     -> /api/ -> Spring Boot:8080 (内网)
     -> /ws/  -> Spring Boot:8080 (内网)
     -> /     -> Vue static files
  -> MySQL:3306 (内网，不暴露)
```

Spring Boot 8080 和 MySQL 3306 不映射到 Host，只走 Docker 内网。
对外只开放 Nginx 监听的 `HTTP_PORT`（默认 8088）。

启动前必须设置 `JWT_SECRET`（≥ 32 字符）和初始管理员账号
（`APP_BOOTSTRAP_ADMIN_USERNAME` / `APP_BOOTSTRAP_ADMIN_PASSWORD`），
详见 `deploy/.env.example`。

启动：

```bash
cd deploy
cp .env.example .env
chmod 600 .env
sh scripts/start.sh
```

停止：

```bash
sh scripts/stop.sh
```

### Part B — Native Ubuntu（无 Docker）

适用于企业内网禁用容器、需要直接对接 systemd / 裸 MySQL / 裸 Nginx
的场景。生产拓扑：

```text
Internet
  -> :80 (或 :443 + TLS) -> Nginx (host)
     -> /api/ proxy_pass http://127.0.0.1:8080
     -> /ws/  proxy_pass http://127.0.0.1:8080 (WebSocket Upgrade)
     -> /     -> /var/www/usb-relay-cloud (Vue dist)
  -> systemd -> java -jar (127.0.0.1:8080，非 root)
  -> mysql.service (127.0.0.1:3306)
```

部署文件位于 `deploy/native/`：

| 文件                            | 安装位置                                         | 用途                   |
|-------------------------------|----------------------------------------------|----------------------|
| `usb-relay-cloud.service`     | `/etc/systemd/system/`                       | systemd 服务           |
| `usb-relay-cloud.env.example` | `/etc/usb-relay-cloud/usb-relay-cloud.env`   | Spring Boot 敏感配置     |
| `nginx.conf`                  | `/etc/nginx/sites-available/usb-relay-cloud` | Nginx 反代 + WebSocket |

最小启动顺序：

```bash
# 1. 编译 JAR
cd server
sudo -u usbrelay mvn -DskipTests package
sudo cp target/usb-relay-cloud-server-*.jar \
     /opt/usb-relay-cloud/usb-relay-cloud-server.jar

# 2. 安装敏感配置（chmod 600）
sudo cp deploy/native/usb-relay-cloud.env.example \
        /etc/usb-relay-cloud/usb-relay-cloud.env
sudo nano /etc/usb-relay-cloud/usb-relay-cloud.env

# 3. 安装 systemd 服务
sudo cp deploy/native/usb-relay-cloud.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now usb-relay-cloud

# 4. 配置 Nginx
sudo cp deploy/native/nginx.conf /etc/nginx/sites-available/usb-relay-cloud
sudo ln -s /etc/nginx/sites-available/usb-relay-cloud \
           /etc/nginx/sites-enabled/usb-relay-cloud
sudo nginx -t && sudo systemctl reload nginx
```

查日志：

```bash
sudo journalctl -u usb-relay-cloud -f
```

详细 Ubuntu 24.04 部署流程（含 Part A 与 Part B 完整步骤）见
[docs/deployment.md](docs/deployment.md)。

## 当前验证状态

已执行并通过：

- Server Maven 编译和单元测试（27 个测试，含 Security/JWT/权限）
- H2 下的 Mapper / 持久化测试
- MySQL 8.0.43 + Flyway 真实迁移（V1 设备表 + V2 认证表）
- REST Event Upload（需 Bearer Token）
- eventId 幂等
- relay_event INSERT
- relay_state UPSERT（FAILED 事件不污染状态）
- WebSocket AUTH 帧认证 + 5s 超时
- WebSocket 实时广播（按设备权限过滤）
- WebSocket sequence 补发
- Browser 跨客户端实时显示
- Vue TypeScript 严格检查
- Vitest store / event mapping / WebSocket handling / EventOutbox
- Vue production build
- Capacitor `sync android`
- 闭环验证脚本 `deploy/scripts/verify-closed-loop.mjs`
  覆盖 login → 401 → WS AUTH → POST → 幂等 → 实时 → gap replay

未完成或未验证：

- Android Gradle APK 构建（Phase 13 待执行）
- Android USB OTG 真机
- CH340 在 Android 上的读写
- LCUS-1 Android 实机 ON/OFF
- Electron Node SerialPort 新项目适配
- Cloud-to-Device 远程控制（仅保留接口，未实现）

## 已知限制

- LCUS-1 无硬件回读，`hardwareState` 始终为 UNKNOWN。
- 当前只有通道 1 的 LCUS-1 指令经过验证。
- ADMIN 可见全部设备事件；普通用户按 `device_user` 授权过滤。
- 大离线队列、消息队列和分布式一致性尚未实现。
- Android App 没有后台常驻、开机启动或 Foreground Service。
- Cloud-to-Device 远程控制未实现，仅保留接口边界。

## Roadmap

1. 增加 Cloud-to-Device command 队列（远程下发控制）。
2. 根据部署规模引入 Redis 或 MQTT/EMQX。
3. 完成 Android USB OTG 和 LCUS-1 实机验证。
4. 恢复 Electron Node SerialPort 完整构建。
5. 增加事件补偿重试和可观测性。
6. 增加 OTA、设备固件版本和更完整的设备管理。
7. 引入多租户、Refresh Token 和更细粒度审计。

架构细节见 [docs/architecture.md](docs/architecture.md)。
