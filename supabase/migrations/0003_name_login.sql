-- Name login (no email, no external auth): a bcrypt PIN tied to the unique
-- display name makes an account portable across devices while sessions stay
-- Supabase-anonymous. login_with_name() re-parents the named account's rows
-- onto the caller's session; the caller's guest shell (if any) is replaced.
--
-- PIN hashes live in their own table with RLS enabled and NO policies:
-- clients can never read them (profiles is public-read by design, so the
-- hash must not live there). Only the security-definer functions below touch
-- this table, and they run as the migration owner (postgres), which also
-- lets them pass the comparisons append-only trigger's role check.

create table if not exists profile_pins (
  user_id  uuid primary key references profiles (id) on delete cascade,
  pin_hash text not null
);
alter table profile_pins enable row level security; -- no policies = no client access

create or replace function public.set_pin(p_pin text)
returns void
language plpgsql security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if length(p_pin) < 6 then raise exception 'PIN_TOO_SHORT'; end if;
  if not exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'NO_PROFILE';
  end if;
  insert into profile_pins (user_id, pin_hash)
  values (auth.uid(), crypt(p_pin, gen_salt('bf')))
  on conflict (user_id) do update set pin_hash = excluded.pin_hash;
end;
$$;

create or replace function public.login_with_name(p_name text, p_pin text)
returns void
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_new  uuid := auth.uid();
  v_old  uuid;
  v_hash text;
begin
  if v_new is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select p.id, pp.pin_hash into v_old, v_hash
  from profiles p
  join profile_pins pp on pp.user_id = p.id
  where lower(p.display_name) = lower(trim(p_name));

  if v_old is null then raise exception 'NAME_NOT_FOUND'; end if;
  if v_hash <> crypt(p_pin, v_hash) then raise exception 'BAD_PIN'; end if;
  if v_old = v_new then return; end if;

  -- A claimed account must never be silently destroyed: the client signs out
  -- to a fresh anonymous session first and retries.
  if exists (select 1 from profile_pins where user_id = v_new) then
    raise exception 'CALLER_HAS_CLAIMED_ACCOUNT';
  end if;

  -- Replace the caller's unclaimed guest shell (if any).
  delete from comparisons where user_id = v_new;
  delete from set_logs    where user_id = v_new;
  delete from follows     where follower_id = v_new or followee_id = v_new;
  delete from profiles    where id = v_new;

  -- Move the claimed account onto the caller's auth user. The profile row is
  -- copied first (children FK profiles.id); the old name is parked so the
  -- unique-name index allows the copy.
  delete from profile_pins where user_id = v_old;
  update profiles set display_name = display_name || ' §moving' where id = v_old;
  insert into profiles (id, display_name, avatar_seed, tier_bounds, created_at)
  select v_new, replace(display_name, ' §moving', ''), avatar_seed, tier_bounds, created_at
  from profiles where id = v_old;
  update set_logs    set user_id = v_new where user_id = v_old;
  update comparisons set user_id = v_new where user_id = v_old;
  update follows     set follower_id = v_new where follower_id = v_old;
  update follows     set followee_id = v_new where followee_id = v_old;
  delete from profiles where id = v_old;
  insert into profile_pins (user_id, pin_hash) values (v_new, v_hash);
end;
$$;

grant execute on function public.set_pin(text) to authenticated;
grant execute on function public.login_with_name(text, text) to authenticated;
