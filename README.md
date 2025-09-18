# City Blitz Planner

A professional, domain-correct, performance-focused City Blitz planning tool.

Stack: Vite + React + TypeScript + Tailwind CSS + shadcn-ui.

Key Features
- 12-hour Action timeline (AM/PM ticks), with Step unlocks derived from City Blitz calendar [3,6,10,13,17,20,28]
- Rules engine: unlocks, half-step adjacency, first capture Lv1 SH, daily caps (2S/2C), global caps (8S/8C), protection timers (SH 36h / City 6d)
- Map UX: rAF pan/zoom (zoom-under-cursor), clamped pan, reset, offscreen culling, overlays, hover/selection states
- Alliances: add/remove, color picking, bottom legend with M/hr, S/hr, counts and details sheet, Top 5 summary
- Persistence: localStorage v3 events schema, export/import; migrations from v1/v2

Local Development
1) Install Node.js (v18+ recommended)
2) Install dependencies
   - npm i
3) Run dev server
   - npm run dev
   - Open http://localhost:8080
4) Build & preview
   - npm run build
   - npm run preview

Environment
- Create a `.env` file in the project root (see `.env.example`).
- Required variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- Without these, auth and account features are disabled automatically.

Folder Highlights
- src/v2/*: domain types, rules, seasons, data loader, map canvas, alliance legend, details panel
- src/pages/V2.tsx: City Blitz Planner page (default route)
- vite.config.ts: preview.allowedHosts enabled for PM2 preview, port 8080

License
- Proprietary (update as needed)
