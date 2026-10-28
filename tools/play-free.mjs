// Free-placement play-through with real mouse clicks (Chrome DevTools Protocol,
// Input.dispatchMouseEvent at each element's centre), desktop and phone.
//   1. a winning grid must win: one that is NOT the stored `solution` when the
//      case has several (a different culprit when one exists), else the only one;
//   2. the same grid with two guests swapped so that a clue breaks must lose,
//      and every guest left on a winning cell must keep its ✓;
//   3. a losing grid whose cells are each possible alone gets all ✓ and the
//      "not all together" verdict;
//   4. Indice places one guest, Solution shows a grid that Vérifier accepts.
// Usage: node tools/play-free.mjs [baseUrl] [caseNumber...]   (default cases 1 and 9)
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { launch, sleep } from './cdp.mjs';

const require = createRequire(import.meta.url);
const { solve, parseCase, victimRule } = require('../clues.js');
const { cases } = JSON.parse(readFileSync(new URL('../cases.json', import.meta.url), 'utf8'));

const args = process.argv.slice(2);
const base = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8130';
const numbers = args.filter((a) => /^\d+$/.test(a)).map(Number);
const picks = numbers.length ? numbers : [1, 9];
const VIEWPORTS = [{ tag: '1440×980', width: 1440, height: 980, mobile: false }, { tag: '393×852', width: 393, height: 852, mobile: true }];

let failures = 0;
const fail = (text) => { failures++; console.log(`  FAIL ${text}`); };

// ------------------------------------------------------------------ CDP
const browser = await launch();
const { send, evaluate } = browser;
async function click(selector) {
  if (!(await browser.click(selector))) fail(`${selector} is covered at its centre`);
}

// ------------------------------------------------------------------ grids
const key = (grid) => grid.join(',');

function pickGrids(puzzle) {
  const n = puzzle.size;
  const grids = solve(puzzle);
  const stored = key(puzzle.solution.map(([row, col]) => row * n + col));
  const killerOf = (grid) => grid.findIndex((p) => puzzle.cells[Math.floor(p / n)][p % n] === puzzle.victim.room);
  // Prefer a grid other than the stored one, with a different culprit.
  const win = grids.filter((grid) => key(grid) !== stored)
    .sort((a, b) => (killerOf(b) !== puzzle.killer.index) - (killerOf(a) !== puzzle.killer.index))[0] || grids[0];
  const rules = [...parseCase(puzzle), victimRule(puzzle)];
  const valid = new Set(grids.map(key));
  let lose = null;
  for (let a = 0; a < n && !lose; a++) {
    for (let b = a + 1; b < n && !lose; b++) {
      const swapped = win.slice();
      [swapped[a], swapped[b]] = [swapped[b], swapped[a]];
      if (!valid.has(key(swapped))) lose = { grid: swapped, a, b, broken: rules.filter((r) => !r.test(swapped)).map((r) => r.text) };
    }
  }
  // Cells a guest may hold in at least one winning grid (the ✓ rule).
  const possible = (s, p) => grids.some((grid) => grid[s] === p);
  // A losing grid where every guest still stands on a possible cell, if a
  // swap of two guests from any winning grid produces one.
  let together = null;
  for (const grid of grids) {
    for (let a = 0; a < n && !together; a++) {
      for (let b = a + 1; b < n && !together; b++) {
        const swapped = grid.slice();
        [swapped[a], swapped[b]] = [swapped[b], swapped[a]];
        if (!valid.has(key(swapped)) && swapped.every((p, s) => possible(s, p))) together = swapped;
      }
    }
    if (together) break;
  }
  return { grids, stored, win, lose, together, killerOf, possible };
}

// ------------------------------------------------------------------ play
async function placeAll(puzzle, grid) {
  const n = puzzle.size;
  for (let s = 0; s < n; s++) {
    const row = Math.floor(grid[s] / n);
    const col = grid[s] % n;
    await click(`#palette .suspect:nth-child(${s + 1})`);
    await click(`.cell[data-row="${row}"][data-col="${col}"]`);
  }
  const board = await evaluate(`[...document.querySelectorAll('.cell')].filter((c) => c.querySelector('.token')).length`);
  if (board !== n) fail(`${board} tokens on the board after placing ${n}`);
  return board;
}

async function readOutcome() {
  return evaluate(`(() => {
    const banner = document.getElementById('win-banner');
    const marks = [...document.querySelectorAll('.cell')].filter((c) => c.querySelector('.mark')).map((c) => ({
      row: +c.dataset.row, col: +c.dataset.col, ok: c.querySelector('.mark').classList.contains('ok'),
    }));
    return {
      won: !banner.hidden && banner.classList.contains('visible'),
      title: document.getElementById('win-title').textContent,
      verdict: document.getElementById('verdict').textContent,
      tally: document.getElementById('board-status').hidden ? '' : document.getElementById('board-status').textContent,
      marks,
      roster: [...document.querySelectorAll('#palette .suspect')].map((b) => b.textContent.trim()),
    };
  })()`);
}

async function loadCase(index) {
  await evaluate(`(() => { const s = document.getElementById('case-select'); s.value = '${index}'; s.dispatchEvent(new Event('change')); })()`);
  await sleep(80);
}

for (const view of VIEWPORTS) {
  await send('Emulation.setDeviceMetricsOverride', { width: view.width, height: view.height, deviceScaleFactor: 1, mobile: view.mobile });
  await send('Page.enable');
  await send('Page.navigate', { url: `${base}/index.html` });
  for (let i = 0; i < 50 && !(await evaluate(`Boolean(document.querySelector('.cell'))`).catch(() => false)); i++) await sleep(100);

  for (const number of picks) {
    const index = number - 1;
    const puzzle = cases[index];
    const n = puzzle.size;
    const { grids, stored, win, lose, together, killerOf, possible } = pickGrids(puzzle);
    const show = (grid) => grid.map((p, s) => `${puzzle.suspects[s].name}(${Math.floor(p / n) + 1},${(p % n) + 1})`).join(' ');
    console.log(`\n[${view.tag}] Affaire n°${number} — ${grids.length} grilles valides · solution stockée ${puzzle.solution.map(([r, c]) => `(${r + 1},${c + 1})`).join('')} → ${puzzle.killer.name}`);

    // 1. A winning grid (non-stored when there is a choice).
    await loadCase(index);
    await placeAll(puzzle, win);
    await click('#btn-check');
    await sleep(150);
    let out = await readOutcome();
    const expected = puzzle.suspects[killerOf(win)].name;
    console.log(`  grille gagnante ${key(win) === stored ? '(la seule : solution stockée)' : 'non stockée'} : ${show(win)}`);
    console.log(`    coupable attendu ${expected} (stocké : ${puzzle.killer.name})`);
    console.log(`    → bannière ${out.won ? 'VISIBLE' : 'absente'} · titre « ${out.title} » · verdict « ${out.verdict} »`);
    if (!out.won || !out.title.startsWith(expected)) fail(`winning grid did not win as ${expected}`);
    if (out.roster.some((text) => /rangée/i.test(text))) fail(`roster still mentions a row: ${out.roster.join(' | ')}`);
    if (view.mobile === false) console.log(`    liste des invités : ${out.roster.join(' | ')}`);
    await click('#win-close');

    // 2. Two guests swapped.
    await loadCase(index);
    await placeAll(puzzle, lose.grid);
    await click('#btn-check');
    await sleep(150);
    out = await readOutcome();
    const names = `${puzzle.suspects[lose.a].name} ↔ ${puzzle.suspects[lose.b].name}`;
    console.log(`  même grille, ${names} échangés : témoignages violés ${lose.broken.map((t) => `« ${t} »`).join(', ')}`);
    console.log(`    → bannière ${out.won ? 'VISIBLE' : 'absente'} · bilan « ${out.tally} » · verdict « ${out.verdict} »`);
    if (out.won) fail('swapped grid won');
    // Marks must follow the per-cell rule, independently of the other guests.
    let wrongMark = 0;
    for (let s = 0; s < n; s++) {
      const p = lose.grid[s];
      const mark = out.marks.find((m) => m.row === Math.floor(p / n) && m.col === p % n);
      if (!mark || mark.ok !== possible(s, p)) wrongMark++;
      if (s !== lose.a && s !== lose.b && (!mark || !mark.ok)) fail(`${puzzle.suspects[s].name} kept a winning cell but is not ✓`);
    }
    if (wrongMark) fail(`${wrongMark} mark(s) disagree with the per-cell rule`);
    console.log(`    marques : ${out.marks.filter((m) => m.ok).length} ✓ / ${out.marks.filter((m) => !m.ok).length} ✗ · invités non échangés tous ✓ : ${wrongMark === 0 ? 'oui' : 'NON'}`);

    // 3. Every cell possible on its own, the grid as a whole contradicting a clue.
    if (together) {
      await loadCase(index);
      await placeAll(puzzle, together);
      await click('#btn-check');
      await sleep(150);
      out = await readOutcome();
      console.log(`  toutes cases possibles mais grille fausse : ${show(together)}`);
      console.log(`    → bannière ${out.won ? 'VISIBLE' : 'absente'} · bilan « ${out.tally} » · verdict « ${out.verdict} »`);
      if (out.won || out.marks.some((m) => !m.ok) || !out.verdict.includes('pas tous ensemble')) fail('all-possible losing grid');
    } else {
      console.log('  (aucun échange de deux invités ne donne une grille fausse à cases toutes possibles)');
    }

    // 4. Indice from an empty board, then Solution, then Vérifier.
    await loadCase(index);
    await click('#btn-hint');
    out = await readOutcome();
    const hinted = await evaluate(`[...document.querySelectorAll('.cell')].filter((c) => c.querySelector('.token')).length`);
    console.log(`  Indice : ${hinted} pion posé · « ${out.verdict} »`);
    if (hinted !== 1) fail(`hint placed ${hinted} tokens`);
    if (view.mobile) await click('#btn-more');
    await click('#btn-reveal');
    const revealed = await evaluate(`document.getElementById('verdict').textContent`);
    await click('#btn-check');
    await sleep(150);
    out = await readOutcome();
    console.log(`  Solution : « ${revealed} » → Vérifier : bannière ${out.won ? 'VISIBLE' : 'absente'} (« ${out.title} »)`);
    if (!out.won) fail('revealed grid does not win');
    await click('#win-close');
  }
}

await browser.close();
console.log(failures ? `\nRESULT FAIL (${failures})` : '\nRESULT PASS');
process.exit(failures ? 1 : 0);
