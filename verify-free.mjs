// The authority on case validity. Re-reads the French clue text of every case
// (clues.js) and enumerates, exhaustively, every placement under free placement
// (any guest on any free cell, one per row, one per column, never on the body)
// that makes all clues true with exactly one guest in the victim's room.
// A case passes when exactly one placement survives, it is the stored
// `solution`, its lone guest in the victim's room is the stored culprit, and
// `validPlacements` / `possibleKillers` in cases.json agree.
//
// Two enumerations must agree: the pruned solver the client runs (`solve`) and
// a plain reference one (`solveReference`). `--brute` adds a third, naive one
// (every row permutation × every column permutation) for cases up to 7×7.
//
// Usage: node verify-free.mjs [--write] [--brute]
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { solve, solveReference, parseCase, victimRule } = require('./clues.js');

const file = new URL('./cases.json', import.meta.url);
const data = JSON.parse(readFileSync(file, 'utf8'));
const write = process.argv.includes('--write');
const brute = process.argv.includes('--brute');

function permutations(n) {
  const out = [];
  const a = [...Array(n).keys()];
  (function walk(k) {
    if (k === n) { out.push(a.slice()); return; }
    for (let i = k; i < n; i++) {
      [a[k], a[i]] = [a[i], a[k]];
      walk(k + 1);
      [a[k], a[i]] = [a[i], a[k]];
    }
  })(0);
  return out;
}

function bruteCount(puzzle) {
  const n = puzzle.size;
  const rules = [...parseCase(puzzle), victimRule(puzzle)];
  const body = puzzle.victim.cell[0] * n + puzzle.victim.cell[1];
  const perms = permutations(n);
  let count = 0;
  for (const rows of perms) {
    for (const cols of perms) {
      const pos = rows.map((r, s) => r * n + cols[s]);
      if (!pos.includes(body) && rules.every((rule) => rule.test(pos))) count++;
    }
  }
  return count;
}

const key = (grids) => grids.map((g) => g.join(',')).sort().join('|');
let failures = 0;
let stale = 0;
let fastTotal = 0;
const started = performance.now();

for (const puzzle of data.cases) {
  const n = puzzle.size;
  let t = performance.now();
  const grids = solve(puzzle);
  const fastMs = performance.now() - t;
  fastTotal += fastMs;
  t = performance.now();
  const reference = solveReference(puzzle);
  const refMs = performance.now() - t;
  const agree = key(grids) === key(reference);

  let bruteText = '';
  let bruteOk = true;
  if (brute && n <= 7) {
    t = performance.now();
    const count = bruteCount(puzzle);
    bruteOk = count === grids.length;
    bruteText = `  brute=${count} (${((performance.now() - t) / 1000).toFixed(1)} s)`;
  }

  const stored = puzzle.solution.map(([row, col]) => row * n + col).join(',');
  const killers = [...new Set(grids.map((grid) => grid.findIndex((p) => puzzle.cells[Math.floor(p / n)][p % n] === puzzle.victim.room)))];
  const possibleKillers = killers.sort((a, b) => a - b).map((k) => puzzle.suspects[k].name);
  const killer = killers.length === 1 ? puzzle.suspects[killers[0]].name : '?';

  const ok = grids.length === 1 && grids[0].join(',') === stored && killer === puzzle.killer.name && agree && bruteOk;
  if (!ok) failures++;
  if (puzzle.validPlacements !== grids.length || JSON.stringify(puzzle.possibleKillers) !== JSON.stringify(possibleKillers)) stale++;
  puzzle.validPlacements = grids.length;
  puzzle.possibleKillers = possibleKillers;

  console.log(`#${String(puzzle.number).padStart(2)} ${puzzle.difficulty.padEnd(9)} ${n}×${n} ${String(puzzle.clues.length).padStart(2)} indices  ` +
    `validPlacements = ${grids.length}  coupable=${killer.padEnd(8)}  ` +
    `élagué ${fastMs.toFixed(1)} ms · référence ${refMs.toFixed(0)} ms ${agree ? '(identiques)' : '(DIVERGENTS)'}${bruteText}  ${ok ? 'OK' : 'FAIL'}`);
}

const unique = data.cases.filter((c) => c.validPlacements === 1).length;
console.log(`\nÉnumération exhaustive (solveur élagué) : ${fastTotal.toFixed(0)} ms pour ${data.cases.length} affaires · total avec contre-vérifications ${((performance.now() - started) / 1000).toFixed(1)} s.`);
console.log(failures === 0
  ? `${unique}/${data.cases.length} affaires à solution unique sous placement libre`
  : `${failures} affaire(s) en échec — ${unique}/${data.cases.length} à solution unique sous placement libre`);

if (stale) {
  if (write) {
    writeFileSync(file, JSON.stringify(data, null, 1));
    console.log(`cases.json mis à jour (${stale} affaire(s)).`);
  } else {
    console.log(`${stale} affaire(s) avec validPlacements/possibleKillers périmés : relancer avec --write.`);
    failures++;
  }
}
process.exit(failures === 0 ? 0 : 1);
