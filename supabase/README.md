# Encore — Supabase backend

Hosted Supabase only (no Docker, no `supabase start`). One migration
(`migrations/0001_init.sql`) owns the entire schema; `seed.sql` in this
directory is **generated** by `npx tsx seed/build-seed.ts` and applied with
`psql` (it is not a CLI-managed seed).

## Bootstrap (once per project)

1. **Create a project** at [supabase.com](https://supabase.com) (any region; free tier is fine).
2. **Link this repo** to it (needs the CLI, `npm i -g supabase` or `npx supabase`):

   ```sh
   supabase login
   supabase link --project-ref <your-project-ref>
   ```

3. **Push the schema**:

   ```sh
   supabase db push        # or: npm run db:push
   ```

4. **Dashboard settings** (cannot be done via SQL):
   - **Authentication → Sign In / Providers → enable "Anonymous sign-ins"** — judges'
     fresh sessions use `signInAnonymously()`.
   - **Authentication → Attack protection → disable captcha** (any captcha on
     anonymous sign-in kills the demo flow).

5. **Environment** — copy `.env.example` → `.env.local` (gitignored) and fill in:
   - `VITE_SUPABASE_URL` — Project Settings → API → Project URL
   - `VITE_SUPABASE_ANON_KEY` — Project Settings → API → anon public key
   - `SUPABASE_DB_URL` — Project Settings → Database → connection string
     (server-side scripts only: seeding, demo reset; never shipped to the client)

6. **Seed** (generates `supabase/seed.sql` from `seed/*.json`, then applies it
   with the service connection, bypassing RLS):

   ```sh
   npm run db:seed
   # equivalent to:
   #   npx tsx seed/build-seed.ts
   #   psql "$SUPABASE_DB_URL" -f supabase/seed.sql
   ```

7. **Generate TS types** (regenerate in any schema-changing PR — contract with
   the client workstreams):

   ```sh
   npm run gen:types   # supabase gen types typescript --linked > src/lib/database.types.ts
   ```

## Pre-demo reset

```sh
npm run demo:reset      # psql "$SUPABASE_DB_URL" -f seed/reset-demo.sql
```

Restores the demo user's canonical 15-show ladder from `demo_ladder_fixture`
and deletes the live-logged show + its comparisons. Then hard-refresh the PWA
(TanStack Query cache) — on good network, before going on stage.

## Schema overview

| Object                                         | Purpose                                                                                                                                                   |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`                                     | mirrors `auth.users`; `tier_bounds jsonb` holds the engine's index-cut shape `{"cuts":[a,b,c,d]}` (not score cutoffs)                                     |
| `artists`, `venues`, `events`, `event_artists` | seed-only catalog (no client write policies); `slug` columns are the deterministic uuidv5 keys for the seed pipeline                                      |
| `set_logs`                                     | one row per user per event; `rank_pos` (1 = best) is the authoritative order, `latent_score` is engine-supplied decoration (1500-centered, no DB default) |
| `comparisons`                                  | append-only tap log; `kind` enum `insertion｜audit｜backfill`, nullable set-null FKs `subject_log`/`opponent_log` (replay ignores dangling ids)           |
| `follows`                                      | social graph                                                                                                                                              |
| `demo_ladder_fixture`                          | canonical demo start state; RLS enabled with **no policies** → service-role only                                                                          |
| `artist_ladder`, `venue_ladder`                | derived read-only views, `security_invoker`                                                                                                               |

### Append-only guarantee on `comparisons`

The **real** guarantee is that no UPDATE/DELETE RLS policies exist for client
roles — PostgREST requests are denied outright. The
`comparisons_append_only` BEFORE trigger is defense in depth; it carves out
(a) the FK `on delete set null` repair when a referenced `set_log` is deleted
and (b) maintenance roles (`postgres`/`service_role`) so seeding and
`demo:reset` can rewrite history.

## RPC / view interface (consumed by `src/lib/persist.ts` and the client)

```
insert_ranked_log(
  p_event_id uuid, p_score double precision, p_rank int, p_session_id uuid,
  p_comparisons jsonb,    -- [{opponent_log, outcome: a_wins|b_wins|skipped, kind?: insertion|audit|backfill}]
  p_score_updates jsonb   -- [{log_id, latent_score}]
) returns set_logs        -- security invoker; atomic shift + insert + comparisons + score repairs
```

The client **buffers comparisons in the session** and calls this once at
finalize — per-tap inserts are impossible because `subject_log` is the id of
the not-yet-created row.

```
shared_shows(user_a uuid, user_b uuid)
  returns (event_id, title, event_date, venue_name,
           a_rank, b_rank, a_score, b_score, a_moment, b_moment)
```

Taste match is computed client-side (`src/engine/tasteMatch.ts`) after
re-ranking the shared subset 1..n on both sides.

Enums: `capacity_tier`, `moment_tag`, `comparison_outcome`, `comparison_kind`.
