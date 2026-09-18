# Deployment on Ubuntu 24.04

USB Relay Cloud 在 Ubuntu 24.04 上提供两套等价的生产部署方案：

| 方案                             | 适用场景                          | 拓扑                                                         |
|--------------------------------|-------------------------------|------------------------------------------------------------|
| **A. Docker Compose**（推荐）      | 单机快速上线、隔离环境、易回滚               | Host:8088 → Nginx 容器 → server 容器 + mysql 容器                |
| **B. Native Ubuntu**（无 Docker） | 企业内网禁用容器、直接对接 systemd/裸 MySQL | systemd → `java -jar` (127.0.0.1:8080) + 裸 MySQL + 裸 Nginx |

两套方案都遵循同样的安全约束：

- 对外只开放 Nginx 监听端口（默认 80 或 8088）
- Spring Boot 8080 与 MySQL 3306 **不暴露公网**（Docker 方案走内网，Native 方案仅监听 127.0.0.1）
- `JWT_SECRET` ≥ 32 字符；初始管理员账号通过 `APP_BOOTSTRAP_ADMIN_*` 仅在 `sys_user` 为空时创建
- 失败的 RelayEvent 不污染 `relay_state`（spec §19）
- V1 不实现 Cloud-to-Device 远程控制、MQTT、Redis、消息队列、微服务、K8s

## Part A — Docker Compose 部署

> 下面章节 1-8 描述 Docker Compose 方案的完整流程。如果使用 Native
> 方案，请直接跳到 [Part B](#part-b--native-ubuntu-部署无-docker)。

## 1. Server Preparation

Install Docker Engine and the Compose plugin, then verify:

```bash
docker --version
docker compose version
```

Open only the ports that are required:

```text
22/tcp   SSH
8088/tcp HTTP (Nginx public entry, maps Host:8088 -> container:80)
443/tcp  HTTPS, after TLS is configured in front of Nginx
```

MySQL 3306 and Spring Boot 8080 are Docker-internal only. Do not expose
them on the host or to the public internet.

## 2. Environment

Create the deployment environment file:

```bash
cd /opt/USB-Relay-Cloud/deploy
cp .env.example .env
chmod 600 .env
```

Set strong, different values for:

```text
MYSQL_PASSWORD
MYSQL_ROOT_PASSWORD
JWT_SECRET                         # >= 32 chars, e.g. openssl rand -base64 48
APP_BOOTSTRAP_ADMIN_USERNAME       # only used on first boot when sys_user is empty
APP_BOOTSTRAP_ADMIN_PASSWORD
APP_CORS_ALLOWED_ORIGINS           # comma-separated HTTPS origins; * for dev only
```

`JWT_SECRET` is required in production. The server refuses to boot if
it is missing or shorter than 32 characters under the `prod` profile.

The bootstrap admin is created only once, when `sys_user` is empty.
After that, rotating the admin password requires either changing it in
the database (BCrypt hash) or doing it through a future admin UI.

Do not commit `deploy/.env`.

## 3. Start

```bash
sh scripts/start.sh
```

The Compose stack contains:

- MySQL 8.4 (internal)
- Spring Boot server on 8080 (internal, behind Nginx)
- Nginx on Host:8088 serving the Vue build and proxying `/api/` + `/ws/`

Check:

```bash
docker compose --env-file .env -f docker-compose.yml ps
docker compose --env-file .env -f docker-compose.yml logs -f server
```

Health check (public):

```bash
curl http://<host>:8088/api/health
```

## 4. Nginx

The included configuration:

- serves Vue history routes through `try_files`
- proxies `/api/` to `server:8080`
- proxies `/ws/` to `server:8080`
- sends `Upgrade` and `Connection`
- keeps WebSocket read/send timeouts at one hour

For production, terminate TLS with a certificate manager or an Alibaba
Cloud load balancer. After TLS, use `https://` and `wss://`.

## 5. MySQL

Flyway runs automatically at server startup. Verify:

```bash
docker compose --env-file .env -f docker-compose.yml \
  exec mysql mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" \
  -e "SHOW TABLES; SELECT version, success FROM flyway_schema_history;"
```

Do not edit applied migration files.

## 6. Backup

Database backup example:

```bash
docker compose --env-file .env -f docker-compose.yml \
  exec -T mysql mysqldump \
  -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" \
  > "usb-relay-$(date +%F-%H%M%S).sql"
```

Store backups outside the ECS instance and test restore procedures.

## 7. Upgrade

```bash
git pull --ff-only
sh scripts/start.sh
```

The server image rebuilds and Flyway applies new migrations. Review new
migrations before production deployment.

## 8. Stop

```bash
sh scripts/stop.sh
```

The named MySQL volume is preserved by `docker compose down`.

## Part B — Native Ubuntu 部署（无 Docker）

适用于企业内网禁用容器、需要直接对接 systemd / 裸 MySQL / 裸 Nginx 的场景。
所有组件都装在主机上，对外只暴露 Nginx 监听端口，Spring Boot 8080 与
MySQL 3306 仅监听 127.0.0.1。

部署所需文件位于 `deploy/native/`：

| 文件                            | 部署位置                                         | 用途                     |
|-------------------------------|----------------------------------------------|------------------------|
| `usb-relay-cloud.service`     | `/etc/systemd/system/`                       | systemd 服务单元           |
| `usb-relay-cloud.env.example` | `/etc/usb-relay-cloud/usb-relay-cloud.env`   | Spring Boot 敏感配置       |
| `nginx.conf`                  | `/etc/nginx/sites-available/usb-relay-cloud` | Nginx 反向代理 + WebSocket |

### B.1 主机准备

```bash
sudo apt update && sudo apt install -y openjdk-21-jdk-headless maven \
    mysql-server nginx git ufw

java -version        # 需 21
mvn -version
mysql --version      # 需 8.0+
nginx -v
```

仅开放必要端口：

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp     # Nginx HTTP
sudo ufw allow 443/tcp    # 启用 TLS 后再开放
sudo ufw enable
```

### B.2 创建运行用户与目录

```bash
sudo useradd -r -s /usr/sbin/nologin -d /opt/usb-relay-cloud -M usbrelay
sudo mkdir -p /opt/usb-relay-cloud /var/www/usb-relay-cloud \
             /etc/usb-relay-cloud /opt/usb-relay-cloud/logs
sudo chown -R usbrelay:usbrelay /opt/usb-relay-cloud /etc/usb-relay-cloud
```

### B.3 编译并安装 JAR

```bash
cd /opt
sudo git clone <your-repo-url> USB-Relay-Cloud
cd USB-Relay-Cloud/server
sudo -u usbrelay mvn -DskipTests package
sudo cp target/usb-relay-cloud-server-*.jar \
     /opt/usb-relay-cloud/usb-relay-cloud-server.jar
sudo chown usbrelay:usbrelay /opt/usb-relay-cloud/usb-relay-cloud-server.jar
```

后续升级：

```bash
cd /opt/USB-Relay-Cloud
sudo git pull --ff-only
cd server
sudo -u usbrelay mvn -DskipTests package
sudo cp target/usb-relay-cloud-server-*.jar \
     /opt/usb-relay-cloud/usb-relay-cloud-server.jar
sudo systemctl restart usb-relay-cloud
```

### B.4 配置 MySQL

确保 `bind-address = 127.0.0.1`：

```bash
sudo sed -i 's/^bind-address.*/bind-address = 127.0.0.1/' \
    /etc/mysql/mysql.conf.d/mysqld.cnf
sudo systemctl restart mysql
```

创建数据库与用户（仅允许本机访问）：

```bash
sudo mysql <<'SQL'
CREATE DATABASE usb_relay_cloud CHARACTER SET utf8mb4
    COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'usb_relay'@'localhost' IDENTIFIED BY 'replace-with-strong-password';
GRANT ALL PRIVILEGES ON usb_relay_cloud.* TO 'usb_relay'@'localhost';
FLUSH PRIVILEGES;
SQL
```

Flyway 在 Spring Boot 启动时自动执行迁移，无需手工建表。

### B.5 安装敏感配置

```bash
sudo cp /opt/USB-Relay-Cloud/deploy/native/usb-relay-cloud.env.example \
        /etc/usb-relay-cloud/usb-relay-cloud.env
sudo nano /etc/usb-relay-cloud/usb-relay-cloud.env
sudo chown usbrelay:usbrelay /etc/usb-relay-cloud/usb-relay-cloud.env
sudo chmod 600 /etc/usb-relay-cloud/usb-relay-cloud.env
```

必填项：

```text
DB_PASSWORD                       # 与 B.4 中设置的密码一致
JWT_SECRET                       # >= 32 字符，openssl rand -base64 48
APP_BOOTSTRAP_ADMIN_USERNAME
APP_BOOTSTRAP_ADMIN_PASSWORD
APP_CORS_ALLOWED_ORIGINS          # 实际域名，生产不要用 *
```

### B.6 安装 systemd 服务

```bash
sudo cp /opt/USB-Relay-Cloud/deploy/native/usb-relay-cloud.service \
        /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable usb-relay-cloud
sudo systemctl start usb-relay-cloud
sudo systemctl status usb-relay-cloud
```

查日志：

```bash
sudo journalctl -u usb-relay-cloud -f
sudo journalctl -u usb-relay-cloud --since "10 minutes ago"
```

确认 8080 仅监听 127.0.0.1：

```bash
sudo ss -tlnp | grep 8080
# 期望: 127.0.0.1:8080  (不能是 0.0.0.0:8080)
```

### B.7 安装前端静态资源

```bash
cd /opt/USB-Relay-Cloud/client
sudo npm ci
sudo npm run build
sudo cp -r dist/* /var/www/usb-relay-cloud/
sudo chown -R www-data:www-data /var/www/usb-relay-cloud
```

### B.8 配置 Nginx

```bash
sudo cp /opt/USB-Relay-Cloud/deploy/native/nginx.conf \
        /etc/nginx/sites-available/usb-relay-cloud
sudo ln -s /etc/nginx/sites-available/usb-relay-cloud \
           /etc/nginx/sites-enabled/usb-relay-cloud
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

编辑 `/etc/nginx/sites-available/usb-relay-cloud`，把 `server_name`
改成实际域名。生产应在 Nginx 前启用 TLS（用 certbot 或阿里云 SLB），
之后客户端使用 `https://` 与 `wss://`。

### B.9 健康检查

```bash
curl http://127.0.0.1/api/health          # 经 Nginx
curl http://127.0.0.1:8080/api/health     # 直连 Spring Boot（仅本机）
sudo systemctl is-active usb-relay-cloud  # 期望: active
```

### B.10 备份

```bash
sudo mysqldump -u usb_relay -p usb_relay_cloud \
    | gzip > /opt/backup/usb-relay-$(date +%F-%H%M%S).sql.gz
```

将备份文件复制到 ECS 之外的存储，并定期测试恢复流程。

### B.11 停止与重启

```bash
sudo systemctl restart usb-relay-cloud   # 重启
sudo systemctl stop usb-relay-cloud      # 停止
```

### B.12 闭环验证

启动 server 与 Nginx 后，跑 Phase 11 的闭环脚本：

```bash
API_BASE_URL=http://127.0.0.1/api \
WS_BASE_URL=ws://127.0.0.1/ws/relay \
ADMIN_USERNAME=admin ADMIN_PASSWORD=<your-admin-password> \
node /opt/USB-Relay-Cloud/deploy/scripts/verify-closed-loop.mjs
```

期望输出：

```json
{
  "ok": true,
  "idempotentReplay": true,
  "commandedState": "ON",
  "hardwareState": "UNKNOWN",
  "websocketBackfill": true,
  "heartbeatStatus": "ONLINE",
  "deviceListed": true,
  "eventFiltersVerified": true,
  "authFlowVerified": true
}
```
