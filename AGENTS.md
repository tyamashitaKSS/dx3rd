# AGENTS.md

## Project overview

This repository contains a Japanese-language combat board and FS judgment manager for
Double Cross The 3rd Edition. The user-facing application manages engagements, PC/enemy
tokens, initiative, damage, status effects, drawing objects, FS progress and events,
CCFOLIA roll-table authoring, import/export, undo/redo, and shared rooms.

Keep user-facing copy in Japanese. Preserve existing behavior unless the request explicitly
changes it, especially empty names, object limits, room links, and imported legacy state.

## Canonical application files

- `public/board/index.html`: deployed application markup.
- `public/board/styles.css`: deployed application styling and board layer ordering.
- `public/board/app.js`: board state, rendering, interaction, history, and local persistence.
- `public/board/sync.js`: Supabase Realtime, room participation, polling, and save queue.
- `public/board/sync-merge.js`: field-level patches and concurrent-state merging.
- `public/board/fs/index.html`: deployed FS manager and roll-table builder markup.
- `public/board/fs/styles.css`: FS manager, responsive, and compact-window styling.
- `public/board/fs/app.js`: FS interactions, history, local roll-table library, and fallback persistence.
- `public/board/fs/fs-core.js`: FS normalization/merge logic and roll-table parsing/validation.
- `public/board/fs/sync.js`: FS Supabase synchronization and combat-board PC roster linking.
- `supabase/dx3rd_rooms.sql`: database table, RPC functions, grants, and access checks.
- `tests/rendered-html.test.mjs`: static application contract tests.
- `tests/sync-merge.test.mjs`: concurrent editing and patch tests.
- `tests/fs-core.test.mjs`: FS progression, merge, and roll-table tests.
- `docs/MANUAL.md` and `docs/IMAGE_GUIDE.md`: user manuals.

GitHub Pages deploys only `public/board/`. Treat that directory as the source of truth for
the public application.

The root-level `index.html`, `styles.css`, `app.js`, and `sync.js` are older copies and are
not deployed by GitHub Pages. Do not edit them for ordinary board changes. The root-level
`sync-merge.js` is imported by `tests/sync-merge.test.mjs`; when merge behavior changes,
keep it synchronized with `public/board/sync-merge.js` or update the test import deliberately.

## Other runtime surface

- `app/page.tsx` redirects the vinext/Next entry point to `/board/`.
- `app/api/board/route.ts` is the D1-backed single-board fallback used outside GitHub Pages.
- `app/api/fs/route.ts` is the independent D1-backed FS-state fallback outside GitHub Pages.
- `.openai/hosting.json`, `vite.config.ts`, and `worker/index.ts` support the vinext/Cloudflare
  runtime. They are separate from the GitHub Pages + Supabase shared-room deployment.

Do not mix the D1 fallback protocol with the Supabase room protocol without an explicit
migration plan.

## State and rendering rules

- Board state is normalized in `normalizeState()` before imported or remote data is used.
- Add new persisted fields to initial state, normalization, rendering, import/export, and
  synchronization tests together.
- Preserve compatibility with the legacy local-storage keys already read by `loadState()`.
- Stable object IDs are required for concurrent patch merging. Never identify objects by
  array position or display name.
- FS participants, events, and history also require stable IDs. FS progress is derived from
  history entries so simultaneous additions are not lost.
- CCFOLIA roll tables are versioned LocalStorage data and must never be added to shared FS state.
- PC and enemy limits are both 20 unless the product requirement changes.
- The board uses fixed pixel coordinates. Account for object bounds when moving or resizing
  so viewport or page scaling does not shift stored positions.
- Rendering is centralized through `render()`. Avoid direct DOM state that cannot be rebuilt
  from the serialized board state.

## Board layers

Maintain the visual and interaction order defined in `styles.css`:

1. Grid
2. Terrain
3. Engagements
4. Drawn shapes
5. Tokens
6. Resize handles

Terrain must remain behind engagements and tokens. Resize handles belong in `resizeLayer`
so selected background objects remain operable even when objects overlap.

Use pointer events for board dragging so mouse and touch interactions share the same path.
Every state-changing drag must call `beginHistoryTransaction()` before mutation and
`commitHistoryTransaction()` on completion.

## Undo, redo, and shared state

- Local actions must remain undoable through the buttons and `Ctrl+Z`/`Ctrl+Y`.
- Do not clear history merely because a Supabase snapshot arrives.
- Rebase remote changes into history snapshots so undoing a local action does not remove
  another participant's concurrent change.
- Remote snapshots must not interrupt an active drag or an editor input session.
- Add tests for simultaneous edits whenever changing state shape, patch generation, deletion,
  or conflict resolution.

## Supabase rules

The GitHub Pages build enables Supabase synchronization with
`window.DX3RD_USE_PEER_SYNC`. Room identity is stored in the URL hash and room secrets are
hashed by the database RPC layer.

- A frontend publishable key may be public; never add a secret key or `service_role` key.
- Keep direct table access revoked and RLS enabled. Browser access should go through the
  explicitly granted RPC functions.
- Preserve room credential validation, board-size limits, revision handling, and
  field-level patch application in `supabase/dx3rd_rooms.sql`.
- Database functions using `security definer` must set a restricted `search_path`, validate
  credentials internally, and have default `PUBLIC` execution revoked before narrow grants.
- Verify current Supabase documentation and changelog before changing client APIs, Realtime,
  RLS, grants, or database functions.
- Test schema/RPC changes against Supabase; a local JavaScript test alone is not sufficient.

## Cache busting

GitHub Pages serves static assets aggressively. When changing a deployed asset:

- Update its query-string version in `public/board/index.html`.
- Update the matching assertion in `tests/rendered-html.test.mjs`.
- If `sync-merge.js` changes, update its version in `public/board/sync.js`.
- Use one new version value per release instead of reusing an existing cached value.

## Commands and verification

Requires Node.js `>=22.13.0`.

```bash
npm install
npm run dev
npm run test
npm run lint
```

`npm run test` performs a production build and then runs both test files. Before finishing:

1. Run `npm run test`.
2. Run `npm run lint` and report any remaining warnings.
3. Run `git diff --check`.
4. For interaction or layout changes, exercise the feature in a real browser at desktop size.
5. Check browser console errors and verify undo/redo for the changed interaction.
6. Update the manuals when user-visible operation changes.

## Deployment

Pushing `main` runs `.github/workflows/pages.yml`, which uploads `public/board/` to GitHub
Pages. The public URL is:

`https://tyamashitakss.github.io/dx3rd/`

After deployment, confirm the workflow succeeded and verify that the public HTML references
the new asset version. Do not assume a successful push means browser caches are refreshed.

## Repository hygiene

- Keep changes scoped to the requested behavior.
- Do not commit credentials, local environment files, build output, or temporary exports.
- Do not stage or remove the local untracked `dx3rd-combat-board.tar.gz` unless explicitly
  requested.
- Do not rewrite or discard unrelated working-tree changes.
