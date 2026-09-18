# Deployment on Ubuntu 24.04

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
