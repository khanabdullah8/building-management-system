# AGENTS.md

BMMS — two independent npm packages (`client/`, `server/`). There is **no root workspace** and no root `package.json`: run npm commands inside the relevant subdirectory.

## Server (`server/`)
- Express 5 + Mongoose 9, **CommonJS** (`require`/`module.exports`), single entrypoint `server.js`. All backend code lives in that one file for now.
- Run: `npm run dev` (uses `node --watch server.js`) or `npm start` from `server/`.
- Requires `server/.env` (gitignored) with `MONGO_URI` (and optional `PORT`, default 5000). The server calls `process.exit(1)` on startup if Mongo connect fails, so it won't run without a reachable DB.
- Health check: `GET /api/health` reports DB connection state.
- No lint, test, or typecheck setup.

## Client (`client/`)
- React 19 + Vite 8, **ESM** (`import`), plain JSX (no TypeScript). Entrypoint: `src/main.jsx` → `src/App.jsx`.
- Run: `npm run dev`; lint: `npm run lint` (ESLint with react-hooks + react-refresh flat config); build: `npm run build` from `client/`.
- `vite.config.js` has **no `server.proxy`** — there is no configured bridge to the Express backend. `App.jsx` is still the default Vite template.
- No test setup.

## General
- No tests, no CI, no codegen or build steps beyond Vite `dist/`.
- `git` repo has no commits yet; `.gitignore` at root covers `node_modules/`, `.env*`, `dist/`.
