# SaaS PostgreSQL P0 runbook

## Readiness

- `GET /api/health` is liveness only: the process is running.
- `GET /api/ready` checks that the API can query PostgreSQL. The API container uses this endpoint for its Docker health check.
- A deployment is ready only when the API is healthy, the gateway is reachable, and the readiness endpoint returns `{"status":"ready","database":"ok"}`.

## Migration

The PostgreSQL image runs `npm run pg:migrate` before the idempotent seed and API startup. Never use `drizzle-kit push` against production. Review the generated migration, take a backup, then deploy the image.

## Backup

From the repository root:

```sh
npm run backup:postgres
```

The command creates a PostgreSQL custom-format dump and a SHA-256 checksum under `backups/postgres/`. Keep that directory outside the application container, copy it to encrypted storage, and retain at least daily and weekly copies. The dump contains tenant data and must be treated as sensitive.

For the online server, set `COMPOSE_ENV_FILE` and `COMPOSE_FILE` if the production files use different names:

```sh
COMPOSE_ENV_FILE=.env.saas-postgres COMPOSE_FILE=docker-compose.postgres.yml npm run backup:postgres
```

## Restore

Restore only during a maintenance window. Take a fresh backup first, verify the checksum, stop application traffic if possible, then run:

```sh
CONFIRM_RESTORE=YES BACKUP_FILE=./backups/postgres/tdpos-postgres-YYYYMMDDTHHMMSSZ.dump npm run restore:postgres
```

After restore, restart the API, check `/api/ready`, log in with a test tenant, and run the tenant-isolation smoke test before reopening traffic.

## P0 deployment checklist

- [ ] `JWT_SECRET`, `HKDPLUS_INSTANCE_SECRET`, PostgreSQL password, and platform-admin credentials are unique production secrets.
- [ ] Cloudflare Tunnel points to the HTTP gateway listener; the origin does not redirect to HTTPS behind the tunnel.
- [ ] PostgreSQL daily backup and restore drill are scheduled outside the app container.
- [ ] API and gateway logs are collected with rotation and alerts for repeated restarts.
- [ ] `/api/ready` passes after every migration.
- [ ] Tenant-isolation, permissions, flow, and build checks pass on the release image.
