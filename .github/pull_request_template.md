## What

<!-- One or two sentences: what does this PR do? -->

## Why

<!-- The user-visible or structural reason. Link the demo beat / design section if relevant. -->

## Screenshots

<!-- REQUIRED for UI PRs: 390px-wide screenshots or a short clip. Delete this section for non-UI PRs. -->

## Contract checklist

- [ ] I did **not** import from another feature folder (only `@/engine`, `@/lib`, `@/components`).
- [ ] Cross-workstream contract touched? (engine API / `src/lib/persist.ts` / `insert_ranked_log` RPC / `database.types.ts` / route table) → consumers updated **in this PR** and noted below.
- [ ] Schema changed? → `npm run gen:types` output committed.

<!-- If a contract was touched, say which one and who reviewed it: -->
