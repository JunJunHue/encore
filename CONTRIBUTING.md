# Contributing to Encore

This repo is structured so **four collaborators work in parallel with minimal merge conflicts**.
Module boundaries are ownership boundaries; cross-module changes go through the owning
collaborator's PR review (enforced via [CODEOWNERS](.github/CODEOWNERS)). The system design
behind all of this is [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — read it before your first
PR; its Appendix A records design conflicts that were already resolved, so don't relitigate them
in code.

## Workstreams

| #   | Workstream      | Owns (paths)                                                                 | Scope                                                                                                                                                                  |
| --- | --------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1  | Ranking core    | `src/engine/**`                                                              | Pure-TS ranking engine: insertion sessions, Elo decoration, tiers, lenses, audit, taste match. **Zero React/Supabase imports.** Every behavior pinned by Vitest tests. |
| W2  | Backend & data  | `supabase/**`, `seed/**`                                                     | Postgres migration, RLS, RPCs, views; seed pipeline (events/friends JSON → seed.sql), demo reset script.                                                               |
| W3  | Log & Rank      | `src/features/log/**`, `src/features/rank/**`, `src/features/onboarding/**`  | Event search + log flow, the pairwise comparison UI + slot-in animation (the demo centerpiece), name-picker onboarding + 5-best backfill.                              |
| W4  | Ladder & Social | `src/features/ladder/**`, `src/features/compare/**`, `src/features/recap/**` | Tiered ladder + lenses + enrichment sheet, friends list, taste match + head-to-head, recap card stretch.                                                               |

**Shared platform** — `src/lib/**`, `src/components/**`, `src/App.tsx`, root configs,
`.github/**`, `docs/**`: no single owner; changes require review from **any one other
collaborator**.

### The isolation rule

Feature code **never** imports from another feature folder — only from `@/engine`, `@/lib`,
`@/components` (and npm packages). If two features need the same code, it moves _down_ into
`src/lib` or `src/components` via a shared-platform PR — it does not get imported sideways.

## Interface contracts (the seams between workstreams)

Breaking one of these is the only way to block three other people. Handle with care:

1. **Engine API** (`src/engine/ranking.ts`, `src/engine/tasteMatch.ts`, `src/engine/types.ts`):
   W3/W4 consume it. W1 may not break exported signatures without a PR that also updates the
   consumers. Canonical surface: `startInsertion` / `getNextComparison` / `recordChoice` /
   `finishInsertion` / `recomputeFromLog` / `autoBucket` / `dragBoundary` / `tierOf` /
   `applyLens` / `selectAuditComparison` / `applyAuditResult` / `removeShow` / `startRerank` /
   `tasteMatch`.
2. **Persistence adapter** (`src/lib/persist.ts`): the _only_ place engine vocabulary
   (`challenger`/`opponent`/`too_different`, `kind`) meets schema vocabulary
   (`subject_log`/`opponent_log`, `a_wins`/`b_wins`/`skipped`, `comparison_kind`); it calls the
   `insert_ranked_log` RPC. **W2 may not change the RPC signature without updating `persist.ts`
   in the same PR.**
3. **`src/lib/database.types.ts`**: generated from the live schema (`npm run gen:types`). W2
   regenerates it in any schema-changing PR — never hand-edit it.
4. **Route table** (`src/App.tsx` + `src/features/README.md`): each feature exports a single
   lazy-loaded entry component (default export) at the documented path; the shell owns routing.
   Route changes are shared-platform PRs.

## GitHub conventions

- **Branches:** prefix with your workstream — `w1/…`, `w2/…`, `w3/…`, `w4/…`. PRs into `main`;
  **squash merge**.
- **CI** ([.github/workflows/ci.yml](.github/workflows/ci.yml)) gates every PR: `npm ci`,
  `tsc --noEmit`, `vitest run`, `vite build`, plus `tsx seed/build-seed.ts` when `seed/**` or
  `supabase/**` changed. Red CI = no merge, even at 3am.
- **PR template:** what/why, screenshots for UI PRs, and the "contract touched?" checklist line —
  if you ticked it, the PR must include the consumer-side update (see contracts above).
- **CODEOWNERS** maps the table above; GitHub auto-requests the right reviewer.
- Keep PRs small and land often — long-lived branches are how a 4-person 48-hour build dies.

## How to claim a workstream

1. Pick an unclaimed row from the workstreams table.
2. Replace the placeholder handle for your row in [.github/CODEOWNERS](.github/CODEOWNERS)
   (`@collab-w1` … `@collab-w4`) with your real GitHub username, in your first PR.
3. Add your name next to the workstream in this file's table (optional but friendly).
4. From then on: you review everything under your paths; you get one other collaborator's review
   for anything shared.

If two people want the same workstream, split it at the screen level (e.g. W4 → ladder vs
compare/recap) and note the split in CODEOWNERS comments — but keep the path→owner mapping
exhaustive.

## Definition of done (MVP bar)

- Compiles under strict TS; CI green.
- Engine changes come with Vitest coverage (`npm test`) — especially anything touching insertion
  determinism, replay identity, or the pinned 87% taste-match fixture.
- Screens are functional _and styled_ (dark concert aesthetic, 390px mobile-first) — this is a
  working MVP, not a skeleton.
- The demo path (log "fred" → 4 taps → #6 → Compare 87%) still works: run through
  [docs/DEMO.md](docs/DEMO.md) beats 2–5 locally before merging anything that touches them.
