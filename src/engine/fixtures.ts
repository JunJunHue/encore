/**
 * Canonical demo fixtures (resolutions.md "Demo fixture" section).
 *
 * These are the engine-side source of truth for the seeded demo state:
 *  - Andrew's 15-show ladder (design-seed.md §4.1) with canonical seed scores,
 *  - the live-logged Fred again.. challenger (lands at rank #6 via pivots 7,3,5,4),
 *  - Maya's shared-show ranks tuned so tasteMatch === 87 pre- AND post-log.
 *
 * The backend seed (seed/friends.json, seed/demo-user.json) must reconcile with
 * these numbers — see scratchpad fixture-final.md for the slug-level mapping.
 */
import type { CapacityTier, ChallengerInput, Ladder, LadderEntry } from './types';
import { autoBucket } from './tiers';
import type { SharedShow } from './tasteMatch';

/** Demo "today" — pinned everywhere time is injected. */
export const DEMO_NOW = new Date('2026-07-18T00:00:00Z');

export const DEMO_USER_ID = 'andrew';

export interface DemoShow {
  showId: string;
  eventId: string;
  artist: string;
  venue: string;
  date: string; // ISO event date
  genre: string[];
  capacityTier: CapacityTier;
  year: number;
  city: string;
  /** canonical seeded latent score (rank order is truth; these decorate it) */
  score: number;
}

/**
 * Andrew's pre-demo ladder, best-first (design-seed.md §4.1 order).
 * Scores are hand-placed so autoBucket lands cuts at [3,7,10,13] pre-log and
 * Fred's #6 sits in tier 'great' post-log.
 */
export const ANDREW_LADDER_SHOWS: DemoShow[] = [
  {
    showId: 'log-rufus',
    eventId: 'evt-rufus-du-sol-msg',
    artist: 'Rüfüs Du Sol',
    venue: 'Madison Square Garden',
    date: '2025-10-17',
    genre: ['electronic'],
    capacityTier: 'arena',
    year: 2025,
    city: 'NYC',
    score: 1808,
  },
  {
    showId: 'log-anyma',
    eventId: 'evt-anyma-mirage',
    artist: 'Anyma',
    venue: 'Brooklyn Mirage',
    date: '2025-08-23',
    genre: ['techno'],
    capacityTier: 'arena',
    year: 2025,
    city: 'NYC',
    score: 1766,
  },
  {
    showId: 'log-fourtet',
    eventId: 'evt-four-tet-k-bridge',
    artist: 'Four Tet',
    venue: 'Under the K Bridge Park',
    date: '2026-06-06',
    genre: ['electronic'],
    capacityTier: 'arena',
    year: 2026,
    city: 'NYC',
    score: 1728,
  },
  {
    showId: 'log-bicep',
    eventId: 'evt-bicep-knockdown',
    artist: 'Bicep (CHROMA AV)',
    venue: 'Knockdown Center',
    date: '2025-11-14',
    genre: ['electronic'],
    capacityTier: 'theater',
    year: 2025,
    city: 'NYC',
    score: 1638,
  },
  {
    showId: 'log-lane8',
    eventId: 'evt-lane-8-mirage',
    artist: 'Lane 8',
    venue: 'Brooklyn Mirage',
    date: '2025-09-05',
    genre: ['house'],
    capacityTier: 'arena',
    year: 2025,
    city: 'NYC',
    score: 1600,
  },
  {
    showId: 'log-jamie',
    eventId: 'evt-jamie-xx-forest-hills',
    artist: 'Jamie xx',
    venue: 'Forest Hills Stadium',
    date: '2025-09-27',
    genre: ['electronic'],
    capacityTier: 'stadium',
    year: 2025,
    city: 'NYC',
    score: 1560,
  },
  {
    showId: 'log-peggy',
    eventId: 'evt-peggy-gou-great-hall',
    artist: 'Peggy Gou',
    venue: 'The Great Hall @ Avant Gardner',
    date: '2026-02-14',
    genre: ['house'],
    capacityTier: 'theater',
    year: 2026,
    city: 'NYC',
    score: 1516,
  },
  {
    showId: 'log-fontaines',
    eventId: 'evt-fontaines-dc-brooklyn-steel',
    artist: 'Fontaines D.C.',
    venue: 'Brooklyn Steel',
    date: '2025-11-21',
    genre: ['indie'],
    capacityTier: 'theater',
    year: 2025,
    city: 'NYC',
    score: 1426,
  },
  {
    showId: 'log-charli',
    eventId: 'evt-charli-xcx-barclays',
    artist: 'Charli XCX',
    venue: 'Barclays Center',
    date: '2025-10-04',
    genre: ['pop'],
    capacityTier: 'arena',
    year: 2025,
    city: 'NYC',
    score: 1388,
  },
  {
    showId: 'log-jungle',
    eventId: 'evt-jungle-brooklyn-paramount',
    artist: 'Jungle',
    venue: 'Brooklyn Paramount',
    date: '2026-03-13',
    genre: ['electronic'],
    capacityTier: 'theater',
    year: 2026,
    city: 'NYC',
    score: 1348,
  },
  {
    showId: 'log-koze',
    eventId: 'evt-dj-koze-nowadays',
    artist: 'DJ Koze',
    venue: 'Nowadays',
    date: '2026-04-18',
    genre: ['house'],
    capacityTier: 'club',
    year: 2026,
    city: 'NYC',
    score: 1258,
  },
  {
    showId: 'log-sammy',
    eventId: 'evt-sammy-virji-webster-hall',
    artist: 'Sammy Virji',
    venue: 'Webster Hall',
    date: '2025-12-05',
    genre: ['house'],
    capacityTier: 'theater',
    year: 2025,
    city: 'NYC',
    score: 1218,
  },
  {
    showId: 'log-kaytranada',
    eventId: 'evt-kaytranada-radio-city',
    artist: 'Kaytranada',
    venue: 'Radio City Music Hall',
    date: '2026-05-08',
    genre: ['r&b'],
    capacityTier: 'arena',
    year: 2026,
    city: 'NYC',
    score: 1180,
  },
  {
    showId: 'log-mj',
    eventId: 'evt-mj-lenderman-bowery',
    artist: 'MJ Lenderman',
    venue: 'Bowery Ballroom',
    date: '2026-01-22',
    genre: ['indie'],
    capacityTier: 'club',
    year: 2026,
    city: 'NYC',
    score: 1090,
  },
  {
    showId: 'log-helena',
    eventId: 'evt-helena-hauff-basement',
    artist: 'Helena Hauff',
    venue: 'Basement',
    date: '2025-12-12',
    genre: ['techno'],
    capacityTier: 'club',
    year: 2025,
    city: 'NYC',
    score: 1052,
  },
];

/** The show logged live in the demo (design-seed.md §4.2). */
export const FRED_CHALLENGER: ChallengerInput = {
  showId: 'log-fred',
  eventId: 'evt-fred-again-forest-hills',
  genre: ['electronic'],
  capacityTier: 'stadium',
  year: 2026,
  city: 'NYC',
};

export const FRED_EVENT_DATE = '2026-07-11';

/** Andrew's seeded ladder as a live engine Ladder (auto-bucketed). */
export function andrewLadder(): Ladder {
  const entries: LadderEntry[] = ANDREW_LADDER_SHOWS.map((s) => ({
    showId: s.showId,
    eventId: s.eventId,
    score: s.score,
    placement: 'ranked',
    genre: [...s.genre],
    capacityTier: s.capacityTier,
    year: s.year,
    city: s.city,
  }));
  return autoBucket({ entries, tierBoundaries: { cuts: [0, 0, 0, 0], mode: 'auto' } });
}

/**
 * Maya's full-ladder positions (out of her 32 shows) for every show she shares
 * with Andrew. Verified: tasteMatch === 87 pre- and post-log, Four Tet is the
 * strict biggest disagreement (Andrew #3 vs Maya #21 — "left before the
 * encore"), Fred sits at her #6.
 */
export const MAYA_FULL_RANKS: Record<string, number> = {
  'log-rufus': 1,
  'log-anyma': 2,
  'log-bicep': 3,
  'log-lane8': 4,
  'log-fontaines': 5,
  'log-fred': 6,
  'log-jamie': 8,
  'log-peggy': 11,
  'log-sammy': 14,
  'log-fourtet': 21,
  'log-koze': 24,
  'log-helena': 26,
  'log-charli': 29,
};

/** Andrew full-ladder rank (1-based) pre-log, by showId. */
const ANDREW_PRE_RANKS: Record<string, number> = Object.fromEntries(
  ANDREW_LADDER_SHOWS.map((s, i) => [s.showId, i + 1]),
);

/** Andrew full-ladder rank post-log: Fred lands at #6, everything below shifts. */
const ANDREW_POST_RANKS: Record<string, number> = {
  ...Object.fromEntries(ANDREW_LADDER_SHOWS.map((s, i) => [s.showId, i + 1 <= 5 ? i + 1 : i + 2])),
  'log-fred': 6,
};

const SHARED_SHOW_IDS = ANDREW_LADDER_SHOWS.filter((s) => s.showId in MAYA_FULL_RANKS);

/** Shared subset BEFORE the demo log (12 shows). rankA = Andrew, rankB = Maya. */
export const MAYA_SHARED_PRE: SharedShow[] = SHARED_SHOW_IDS.map((s) => ({
  eventId: s.eventId,
  eventDate: s.date,
  rankA: ANDREW_PRE_RANKS[s.showId]!,
  rankB: MAYA_FULL_RANKS[s.showId]!,
}));

/** Shared subset AFTER Fred is logged (13 shows). */
export const MAYA_SHARED_POST: SharedShow[] = [
  ...SHARED_SHOW_IDS.map((s) => ({
    eventId: s.eventId,
    eventDate: s.date,
    rankA: ANDREW_POST_RANKS[s.showId]!,
    rankB: MAYA_FULL_RANKS[s.showId]!,
  })),
  {
    eventId: FRED_CHALLENGER.eventId,
    eventDate: FRED_EVENT_DATE,
    rankA: 6,
    rankB: MAYA_FULL_RANKS['log-fred']!,
  },
];
