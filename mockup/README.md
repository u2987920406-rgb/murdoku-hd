# Clu&doku — screen mockup

A clickable UI/UX mockup that splits today's single dense screen into four
screens with one job each. It is a design artefact: it runs on the real cases
(`../cases.json`), the real portraits and victim photos, and the real board
renderer (`../floorplan.js`), but it has no game logic beyond navigation and a
few visual-only interactions on the board. The shipped game (`../index.html`,
`../app.js`, `../styles.css`, `../cases.json`) is untouched.

Open http://127.0.0.1:8131/mockup/ (any static server at the repo root).
Mobile-first: designed at 412×915 and 360×740.

## Screens

| Route | Screen | Its one job |
|---|---|---|
| `#/accueil` | Accueil | Pick a case: a "Reprendre" card for the case in progress, then the 12 cases grouped by difficulty with size and status (À découvrir / En cours / Résolue). The only screen that scrolls. |
| `#/dossier/N` | Dossier | Read the case file before playing: victim, one-line brief, **the rules of this case** (they may differ from one case to the next; a rule that departs from the usual set is flagged "Inhabituel"), the guest line-up when the screen is tall enough. One pinned primary button: Commencer / Reprendre l'enquête. |
| `#/jeu/N` | Jeu | Play: the board, one clue at a time (‹ › pager with progress dots), and the actions (Vérifier, Indice, ⋯ → Voir la solution, Effacer la grille, Règles de l'affaire). Tapping a cell opens a "Qui se trouvait ici ?" sheet instead of a permanent roster. |
| `#/resultat/N` | Résultat | Close the case: culprit portrait and verdict, a few stats, then Affaire suivante or Revoir la grille. |

`N` is the case number (1–12); without it the screen shows the case in progress (n°3).

## Navigation graph

```
              ┌──────────── ⌂ (header, every screen) ────────────┐
              ▼                                                   │
          Accueil ── case row ──▶ Dossier ── Commencer ──▶ Jeu ── Vérifier ──▶ Résultat
             │  ◀──────── ‹ ───────  │  ◀──────── ‹ ──────  │  ◀───── ‹ / Revoir la grille ──┘
             │                       ▲                      │                │
             └── Reprendre card ─────┼──────────────────────┘                │
                                     └──── ⋯ → Règles de l'affaire           │
                                     ◀───────────── Affaire suivante ────────┘ (Dossier N+1)
```

- Back arrows follow the graph, not the browser history, so a deep link never
  traps the player: Résultat ‹ Jeu ‹ Dossier ‹ Accueil.
- Every screen but Accueil has a ⌂ button in its header.
- In the mockup, Vérifier always leads to Résultat (no validation).

## Mockup data

- Progress: cases 1–2 solved, case 3 in progress with three guests placed.
- Rules: the shipped game uses the same set for every case (1 per row, 1 per
  column, 1 alone in the crime room). Two cases carry invented variants to show
  that the Dossier pattern holds when the numbers change:
  - n°3: 1 invité par rangée · **2 invités maximum par colonne** · 1 seul invité dans la pièce du crime
  - n°9: 1 invité par rangée · 1 invité par colonne · **3 invités maximum par pièce** · 1 seul invité dans la pièce du crime
- Résultat stats (essais, indices, temps) are placeholders.

## Files

- `index.html`, `mockup.css`, `mockup.js` — the mockup (hash router, four renderers).
- `check.mjs` — headless Chrome check: page scroll per screen at both sizes,
  pinned button inside the viewport, the game's design laws via
  `../tools/audit-lib.js` (no overflow, no clipped text, targets ≥ 44 px,
  text ≥ 16 px, contrast ≥ 4.5:1, no image distortion), the navigation graph
  with real clicks, no running animation under `prefers-reduced-motion`, and
  screenshots into `shots/`. Run `node mockup/check.mjs http://127.0.0.1:8131`.
