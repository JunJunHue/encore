# Feature modules — route & entry-point contract

The shell (`src/App.tsx`) owns routing. Each feature exports **one lazy-loaded entry
component** as the **default export** at the exact path below. Do not add routes yourself —
propose route changes via a PR that touches `App.tsx` (shared platform, needs cross-review).

| Route                 | Entry module (default export)                  | Owner | Notes                                                                                                                                                 |
| --------------------- | ---------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/welcome`            | `src/features/onboarding/OnboardingScreen.tsx` | W3    | Name picker + 5-best backfill. Guard: profile exists AND ladder non-empty → skip to `/`; always offer "Skip for now". Rendered outside the tab shell. |
| `/log`                | `src/features/log/LogScreen.tsx`               | W3    | Event search (`useEventSearch`, `.ilike` on title). Tap result → navigate `/rank/:eventId`.                                                           |
| `/rank/:eventId`      | `src/features/rank/RankFlowScreen.tsx`         | W3    | Pairwise comparisons + slot-in animation. Rendered outside the tab shell (fullscreen). Persist via `@/lib/persist`.                                   |
| `/`                   | `src/features/ladder/LadderScreen.tsx`         | W4    | Tiered ladder, lenses, enrichment sheet (opens on row tap).                                                                                           |
| `/compare/:friendId?` | `src/features/compare/CompareScreen.tsx`       | W4    | No `friendId` → friends list; with `friendId` → taste match + head-to-head.                                                                           |
| `/recap`              | `src/features/recap/RecapScreen.tsx`           | W4    | Recap card (stretch). Reachable by URL; no tab.                                                                                                       |

## Shell facts your screens can rely on

- Screens render inside the `AuthGate`: a Supabase session **always** exists and
  `useSession()` (from `@/lib/hooks`) returns `{ session, userId }`.
- If no profile row exists, the shell redirects everything to `/welcome`.
- Tab-shell routes (`/`, `/log`, `/compare`, `/recap`) get a bottom tab bar; the shell adds
  `pb-24` clearance for it. `/welcome` and `/rank/:eventId` are fullscreen.
- Wrap your content in `<Screen>` from `@/components` for the safe-area frame + header.

## The isolation rule (collab.md)

**Feature code NEVER imports from another feature folder.** Allowed imports:

- `@/engine` — pure ranking/taste-match engine (W1)
- `@/lib` — supabase client, auth, hooks, persist adapter, query client, motion springs
- `@/components` — shared UI primitives (barrel: `@/components`)
- npm packages

If two features need the same code, it moves down into `@/lib` or `@/components` via a
shared-platform PR — it does not get imported across feature folders.
