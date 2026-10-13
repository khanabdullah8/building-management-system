# BMMS Deployment Guide

This guide describes the supported production topology for BMMS: a single
public origin that serves the Vite static build and reverse-proxies `/api`
requests to the Express backend.

> **Provider-neutral reference, not a turnkey configuration.** Every hosting
> platform differs: adapt the routing, TLS, process management, storage, and
> backups to your provider. This file intentionally contains no real domains,
> credentials, tokens, or connection strings.

## 1. Architecture: same-origin `/api` reverse proxy

- The React + Vite frontend is compiled to a static bundle and served at the
  public origin.
- The browser calls the backend through the **relative** `/api` base URL
  (`client/src/api/http.js`), so no public host/IP is baked into the bundle.
- A reverse proxy on the public origin forwards `/api/*` to the Express
  backend and serves the static frontend for every other path.

Why: the frontend deliberately uses a relative `/api` base URL with no
`VITE_*` override. Frontend and backend must therefore share one origin.
Split-origin hosting (frontend on one domain, API on another) is **not
supported** without a code change, and changing the base URL just to move the
UI would break the approved architecture.

## 2. Build the frontend

```sh
cd client
npm ci
npm run build   # static output: client/dist
```

Node version per `client/package.json` `engines` / root `.nvmrc`
(currently 24.x).

## 3. Serve the frontend with SPA fallback

The frontend uses React Router's `BrowserRouter`, so the host must **rewrite
unknown paths to `index.html`** (SPA fallback). Requests under `/api` must be
**proxied to the backend**, never rewritten to `index.html`.

> **Note:** the Vite development proxy in `client/vite.config.js` only applies
> to `npm run dev`. It does **not** configure production routing. Production
> routing is the responsibility of the reverse proxy / static host.

## 4. Run the backend

```sh
cd server
npm ci
npm start   # node server.js
```

Node version per `server/package.json` `engines` (same range as the client).

## 5. Required backend environment variables

Set these in the hosting platform's secret store. Never commit them.

| Variable | Required | Purpose |
|---|---|---|
| `NODE_ENV` | yes | Set to `production` |
| `MONGO_URI` | yes | MongoDB Atlas connection string (server/.env or platform secret) |
| `JWT_SECRET` | yes (production) | ≥ 32 chars, non-placeholder; signing/verifying JWTs |
| `PORT` | no | Listen port; many platforms inject it |
| `CLIENT_ORIGIN` | no | Comma-separated allowed browser origins (CORS) |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | no | Global rate limit (defaults: 60000 / 100) |
| `LOGIN_RATE_LIMIT_WINDOW_MS` / `LOGIN_RATE_LIMIT_MAX` | no | Login rate limit (defaults: 900000 / 7) |

Startup fails fast (`exit 1`) when `MONGO_URI` is missing, or when
`JWT_SECRET` is missing/too short/placeholder in production.

## 6. HTTPS

Terminate TLS at the reverse proxy / load balancer and redirect HTTP → HTTPS.
Never serve the login flow over plaintext.

## 7. CORS

Because the architecture is same-origin, browser requests to `/api` are
same-origin and generally do not require CORS headers. Still set
`CLIENT_ORIGIN` to the production origin(s) as defense in depth for any
cross-origin client. Keep it aligned with actual origins; disallowed origins
are rejected by the server.

## 8. Health checks

- **Liveness:** `GET /api/health` — returns 200 while the process serves traffic.
- **Readiness:** `GET /api/health/ready` — returns 200 **only when MongoDB is
  connected**, otherwise 503. Use this as the platform's readiness probe so
  traffic is withheld from an instance that cannot serve requests yet.

## 9. Graceful shutdown

The server handles `SIGTERM` and `SIGINT`:

1. stops accepting new connections,
2. lets in-flight requests finish,
3. closes idle keep-alive connections eagerly,
4. closes the Mongoose connection,
5. exits 0 (or 1 if cleanup failed).

Cleanup is bounded by an internal timeout (default 10 s) so a stuck shutdown
cannot hang the process. Configure the platform's termination grace period to
be longer than the cleanup window.

## 10. Example reverse proxy — ADAPT BEFORE USE

Illustrative nginx block. Replace `app.example.com` and the upstream port with
your own values; provider-specific settings (TLS certificates, health checks,
process restart policies) are out of scope here.

```
server {
    listen 443 ssl;
    # ssl_certificate / ssl_certificate_key per your provider

    server_name app.example.com;

    # Vite production build
    root /var/www/bmms/client/dist;
    index index.html;

    # Forward API traffic to the Express backend
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # BrowserRouter SPA fallback for non-API paths
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

The `X-Forwarded-*` headers are forwarded so the backend can log the real
client address and scheme. Do not copy this block verbatim; adapt it to your
hosting platform and its documentation.

## 11. Backups and recovery

Enable MongoDB Atlas backups (or the platform equivalent) before launch.
Document the restore procedure and test it. Application-level exports fall
back on the API but do not constitute a database backup strategy.

## 12. Operational notes

- **Rate limiting is in-memory** (`server/src/middlewares/rateLimit.js`):
  counters are per-process. A single instance is fine; if you scale to
  multiple instances behind a load balancer, introduce a shared store (e.g.,
  Redis) before relying on global limits.
- **Mongo connection failures** are logged with the underlying error message
  at startup. Keep logs restricted and review what a failure message may
  reveal about your Atlas deployment.
- **Admin provisioning:** `server/src/utils/seedAdmin.js` creates the initial
  admin. Prefer providing `ADMIN_EMAIL`/`ADMIN_PASSWORD` so no password is
  printed to logs; when auto-generating, capture the printed password securely
  and immediately.

## 13. Production build and startup commands (summary)

```sh
# Frontend
cd client && npm ci && npm run build        # → client/dist (static)

# Backend
cd server && npm ci && npm start            # node server.js
```