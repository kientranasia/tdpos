# HKD Smart Online SaaS Architecture

This document describes the online SaaS track. The offline release remains
on `offline-stable` and is deployed with `docker-compose.offline.yml`.

## Product boundary

- Customers cannot register directly on the public website.
- A platform admin creates each tenant manually.
- The tenant owner manages users and permissions inside that tenant.
- The Cloudflare hostname is deployment configuration. The application must
  not hard-code a single public domain.

## Target request flow

```text
Public hostname (Cloudflare configuration)
  -> Cloudflare Tunnel
  -> shared HKD Smart application
  -> platform control database: tenant + user + subscription registry
  -> tenant database: business data for exactly one tenant
```

The login request identifies the tenant through the account registry. The
server puts the tenant identity in the signed session and resolves the tenant
database server-side. A browser must never be allowed to select an arbitrary
tenant by sending a tenant id in the request body.

## Current foundation on this branch

- Public registration is blocked by the API when `OFFLINE_MODE=false`.
- `ENABLE_PLATFORM_ADMIN=true` enables the internal platform-admin routes.
- The first platform admin can be bootstrapped from environment variables;
  bootstrap runs only when the admin table is empty.
- `HKDPLUS_PUBLIC_URL`, `HKDPLUS_HOSTNAME`, and `CORS_ORIGINS` are deployment
  settings, so a Cloudflare hostname can be changed without changing code.
- `DATABASE_MODE=per_tenant` enables a request-scoped SQLite database file for
  each tenant under the data volume. The control database keeps tenant/user
  registry data and platform-admin records; business routes are routed to the
  tenant file after JWT validation.
- Provisioning is idempotent: a tenant database is created from the current
  schema and only that tenant's rows are copied. Global permission/package
  definitions are copied; child rows are selected through their tenant-owned
  parent. The control record stores database key, engine, status, and the last
  provision time.
- User changes made by the tenant owner are mirrored to the control registry so
  the next login can be resolved without allowing a client to choose a tenant.
- This first isolation adapter uses SQLite files to keep the online branch
  deployable with the existing application. PostgreSQL remains the target
  engine before high-scale production rollout; the provider boundary is kept
  separate so that migration does not touch the offline branch.

## Database migration plan

1. Replace the SQLite tenant adapter with the PostgreSQL provider for hosted
   production, while keeping SQLite as the offline provider.
2. Add a tenant database record with a stable database key and provisioning
   status; never expose connection credentials to the client.
3. Extract the existing schema/migrations into a reusable tenant-database
   migrator and run schema-version checks for existing tenant files.
4. Migrate the current SQLite data into the first tenant database and verify
   product, stock, invoice, debt, cashbook, user, and permission counts.
5. Add per-tenant backup/restore, migration status, audit logs, and failure
   recovery before opening tenant creation to production operations.

PostgreSQL is the target online engine. SQLite remains the offline engine.

## Release policy

- `offline-stable` / `offline-v1.0.0`: frozen customer-installation baseline.
- `online-saas-multitenant`: SaaS development and staging.
- SaaS changes are not merged into the offline branch unless they are
  explicitly reviewed as portable security or bug fixes.
