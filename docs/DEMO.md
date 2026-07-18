# Encore — 3-minute demo runbook

Presenter plays "Andrew", the seeded demo user (15-show ladder). The demo date is pinned to
**2026-07-18**; the live-logged show is **Fred again.. @ Forest Hills Stadium (Jul 11 2026)** —
"last weekend's show". Everything below runs on seeded data; the only live write is the Fred log.

---

## Pre-demo checklist (run T-minus 15 minutes, on good network)

1. **Reset the demo state:**
   ```sh
   npm run demo:reset
   ```
   (Deletes any previously logged Fred + its comparisons, restores the canonical 15-row ladder
   from `demo_ladder_fixture`. Idempotent — safe to run twice.)
2. **Open the deployed URL on the demo phone with `?as=demo`** — e.g.
   `https://<your-deploy>.vercel.app/?as=demo` — which signs in as `demo@encore.app` (password
   in `src/lib/auth.ts`; see README). **Do not** use a plain anonymous session: it mints a fresh
   uid with an empty ladder.
3. **Verify the start state:** ladder shows exactly **15 shows**, Rüfüs Du Sol @ MSG at #1,
   Helena Hauff @ Basement at #15. Compare → Maya reads **87%**.
4. **Pre-warm:** the app pre-warms ladder, friends, shared-shows, and event queries on boot —
   just let it sit on the Ladder screen for ~5 seconds after load. Then visit Compare → Maya
   once and go back (guarantees her ladder + head-to-head are cached).
5. **Do NOT hard-refresh after this point.** The Query cache is your wifi-death insurance.
6. Phone: do-not-disturb on, brightness up, browser chrome minimized (PWA standalone if
   installed).
7. Optional dry run: log Fred, confirm the 4 taps and #6 landing, then `npm run demo:reset` and
   reload **while still on good network**, and redo steps 3–5.

---

## The script (3:00)

### Beat 1 — Cold open on the ladder (0:00–0:20)

Ladder screen, seeded 15 shows with tier bars.

> "Everyone here has argued about the best show they've ever seen. This is mine — every show of
> my life, ranked. No star ratings, ever. You can't re-listen to a concert, so the only honest
> question is: _was it better than the last one?_"

### Beat 2 — Log last weekend's show (0:20–0:50)

Tap the center **Log** FAB → type **"fred"** → tap **Fred again.. at Forest Hills Stadium ·
Jul 11**.

> "Saturday I was at Forest Hills. Watch how fast this is."

### Beat 3 — The four taps + slot-in (0:50–1:30) — _the money shot_

The pairwise cards appear. Narrate each as a gut call and tap:

| Tap | Card shown                      | Tap this   | Say something like                                      |
| --- | ------------------------------- | ---------- | ------------------------------------------------------- |
| 1   | Fontaines D.C. @ Brooklyn Steel | **Fred**   | "Better than Fontaines? Easily."                        |
| 2   | Bicep @ Knockdown Center        | **Bicep**  | "Better than Bicep's AV show? …no, that was religious." |
| 3   | Jamie xx @ Forest Hills         | **Fred**   | "Better than Jamie xx at the same venue? Yeah."         |
| 4   | Lane 8 @ Brooklyn Mirage        | **Lane 8** | "Lane 8 at Mirage still wins."                          |

**Pause and let the slot-in animation land Fred at #6.** Don't talk over it.

> "Four taps. Binary search — even a 300-show ladder is nine taps, max. And it lands _exactly_
> where it belongs: number six, tier: Great."

### Beat 4 — Lenses & tiers (1:30–1:50)

Back on the ladder: flip the genre lens to **house/techno**, then the year lens to **2026**.

> "One ladder, many views — my top club sets, my best of 2026. Tiers, because #47 vs #52 is
> noise but 'All-timer' means something."

### Beat 5 — Compare with Maya (1:50–2:40)

Compare tab → **Maya**. The ring counts up to **87%**.

> "This is the whole social engine. Maya and I are 87% matched across thirteen shared shows —
> including the one I just logged."

Scroll the head-to-head to **Four Tet @ Under the K Bridge**:

> "But we violently disagree about one set. Four Tet under the K Bridge — my #3 all-time. Maya
> has it at #21. Her note says she _'left before the encore.'_ This screen is engineered to be
> screenshotted into the group chat."

### Beat 6 — Recap card + close (2:40–3:00)

Flash `/recap` (Andrew's year: 16 shows, top-3 podium, "Fred again.. debuted at #6", 87% with
@mayaraves). Close on the ladder.

> "Every festival weekend, a hundred thousand people post recaps with no structure. We're the
> structure. Ticketing affiliate on the recommendations, promoter analytics on the ranking data."

---

## Wifi-death fallback

The demo is engineered to survive a dead network **after boot**:

- The entire comparison flow is client-side — the four taps need zero network.
- Finalize is **optimistic-first**: the ladder updates and the slot-in animation plays from the
  Query cache; the `insert_ranked_log` RPC retries in the background and flushes on next boot.
- Compare/Maya works from the pre-warmed cache (checklist step 4).

Rules of engagement when the wifi dies mid-demo:

1. **Keep going. Do not refresh.** Every remaining beat (slot-in, lenses, Compare, recap) runs
   off cache.
2. If the app was never loaded on the venue network: switch to phone hotspot, load once, then
   demo — boot is the only network-critical moment.
3. If Compare shows a spinner (cache miss): pivot the narration — "and when Maya opens her app,
   she sees we're 87% matched" — show the ladder lenses longer instead, and flash the recap card,
   which renders from cached ladder data.
4. Nuclear option: `npm run dev` on the laptop against the same Supabase project, phone-sized
   responsive window, same `?as=demo` login. Rehearse this once.

## Post-demo

Run `npm run demo:reset` before the next run-through. If judges want to try it themselves, hand
them the plain URL (no `?as=demo`) — they get an anonymous session, the name picker, the 5-best
backfill, and auto-follow Maya + Dex so Compare is never empty.
