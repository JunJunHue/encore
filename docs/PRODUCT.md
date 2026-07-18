# Encore — Beli for Live Music

_End-to-end product design_

---

## 1. Thesis

Every concert-goer keeps a mental ranking ("Fred again at Forest Hills was top 3 ever, but that warehouse set last month beat it"). Nobody has the ledger. Star ratings fail for live music even harder than for restaurants because shows are singular events — you can't revisit them, so the only honest evaluation is comparative: _was it better than the last one?_

Encore is the ranked ledger of your live music life: every show, every set, every venue, ordered by forced pairwise comparison, shared with friends whose taste you actually trust.

**Why now:** post-2021 live music spending is at all-time highs, festival culture is mainstream, and the "concert dump" (posting stories from shows) is already a universal behavior with no structured home. Setlist.fm proved people will log shows for zero social reward; Beli proved pairwise ranking + friend graphs retain.

**Why this beats restaurants for virality:** shows are scheduled, communal events. Thousands of people exit the same venue at the same moment, all reaching for their phones. Restaurants never give you a synchronized emotional spike.

---

## 2. Core objects

The data model has one crucial decision: **a Show is not an Artist and not a Venue — it's the intersection.**

- **Artist** — canonical entity (MusicBrainz ID). Has genre tags, aliases (b2b sets, side projects link to parents).
- **Venue** — canonical entity with capacity tier (club < 1k, theater 1–4k, arena 4–20k, stadium/festival grounds). Capacity tier matters for fair comparison later.
- **Event** — artist(s) × venue × date. Pre-populated from event APIs; user-creatable for underground shows with a dedupe/merge queue.
- **SetLog** — a user's attendance record of an Event: rank position, optional 1-line note, photos, "moment" tag (see §4), who they went with.
- **FestivalEdition** — a container (EDC 2027) holding a schedule grid of Events; enables clash-aware logging.
- **User** — profile, follow graph, and three ladders (see §3).

Every SetLog feeds **three separate ladders simultaneously**:

1. **Show ladder** — the ranked list of individual nights. This is the emotional core.
2. **Artist ladder** — derived + directly rankable. If you've seen an artist 4 times, their artist-level position aggregates those shows but can be manually adjusted ("great sets, but I'm over them").
3. **Venue ladder** — venues ranked on the venue experience (sound, sightlines, crowd, logistics), explicitly decoupled from who played there.

Decoupling matters: a mid artist at a transcendent venue is a real, common experience, and conflating them (Google reviews' failure) destroys signal.

---

## 3. Ranking mechanics

**Insertion flow (the Beli mechanic, adapted):** when you log a show, you never assign a score. The app runs a binary-search insertion against your existing ladder:

> "Was Rüfüs at MSG better than Lane 8 at Brooklyn Mirage?" → tap left or right → 3–5 comparisons and the show lands in its exact slot.

- Under ~10 logged shows: compare against all. Above that: binary search, so even a 300-show ladder needs ≤9 taps.
- **"Too different to compare"** button: skips the pair and draws the next candidate. Live music needs this more than food — comparing a jazz club set to a festival mainstage is nonsense. Skips inform the category system below.
- Under the hood, positions map to a **Bradley–Terry / Elo-style latent score** rather than a naive linked list. This lets the system (a) surface occasional "audit" comparisons when adjacent shows have near-equal scores, keeping the ladder honest, and (b) power taste-matching math in §5.

**Tiers, not just ranks:** the ladder auto-buckets into tiers — _All-timer / Great / Good / Fine / Regret_ — with draggable boundaries. Tiers solve two problems: rank #47 vs #52 is meaningless noise, and tiers make shareable graphics legible.

**Category lenses:** every ladder can be filtered by genre, capacity tier, year, or city — "my top 10 club sets of 2026" — computed from the single global ladder rather than maintained separately. One ladder, many views; this keeps the comparison burden low.

**Retroactive backfill:** onboarding asks "what are the 5 best shows you've ever seen?" and inserts them first, so the ladder has spine before daily logging begins. Backfill of the long tail is gamified later ("You saw Odesza in 2023 — where does it land?").

---

## 4. Logging UX

The log must take **under 20 seconds** at the venue exit, drunk, at 1am. Everything else is optional enrichment.

**Fast path:**

1. Open app → it already knows (location + event API) you're likely at _Brooklyn Mirage — Sept 14_. One tap confirms.
2. 3–5 pairwise taps → show is ranked.
3. Done screen shows the new ladder position with a satisfying animation. Total: ~15 seconds.

**Enrichment (optional, any time later):**

- **Moment tag:** one structured highlight — _the drop, the encore, the crowd, the visuals, the guest appearance_. Structured moments beat freeform notes for both recall and social feed quality.
- 1-line note, photos (pulled by date from camera roll with permission — "these 14 photos look like they're from last night's show").
- **Crew tagging:** tag friends who were there. If they're on Encore, the show pre-loads in their log queue — the single strongest retention loop in the app (see §7).

**The queue:** shows you likely attended but haven't ranked (ticket email parsing opt-in, tagged-by-friends, location pings) sit in a queue with gentle badges. Zombie queues get auto-archived after 30 days to avoid guilt-driven churn.

---

## 5. Social layer

**Follow graph, not friend requests** — asymmetric like Beli/Letterboxd, because taste is worth following even without mutuality.

- **Taste match %:** computed from overlapping shows ranked in similar order (rank correlation on the shared subset, weighted toward recent). Displayed on every profile. This number is the whole social engine — "we're 91% matched" is instantly shareable and makes every recommendation credible.
- **Head-to-head:** open any friend's profile → "Compare" → see shows you both attended, ranked side by side, with disagreements highlighted. ("You both saw Sara Landry at Basement — you: #3, them: #41. Discuss.") This screen is engineered to be screenshotted into group chats.
- **Feed:** friends' new logs with rank position and moment tag — "Alex ranked Anyma at Sphere #2 all-time 🔥" — not an algorithmic firehose. Chronological, friends-only by default.
- **Group ladders:** any crew can spin up a shared ladder ("Our 2026 shows") aggregating members' rankings — settles the group-chat argument about the best night of the year, and doubles as trip planning history.
- **Leaderboards, carefully:** show-count leaderboards among friends only. Global leaderboards attract grinders and fake logs; friend-scoped ones fuel friendly rivalry without inviting fraud.

---

## 6. Festival mode (the viral engine)

Festivals are the moment the app is _built_ to exploit: 100k+ people, 3 days, everyone comparing sets constantly, everyone posting recaps.

**Before:** the festival's schedule grid is pre-loaded. Users build their planned schedule; clashes ("Chris Lake vs. Solomun, both 11pm") are surfaced with friends' picks shown — pre-event social engagement before a single note plays.

**During:** ultra-light "I'm here" check-ins per set (offline-tolerant — writes queue locally and sync later, because festival network conditions are hostile). No ranking pressure mid-festival.

**After (the payoff):** a guided ranking session — "You caught 14 sets at EDC. Let's rank them." Pairwise flow, tuned to ~90 seconds, ending in the **Festival Recap Card**: a beautifully designed, IG-story-sized graphic — your top 3 sets, your total sets caught, your taste match with tagged crew, festival branding. Every recap card is an ad for the app posted by the user, timestamped to the exact weekend everyone in their network attended the same event.

**Launch tactic:** don't launch generally — launch _at one festival_. Seed ambassadors, geo-targeted promotion, QR codes in the campground. One festival cohort of a few thousand active users beats 50k scattered signups, because the social graph density is instant.

---

## 7. Retention & growth loops

1. **Crew tag loop:** tagged friends get "Andrew tagged you at Boiler Room NYC — rank it?" — an invite that arrives attached to a shared memory, the warmest possible cold start.
2. **Show cadence loop:** event APIs know when you have tickets/are at a venue; the next-morning nudge ("Rank last night?") aligns with the natural cadence of going out (weekly for the core demo — this clears the logging-frequency bar that kills most Beli clones).
3. **Recap loop:** monthly and annual **Wrapped-style recaps** (top shows, new venues, genre drift, taste match shifts). Spotify proved the December explosion; Encore gets one per festival _plus_ December.
4. **Discovery loop:** "3 friends with 85%+ taste match are going to Cityfox Halloween" → tap through to tickets (affiliate revenue, §9). The taste graph makes this rec categorically better than Bandsintown's "artists you follow."

---

## 8. Data sourcing

- **Events/lineups:** Songkick + Bandsintown APIs for concerts; festival schedules ingested manually at first (one intern-day per festival, and only the launch festivals matter early).
- **Artists:** MusicBrainz canonical IDs + Spotify API for images/genres.
- **Venues:** Google Places seeded, community-maintained (capacity tier, sound system notes).
- **User-generated events:** essential for undergrounds/warehouse shows — create with artist + location + date, fuzzy-matched against existing events, mod-queue merge for duplicates. Underground scenes are exactly the communities that keep obsessive mental rankings; serving them early buys evangelists.

---

## 9. Monetization (later, but load-bearing for the pitch)

1. **Ticketing affiliate** — recs → ticket purchases via affiliate links (Ticketmaster, DICE, RA). Aligned with user value; DICE especially courts taste-driven discovery partners.
2. **Encore Pro** (~$4/mo): deep personal stats (genre drift over time, venue heatmaps, artist history timelines), ladder exports, early recap access. Letterboxd's Pro model, proven for logging apps.
3. **Promoter/artist analytics** — aggregated, anonymized: "your Brooklyn show ranked in attendees' top-quartile at 2.3× the rate of your Boston show." Ranking data is a _quality_ signal ticket sales can't provide. Long-term, this is the moat-monetizing product.
4. **Festival partnerships** — official recap card skins, branded ranking experiences, embedded "rank the weekend" activations. Festivals pay for engagement tooling already.

---

## 10. Architecture

_(Superseded in detail by [ARCHITECTURE.md](./ARCHITECTURE.md) for the MVP.)_

- **Client:** React Native (iOS-first in practice; the demo can be a mobile-web PWA). Offline-first local store (WatermelonDB/SQLite) with sync — festival conditions demand it.
- **Backend:** Postgres + a thin API (Supabase or Rails/Node — boring on purpose). Ranking math is trivial compute; the hard problems are entity resolution and feed fan-out, both standard.
- **Ranking service:** Bradley–Terry scores updated on each comparison; comparisons stored as an append-only log (enables recomputation, audit comparisons, and future model upgrades without data loss).
- **Entity resolution:** fuzzy matching (artist aliases, venue name variants) + human mod queue. This is the unsexy 30% of engineering effort that determines whether the catalog feels clean or like a wiki dump.
- **Media:** photos to object storage, EXIF-date matching for camera-roll suggestions on-device (privacy-preserving — never upload the roll).

---

## 11. MVP scope (hackathon / 48-hour cut)

Build exactly four screens and fake the rest:

1. **Log a show** — search a pre-seeded event list (hardcode ~200 real NYC shows from the past year), tap to log.
2. **Pairwise ranking flow** — the binary-search comparison UI with the slot-in animation. _This is the demo's beating heart; spend half the build time making these taps feel great._
3. **Ladder view** — the ranked list with tiers and genre/year filters.
4. **Compare with a friend** — two seeded accounts, taste match %, head-to-head disagreements.

Stretch (only if the four are polished): the festival recap card generator — even a static, beautifully designed shareable image sells the vision instantly.

**Demo script (3 min):** "Everyone here has argued about the best show they've seen. Watch." → log last weekend's show live → 4 taps → it slots in at #6 with the animation → open Compare with a judge-relatable seeded account → "we're 87% matched, but we violently disagree about this one set" → flash the EDC recap card → "every festival weekend, 100,000 people post recaps with no structure. We're the structure." Close on the ticketing-affiliate + promoter-analytics slide.

Skip entirely for the hackathon: auth beyond a name picker, real event APIs (seed a JSON file), photos, offline sync, moderation.

---

## 12. Metrics that matter

- **Shows logged per user per month** (target ≥2 for core demo) — the single health metric; everything else is downstream.
- % of logs completing ≥3 pairwise comparisons (flow completion).
- Crew-tag invite → activation rate (the growth loop's conversion).
- Recap card share rate per festival cohort.
- D30 retention of festival-acquired cohorts vs. organic (validates the launch strategy).

---

## 13. Risks & honest counterarguments

- **Logging frequency floor:** casual concert-goers (3 shows/year) won't sustain a ladder. Mitigation: build for the heavy user (EDM/scene people, 2–6 events/month) and let casuals lurk on friends' ladders — Letterboxd's exact shape.
- **Setlist.fm / Beli itself:** Setlist.fm owns the archival community but has no ranking or social; Beli could expand into "experiences." Speed to owning the festival wedge is the defense — category association is winner-take-most.
- **Ranking fatigue:** if comparisons ever feel like homework, retention dies. The 20-second fast path and the "too different" escape hatch are load-bearing; instrument flow abandonment from day one.
- **Ephemerality objection:** "you can't re-verify a show, so rankings are just vibes." Correct — and that's the point. The product is a memory ledger, not a review site; positioning must never drift toward "objective ratings" or it inherits Yelp's credibility problems.
