#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DEPLOY_DIR=$(dirname "$SCRIPT_DIR")

if [ ! -f "$DEPLOY_DIR/.env" ]; then
  echo "deploy/.env is required. Copy deploy/.env.example and set real values." >&2
  exit 1
fi

docker compose --env-file "$DEPLOY_DIR/.env" \
  -f "$DEPLOY_DIR/docker-compose.yml" up -d --build
