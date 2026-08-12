# AGENTS.md

BMMS — two independent npm packages (`client/`, `server/`). There is **no root workspace** and no root `package.json`: run npm commands inside the relevant subdirectory. Never touch `server/.env` and never print/commit its contents.

## Server (`server/`)
- Express 5 + Mongoose 9, **CommonJS** (`require`/`module.exports`). Entrypoint `server.js` → app built in `src/app.js`. Modular layout: `src/config/` (env, db), `src/middlewares/` (error, notFound, rateLimit), `src/utils/` (ApiError, asyncHandler, apiResponse).
- Run: `npm run dev` (`node --watch server.js`) or `npm start` from `server/`. Test: `npm test` (Vitest + Supertest + mongodb-memory-server — tests never touch Atlas).
- Requires `server/.env` (gitignored) with `MONGO_URI` (plus optional `PORT`, default 5000). Server calls `process.exit(1)` on startup if Mongo connect fails. Missing required env vars fail fast; `JWT_SECRET` only required in production (Phase 2 warning otherwise).
- Health: `GET /api/health` → `{ success, message, database, timestamp }`. Do not change this contract.
- Security baseline: helmet, CORS allowlist from `CLIENT_ORIGIN` (comma-separated), global `express-rate-limit` (env `RATE_LIMIT_WINDOW_MS`/`RATE_LIMIT_MAX`), centralized JSON error handler that masks stack traces in production. New endpoints go under `/api/v1` once implemented.
- Env reference: `server/.env.example`.

## Client (`client/`)
- React 19 + Vite 8, **ESM**, plain JSX (no TypeScript, no Redux). Entry: `src/main.jsx` (BrowserRouter + AuthProvider) → `src/App.jsx` routes.
- Run: `npm run dev`; lint: `npm run lint`; test: `npm test` (Vitest + jsdom + Testing Library); build: `npm run build`. Config lives in `vite.config.js` (proxy + vitest `test` block).
- `vite.config.js` proxies `/api` → `http://localhost:5000`. Axios client `src/api/http.js` uses `baseURL: '/api'` — never hard-code `http://localhost:5000` in components.
- All module pages (buildings, units, residents, maintenance, complaints, notices, visitors, parking, billing, payments, expenses, users, notifications, audit-logs) share `src/components/common/ModulePage.jsx` (header + primary action + search + loading/empty/error states + `DataTable`).
- **Demo data:** `src/data/demoData.js` + `src/hooks/useDemoData.js` simulate API responses so the UI has loading/empty/error states before backend endpoints exist. Marked as demo — do NOT present as real data; replace with API calls in later phases.
- Reusable UI in `src/components/ui/` (Card, StatCard, Badge, SearchInput, DataTable, Spinner, EmptyState, ErrorState, PageHeader). Status→badge tone mapping in `src/utils/status.js`; date/currency formatting in `src/utils/formatters.js`.
- Design tokens in `src/styles/tokens.css` (colors, radius, spacing); base/`.btn` styles in `src/index.css`. Components import their own CSS files.
- Auth is a **stub**: `src/context/auth-context.js` + `src/context/AuthProvider.jsx` + `src/hooks/useAuth.js`. `login()` throws "not implemented" — do not rely on it. JWT + RBAC come in a later phase.

## General
- No CI, no codegen. Vite `dist/` is the only build artifact.
- Root `.gitignore` covers `node_modules/`, `.env*`, `dist/`. Never commit `.env` or secrets.
- Test files: `client/src/App.test.jsx` (routes/layout), `server/tests/server.spec.js` (health, helmet headers, CORS, rate limit, error handler).
