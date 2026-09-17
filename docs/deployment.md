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
80/tcp   HTTP
443/tcp  HTTPS, after TLS is configured
```

MySQL and the Spring Boot port should remain private in production.

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
```

Set `CORS_ALLOWED_ORIGIN_PATTERNS` to the real HTTPS origin. Do not commit
`deploy/.env`.

## 3. Start

```bash
sh scripts/start.sh
```

The Compose stack contains:

- MySQL 8.4
- Spring Boot server
- Nginx serving the Vue build and proxying `/api/` plus `/ws/`

Check:

```bash
docker compose --env-file .env -f docker-compose.yml ps
docker compose --env-file .env -f docker-compose.yml logs -f server
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
