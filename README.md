# Clu&Do

Illustrated deduction puzzle (published as Clu&Do), grown from the Murdoku base
app in `~/projets/murdoku`: vector character portraits, an illustrated
floorplan, a victim file photo and a motion layer. Twelve cases (4 × 6 guests,
4 × 7, 4 × 8), each with exactly one winning grid under free placement. No build
step, no dependencies, no external fonts or images. Installable as a web app
and playable offline after the first visit.

## Run

```
cd ~/projets/murdoku-hd && python3 -m http.server 8130
```

Open http://127.0.0.1:8130/ (`fetch('cases.json')` needs http, not `file://`).
The service worker only registers over https or on `localhost`, so use
http://localhost:8130/ to try the installable/offline mode locally.

## Cases: generate and verify

```
node generate.mjs      # writes cases.json (≈ 2 s for the 12 cases)
node verify-free.mjs   # the authority: must print 12/12 … sous placement libre
node verify-free.mjs --brute   # adds a naive n!×n! count for cases up to 7×7
```

- `generate.mjs` builds a floorplan, a hidden placement and the victim's cell,
  writes every true statement in French, reads each back through `clues.js`,
  then adds clues counterexample-first: it enumerates up to 400 placements that
  fit the clues so far and adds the true clue that rules out the most of them,
  until the hidden placement is the only one left; redundant clues are then
  dropped, each removal re-checked exhaustively.
- `verify-free.mjs` re-reads the clue text and enumerates every placement:
  exactly one must survive, equal to the stored `solution`, with the stored
  culprit. The pruned solver (`solve`) and a plain reference enumeration
  (`solveReference`) must return the same set. It also keeps `validPlacements`
  and `possibleKillers` in `cases.json` honest (`--write` refreshes them).
- `verify.mjs` (the base app's row-lock checker) was deleted: that rule is gone,
  and a checker that passes for it would prove nothing about this game.

## Installable web app

- `manifest.webmanifest` — name, standalone display, portrait, paper colours,
  icons in `assets/icons/` (192, 512, maskable 512, 180 `apple-touch-icon`).
- `tools/make-icons.mjs` renders those PNGs from `assets/ui/emblem.svg` with
  headless Chrome (offline, no data URL). Rerun only if the emblem changes.
- `sw.js` — cache-first: on install it caches the app shell, `cases.json`, the
  icons and all portraits and victim photos (a missing file is skipped and left
  to the network); unknown same-origin files are fetched and cached on first use.
  **When shipping any change, bump `VERSION` in `sw.js`**: installed copies
  only pick up new files when the worker itself changes.
- `tools/offline-check.mjs` — proof: loads the game on localhost, waits for the
  cache, kills the server and switches Chrome offline, reloads, then places a
  guest with a real click.

## Phone layout (under 860 px)

The play screen fits one viewport: no page scroll at 360x640, 360x740, 393x852,
412x780 and 412x915. An 8×8 board needs about 360 px to keep 44 px cells, so
on a 360 px phone it may use the side padding (`--board-min` in `styles.css`).
Known limit at 360×640 (not in the audits): the peek overlaps the action bar,
by ~23 px on 6×6/7×7 (already the case before the 8×8 cases) and by ~67 px on
8×8, where the sheet must be swiped down to reach `Vérifier`. Header, square board, chip rail and action bar are fixed
rows; clues and the dossier move into a bottom sheet with three snaps (closed,
peek, full). The peek height is computed from the real content (`syncPeekHeight`)
so the first clue and its "1 / N" hint are always whole, never cut by the sheet
edge. `prefers-reduced-motion` disables the snap and win animations.

## Layout

- `index.html`, `styles.css`, `app.js` — the client (game logic ported from the
  base app).
- `floorplan.js` — builds the board SVG per case: floor material per room type
  tinted with the legend colour, wall ambient shadow, doors, furniture placed
  against walls, chalk outline on the victim cell.
- `assets/portraits/*.svg` — one bust per suspect (16), `assets/victims/*.svg`
  — sepia file photos (6), `assets/ui/emblem.svg` — brand seal.
- `tools/make-portraits.mjs` — the parametric source of every portrait. The
  SVGs are committed; rerun it only to change a character.
- `tools/audit.html` + `tools/audit.js` + `tools/audit.mjs` — measured layout,
  contrast, target-size and gameplay-flow audit at 360, 412 and 1440 px.
- `tools/audit-mobile.html` + `tools/audit-mobile.js` — phone-shell audit at
  360×740, 393×852 and 412×915 (no page scroll, sheet snaps, tally visibility).
  Both share `tools/audit-lib.js`.
- `tools/audit-tags.html` + `tools/audit-tags.js` — room-name plaques in all 12
  cases at 360×740, 393×852, 412×915 and 1440×980, re-rendered in each fallback
  face and in monospace: text inside the plaque, plaque inside its own room's
  cells and clear of walls and the victim cell, labels painted last, squeeze
  ≤ 15 %. `tools/probe-occlusion.html` (informational) measures how much of
  each label a placed portrait hides on a solved grid.
- `tools/scene.html` — drives the page into a state (`?case=8&scene=checked`,
  `solved` or `select`; phone extras `&sheet=full|closed`, `&tab=dossier`,
  `&more=1`) for screenshots.
- `cases.json` — written by `generate.mjs`; `solution` is `[row, col]` per
  suspect, `validPlacements` (1) and `possibleKillers` (one name) are checked by
  `verify-free.mjs`.
- `clues.js` — French clue parser and grid solver, shared by the client,
  `generate.mjs` and `verify-free.mjs`.
- `generate.mjs`, `verify-free.mjs` — see "Cases" above.
- `manifest.webmanifest`, `sw.js`, `assets/icons/` — see "Installable web app".
- `tools/cdp.mjs` — tiny Chrome DevTools Protocol driver (Node's WebSocket)
  shared by the three scripts below.
- `tools/play-free.mjs` — real-click play-through in headless Chrome (desktop and
  phone): the winning grid wins, a two-guest swap loses, Indice and Solution work.

## Phone layout (≤ 860 px)

The page becomes one screen with no page scroll: compact header (brand mark +
case selector), square board, a horizontal chip rail, and an action bar
(`Vérifier`, `Indice`, `⋯` → `Solution`, `Effacer`, `Suivante`). Clues and the
dossier live in a bottom sheet with three snaps (closed = header only, peek,
full); tap the header or the chevron to cycle, drag the header to move it. The
validation tally sits in the sheet header, so it is visible in every snap.
`app.js` moves the existing dossier, clue, rules, legend, footer and tally
nodes into the sheet and back when the media query flips, so the desktop
markup and layout are unchanged.

## Rules encoded

1. Any guest may stand on any free cell (never on the body's cell).
2. No two guests share a row or a column: placing a guest bounces whoever
   shares the row or the column.
3. The victim's room holds exactly one guest: that guest is the killer.
4. A grid wins when every clue holds together with rule 3. It is judged by the
   clues alone (`clues.js`), never against the stored `solution`.
5. `Vérifier` marks a guest ✓ when at least one winning grid puts them on
   their cell, ✗ otherwise, so a mark never depends on the other guests (with
   one winning grid per case, ✓ means "on the right cell").
6. North is the top of the plan, east its right edge. Clue families: in / not
   in a room, same / different room, (not) right next to (any of the 8
   neighbouring cells), east / west, north / south, on the northernmost /
   southernmost row or westernmost / easternmost column, exact head-count of a
   room, "personne n'était…".

Every case has exactly one winning grid (`node verify-free.mjs`); the rules
panel and the footer read `validPlacements` and would say so if one did not.

## Audit

```
node tools/audit.mjs                             # 360 / 412 / 1440 px
node tools/audit.mjs --mobile                    # phone shell, three sizes
node tools/audit.mjs --mobile --reduced-motion   # every animation must be off
node tools/audit.mjs --tags [--verbose]          # room-name plaques, per label
```

Pass the base URL first if the server is not on port 8130, e.g.
`node tools/audit.mjs http://127.0.0.1:8131 --mobile`.

All exit non-zero on any failure, as do `node tools/play-free.mjs <url>` and
`node tools/offline-check.mjs`.
