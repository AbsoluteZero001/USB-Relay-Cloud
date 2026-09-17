#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DEPLOY_DIR=$(dirname "$SCRIPT_DIR")

if [ -f "$DEPLOY_DIR/.env" ]; then
  docker compose --env-file "$DEPLOY_DIR/.env" \
    -f "$DEPLOY_DIR/docker-compose.yml" down
else
  docker compose -f "$DEPLOY_DIR/docker-compose.yml" down
fi
