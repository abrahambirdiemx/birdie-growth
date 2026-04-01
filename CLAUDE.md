# Birdie Growth Dashboard

Internal sales dashboard for Birdie (Abraham Lopez, Héctor Nícola, Daniel Luna).

## Stack
- **Frontend**: Vanilla JS + Vite (no framework)
- **Backend**: Supabase (PostgreSQL via REST API)
- **Deploy**: GitHub Pages via GitHub Actions (auto on push to main)
- **Auth**: Supabase Auth (email + password, no passwords in code)

## Project structure
```
src/
├── index.html          # App shell (HTML structure)
├── main.js             # Entry point, bootstrap, auto-sync
├── api/
│   └── supabase.js     # sbFetch(), sbHeaders() — all API calls go here
├── modules/
│   ├── config.js       # Stage colors, order, probabilities, seller list
│   ├── utils.js        # fmt$, showToast, debounce, date helpers
│   ├── auth.js         # Supabase Auth login/logout/refresh
│   ├── pipeline.js     # Pipeline grid, CRUD, filters, sort
│   ├── crm.js          # CRM table, search, CRUD
│   ├── dashboard.js    # parseSupabaseData(), renderDashboard(), charts
│   └── kpi.js          # KPI activity log, goals, seller cards
└── styles/
    └── main.css        # All styles (extracted from monolith)
```

## Supabase tables
- `pipeline`   — deals (701 records, migrated from Airtable)
- `crm`        — accounts (~700 records, migrated from localStorage seed)
- `kpi_logs`   — activity log (migrated from localStorage)

## Getting started (Claude Code)
```bash
npm install
npm run dev          # http://localhost:5173/birdie-growth/
npm run build        # builds to dist/
```

## Deploy
Push to `main` → GitHub Actions builds + deploys to GitHub Pages automatically.
Live URL: https://abrahambirdiemx.github.io/birdie-growth/

## Auth setup (Supabase)
Users are managed in Supabase Dashboard → Authentication → Users.
Current team: abraham@birdie.mx, hector@birdie.mx, daniel@birdie.mx
Passwords set by each user (not stored in code).

## Priority next steps (picked up in Claude Code)
1. [ ] Remove CRM_SEED inline data (125KB) — now in Supabase, no longer needed
2. [ ] Fix module circular imports (dashboard ↔ pipeline)
3. [ ] Implement proper ES module imports (replace window.* globals)
4. [ ] Add virtualized pipeline grid (react-virtual or custom) for 2000+ rows
5. [ ] Move goals/metas to Supabase table (currently hardcoded)
6. [ ] Add Supabase Realtime subscriptions (replace polling with websocket push)
