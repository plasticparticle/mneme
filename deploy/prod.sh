#!/usr/bin/env bash
# Wrapper around docker compose for the production stack: pins the compose
# file and the .env.prod env file so every invocation is consistent.
#
#   ./deploy/prod.sh up -d --build
#   ./deploy/prod.sh ps
#   ./deploy/prod.sh logs -f server
#   ./deploy/prod.sh exec server /journald backup        # backup right now
#   ./deploy/prod.sh exec server /journald list-backups
#   ./deploy/prod.sh down
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env.prod ]]; then
  echo "error: .env.prod not found — copy .env.prod.example and fill it in" >&2
  exit 1
fi

exec docker compose -f docker-compose.prod.yml --env-file .env.prod "$@"
