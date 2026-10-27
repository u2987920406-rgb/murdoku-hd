# Clu&Do

Illustrated client for the Murdoku deduction puzzle (published as Clu&Do): same twelve cases and rules
as `~/projets/murdoku`, with vector character portraits, an illustrated
floorplan, a victim file photo and a motion layer. No build step, no
dependencies, no external fonts or images.

## Run

```
cd ~/projets/murdoku-hd && python3 -m http.server 8130
```

Open http://127.0.0.1:8130/ (`fetch('cases.json')` needs http, not `file://`).

## Phone layout (under 860 px)

The play screen fits one viewport: no page scroll at 360x640, 360x740, 393x852,
412x780 and 412x915. Header, square board, chip rail and action bar are fixed
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
- `cases.json`, `verify.mjs` — copied verbatim from the base project.

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

1. Suspect *i* sits in row *i* (this is how `generate.mjs` and `verify.mjs`
   define every case); the player picks each suspect's column.
2. No two guests share a row or a column.
3. The victim's room holds exactly one guest: that guest is the killer.

## Audit

```
node tools/audit.mjs                             # 360 / 412 / 1440 px
node tools/audit.mjs --mobile                    # phone shell, three sizes
node tools/audit.mjs --mobile --reduced-motion   # every animation must be off
node tools/audit.mjs --tags [--verbose]          # room-name plaques, per label
```

Pass the base URL first if the server is not on port 8130, e.g.
`node tools/audit.mjs http://127.0.0.1:8131 --mobile`.

Both exit non-zero on any failure.
