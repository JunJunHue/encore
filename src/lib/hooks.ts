/**
 * Shared data hooks — every feature reads server state through these.
 * Column vocabulary is the AMENDED schema: rank_pos / latent_score,
 * event search via .ilike on events.title (resolutions.md, Section C).
 */
import { createContext, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { queryClient, qk } from '@/lib/queryClient';
import { fetchProfile, SEED_FRIEND_IDS, type Profile } from '@/lib/auth';
import type { CapacityTier, Database, MomentTag } from '@/lib/database.types';

// ---------- session context ----------

export interface SessionInfo {
  session: Session;
  userId: string;
}

/** Provided by the AuthGate in App.tsx; everything under it may call useSession(). */
export const SessionContext = createContext<SessionInfo | null>(null);

export function useSession(): SessionInfo {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside the AuthGate');
  return ctx;
}

// ---------- row shapes features consume ----------

export interface EventArtistJoin {
  billing_order: number;
  artists: { id: string; name: string; genres: string[] } | null;
}

export interface EventJoin {
  id: string;
  slug: string | null;
  title: string;
  event_date: string;
  primary_genre: string | null;
  venues: {
    id: string;
    name: string;
    capacity_tier: CapacityTier;
    neighborhood: string | null;
    borough: string | null;
    capacity: number | null;
  } | null;
  event_artists: EventArtistJoin[];
}

/** One ladder row: my set_log + its event, venue and artists. Ordered by rank_pos asc. */
export interface LadderRow {
  id: string;
  user_id: string;
  event_id: string;
  latent_score: number;
  rank_pos: number;
  note: string | null;
  moment: MomentTag | null;
  crew: string[];
  created_at: string;
  updated_at: string;
  events: EventJoin | null;
}

export type EventSearchRow = EventJoin;

export type SharedShowRow = Database['public']['Functions']['shared_shows']['Returns'][number];

const EVENT_SELECT =
  'id, slug, title, event_date, primary_genre, ' +
  'venues(id, name, capacity_tier, neighborhood, borough, capacity), ' +
  'event_artists(billing_order, artists(id, name, genres))';

// ---------- fetchers (exported so prewarm + features can prefetch) ----------

export async function fetchLadder(userId: string): Promise<LadderRow[]> {
  const { data, error } = await supabase
    .from('set_logs')
    .select(`*, events(${EVENT_SELECT})`)
    .eq('user_id', userId)
    .order('rank_pos', { ascending: true })
    .returns<LadderRow[]>();
  if (error) throw error;
  return data ?? [];
}

export async function fetchEventSearch(search: string): Promise<EventSearchRow[]> {
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_SELECT)
    .ilike('title', `%${search}%`)
    .order('event_date', { ascending: false })
    .limit(20)
    .returns<EventSearchRow[]>();
  if (error) throw error;
  return data ?? [];
}

export async function fetchFriends(userId: string): Promise<Profile[]> {
  const { data: follows, error } = await supabase
    .from('follows')
    .select('followee_id')
    .eq('follower_id', userId);
  if (error) throw error;
  const ids = (follows ?? []).map((f) => f.followee_id);
  if (ids.length === 0) return [];
  const { data: profiles, error: pErr } = await supabase.from('profiles').select('*').in('id', ids);
  if (pErr) throw pErr;
  // keep follow order stable
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

export async function fetchSharedShows(userA: string, userB: string): Promise<SharedShowRow[]> {
  const { data, error } = await supabase.rpc('shared_shows', { user_a: userA, user_b: userB });
  if (error) throw error;
  return data ?? [];
}

// ---------- hooks ----------

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: qk.profile(userId ?? 'anonymous'),
    queryFn: () => fetchProfile(userId as string),
    enabled: !!userId,
  });
}

/** My (or a friend's) full ladder, ordered best → worst. */
export function useLadder(userId: string | undefined) {
  return useQuery({
    queryKey: qk.ladder(userId ?? 'anonymous'),
    queryFn: () => fetchLadder(userId as string),
    enabled: !!userId,
  });
}

/** Seeded-event search; enabled from 2 chars. */
export function useEventSearch(search: string) {
  const q = search.trim();
  return useQuery({
    queryKey: qk.events(q),
    queryFn: () => fetchEventSearch(q),
    enabled: q.length >= 2,
    placeholderData: (prev) => prev, // keep old results while typing
  });
}

/** Profiles I follow (seeded friends are auto-followed on profile creation). */
export function useFriends(userId: string | undefined) {
  return useQuery({
    queryKey: qk.friends(userId ?? 'anonymous'),
    queryFn: () => fetchFriends(userId as string),
    enabled: !!userId,
  });
}

/** Shared subset between two users — input for engine/tasteMatch + head-to-head list. */
export function useSharedShows(userA: string | undefined, userB: string | undefined) {
  return useQuery({
    queryKey: qk.sharedShows(userA ?? 'anonymous', userB ?? 'unknown'),
    queryFn: () => fetchSharedShows(userA as string, userB as string),
    enabled: !!userA && !!userB,
  });
}

// ---------- boot pre-warm (resolutions.md P1-4) ----------

/**
 * Called once by the AuthGate after the profile resolves: warms the caches the
 * demo touches so every screen paints instantly.
 */
export async function prewarmAppQueries(userId: string): Promise<void> {
  await Promise.allSettled([
    queryClient.prefetchQuery({ queryKey: qk.ladder(userId), queryFn: () => fetchLadder(userId) }),
    queryClient.prefetchQuery({
      queryKey: qk.friends(userId),
      queryFn: () => fetchFriends(userId),
    }),
    ...SEED_FRIEND_IDS.filter((id) => id !== userId).flatMap((friendId) => [
      queryClient.prefetchQuery({
        queryKey: qk.sharedShows(userId, friendId),
        queryFn: () => fetchSharedShows(userId, friendId),
      }),
      queryClient.prefetchQuery({
        queryKey: qk.ladder(friendId),
        queryFn: () => fetchLadder(friendId),
      }),
      queryClient.prefetchQuery({
        queryKey: qk.profile(friendId),
        queryFn: () => fetchProfile(friendId),
      }),
    ]),
  ]);
}
