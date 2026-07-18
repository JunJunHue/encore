import { describe, expect, it } from 'vitest';
import { recommendShows } from './affinity';
import type { EventJoin, LadderRow } from '@/lib/hooks';

const NOW = new Date('2026-07-18T00:00:00Z');

function event(id: string, artist: string, genre: string, date: string): EventJoin {
  return {
    id,
    slug: id,
    title: `${artist} at Venue`,
    event_date: date,
    primary_genre: genre,
    venues: null,
    event_artists: [{ billing_order: 1, artists: { id: `artist-${id}`, name: artist, genres: [genre] } }],
  };
}

function loggedRow(rankPos: number, ev: EventJoin): LadderRow {
  return {
    id: `log-${ev.id}`,
    user_id: 'u1',
    event_id: ev.id,
    latent_score: 1500,
    rank_pos: rankPos,
    note: null,
    moment: null,
    crew: [],
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    events: ev,
  };
}

describe('recommendShows', () => {
  it('returns nothing for a brand-new user with an empty ladder', () => {
    const catalog = [event('c1', 'Bicep', 'techno', '2026-01-01')];
    expect(recommendShows([], catalog, NOW)).toEqual([]);
  });

  it('recommends unlogged catalog shows matching the genre of top-ranked shows', () => {
    const loved = event('loved', 'Four Tet', 'electronic', '2026-06-06');
    const ladder = [loggedRow(1, loved)];

    const match = event('match', 'Overmono', 'electronic', '2026-05-23');
    const offGenre = event('off', 'Some Rock Band', 'rock', '2026-02-01');

    const recs = recommendShows(ladder, [loved, match, offGenre], NOW);

    expect(recs.map((r) => r.event.id)).toEqual(['match']);
    expect(recs[0]!.reason).toBe('Because you loved Four Tet');
  });

  it('never recommends a show already on the ladder', () => {
    const loved = event('loved', 'Four Tet', 'electronic', '2026-06-06');
    const ladder = [loggedRow(1, loved)];
    const recs = recommendShows(ladder, [loved], NOW);
    expect(recs).toEqual([]);
  });

  it('ranks a top-ranked-genre show above a mid-ranked-genre show', () => {
    // 3-show ladder so the mid-ranked show still carries nonzero goodness
    // (only the strict bottom of the ladder is zeroed by design).
    const lovedTechno = event('loved-techno', 'Bicep', 'techno', '2026-06-01');
    const midHouse = event('mid-house', 'Some DJ', 'house', '2025-08-01');
    const bottomRock = event('bottom-rock', 'Some Band', 'rock', '2025-08-01');
    const ladder = [loggedRow(1, lovedTechno), loggedRow(2, midHouse), loggedRow(3, bottomRock)];

    const technoCandidate = event('c-techno', 'Overmono', 'techno', '2026-05-01');
    const houseCandidate = event('c-house', 'Another DJ', 'house', '2026-05-01');

    const recs = recommendShows(
      ladder,
      [lovedTechno, midHouse, bottomRock, technoCandidate, houseCandidate],
      NOW,
    );

    expect(recs.map((r) => r.event.id)).toEqual(['c-techno', 'c-house']);
    expect(recs[0]!.score).toBeGreaterThan(recs[1]!.score);
  });

  it('caps the reason string at the two highest-weighted contributing shows', () => {
    const a = event('a', 'Artist A', 'house', '2026-06-01');
    const b = event('b', 'Artist B', 'house', '2026-05-01');
    const c = event('c', 'Artist C', 'house', '2026-04-01');
    const ladder = [loggedRow(1, a), loggedRow(2, b), loggedRow(3, c)];

    const candidate = event('match', 'DJ Match', 'house', '2026-03-01');
    const recs = recommendShows(ladder, [a, b, c, candidate], NOW);

    expect(recs[0]!.reason).toBe('Because you loved Artist A & Artist B');
  });
});
