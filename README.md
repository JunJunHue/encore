# Encore 🎪

**The ranked ledger of your live-music life.** Star ratings fail for concerts even harder than
for restaurants — you can't revisit a show, so the only honest evaluation is comparative: _was it
better than the last one?_ Encore logs every show you attend and slots it into your personal
ladder via 3–5 forced pairwise taps (binary insertion — even a 300-show ladder needs ≤9), buckets
it into tiers (All-timer → Regret), filters it through genre/year/venue-size lenses, and matches
your taste against friends with a recency-weighted rank correlation — "we're **87% matched**, but
we violently disagree about that Four Tet set." Beli for live music; built for the people who
keep this ranking in their heads anyway.

This is the 48-hour hackathon MVP: four screens (log, rank, ladder, compare) + a recap card,
running on a seeded universe of ~200 real NYC shows (May '25–Jul '26).

📄 [ARCHITECTURE](docs/ARCHITECTURE.md) · [DEMO runbook](docs/DEMO.md) ·
[CONTRIBUTING](CONTRIBUTING.md) · [PRODUCT design](docs/PRODUCT.md)

---

## Prerequisites

- **Node 20+** and npm
- **Supabase CLI** (`brew install supabase/tap/supabase`) + a free hosted Supabase project
  (no Docker — we run hosted-only)
- **psql** (`brew install libpq && brew link --force libpq`) — used by the seed/reset scripts

One-time Supabase dashboard step: **Authentication → Providers → enable Anonymous sign-ins**
(and disable captcha). Without it, sign-in 422s.

## Bootstrap (5 commands)

```sh
npm install
cp .env.example .env.local        # then fill in the three values (see below)
supabase link --project-ref YOUR-PROJECT-REF
npm run db:push                   # apply supabase/migrations to your project
npm run db:seed                   # build seed.sql from seed/*.json and load it
```

Then `npm run dev` and open http://localhost:5173 — phone-sized viewport (390px) recommended;
it's a mobile-first PWA.

## Environment

`.env.local` (gitignored; template in [.env.example](.env.example)):

| Var                      | Scope                                                  | Where to find it                                                  |
| ------------------------ | ------------------------------------------------------ | ----------------------------------------------------------------- |
| `VITE_SUPABASE_URL`      | client (bundled)                                       | Dashboard → Project Settings → API → Project URL                  |
| `VITE_SUPABASE_ANON_KEY` | client (bundled)                                       | Dashboard → Project Settings → API → anon public                  |
| `SUPABASE_DB_URL`        | **server-side scripts only** (`db:seed`, `demo:reset`) | Dashboard → Project Settings → Database → Connection string (URI) |

Only `VITE_`-prefixed vars ever reach the browser bundle. No service-role key lives in this repo.

## Demo login

The seeded demo user "Andrew" (15-show ladder, 87% match with Maya) has a password credential:

- Open the app with **`?as=demo`** (e.g. `http://localhost:5173/?as=demo`) — it signs in as
  **`demo@encore.app`** with password **`encore-demo-2026`** (constants `DEMO_EMAIL` /
  `DEMO_PASSWORD` in `src/lib/auth.ts`; the credential is created by `seed/build-seed.ts`).
- A plain visit (no query param) gets an anonymous session + name picker + 5-best backfill —
  the judge path. New users auto-follow the seeded friends so Compare is never empty.

Before presenting, read the full [demo runbook](docs/DEMO.md) — including `npm run demo:reset`
and the wifi-death fallback.

## Scripts

| Script                            | What it does                                                       |
| --------------------------------- | ------------------------------------------------------------------ |
| `npm run dev`                     | Vite dev server                                                    |
| `npm run build`                   | typecheck (`tsc -b`) + production build                            |
| `npm run preview`                 | serve the production build locally                                 |
| `npm test`                        | Vitest — engine tests (`src/engine/**`), incl. the 87% fixture pin |
| `npm run lint` / `npm run format` | eslint / prettier                                                  |
| `npm run db:push`                 | apply `supabase/migrations` to the linked project                  |
| `npm run db:seed`                 | `seed/build-seed.ts` → `supabase/seed.sql` → psql load             |
| `npm run demo:reset`              | restore the canonical pre-demo ladder (idempotent)                 |
| `npm run gen:types`               | regenerate `src/lib/database.types.ts` from the live schema        |

## Repo map (ownership = module boundaries)

| #   | Workstream      | Owns (paths)                                                                            | Scope                                                                                                                                                        |
| --- | --------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| W1  | Ranking core    | `src/engine/**`                                                                         | Pure-TS ranking engine: insertion sessions, Elo decoration, tiers, lenses, audit, taste match. Zero React/Supabase imports; every behavior pinned by Vitest. |
| W2  | Backend & data  | `supabase/**`, `seed/**`                                                                | Postgres migration, RLS, RPCs, views; seed pipeline (events/friends JSON → seed.sql), demo reset.                                                            |
| W3  | Log & Rank      | `src/features/log/**`, `src/features/rank/**`, `src/features/onboarding/**`             | Event search + log flow, the pairwise comparison UI + slot-in animation (the demo centerpiece), onboarding + backfill.                                       |
| W4  | Ladder & Social | `src/features/ladder/**`, `src/features/compare/**`, `src/features/recap/**`            | Tiered ladder + lenses + enrichment sheet, friends, taste match + head-to-head, recap card.                                                                  |
| —   | Shared platform | `src/lib/**`, `src/components/**`, `src/App.tsx`, root configs, `.github/**`, `docs/**` | No single owner; any one other collaborator reviews.                                                                                                         |

**The one rule:** feature code never imports from another feature folder — only `@/engine`,
`@/lib`, `@/components`. Details, interface contracts, and PR conventions in
[CONTRIBUTING.md](CONTRIBUTING.md); the full system design in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Deploy

Vercel, static Vite build (`vercel.json` rewrites everything to `/index.html` for SPA deep
links). Set the two `VITE_` env vars in the Vercel project; demo from the deployed URL.
