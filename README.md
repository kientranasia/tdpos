<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/98283500-e7a7-44de-a219-f16314534997

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env` and set `JWT_SECRET`, `API_PORT` (default `3101`), `VITE_API_URL` (default `http://localhost:3101`), and bootstrap admin variables:
   - `ADMIN_BOOTSTRAP_EMAIL`
   - `ADMIN_BOOTSTRAP_PASSWORD`
   - `ADMIN_BOOTSTRAP_NAME`
   - `ADMIN_BOOTSTRAP_ROLE`
3. Initialize the local SQLite database:
   `npm run seed`
4. Run the backend API:
   `npm run server`
5. Run the frontend:
   `npm run dev`

Default local accounts after seeding (or first server start when no admin exists):

- Store owner: `owner@tdpos.vn` / `123456`
- Admin: from `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` (defaults above if unchanged)

## Docker Deploy

1. Create `.env` (or export env vars) with at least:
   - `JWT_SECRET`
   - `ADMIN_BOOTSTRAP_EMAIL`
   - `ADMIN_BOOTSTRAP_PASSWORD`
   - Optional port overrides when local ports are busy:
     - `API_PUBLIC_PORT` (default `3101`)
     - `WEB_PUBLIC_PORT` (default `3001`)
2. Build and run:
   - `docker compose up -d --build`
3. Open:
   - App: `http://localhost:${WEB_PUBLIC_PORT:-8077}`

Notes:
- SQLite data is persisted in Docker volume `tdpos_data`.
- Backend API is internal-only in Docker network (not published to host).
- Frontend is built with `VITE_API_URL=/api` and nginx proxies `/api/*` to `api:3101`.

## Docker UAT & Production

Use separate env files + compose override files:

- `.env.uat` + `docker-compose.uat.yml`
- `.env.prod` + `docker-compose.prod.yml`
- Sample templates:
  - `.env.uat.example`
  - `.env.prod.example`

Run UAT:

`docker compose --env-file .env.uat -f docker-compose.yml -f docker-compose.uat.yml up -d --build`

Run Production:

`docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml up -d --build`

Stop UAT:

`docker compose --env-file .env.uat -f docker-compose.yml -f docker-compose.uat.yml down`

Stop Production:

`docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml down`

Open URLs:

- UAT: `http://localhost:18077`
- Production: `http://localhost:8077`

## Product Backlog (Next Phases)

### Phase A - Subscription & Billing Hardening
- Add full subscription request timeline (multiple requests, approve/reject history, actor + timestamp).
- Add tenant-facing billing center with invoice history and payment proof upload.
- Add package effective date model (scheduled change next cycle vs immediate).
- Add admin-side bulk actions for expiring trials and pending reviews.

### Phase B - RBAC & User Governance
- Granular permission matrix by screen/action (view/create/update/delete/export/approve).
- Per-package enforcement for feature flags, seat limits, and add-on modules.
- User invitation flow (email invite token, first-login password setup).
- Session security controls: force logout all sessions, password policy, optional 2FA.

### Phase C - POS UX & Operational Excellence
- Dense POS layout mode for low-resolution devices and high-volume cashier workflows.
- Cart and checkout keyboard shortcuts + scanner-first flow.
- Inventory intelligence: reorder suggestions, stock movement audit, variance alerts.
- Debt collection workflow with due-date buckets and customer payment plans.

### Phase D - Data, Audit, and Reliability
- Structured audit viewer (filter by entity/action/user/date range) with export.
- Soft-delete + restore for customers/products/users with retention policy.
- Background jobs for daily snapshots and anomaly detection.
- Backup/restore tooling and migration playbook for production operations.

### Phase E - Analytics & Merchant Insights
- Merchant health score (sales velocity, debt risk, stock-out risk).
- Cohort analytics (new vs returning customers, retention trend).
- Package recommendation engine based on seat usage and feature usage.
- Executive dashboard for TRANDAO with MRR, churn risk, and support SLA metrics.
