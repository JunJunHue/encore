/**
 * seed/build-seed.ts — Encore seed pipeline (W2).
 *
 * Reads seed/venues.json + seed/events.json + seed/andrew.json + seed/friends.json,
 * validates everything against the closed vocab / distribution targets, synthesizes
 * outcome-consistent session-grouped comparisons for each seeded ladder, verifies the
 * demo taste-match fixture (Andrew x Maya === 87 pre- AND post-log, Andrew x Dex === 62),
 * then emits:
 *   - supabase/seed.sql   (idempotent: deterministic uuidv5 ids, delete-then-insert
 *                          for seed users, upsert for the shared event catalog)
 *   - seed/reset-demo.sql (hardcoded UUID literals restoring Andrew's 15-show state)
 *
 * Run: npx tsx seed/build-seed.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { v5 as uuidv5 } from 'uuid';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const NAMESPACE = '9f2c1a7e-5b83-4d64-a1c9-3e07f6d24b58'; // fixed: uuidv5(slug) is stable forever
const DEMO_NOW = new Date('2026-07-18T00:00:00Z'); // pinned demo date (resolutions.md)
const SEED_CUTOFF = '2026-07-17 00:00:00+00'; // rows after this are "live" (demo:reset wipes them)
const DATE_MIN = '2025-05-01'; // widened: real-world swaps (Four Tet, Fontaines, Lane 8) land May–Jun '25
const DATE_MAX = '2026-07-17';
const SPACING = 32; // Elo points between adjacent seeded ranks (engine SPACING)
const BASELINE = 1500; // ladder scores are centered here
const GENRES = ['house', 'techno', 'electronic', 'indie', 'pop', 'hip-hop', 'jazz', 'rock', 'r&b'];
const MOMENTS = ['the_drop', 'the_encore', 'the_crowd', 'the_visuals', 'the_guest_appearance'];
const HALF_LIFE_MONTHS = 18;
const MIN_OVERLAP = 5;

const uid = (key: string): string => uuidv5(key, NAMESPACE);

// ---------------------------------------------------------------------------
// Input shapes
// ---------------------------------------------------------------------------
interface VenueSeed {
  slug: string;
  name: string;
  neighborhood: string;
  borough: string;
  capacityTier: 'club' | 'theater' | 'arena' | 'stadium';
  capacity: number;
}
interface EventSeed {
  slug: string;
  artist: string;
  artistGenres: string[];
  venue: string;
  date: string;
  supportingArtists?: string[];
}
interface PersonSeed {
  id: string;
  slug: string;
  displayName: string;
  handle?: string;
  bio?: string;
  email?: string;
  password?: string;
  tierCuts: [number, number, number, number];
  scores?: number[]; // engine-pinned latent scores (Andrew: fixture-final.md §1)
  ladder: string[]; // event slugs, rank 1 first
  notes?: Record<string, string>;
  moments?: Record<string, string>;
}

const venues: VenueSeed[] = JSON.parse(readFileSync(join(__dir, 'venues.json'), 'utf8'));
const events: EventSeed[] = JSON.parse(readFileSync(join(__dir, 'events.json'), 'utf8'));
const andrew: PersonSeed = JSON.parse(readFileSync(join(__dir, 'andrew.json'), 'utf8'));
const friendsFile: { friends: PersonSeed[]; follows: [string, string][] } = JSON.parse(
  readFileSync(join(__dir, 'friends.json'), 'utf8'),
);
const [maya, dex] = friendsFile.friends;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------
const problems: string[] = [];
const fail = (msg: string): void => {
  problems.push(msg);
};

const venueBySlug = new Map(venues.map((v) => [v.slug, v]));
const eventBySlug = new Map<string, EventSeed>();

for (const e of events) {
  if (eventBySlug.has(e.slug)) fail(`duplicate event slug: ${e.slug}`);
  eventBySlug.set(e.slug, e);
  if (!venueBySlug.has(e.venue)) fail(`event ${e.slug}: unknown venue "${e.venue}"`);
  if (e.artistGenres.length < 1 || e.artistGenres.length > 3)
    fail(`event ${e.slug}: needs 1-3 genre tags`);
  for (const g of e.artistGenres)
    if (!GENRES.includes(g)) fail(`event ${e.slug}: genre "${g}" not in vocab`);
  if (e.date < DATE_MIN || e.date > DATE_MAX)
    fail(`event ${e.slug}: date ${e.date} outside [${DATE_MIN}, ${DATE_MAX}]`);
  if (Number.isNaN(new Date(e.date + 'T00:00:00Z').getTime()))
    fail(`event ${e.slug}: unparseable date ${e.date}`);
}
// no venue double-booked on one night
const venueNight = new Set<string>();
for (const e of events) {
  const key = `${e.venue}|${e.date}`;
  if (venueNight.has(key)) fail(`venue double-booked: ${key}`);
  venueNight.add(key);
}
if (events.length < 190 || events.length > 210) fail(`expected ~200 events, got ${events.length}`);

// Distribution targets (design-seed.md §1.3), tolerance ±8pp. The 5% "wildcard"
// slice is folded into pop/hip-hop (closed genre vocab has no wildcard tag).
const tierTargets: Record<string, number> = { club: 40, theater: 30, arena: 22, stadium: 8 };
const genreBuckets: Record<string, string[]> = {
  'house/techno/electronic': ['house', 'techno', 'electronic'],
  'indie/rock': ['indie', 'rock'],
  'pop/hip-hop': ['pop', 'hip-hop'],
  'jazz/r&b': ['jazz', 'r&b'],
};
const genreTargets: Record<string, number> = {
  'house/techno/electronic': 45,
  'indie/rock': 25,
  'pop/hip-hop': 20,
  'jazz/r&b': 10,
};
const tierCount: Record<string, number> = { club: 0, theater: 0, arena: 0, stadium: 0 };
const bucketCount: Record<string, number> = Object.fromEntries(
  Object.keys(genreBuckets).map((k) => [k, 0]),
);
for (const e of events) {
  const v = venueBySlug.get(e.venue);
  if (v) tierCount[v.capacityTier] += 1;
  const primary = e.artistGenres[0];
  for (const [bucket, tags] of Object.entries(genreBuckets))
    if (tags.includes(primary)) bucketCount[bucket] += 1;
}
const distReport: string[] = ['distribution (actual% vs target%):'];
for (const [tier, target] of Object.entries(tierTargets)) {
  const pct = (tierCount[tier] / events.length) * 100;
  distReport.push(`  tier ${tier.padEnd(8)} ${pct.toFixed(1).padStart(5)}% vs ${target}%`);
  if (Math.abs(pct - target) > 8) fail(`tier ${tier} at ${pct.toFixed(1)}%, target ${target}±8`);
}
for (const [bucket, target] of Object.entries(genreTargets)) {
  const pct = (bucketCount[bucket] / events.length) * 100;
  distReport.push(`  genre ${bucket.padEnd(24)} ${pct.toFixed(1).padStart(5)}% vs ${target}%`);
  if (Math.abs(pct - target) > 8)
    fail(`genre bucket ${bucket} at ${pct.toFixed(1)}%, target ${target}±8`);
}

// Ladder validation
const people = [andrew, maya, dex];
for (const p of people) {
  const seen = new Set<string>();
  for (const slug of p.ladder) {
    if (!eventBySlug.has(slug)) fail(`${p.slug}: ladder references unknown event ${slug}`);
    if (seen.has(slug)) fail(`${p.slug}: duplicate ladder entry ${slug}`);
    seen.add(slug);
  }
  for (const slug of Object.keys(p.notes ?? {}))
    if (!seen.has(slug)) fail(`${p.slug}: note for event not in ladder: ${slug}`);
  for (const [slug, m] of Object.entries(p.moments ?? {})) {
    if (!seen.has(slug)) fail(`${p.slug}: moment for event not in ladder: ${slug}`);
    if (!MOMENTS.includes(m)) fail(`${p.slug}: invalid moment "${m}"`);
  }
  for (const note of Object.values(p.notes ?? {}))
    if (note.length > 140) fail(`${p.slug}: note over 140 chars`);
}
const FRED = 'fred-again-forest-hills-2026-07-11';
if (andrew.ladder.length !== 15) fail(`Andrew must have 15 shows, has ${andrew.ladder.length}`);
if (andrew.ladder.includes(FRED)) fail('Andrew must NOT have Fred seeded (logged live in demo)');
if (maya.ladder[5] !== FRED)
  fail(`Maya must have Fred at #6, found at #${maya.ladder.indexOf(FRED) + 1}`);
if (maya.ladder.length !== 32) fail(`Maya must have 32 shows, has ${maya.ladder.length}`);
if (dex.ladder.length !== 26) fail(`Dex must have 26 shows, has ${dex.ladder.length}`);
if (dex.ladder.includes(FRED)) fail('Dex must not share Fred');
// Maya's full-ladder positions for every shared show are engine-pinned
// (fixture-final.md §3) — the taste-match tests in src/engine assume them.
const MAYA_CANON: Record<string, number> = {
  'rufus-du-sol-msg-2026-06-26': 1,
  'bicep-knockdown-center-2025-11-14': 2,
  'fontaines-dc-hammerstein-2025-05-16': 3,
  'lane-8-k-bridge-2025-06-14': 4,
  'anyma-brooklyn-mirage-2025-08-23': 5,
  [FRED]: 6,
  'jamie-xx-k-bridge-2025-08-01': 9,
  'peggy-gou-k-bridge-2026-05-09': 10,
  'sammy-virji-webster-hall-2026-05-08': 14,
  'four-tet-k-bridge-2025-05-17': 21,
  'dj-koze-nowadays-2026-04-18': 25,
  'helena-hauff-basement-2025-12-12': 26,
  'charli-xcx-music-hall-williamsburg-2026-07-10': 29,
};
for (const [slug, pos] of Object.entries(MAYA_CANON))
  if (maya.ladder[pos - 1] !== slug)
    fail(`Maya canon: ${slug} must sit at #${pos}, found at #${maya.ladder.indexOf(slug) + 1}`);
for (const slug of maya.ladder)
  if (!(slug in MAYA_CANON) && andrew.ladder.includes(slug))
    fail(`Maya filler ${slug} collides with Andrew's ladder (must be non-shared)`);

// ---------------------------------------------------------------------------
// Taste match (canonical formula, resolutions.md — mirrors src/engine/tasteMatch.ts)
// ---------------------------------------------------------------------------
interface SharedShow {
  eventDate: string;
  rankA: number;
  rankB: number;
}
function tasteMatch(shared: SharedShow[], now: Date): number | null {
  const n = shared.length;
  if (n < MIN_OVERLAP) return null;
  const w = shared.map((s) => {
    const months = (now.getTime() - new Date(s.eventDate).getTime()) / (30.44 * 864e5);
    return Math.pow(0.5, Math.max(0, months) / HALF_LIFE_MONTHS);
  });
  const W = w.reduce((a, b) => a + b, 0);
  const a = shared.map((s) => s.rankA);
  const b = shared.map((s) => s.rankB);
  const mean = (v: number[]): number => v.reduce((acc, x, i) => acc + w[i] * x, 0) / W;
  const ma = mean(a);
  const mb = mean(b);
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    cov += w[i] * (a[i] - ma) * (b[i] - mb);
    va += w[i] * (a[i] - ma) ** 2;
    vb += w[i] * (b[i] - mb) ** 2;
  }
  const rho = va === 0 || vb === 0 ? 0 : cov / Math.sqrt(va * vb);
  return Math.min(100, Math.max(0, Math.round(50 * (1 + rho))));
}

/** Re-rank both users' shared subset 1..n by full-ladder order, then correlate. */
function matchBetween(ladderA: string[], ladderB: string[]): number | null {
  const setB = new Set(ladderB);
  const sharedSlugs = ladderA.filter((s) => setB.has(s));
  const rankIn = (ladder: string[]): Map<string, number> => {
    const subset = ladder.filter((s) => sharedSlugs.includes(s));
    return new Map(subset.map((s, i) => [s, i + 1]));
  };
  const ra = rankIn(ladderA);
  const rb = rankIn(ladderB);
  const rows: SharedShow[] = sharedSlugs.map((s) => ({
    eventDate: eventBySlug.get(s)!.date,
    rankA: ra.get(s)!,
    rankB: rb.get(s)!,
  }));
  return tasteMatch(rows, DEMO_NOW);
}

const andrewPostLog = [...andrew.ladder.slice(0, 5), FRED, ...andrew.ladder.slice(5)];
const preMatch = matchBetween(andrew.ladder, maya.ladder);
const postMatch = matchBetween(andrewPostLog, maya.ladder);
const dexMatch = matchBetween(andrew.ladder, dex.ladder);
const dexPostMatch = matchBetween(andrewPostLog, dex.ladder);
const sharedWithMaya = andrew.ladder.filter((s) => maya.ladder.includes(s)).length;
const sharedWithDex = andrew.ladder.filter((s) => dex.ladder.includes(s)).length;
if (sharedWithMaya !== 12) fail(`Andrew∩Maya pre-log must be 12, got ${sharedWithMaya}`);
if (sharedWithDex !== 7) fail(`Andrew∩Dex must be 7, got ${sharedWithDex}`);
if (preMatch !== 87) fail(`taste match Andrew×Maya PRE-log must be 87, got ${preMatch}`);
if (postMatch !== 87) fail(`taste match Andrew×Maya POST-log must be 87, got ${postMatch}`);
if (dexMatch !== 62) fail(`taste match Andrew×Dex must be 62, got ${dexMatch}`);
if (dexPostMatch !== 62) fail(`taste match Andrew×Dex post-log must be 62, got ${dexPostMatch}`);

// ---------------------------------------------------------------------------
// Synthetic comparisons: replay each ladder through the engine's binary-search
// state machine (design-engine.md §2) so recomputeFromLog reproduces the seeded
// order exactly. Shows are inserted in chronological (logged-as-attended) order.
// ~5% of comparison rows are 'skipped' (too different), injected only where the
// session still deterministically lands on the seeded rank.
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash32(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

type Outcome = 'a_wins' | 'b_wins' | 'skipped';
interface SimStep {
  pivot: number;
  outcome: Outcome;
}
function selectPivot(lo: number, hi: number, skipped: Set<number>): number | null {
  const mid = Math.floor((lo + hi) / 2);
  if (mid < hi && !skipped.has(mid)) return mid;
  for (let d = 1; d <= hi - lo; d++) {
    if (mid + d < hi && !skipped.has(mid + d)) return mid + d;
    if (mid - d >= lo && !skipped.has(mid - d)) return mid - d;
  }
  return null;
}
/** Binary-search insertion of a challenger whose true slot is t in a ladder of size n. */
function simulateSession(
  t: number,
  n: number,
  skipAtStep: number,
): {
  steps: SimStep[];
  landed: number;
  provisional: boolean;
} {
  let lo = 0;
  let hi = n;
  const skipped = new Set<number>();
  const steps: SimStep[] = [];
  let step = 0;
  while (lo < hi) {
    const p = selectPivot(lo, hi, skipped);
    if (p === null) return { steps, landed: hi, provisional: true };
    if (step === skipAtStep && hi - lo >= 3 && p !== t) {
      steps.push({ pivot: p, outcome: 'skipped' });
      skipped.add(p);
      step++;
      continue;
    }
    const challengerWins = t <= p;
    steps.push({ pivot: p, outcome: challengerWins ? 'a_wins' : 'b_wins' });
    if (challengerWins) hi = p;
    else lo = p + 1;
    step++;
  }
  return { steps, landed: lo, provisional: false };
}

interface ComparisonRow {
  id: string;
  userId: string;
  sessionId: string;
  subjectLog: string;
  opponentLog: string;
  outcome: Outcome;
  createdAt: string;
}
interface SetLogRow {
  id: string;
  userId: string;
  eventSlug: string;
  score: number;
  rank: number;
  note: string | null;
  moment: string | null;
  createdAt: string;
}

const setLogId = (userSlug: string, eventSlug: string): string =>
  uid(`setlog:${userSlug}:${eventSlug}`);
/**
 * Latent scores for a seeded ladder. Andrew's are engine-pinned verbatim
 * (fixture-final.md §1: autoBucket reproduces cuts [3,7,10,13]). Friends get
 * generated scores: SPACING between neighbors, a +60 bonus gap at each stored
 * tier-cut boundary (so autoBucket agrees with profiles.tier_bounds), then the
 * whole ladder re-centered on 1500.
 */
function ladderScores(p: PersonSeed): number[] {
  const n = p.ladder.length;
  if (p.scores) {
    if (p.scores.length !== n) fail(`${p.slug}: scores length ${p.scores.length} != ${n}`);
    for (let i = 1; i < p.scores.length; i++)
      if (p.scores[i] >= p.scores[i - 1]) fail(`${p.slug}: scores not strictly decreasing`);
    return p.scores;
  }
  const raw: number[] = [0];
  for (let i = 1; i < n; i++) raw.push(raw[i - 1] - SPACING - (p.tierCuts.includes(i) ? 60 : 0));
  const mean = raw.reduce((a, b) => a + b, 0) / n;
  return raw.map((s) => Math.round((s - mean + BASELINE) * 100) / 100);
}
const sessionTime = (dateISO: string): Date => {
  const d = new Date(dateISO + 'T17:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
};
const pgTs = (d: Date): string => d.toISOString().replace('T', ' ').replace('.000Z', '+00');

const allSetLogs: SetLogRow[] = [];
const allComparisons: ComparisonRow[] = [];
let totalComparisonRows = 0;
let totalSkipRows = 0;

for (const p of people) {
  const n = p.ladder.length;
  const scores = ladderScores(p);
  // set_logs (rank order is truth; 1500-centered scores, min gap SPACING 32)
  for (let i = 0; i < n; i++) {
    const slug = p.ladder[i];
    allSetLogs.push({
      id: setLogId(p.slug, slug),
      userId: p.id,
      eventSlug: slug,
      score: scores[i],
      rank: i + 1,
      note: p.notes?.[slug] ?? null,
      moment: p.moments?.[slug] ?? null,
      createdAt: pgTs(sessionTime(eventBySlug.get(slug)!.date)),
    });
  }
  // comparisons: chronological insertion replay
  const finalRank = new Map(p.ladder.map((s, i) => [s, i]));
  const chrono = [...p.ladder].sort((a, b) => {
    const da = eventBySlug.get(a)!.date;
    const db = eventBySlug.get(b)!.date;
    return da === db ? a.localeCompare(b) : da.localeCompare(db);
  });
  const partial: string[] = [];
  for (const slug of chrono) {
    const t = partial.filter((s) => finalRank.get(s)! < finalRank.get(slug)!).length;
    const rng = mulberry32(hash32(`${p.slug}:${slug}`));
    const wantSkip =
      rng() < 0.33 ? Math.floor(rng() * Math.max(1, Math.ceil(Math.log2(partial.length + 1)))) : -1;
    let sim = simulateSession(t, partial.length, wantSkip);
    if (sim.provisional || sim.landed !== t) sim = simulateSession(t, partial.length, -1);
    if (sim.provisional || sim.landed !== t)
      fail(`${p.slug}/${slug}: simulated session landed at ${sim.landed}, expected ${t}`);
    const base = sessionTime(eventBySlug.get(slug)!.date);
    const sessionId = uid(`session:${p.slug}:${slug}`);
    sim.steps.forEach((s, i) => {
      const at = new Date(base.getTime() + (i + 1) * 20_000);
      allComparisons.push({
        id: uid(`cmp:${p.slug}:${slug}:${i}`),
        userId: p.id,
        sessionId,
        subjectLog: setLogId(p.slug, slug),
        opponentLog: setLogId(p.slug, partial[s.pivot]),
        outcome: s.outcome,
        createdAt: pgTs(at),
      });
      totalComparisonRows++;
      if (s.outcome === 'skipped') totalSkipRows++;
      if (pgTs(at) >= SEED_CUTOFF) fail(`comparison after seed cutoff: ${p.slug}/${slug}`);
    });
    partial.splice(t, 0, slug);
  }
  // sanity: partial must equal the seeded ladder
  if (partial.join() !== p.ladder.join()) fail(`${p.slug}: replay did not reproduce ladder`);
}
const skipPct = (totalSkipRows / totalComparisonRows) * 100;
if (skipPct < 1 || skipPct > 12) fail(`skip fraction ${skipPct.toFixed(1)}% outside 1-12%`);

// ---------------------------------------------------------------------------
// Bail out on any validation failure
// ---------------------------------------------------------------------------
console.log(distReport.join('\n'));
console.log(
  `events=${events.length} venues=${venues.length} set_logs=${allSetLogs.length} ` +
    `comparisons=${totalComparisonRows} (skipped ${totalSkipRows}, ${skipPct.toFixed(1)}%)`,
);
console.log(`taste match — Andrew×Maya pre=${preMatch} post=${postMatch}, Andrew×Dex=${dexMatch}`);
if (problems.length > 0) {
  console.error('\nSEED BUILD FAILED:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// SQL emission
// ---------------------------------------------------------------------------
const esc = (s: string): string => s.replace(/'/g, "''");
const lit = (s: string | null): string => (s === null ? 'null' : `'${esc(s)}'`);
const textArray = (xs: string[]): string =>
  xs.length === 0 ? `'{}'::text[]` : `array[${xs.map((x) => `'${esc(x)}'`).join(', ')}]::text[]`;

// artists: dedupe headliners + supporting acts by name
const artistIds = new Map<string, string>(); // name -> uuid
const artistGenres = new Map<string, string[]>();
for (const e of events) {
  if (!artistIds.has(e.artist)) artistIds.set(e.artist, uid(`artist:${e.artist}`));
  // headliner genres always win (an artist may appear first as a support act)
  artistGenres.set(e.artist, e.artistGenres);
  for (const s of e.supportingArtists ?? []) {
    if (!artistIds.has(s)) {
      artistIds.set(s, uid(`artist:${s}`));
      artistGenres.set(s, []);
    }
  }
}

const L: string[] = [];
L.push(`-- ============================================================================`);
L.push(`-- Encore seed data — GENERATED by seed/build-seed.ts. Do not edit by hand.`);
L.push(`-- Idempotent: fixed seed-user UUIDs, uuidv5 catalog ids, delete-then-insert`);
L.push(`-- for seed users, upsert for the event catalog. Run with a service-role/`);
L.push(`-- postgres connection: psql "$SUPABASE_DB_URL" -f supabase/seed.sql`);
L.push(`--`);
L.push(`-- Demo login: demo@encore.app / ${andrew.password}  (hidden ?as=demo path)`);
L.push(`-- ============================================================================`);
L.push(`begin;`);
L.push(``);
L.push(`-- ---- wipe seed users (cascades: profiles, set_logs, comparisons, follows,`);
L.push(`-- ----                  demo_ladder_fixture) --------------------------------`);
const seedIds = people.map((p) => `'${p.id}'`).join(', ');
L.push(`delete from auth.users where id in (${seedIds});`);
L.push(``);
L.push(`-- ---- auth.users: Andrew has a real password credential; the two friends are`);
L.push(`-- ---- anonymous-style rows (never signed into; they exist for FK integrity).`);
L.push(
  `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,` +
    ` email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,` +
    ` confirmation_token, recovery_token, email_change, email_change_token_new,` +
    ` email_change_token_current, phone_change, phone_change_token, reauthentication_token,` +
    ` is_anonymous, is_sso_user)`,
);
L.push(`values`);
L.push(
  `  ('00000000-0000-0000-0000-000000000000', '${andrew.id}', 'authenticated', 'authenticated',` +
    ` '${andrew.email}', extensions.crypt('${andrew.password}', extensions.gen_salt('bf')),` +
    ` now(), '{"provider":"email","providers":["email"]}'::jsonb,` +
    ` '{"display_name":"${esc(andrew.displayName)}"}'::jsonb, now(), now(),` +
    ` '', '', '', '', '', '', '', '', false, false),`,
);
for (const [i, f] of friendsFile.friends.entries()) {
  const comma = i === friendsFile.friends.length - 1 ? ';' : ',';
  L.push(
    `  ('00000000-0000-0000-0000-000000000000', '${f.id}', 'authenticated', 'authenticated',` +
      ` null, null, null, '{"provider":"anonymous","providers":["anonymous"]}'::jsonb,` +
      ` '{"display_name":"${esc(f.displayName)}"}'::jsonb, now(), now(),` +
      ` '', '', '', '', '', '', '', '', true, false)${comma}`,
  );
}
L.push(``);
L.push(`-- email identity so signInWithPassword works for the demo account`);
L.push(
  `insert into auth.identities (id, user_id, provider_id, provider, identity_data,` +
    ` last_sign_in_at, created_at, updated_at)`,
);
L.push(
  `values ('${uid('identity:andrew')}', '${andrew.id}', '${andrew.id}', 'email',` +
    ` jsonb_build_object('sub', '${andrew.id}', 'email', '${andrew.email}',` +
    ` 'email_verified', true, 'phone_verified', false), now(), now(), now());`,
);
L.push(``);
L.push(`-- ---- profiles (tier_bounds = engine index-cut shape {"cuts":[a,b,c,d]}) ----`);
L.push(`insert into profiles (id, display_name, avatar_seed, tier_bounds) values`);
L.push(
  people
    .map(
      (p) =>
        `  ('${p.id}', '${esc(p.displayName)}', '${p.slug}',` +
        ` '{"cuts":[${p.tierCuts.join(',')}]}'::jsonb)`,
    )
    .join(',\n') + ';',
);
L.push(``);
L.push(`-- ---- artists (${artistIds.size}) --------------------------------------------------`);
L.push(`insert into artists (id, name, genres) values`);
L.push(
  [...artistIds.entries()]
    .map(([name, id]) => `  ('${id}', '${esc(name)}', ${textArray(artistGenres.get(name) ?? [])})`)
    .join(',\n') +
    '\non conflict (id) do update set name = excluded.name, genres = excluded.genres;',
);
L.push(``);
L.push(`-- ---- venues (${venues.length}) ---------------------------------------------------`);
L.push(
  `insert into venues (id, slug, name, city, neighborhood, borough, capacity, capacity_tier) values`,
);
L.push(
  venues
    .map(
      (v) =>
        `  ('${uid(`venue:${v.slug}`)}', '${v.slug}', '${esc(v.name)}', 'New York',` +
        ` '${esc(v.neighborhood)}', '${esc(v.borough)}', ${v.capacity}, '${v.capacityTier}')`,
    )
    .join(',\n') +
    `\non conflict (id) do update set slug = excluded.slug, name = excluded.name,` +
    ` neighborhood = excluded.neighborhood, borough = excluded.borough,` +
    ` capacity = excluded.capacity, capacity_tier = excluded.capacity_tier;`,
);
L.push(``);
L.push(`-- ---- events (${events.length}; title = "Artist at Venue"; primary_genre = headliner's`);
L.push(`-- ---- first genre tag) ------------------------------------------------------`);
L.push(`insert into events (id, slug, venue_id, event_date, title, primary_genre) values`);
L.push(
  events
    .map((e) => {
      const v = venueBySlug.get(e.venue)!;
      const title = `${e.artist} at ${v.name}`;
      return (
        `  ('${uid(`event:${e.slug}`)}', '${e.slug}', '${uid(`venue:${e.venue}`)}',` +
        ` '${e.date}', '${esc(title)}', '${esc(e.artistGenres[0])}')`
      );
    })
    .join(',\n') +
    `\non conflict (id) do update set slug = excluded.slug, venue_id = excluded.venue_id,` +
    ` event_date = excluded.event_date, title = excluded.title,` +
    ` primary_genre = excluded.primary_genre;`,
);
L.push(``);
L.push(`-- ---- event_artists (headliner billing_order 1, supports 2..) ---------------`);
const eaRows: string[] = [];
for (const e of events) {
  eaRows.push(`  ('${uid(`event:${e.slug}`)}', '${artistIds.get(e.artist)}', 1)`);
  (e.supportingArtists ?? []).forEach((s, i) => {
    eaRows.push(`  ('${uid(`event:${e.slug}`)}', '${artistIds.get(s)}', ${i + 2})`);
  });
}
L.push(`insert into event_artists (event_id, artist_id, billing_order) values`);
L.push(
  eaRows.join(',\n') +
    `\non conflict (event_id, artist_id) do update set billing_order = excluded.billing_order;`,
);
L.push(``);
L.push(`-- ---- set_logs (rank_pos is truth; latent_score 1500-centered, SPACING ${SPACING}) --`);
L.push(
  `insert into set_logs (id, user_id, event_id, latent_score, rank_pos, note, moment, created_at) values`,
);
L.push(
  allSetLogs
    .map(
      (r) =>
        `  ('${r.id}', '${r.userId}', '${uid(`event:${r.eventSlug}`)}', ${r.score}, ${r.rank},` +
        ` ${lit(r.note)}, ${r.moment === null ? 'null' : `'${r.moment}'::moment_tag`},` +
        ` '${r.createdAt}')`,
    )
    .join(',\n') + ';',
);
L.push(``);
L.push(`-- ---- comparisons (session-grouped, outcome-consistent binary-search replay;`);
L.push(
  `-- ---- ${totalSkipRows}/${totalComparisonRows} skipped ~ ${skipPct.toFixed(1)}%; kind = 'insertion') ---------------------`,
);
L.push(
  `insert into comparisons (id, user_id, session_id, subject_log, opponent_log, outcome, kind, created_at) values`,
);
L.push(
  allComparisons
    .map(
      (c) =>
        `  ('${c.id}', '${c.userId}', '${c.sessionId}', '${c.subjectLog}', '${c.opponentLog}',` +
        ` '${c.outcome}'::comparison_outcome, 'insertion'::comparison_kind, '${c.createdAt}')`,
    )
    .join(',\n') + ';',
);
L.push(``);
L.push(`-- ---- follows ---------------------------------------------------------------`);
const slugToId = new Map(people.map((p) => [p.slug, p.id]));
L.push(`insert into follows (follower_id, followee_id) values`);
L.push(
  friendsFile.follows
    .map(([a, b]) => `  ('${slugToId.get(a)}', '${slugToId.get(b)}')`)
    .join(',\n') + ';',
);
L.push(``);
L.push(`-- ---- demo_ladder_fixture (canonical pre-demo state for Andrew) -------------`);
const andrewLogs = allSetLogs.filter((r) => r.userId === andrew.id);
L.push(`insert into demo_ladder_fixture (set_log_id, rank_pos, latent_score) values`);
L.push(andrewLogs.map((r) => `  ('${r.id}', ${r.rank}, ${r.score})`).join(',\n') + ';');
L.push(``);
L.push(`commit;`);
L.push(``);
writeFileSync(join(ROOT, 'supabase', 'seed.sql'), L.join('\n'));

// ---------------------------------------------------------------------------
// seed/reset-demo.sql — hardcoded literals only (no dependence on fixture table)
// ---------------------------------------------------------------------------
const R: string[] = [];
R.push(`-- ============================================================================`);
R.push(`-- Encore demo reset — GENERATED by seed/build-seed.ts. Do not edit by hand.`);
R.push(`-- Restores Andrew (${andrew.id}) to the canonical`);
R.push(`-- 15-show pre-demo ladder: deletes the live-logged show (Fred again.. at`);
R.push(`-- Forest Hills) + its comparisons, restores rank/score/note/moment, resets`);
R.push(`-- tier cuts. Idempotent. Run: npm run demo:reset`);
R.push(`-- ============================================================================`);
R.push(`begin;`);
R.push(``);
R.push(`-- live comparisons are stamped after the seed cutoff`);
R.push(`delete from comparisons`);
R.push(` where user_id = '${andrew.id}'`);
R.push(`   and created_at > '${SEED_CUTOFF}';`);
R.push(``);
R.push(`-- drop any set_log that is not one of the 15 canonical rows (Fred + strays)`);
R.push(`delete from set_logs`);
R.push(` where user_id = '${andrew.id}'`);
R.push(`   and id not in (`);
R.push(andrewLogs.map((r) => `     '${r.id}'`).join(',\n'));
R.push(`   );`);
R.push(``);
R.push(`-- restore canonical rank_pos / latent_score / note / moment`);
R.push(`update set_logs as sl`);
R.push(`   set rank_pos = v.rank_pos,`);
R.push(`       latent_score = v.latent_score,`);
R.push(`       note = v.note,`);
R.push(`       moment = v.moment::moment_tag`);
R.push(`  from (values`);
R.push(
  andrewLogs
    .map(
      (r) =>
        `    ('${r.id}'::uuid, ${r.rank}, ${r.score}::double precision, ${lit(r.note)},` +
        ` ${r.moment === null ? 'null' : `'${r.moment}'`})`,
    )
    .join(',\n'),
);
R.push(`  ) as v(id, rank_pos, latent_score, note, moment)`);
R.push(` where sl.id = v.id;`);
R.push(``);
R.push(`-- reset tier cuts to the seeded auto-buckets`);
R.push(`update profiles`);
R.push(`   set tier_bounds = '{"cuts":[${andrew.tierCuts.join(',')}]}'::jsonb`);
R.push(` where id = '${andrew.id}';`);
R.push(``);
R.push(`commit;`);
R.push(``);
writeFileSync(join(__dir, 'reset-demo.sql'), R.join('\n'));

console.log('\nwrote supabase/seed.sql and seed/reset-demo.sql');
