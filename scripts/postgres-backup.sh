#!/bin/sh
set -eu

# Run from the repository root. The dump is created by the PostgreSQL
# container, so the host never needs the database password or pg_dump binary.
COMPOSE_ENV_FILE=${COMPOSE_ENV_FILE:-.env.saas-postgres.local}
COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.yml}
BACKUP_DIR=${BACKUP_DIR:-./backups/postgres}

if [ ! -f "$COMPOSE_ENV_FILE" ]; then
  echo "Missing compose environment file: $COMPOSE_ENV_FILE" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
umask 077
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_file="$BACKUP_DIR/tdpos-postgres-$timestamp.dump"

docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' \
  > "$backup_file"

if [ ! -s "$backup_file" ]; then
  rm -f "$backup_file"
  echo "PostgreSQL backup is empty." >&2
  exit 1
fi

sha256sum "$backup_file" > "$backup_file.sha256"
chmod 600 "$backup_file" "$backup_file.sha256"
echo "Created $backup_file"
echo "Checksum $backup_file.sha256"
