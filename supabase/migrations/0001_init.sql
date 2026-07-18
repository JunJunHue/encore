-- ============================================================================
-- Encore MVP — 0001_init.sql
-- Full schema per design-schema.md as amended by resolutions.md ("Section A
-- owns storage", amendments 1–10). Targets hosted Supabase (assumes the
-- `auth` schema, the `extensions` schema, and Supabase default privileges
-- granting table access to anon/authenticated/service_role).
-- Runnable top-to-bottom via `supabase db push`.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- extensions (amendment 1: FIRST, before any index that uses them)
-- ---------------------------------------------------------------------------
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm  with schema extensions;

-- ---------------------------------------------------------------------------
-- enums
-- ---------------------------------------------------------------------------
create type capacity_tier as enum ('club', 'theater', 'arena', 'stadium');

create type moment_tag as enum
  ('the_drop', 'the_encore', 'the_crowd', 'the_visuals', 'the_guest_appearance');

-- skipped = "too different" tap
create type comparison_outcome as enum ('a_wins', 'b_wins', 'skipped');

-- amendment 2: replaces the old is_audit boolean
create type comparison_kind as enum ('insertion', 'audit', 'backfill');

-- ---------------------------------------------------------------------------
-- profiles (id mirrors auth.users.id; anonymous sign-ins create real rows)
-- ---------------------------------------------------------------------------
create table profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_seed  text not null default md5(gen_random_uuid()::text),
  -- amendment 5: engine-owned INDEX-CUT shape {"cuts":[a,b,c,d]} (NOT score
  -- cutoffs). Client derives tier labels from cuts; engine autoBucket writes it.
  tier_bounds  jsonb not null default '{"cuts": [0, 0, 0, 0]}',
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- artists
-- ---------------------------------------------------------------------------
create table artists (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  musicbrainz_id uuid unique,            -- nullable for MVP seed
  genres         text[] not null default '{}',
  aliases        text[] not null default '{}',
  created_at     timestamptz not null default now(),
  unique (name)
);

-- ---------------------------------------------------------------------------
-- venues (amendment 7: slug / neighborhood / capacity / borough)
-- ---------------------------------------------------------------------------
create table venues (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique,             -- deterministic seed key (uuidv5 source)
  name          text not null,
  city          text not null default 'New York',
  neighborhood  text,
  borough       text,
  capacity      integer,
  capacity_tier capacity_tier not null,
  created_at    timestamptz not null default now(),
  unique (name, city)
);

-- ---------------------------------------------------------------------------
-- events (amendment 7: slug; amendment 8: primary_genre is seed-derived from
-- the headliner's first genre tag — not maintained by trigger)
-- ---------------------------------------------------------------------------
create table events (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique,             -- deterministic seed key (uuidv5 source)
  venue_id      uuid not null references venues (id),
  event_date    date not null,
  title         text not null,           -- display string, e.g. "Fred again.. at Forest Hills Stadium"
  primary_genre text,
  created_at    timestamptz not null default now()
);

create index events_date_idx  on events (event_date desc);
create index events_venue_idx on events (venue_id);
-- search is a simple ILIKE on title; trgm gin index keeps it snappy
create index events_title_trgm_idx on events using gin (title extensions.gin_trgm_ops);

create table event_artists (
  event_id      uuid not null references events (id) on delete cascade,
  artist_id     uuid not null references artists (id),
  billing_order smallint not null default 1,   -- 1 = headliner
  primary key (event_id, artist_id)
);
create index event_artists_artist_idx on event_artists (artist_id);

-- ---------------------------------------------------------------------------
-- set_logs (amendment 6: latent_score has NO default — the engine supplies
-- 1500-centered scores; rank_pos is the authoritative display order)
-- ---------------------------------------------------------------------------
create table set_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles (id) on delete cascade,
  event_id     uuid not null references events (id),
  latent_score double precision not null,        -- engine-supplied, derived decoration
  rank_pos     integer not null,                 -- 1 = best; order is truth
  note         text check (char_length(note) <= 140),
  moment       moment_tag,
  crew         uuid[] not null default '{}',     -- profile ids of friends who came
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, event_id)                     -- one log per user per event
);

create index set_logs_user_rank_idx  on set_logs (user_id, rank_pos);
create index set_logs_user_score_idx on set_logs (user_id, latent_score desc);
create index set_logs_event_idx      on set_logs (event_id);

-- keep updated_at honest
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_logs_touch_updated_at
  before update on set_logs
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- comparisons (append-only source of truth for rank recomputation)
-- amendment 2: kind enum instead of is_audit; session_id kept
-- amendment 3: subject/opponent are NULLABLE set-null FKs — replay ignores
--              dangling ids after a set_log is deleted
-- ---------------------------------------------------------------------------
create table comparisons (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles (id) on delete cascade,
  session_id   uuid not null,            -- groups one insertion flow; client-minted
  subject_log  uuid references set_logs (id) on delete set null, -- show being inserted (side A)
  opponent_log uuid references set_logs (id) on delete set null, -- ladder candidate (side B)
  outcome      comparison_outcome not null,
  kind         comparison_kind not null,
  created_at   timestamptz not null default now(),
  check (subject_log <> opponent_log)
);

create index comparisons_user_idx    on comparisons (user_id, created_at desc);
create index comparisons_session_idx on comparisons (session_id);

-- amendment 4: append-only via BEFORE trigger (no `create rule`). For API
-- clients the REAL guarantee is the absence of UPDATE/DELETE RLS policies
-- below; this trigger is defense in depth. Two carve-outs:
--   (a) the ON DELETE SET NULL repair fired when a referenced set_log is
--       deleted must pass (it is a system UPDATE that only nulls FK columns);
--   (b) maintenance roles (postgres/service_role — seed pipeline, demo reset)
--       may mutate history; client API roles (anon/authenticated) never can.
create or replace function public.comparisons_append_only()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and new.id         is not distinct from old.id
     and new.user_id    is not distinct from old.user_id
     and new.session_id is not distinct from old.session_id
     and new.outcome    is not distinct from old.outcome
     and new.kind       is not distinct from old.kind
     and new.created_at is not distinct from old.created_at
     and (new.subject_log  is null or new.subject_log  is not distinct from old.subject_log)
     and (new.opponent_log is null or new.opponent_log is not distinct from old.opponent_log)
  then
    return new;  -- FK on-delete-set-null repair only
  end if;

  if current_user in ('anon', 'authenticated') then
    raise exception 'comparisons is append-only: % rejected', tg_op;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger comparisons_append_only
  before update or delete on comparisons
  for each row
  execute function public.comparisons_append_only();

-- ---------------------------------------------------------------------------
-- follows
-- ---------------------------------------------------------------------------
create table follows (
  follower_id uuid not null references profiles (id) on delete cascade,
  followee_id uuid not null references profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee_idx on follows (followee_id);

-- ---------------------------------------------------------------------------
-- demo_ladder_fixture (amendment 10: canonical demo start state, written by
-- the seed pipeline, read by seed/reset-demo.sql. Service-role only: RLS is
-- enabled and NO policies exist, so client roles get nothing.)
-- ---------------------------------------------------------------------------
create table demo_ladder_fixture (
  set_log_id   uuid primary key references set_logs (id) on delete cascade,
  rank_pos     integer not null,
  latent_score double precision not null
);

-- ---------------------------------------------------------------------------
-- RLS (amendment 9-adjacent note: anonymous sign-ins still mint a real
-- auth.users row + JWT with role `authenticated`, so `to authenticated`
-- covers judges' anonymous sessions)
-- ---------------------------------------------------------------------------
alter table profiles            enable row level security;
alter table artists             enable row level security;
alter table venues              enable row level security;
alter table events              enable row level security;
alter table event_artists       enable row level security;
alter table set_logs            enable row level security;
alter table comparisons         enable row level security;
alter table follows             enable row level security;
alter table demo_ladder_fixture enable row level security;  -- no policies: service-role only

-- global read: public-ledger product
create policy "read profiles"      on profiles      for select to authenticated using (true);
create policy "read artists"       on artists       for select to authenticated using (true);
create policy "read venues"        on venues        for select to authenticated using (true);
create policy "read events"        on events        for select to authenticated using (true);
create policy "read event_artists" on event_artists for select to authenticated using (true);
create policy "read set_logs"      on set_logs      for select to authenticated using (true);
create policy "read comparisons"   on comparisons   for select to authenticated using (true);
create policy "read follows"       on follows       for select to authenticated using (true);

-- owner writes
create policy "insert own profile" on profiles for insert to authenticated
  with check (id = auth.uid());
create policy "update own profile" on profiles for update to authenticated
  using (id = auth.uid());

create policy "insert own set_log" on set_logs for insert to authenticated
  with check (user_id = auth.uid());
create policy "update own set_log" on set_logs for update to authenticated
  using (user_id = auth.uid());
create policy "delete own set_log" on set_logs for delete to authenticated
  using (user_id = auth.uid());

-- comparisons: INSERT only. No update/delete policies = denied (the real
-- append-only guarantee); the trigger above is belt-and-suspenders.
create policy "insert own comparison" on comparisons for insert to authenticated
  with check (user_id = auth.uid());

create policy "insert own follow" on follows for insert to authenticated
  with check (follower_id = auth.uid());
create policy "delete own follow" on follows for delete to authenticated
  using (follower_id = auth.uid());

-- artists/venues/events/event_artists: no client write policies; seed-only via
-- service role. demo_ladder_fixture: no policies at all.

-- ---------------------------------------------------------------------------
-- derived views (security_invoker so RLS of the caller applies)
-- ---------------------------------------------------------------------------
create view artist_ladder with (security_invoker = on) as
select sl.user_id,
       a.id as artist_id,
       a.name,
       avg(sl.latent_score) as score,
       count(*) as show_count,
       rank() over (partition by sl.user_id order by avg(sl.latent_score) desc) as rank_pos
from set_logs sl
join event_artists ea on ea.event_id = sl.event_id
join artists a        on a.id = ea.artist_id
group by sl.user_id, a.id, a.name;

create view venue_ladder with (security_invoker = on) as
select sl.user_id,
       v.id as venue_id,
       v.name,
       v.capacity_tier,
       avg(sl.latent_score) as score,
       count(*) as show_count,
       rank() over (partition by sl.user_id order by avg(sl.latent_score) desc) as rank_pos
from set_logs sl
join events e on e.id = sl.event_id
join venues v on v.id = e.venue_id
group by sl.user_id, v.id, v.name, v.capacity_tier;

-- ---------------------------------------------------------------------------
-- shared_shows RPC — head-to-head / taste-match input (client re-ranks the
-- subset 1..n on both sides before correlating)
-- ---------------------------------------------------------------------------
create or replace function public.shared_shows(user_a uuid, user_b uuid)
returns table (
  event_id   uuid,
  title      text,
  event_date date,
  venue_name text,
  a_rank     int,
  b_rank     int,
  a_score    double precision,
  b_score    double precision,
  a_moment   moment_tag,
  b_moment   moment_tag
)
language sql
stable
security invoker
as $$
  select e.id, e.title, e.event_date, v.name,
         sa.rank_pos, sb.rank_pos, sa.latent_score, sb.latent_score,
         sa.moment, sb.moment
  from set_logs sa
  join set_logs sb on sb.event_id = sa.event_id and sb.user_id = user_b
  join events e on e.id = sa.event_id
  join venues v on v.id = e.venue_id
  where sa.user_id = user_a
  order by e.event_date desc;
$$;

-- ---------------------------------------------------------------------------
-- insert_ranked_log RPC (amendment 9: full body, security invoker — RLS of
-- the calling user applies to every statement). Atomic finalize of one
-- insertion flow: shift ladder, insert the log, append buffered comparisons,
-- apply neighbor score repairs.
--
-- Payload shapes (see src/lib/persist.ts, the only adapter allowed to call):
--   p_comparisons   jsonb array of
--     {"opponent_log": uuid|null, "outcome": "a_wins"|"b_wins"|"skipped",
--      "kind": "insertion"|"audit"|"backfill"}   (kind defaults to 'insertion')
--     subject_log is ALWAYS the newly created row — the client cannot know its
--     id, which is why per-tap inserts are impossible and this RPC exists.
--   p_score_updates jsonb array of {"log_id": uuid, "latent_score": number}
-- ---------------------------------------------------------------------------
create or replace function public.insert_ranked_log(
  p_event_id      uuid,
  p_score         double precision,
  p_rank          int,
  p_session_id    uuid,
  p_comparisons   jsonb,
  p_score_updates jsonb
)
returns set_logs
language plpgsql
security invoker
as $$
declare
  v_log set_logs;
begin
  -- 1. shift the existing ladder down to open the slot
  update set_logs
     set rank_pos = rank_pos + 1
   where user_id = auth.uid()
     and rank_pos >= p_rank;

  -- 2. insert the new log at the slot
  insert into set_logs (user_id, event_id, latent_score, rank_pos)
  values (auth.uid(), p_event_id, p_score, p_rank)
  returning * into v_log;

  -- 3. append the session's buffered comparisons (subject = the new row)
  insert into comparisons (user_id, session_id, subject_log, opponent_log, outcome, kind)
  select auth.uid(),
         p_session_id,
         v_log.id,
         nullif(c ->> 'opponent_log', '')::uuid,
         (c ->> 'outcome')::comparison_outcome,
         coalesce(c ->> 'kind', 'insertion')::comparison_kind
  from jsonb_array_elements(coalesce(p_comparisons, '[]'::jsonb)) as c;

  -- 4. neighbor score repairs, guarded to the caller's own rows
  update set_logs sl
     set latent_score = (u ->> 'latent_score')::double precision
    from jsonb_array_elements(coalesce(p_score_updates, '[]'::jsonb)) as u
   where sl.id = (u ->> 'log_id')::uuid
     and sl.user_id = auth.uid();

  return v_log;
end;
$$;
