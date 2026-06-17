# InvestSmart — Project CLAUDE.md

## What this project is
A personal investment portfolio tracker built as a pure static web app (no build step).
Users log daily stock returns from XTB, get AI-powered recommendations, and analyze stocks via PER.
Deployed target: GitHub Pages (frontend) + Supabase (auth, DB, Edge Functions).

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS ES Modules, Chart.js, Inter + Space Grotesk fonts |
| Auth + DB | Supabase JS v2 (`persistSession: true`, JWT auto-refresh) |
| Backend | Supabase Edge Functions (Deno runtime) |
| Market data | Yahoo Finance API (crumb auth since 2025) |
| Styling | Custom CSS in `styles.css` — no Tailwind, no framework |
| Deploy | GitHub Pages (static) + `npx serve` for local dev |

---

## Repository structure

```
D:\Documentos\pruebas\
├── index.html              # Single HTML shell — no logic, just DOM structure
├── styles.css              # All CSS (variables, components, responsive)
├── src/
│   ├── config.js           # SUPA_URL, SUPA_KEY, EDGE_BASE, ASSET_META, BK
│   ├── utils.js            # pct(), $f, esc() XSS, safeUrl(), toast(), set(), val()
│   ├── sync.js             # setSyncState() — updates sync dot in sidebar
│   ├── repository.js       # SessionRepo — Supabase queries (imports db from auth.js)
│   ├── assets.js           # getAllAssets(), getCustomAssets(), addCustomAsset(), removeCustomAsset()
│   ├── store.js            # Store — in-memory history, add/load/reset, _syncCloud()
│   ├── learn.js            # Learn — ML-lite recommendations, generateDescription()
│   ├── charts.js           # Charts — Chart.js value/returns/sector charts
│   ├── ui.js               # UI — all DOM render methods (kpis, table, per inputs, etc.)
│   ├── market.js           # fetchMarketData() — calls Edge Function, renders prices
│   ├── per.js              # PER analysis — renderWatchlist(), analyzeTickerPer(), evaluateAllPer()
│   ├── onboarding.js       # 3-step wizard for new users (capital → assets → confirm)
│   ├── auth.js             # db (single Supabase client), login, signup, signOut, changePwd
│   └── app.js              # Entry point — imports all, exposes window.*, bootstrap
├── supabase/
│   └── functions/
│       └── market-data/
│           └── index.ts    # Edge Function — modes: { tickers } and { search }
├── schema.sql              # Supabase table + RLS policies for `sessions`
├── SETUP.md                # Supabase setup guide
└── .gitignore              # Excludes data.json, image.png, reports/, .env
```

---

## Module dependency graph (DAG — no circular imports)

```
config / utils / sync           ← leaves (no imports from project)
    ↓
repository / assets             ← use config + db from auth
    ↓
store                           ← uses repository
    ↓
learn                           ← uses store
    ↓
charts / ui / per / onboarding  ← use store, learn, assets
    ↓
market                          ← uses auth.db for JWT
    ↓
app.js                          ← root, imports everything, exposes to window
```

---

## Key design decisions

### Single Supabase client
`db` is created once in `auth.js` and imported by `repository.js`, `market.js`, `onboarding.js`.
Never create a second `createClient()` — causes "Multiple GoTrueClient" warning.

### Yahoo Finance crumb auth (2025 requirement)
All market data goes through the Edge Function `market-data`.
Two-step auth: `fc.yahoo.com` cookie → `/v1/test/getcrumb` → use crumb in all requests.
Direct calls from browser to Yahoo Finance will 401.

### Custom assets
Stored in `localStorage` key `investsmart-custom-assets` as `[{ticker, full, role, color, sector, isCustom}]`.
`getAllAssets()` in `assets.js` merges base ASSETS + custom. Custom assets are saved to Supabase sessions as JSONB keys alongside base assets.

### XSS prevention
`esc(str)` in `utils.js` escapes HTML entities — used on ALL external/user data in innerHTML.
`safeUrl(url)` in `market.js` validates `https://` before using in `href`.

### RLS (Row Level Security)
All `sessions` table operations require `auth.uid() = user_id`.
Edge Function verifies JWT via `supabase.auth.getUser()` before processing any request.

### Ticker mapping
Visa's Yahoo Finance symbol is `V`, not `VISA`. Mapping lives in `ASSET_META[a].yfTicker` in `config.js`.
`market.js` has `_yfTickers` (for requests) and `_reverseMap` (to restore internal keys after response).

---

## Base assets (ASSETS array in config.js)

| Key | Full name | Yahoo ticker |
|---|---|---|
| VOO | Vanguard S&P 500 | VOO |
| AMZN | Amazon | AMZN |
| NVDA | NVIDIA | NVDA |
| MSFT | Microsoft | MSFT |
| GOOGL | Alphabet | GOOGL |
| VISA | Visa Inc. | **V** |

Custom assets added by user are stored in localStorage and merged at runtime.

---

## Supabase project

- **Project ref**: `fjufxwkhjgbkhqvpmryb`
- **Edge Function**: `market-data` — deployed via `npx supabase functions deploy market-data --project-ref fjufxwkhjgbkhqvpmryb`
- **Table**: `sessions` (fields: `id`, `user_id`, `fecha`, `fase`, `valor_total_usd`, `rendimientos` JSONB, `created_at`)
- **Auth**: email + password, signup enabled, email confirmation configurable

---

## Edge Function modes

```ts
// Mode 1 — live prices
{ tickers: ['VOO', 'AMZN', 'V'] }
// Returns: [{ ticker, name, currentPrice, changePercent, pe, forwardPe, week52High, week52Low, analystRating, latestNews }]

// Mode 2 — asset search
{ search: 'Apple' }
// Returns: [{ ticker, name, exchange, type }] — max 8 results, EQUITY + ETF only
```

Security: JWT required (401 if missing), ticker whitelist `/^[A-Z0-9.\-]{1,10}$/`, max 20 tickers, search sanitized.

---

## Auth flows

| Flow | Entry point |
|---|---|
| Login | `loginWithPassword()` in auth.js |
| Signup | `signUp()` in auth.js — email + password + confirm |
| Forgot password | `showForgot()` → `sendReset()` → email link |
| Change password | `showChangePwd()` → `changePassword()` (modal) |
| Sign out | `signOut()` |
| New user onboarding | Auto-triggered after login if `Store.history.length === 0` and `!isOnboardingDone()` |

---

## Onboarding wizard (src/onboarding.js)

Triggered in `app.js` after `_syncCloud()` resolves with 0 sessions.
- Step 1: Capital inicial (USD)
- Step 2: Asset search (popular chips + Yahoo Finance search via Edge Function)
- Step 3: Confirm → creates first session with `rendimientos: 0` for all selected assets
- Skip: sets `investsmart-onboarding-done` in localStorage (wizard won't show again)
- Non-base assets selected in onboarding are auto-saved as custom assets

---

## Local development

```bash
cd D:\Documentos\pruebas
npx serve .
# → http://localhost:3000
```

Python's `http.server` may misconfigure MIME types for ES modules on Windows — use `npx serve`.

---

## Deployment (GitHub Pages)

```bash
git remote add origin https://github.com/USER/investsmart.git
git branch -M main
git push -u origin main
# Then: GitHub Settings → Pages → Source: main / root
```

No build step needed — pure static files.

---

## What to watch out for

- **Never add a second `createClient()`** — always import `db` from `auth.js`
- **Always use `esc()` for user/external data in innerHTML** — XSS risk
- **Edge Function must be redeployed** after changes to `index.ts`
- **Yahoo Finance crumb** is obtained per-invocation — don't cache across cold starts
- **`_syncCloud()` is async** — UI renders immediately from localStorage, then updates after sync
- **`perMyAssets()` in ui.js saves/restores input values** before re-render to avoid clearing user data
