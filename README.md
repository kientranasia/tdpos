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
