import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/lib/database.types';

export type Profile = Tables<'profiles'>;

/** Demo credential (seeded by W2's seed.sql; also documented in README). */
export const DEMO_EMAIL = 'demo@encore.app';
export const DEMO_PASSWORD = 'encore-demo-2026';

/** The two seeded friend accounts every new profile auto-follows (resolutions.md): Maya + Dex. */
export const SEED_FRIEND_IDS = [
  '00000000-0000-4000-a000-000000000002',
  '00000000-0000-4000-a000-000000000003',
] as const;

function demoRequested(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('as') === 'demo';
}

/**
 * Auth bootstrap, called once by the AuthGate before anything renders.
 * - `?as=demo` → signInWithPassword as the seeded demo user (Andrew).
 * - existing session → reuse it.
 * - otherwise → signInAnonymously (judges' fresh sessions; name picker follows).
 */
export async function ensureSession(): Promise<Session> {
  if (demoRequested()) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });
    if (!error && data.session) return data.session;
    // Seed not applied yet / wrong password — fall through to anonymous so the app still boots.
    console.warn('[encore] demo sign-in failed, falling back to anonymous:', error?.message);
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) return session;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  if (!data.session) throw new Error('signInAnonymously returned no session');
  return data.session;
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Create/update the caller's profile with the picked name, then auto-follow the
 * two seeded friends so the Compare tab is never empty (resolutions.md).
 */
export async function upsertProfile(displayName: string): Promise<Profile> {
  const session = await ensureSession();
  const uid = session.user.id;

  const { data, error } = await supabase
    .from('profiles')
    .upsert({ id: uid, display_name: displayName }, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;

  await followSeedFriends(uid); // best-effort, idempotent
  return data;
}

// ---------- name login (name + PIN = a portable account) ----------

export class NameTakenError extends Error {
  constructor() {
    super('That name is taken — if it’s yours, check your PIN.');
    this.name = 'NameTakenError';
  }
}

/**
 * Log in (or claim) a name + PIN. Sessions stay Supabase-anonymous; the
 * `login_with_name` RPC re-parents the named account's rows onto the current
 * session, so the same name + PIN resumes the same ladder on any device
 * (single active device at a time — logging in elsewhere moves the account).
 * Claiming a fresh name keeps any shows already logged as a guest.
 * Caller should full-reload after success so the AuthGate re-boots.
 */
export async function loginWithName(displayName: string, pin: string): Promise<void> {
  const name = displayName.trim();
  await ensureSession();

  let { error } = await supabase.rpc('login_with_name', { p_name: name, p_pin: pin });

  // Switching away from an already-claimed account: park it (it stays
  // claimable by its name + PIN) and retry from a fresh anonymous session.
  if (error && error.message.includes('CALLER_HAS_CLAIMED_ACCOUNT')) {
    await supabase.auth.signOut();
    const anon = await supabase.auth.signInAnonymously();
    if (anon.error) throw anon.error;
    ({ error } = await supabase.rpc('login_with_name', { p_name: name, p_pin: pin }));
  }

  if (!error) return; // logged in — the account now lives on this session

  if (error.message.includes('BAD_PIN')) throw new NameTakenError();
  if (!error.message.includes('NAME_NOT_FOUND')) throw error;

  // New name → claim it: name the current profile (keeps guest ladder) + set the PIN.
  const session = await ensureSession();
  const { error: profileErr } = await supabase
    .from('profiles')
    .upsert({ id: session.user.id, display_name: name }, { onConflict: 'id' });
  if (profileErr) {
    if (profileErr.code === '23505') throw new NameTakenError(); // name held by a pinless guest
    throw profileErr;
  }
  const { error: pinErr } = await supabase.rpc('set_pin', { p_pin: pin });
  if (pinErr) throw pinErr;
  await followSeedFriends(session.user.id);
}

export async function followSeedFriends(userId: string): Promise<void> {
  const rows = SEED_FRIEND_IDS.filter((id) => id !== userId).map((followee_id) => ({
    follower_id: userId,
    followee_id,
  }));
  if (rows.length === 0) return;
  const { error } = await supabase
    .from('follows')
    .upsert(rows, { onConflict: 'follower_id,followee_id', ignoreDuplicates: true });
  if (error) console.warn('[encore] auto-follow seeded friends failed:', error.message);
}
