#!/bin/sh
set -eu

# Restore is intentionally explicit and destructive. Set
# CONFIRM_RESTORE=YES only after taking a fresh backup and checking the file.
COMPOSE_ENV_FILE=${COMPOSE_ENV_FILE:-.env.saas-postgres.local}
COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.postgres.yml}
BACKUP_FILE=${BACKUP_FILE:-}

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "Set BACKUP_FILE to an existing PostgreSQL custom-format dump." >&2
  exit 1
fi

if [ "${CONFIRM_RESTORE:-}" != "YES" ]; then
  echo "Restore replaces current PostgreSQL data. Re-run with CONFIRM_RESTORE=YES after taking a fresh backup." >&2
  exit 1
fi

if [ -f "$BACKUP_FILE.sha256" ]; then
  sha256sum -c "$BACKUP_FILE.sha256"
fi

docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  sh -c 'pg_restore --clean --if-exists --exit-on-error --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < "$BACKUP_FILE"

echo "Restored $BACKUP_FILE"
