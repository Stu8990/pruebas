# InvestSmart — Project AGENTS.md

## What this project is
A personal investment portfolio tracker for XTB users, built as a pure static web app (no build step), mobile-first.
The user notes each buy/sell; the app answers in plain Spanish: *¿cómo voy?* (real gain, deposits excluded),
*¿por qué subí/bajé este mes?* (USD attribution per stock), *¿qué hago ahora?* and *¿dónde pongo mi próximo aporte?*
Recommendations come from a deterministic, tested rules engine; the LLM only explains them.
Deployed target: GitHub Pages under `/pruebas/` (frontend) + Supabase (auth, DB, Edge Functions).

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS ES Modules, SVG charts (no Chart.js), Bricolage Grotesque + Schibsted Grotesk |
| Auth + DB | Supabase JS v2 UMD pinned with SRI (`persistSession: true`) |
| Backend | Supabase Edge Functions (Deno): `market-data` (Yahoo), `ai-analysis` (Groq) |
| Styling | `styles.css`, tokens on `:root` (palette: blue-petrol, light by default; «Apariencia» in Más: Claro/Oscuro/Automático) |
| Tests | `npm test` (node:test, pure logic) · `npx playwright test` (E2E with mocked Supabase: Chromium mobile + desktop, WebKit iPhone for overflow; axe) |

---

## Repository structure

```
index.html            # Auth screen + app shell (4 tabs). No inline handlers.
styles.css            # All CSS, mobile-first (breakpoints 720px, 1000px)
sw.js                 # Service worker: CACHE version + SHELL list (a unit test checks SHELL ⊇ src/**/*.js)
src/
  config.js           # SUPA_URL, SUPA_KEY, EDGE_BASE, ASSET_META (display names, VISA→V)
  auth.js             # db (THE single Supabase client) + signIn/signUp/sendReset/changePassword/signOut (no DOM)
  data.js             # state + all I/O: positions, history, market, cash/profile (user_metadata), snapshotToday()
  model.js            # derives summary / month attribution / verdicts / actions from state
  format.js           # money(), signedMoney(), pct(), esc() — every number/text shown goes through here
  app.js              # bootstrap, hash router, data-action delegation, forms, AI, price refresh, SW registration
  core/portfolio.js   # PURE: ledger (avg-cost, buys+sales), summarize(), monthAttribution()
  core/advice.js      # PURE: PROFILES, verdicts(), planContribution(), todayActions(), evaluateCandidate()
  core/trades.js      # PURE: validateTrade(), applyTrade(), removeTrade()
  ui/sheet.js         # bottom sheet on native <dialog>
  ui/chart.js         # SVG value chart
  views/home.js       # Inicio: ¿cómo voy? · ¿por qué subí/bajé? · ¿qué hago? · curva
  views/holdings.js   # Acciones: list, detail sheet, buy/sell form
  views/plan.js       # Plan: perfil, próximo aporte, ¿vendo algo?, otra acción, IA
  views/more.js       # Más: cómo funciona, historial, cuenta
supabase/functions/   # market-data, ai-analysis, xtb-sync (not deployed; see risks)
tests/unit/           # node:test
tests/e2e/            # Playwright; fixtures.js mocks Supabase auth/REST/functions with a fixed date
```

Dependency direction: `core/*` (pure, no imports from app) ← `data` ← `model` ← `views/*` ← `app`.

---

## Data model (no schema migration needed)

- `user_positions.data` (JSONB): `{ TICKER: { purchases: [{date, shares, price}], sales: [{date, shares, price}] } }`.
  Legacy purchases have `date: ''` → treated as the oldest. Sales were added in the redesign (same JSONB, no SQL change).
- `sessions`: one row per day with `valor_total_usd` and `rendimientos` (% gain vs avg cost per ticker at that date).
  Written by `snapshotToday()` (insert, or update if today exists — never duplicates). Legacy rows may contain
  `_capitalInjected`; it is ignored by the new code. Duplicated dates are deduplicated on read (last wins).
- `auth.users.user_metadata`: `last_cash` (uninvested cash in XTB) and `profile` (conservador/equilibrado/agresivo).

## Rules engine (src/core/advice.js) — keep it explainable
- Profiles: funds target 70/50/30 %, max per single stock 15/20/30 %.
- **Revisar** only if analysts = VENDER, or loss ≤ −30 % AND analysts = MANTENER. A loss alone never triggers selling.
- **Vender una parte** if a stock's weight > cap and the excess ≥ $25 (amount = excess).
- **No compres más** if not a fund, (forwardPe || pe) > 35 and price ≥ 90 % of its 52-week range.
- **Comprar más** if weight < target − 5 pp.
- `planContribution`: fills gaps to targets, never pushes a stock over its cap, remainder to funds (VOO if none), sums exactly.
- With missing prices (`summary.complete === false`) no weight-based advice is given.
- Month attribution: `shares_at_start × (p_now − p_start) + Σ buys_in_month × (p_now − p_buy) + Σ sells_in_month × (p_sell − p_now)`.
  `p_start` = `monthStartPrice` from market-data, fallback: last session of previous month × avg cost at that date.

---

## Edge Function modes

```ts
// market-data
{ tickers: ['VOO','V'] }  → [{ ticker, name, quoteType, currentPrice, changePercent, pe, forwardPe,
                               week52High, week52Low, analystRating, monthStartPrice, latestNews }]
{ search: 'Apple' }       → [{ ticker, name, exchange, type }]
// ai-analysis
{ mode: 'advisor', question, positions, portfolio, facts } → { answer }
// facts = engine output (verdicts, month attribution, real gain). The prompt forbids contradicting it.
```
Security: JWT required, ticker whitelist `/^[A-Z0-9.\-]{1,10}$/`, max 20 tickers, rate limits via `api_usage`.
**Edge Functions must be redeployed after changes:** `npx supabase functions deploy <name> --project-ref fjufxwkhjgbkhqvpmryb`.

---

## Supabase project
- Project ref: `fjufxwkhjgbkhqvpmryb`. Tables: `sessions`, `user_positions`, `api_usage` (see `schema.sql`), all with RLS `auth.uid() = user_id`.

## Local development & tests

```bash
npm install
npm test                 # unit tests (pure logic)
npx playwright test      # E2E (starts tests/e2e/server.mjs on :3100, serves repo under /pruebas/)
node tests/e2e/server.mjs   # manual: http://localhost:3000/pruebas/
```

## Deployment (GitHub Pages)
Push `master`; Pages serves the repo root under `/pruebas/`. No build step. Bump `CACHE` in `sw.js` on every release.

---

## What to watch out for
- **Never add a second `createClient()`** — import `db` from `auth.js`.
- **Every dynamic value in innerHTML goes through `esc()`** (format.js), including attributes.
- **Business rules live in `src/core/` with unit tests first.** Views only render; they don't compute money.
- **No silent failures**: data.js throws user-readable errors; the UI shows them (toast / form message).
- **Adding a module?** Add it to `SHELL` in `sw.js` (unit test enforces it) and bump `CACHE`.
- **Service worker** reloads only on updates (not on first install) and never while the user is typing.
  It fetches with `cache: 'reload'`/`'no-cache'`: GitHub Pages sends `max-age=600` and a new SW could cache old CSS.
- **Overflow on iPhone**: `body { overflow-x: hidden }` hides overflow in Chromium but Safari widens the page.
  The E2E overflow test measures every element and runs in WebKit (`iphone` project). Long text relies on `overflow-wrap: anywhere`.
- **Password recovery**: `sendReset()` passes `redirectTo: appUrl()`; `auth.js` reads `type=recovery` / `error_code` from the URL
  hash BEFORE creating the client (Supabase clears it) and the app shows «Crea tu contraseña nueva» before entering.
  Supabase → Authentication → URL Configuration must list `https://stu8990.github.io/pruebas/` (Site URL and Redirect URLs).
- Brand assets: `assets/auth-hero(-dark).webp` (generated by Codex), icons in `icons/` (SVG + PNG for iOS/Android).
- Visa is stored as `VISA` but is `V` in Yahoo (`ASSET_META.VISA.yfTicker`).
- `xtb-sync` stores broker credentials: do not deploy until its table has encryption + RLS reviewed.
