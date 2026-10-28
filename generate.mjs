// Case generator for Clu&Do under free placement: any guest may stand on any
// free cell, one per row and one per column. A case ships only when exactly
// one placement satisfies every clue and the one-guest-with-the-body rule, so
// the culprit is unique by construction.
//
// Every clue is written in French, then read back through clues.js (the parser
// the client and verify-free.mjs use), so the generator cannot rely on a meaning
// the text does not carry.
//
// Clue search (counterexample-driven):
//   1. enumerate up to SAMPLE placements that satisfy the clues chosen so far;
//   2. if the truth is the only one left, stop; otherwise add the true clue that
//      rules out the most of those rival placements;
//   3. finally drop every clue the others make redundant (exhaustive re-check).
//
// Usage: node generate.mjs            writes cases.json
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseClue, solve } = require('./clues.js');

const SAMPLE = 400;

// ---------------------------------------------------------------- RNG helpers
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(list, rng) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const pick = (list, rng) => list[Math.floor(rng() * list.length)];

// French elision: "de Étienne" is wrong, "d'Étienne" is right.
const VOWELS = /^[aeiouyàâäéèêëîïôöûüh]/i;
const deName = (name) => (VOWELS.test(name) ? `d’${name}` : `de ${name}`);

// --------------------------------------------------------------------- pools
const ROOM_POOL = [
  { name: 'Cuisine', loc: 'dans la Cuisine' },
  { name: 'Salon', loc: 'dans le Salon' },
  { name: 'Bibliothèque', loc: 'dans la Bibliothèque' },
  { name: 'Bureau', loc: 'dans le Bureau' },
  { name: 'Véranda', loc: 'dans la Véranda' },
  { name: 'Chambre', loc: 'dans la Chambre' },
  { name: 'Cave', loc: 'dans la Cave' },
  { name: 'Atelier', loc: "dans l'Atelier" },
  { name: 'Hall', loc: 'dans le Hall' },
  { name: 'Grenier', loc: 'dans le Grenier' },
  { name: 'Salle à manger', loc: 'dans la Salle à manger' },
  { name: 'Serre', loc: 'dans la Serre' },
];

// Every name has a portrait in assets/portraits.
const SUSPECT_POOL = [
  { name: 'Camille', gender: 'f' }, { name: 'Bastien', gender: 'm' },
  { name: 'Nadia', gender: 'f' }, { name: 'Étienne', gender: 'm' },
  { name: 'Lucie', gender: 'f' }, { name: 'Marc', gender: 'm' },
  { name: 'Sofia', gender: 'f' }, { name: 'Julien', gender: 'm' },
  { name: 'Hélène', gender: 'f' }, { name: 'Karim', gender: 'm' },
  { name: 'Anaïs', gender: 'f' }, { name: 'Théo', gender: 'm' },
  { name: 'Inès', gender: 'f' }, { name: 'Roxane', gender: 'f' },
  { name: 'Victor', gender: 'm' }, { name: 'Maud', gender: 'f' },
];

// Every victim has a file photo in assets/victims.
const VICTIM_POOL = [
  'Monsieur Delaunay', 'Madame Rousseau', 'le notaire Vasseur',
  'Monsieur Aubert', 'l’antiquaire Molina', 'Madame Le Goff',
];

// ------------------------------------------------------------ floorplan growth
function buildRooms(rng, n, roomCount) {
  for (let attempt = 0; attempt < 800; attempt++) {
    const cells = Array.from({ length: n }, () => new Array(n).fill(-1));
    const seeds = [];
    while (seeds.length < roomCount) {
      const r = Math.floor(rng() * n);
      const c = Math.floor(rng() * n);
      if (!seeds.some((s) => s.r === r && s.c === c)) seeds.push({ r, c });
    }
    seeds.forEach((s, i) => { cells[s.r][s.c] = i; });
    let remaining = n * n - roomCount;
    let guard = 0;
    while (remaining > 0 && guard++ < 4000) {
      let progressed = false;
      for (const room of shuffled([...Array(roomCount).keys()], rng)) {
        const frontier = [];
        for (let r = 0; r < n; r++) {
          for (let c = 0; c < n; c++) {
            if (cells[r][c] !== room) continue;
            for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
              const nr = r + dr, nc = c + dc;
              if (nr >= 0 && nr < n && nc >= 0 && nc < n && cells[nr][nc] === -1) frontier.push({ r: nr, c: nc });
            }
          }
        }
        if (!frontier.length) continue;
        const target = pick(frontier, rng);
        cells[target.r][target.c] = room;
        remaining--;
        progressed = true;
      }
      if (!progressed) break;
    }
    if (remaining > 0) continue;
    const sizes = new Array(roomCount).fill(0);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) sizes[cells[r][c]]++;
    const maxSize = Math.ceil(n * n * 0.36);
    if (sizes.some((s) => s < 3 || s > maxSize)) continue;
    // Rooms must be connected blobs, not scattered dots.
    if (!sizes.every((_, room) => isConnected(cells, room, n))) continue;
    return cells;
  }
  throw new Error('room layout generation failed');
}

function isConnected(cells, room, n) {
  const own = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (cells[r][c] === room) own.push([r, c]);
  if (!own.length) return false;
  const seen = new Set([own[0].join(',')]);
  const stack = [own[0]];
  while (stack.length) {
    const [r, c] = stack.pop();
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= n || nc < 0 || nc >= n || cells[nr][nc] !== room) continue;
      const key = `${nr},${nc}`;
      if (seen.has(key)) continue;
      seen.add(key);
      stack.push([nr, nc]);
    }
  }
  return seen.size === own.length;
}

// ------------------------------------------------------------------ clue texts
// Every statement that is true of the hidden placement, in French.
function candidateTexts({ n, cells, rooms, suspects, truth, victimRoom }) {
  const texts = [];
  const name = (s) => suspects[s].name;
  const row = (s) => Math.floor(truth[s] / n);
  const col = (s) => truth[s] % n;
  const room = (s) => cells[row(s)][col(s)];

  for (let s = 0; s < n; s++) {
    for (let r = 0; r < rooms.length; r++) {
      if (room(s) === r) {
        if (r !== victimRoom) texts.push(`${name(s)} se trouvait ${rooms[r].loc}.`); // else it names the culprit
      } else {
        texts.push(`${name(s)} n'était pas ${rooms[r].loc}.`);
      }
    }
    if (row(s) === 0) texts.push(`${name(s)} se trouvait sur la rangée la plus au nord.`);
    if (row(s) === n - 1) texts.push(`${name(s)} se trouvait sur la rangée la plus au sud.`);
    if (col(s) === 0) texts.push(`${name(s)} se trouvait sur la colonne la plus à l'ouest.`);
    if (col(s) === n - 1) texts.push(`${name(s)} se trouvait sur la colonne la plus à l'est.`);
  }

  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      if (a === b) continue;
      if (a < b && room(a) !== victimRoom) {
        texts.push(room(a) === room(b)
          ? `${name(a)} et ${name(b)} étaient dans la même pièce.`
          : `${name(a)} et ${name(b)} n'étaient pas dans la même pièce.`);
      }
      if (a < b) {
        const near = Math.abs(row(a) - row(b)) <= 1 && Math.abs(col(a) - col(b)) <= 1;
        texts.push(near
          ? `${name(a)} se trouvait juste à côté ${deName(name(b))}.`
          : `${name(a)} n'était pas juste à côté ${deName(name(b))}.`);
      }
      // Each ordered pair once, phrased from whichever side is true.
      if (col(a) > col(b)) texts.push(`${name(a)} était à l'est ${deName(name(b))}.`);
      if (col(a) < col(b) && a < b) texts.push(`${name(a)} était à l'ouest ${deName(name(b))}.`);
      if (row(a) < row(b)) texts.push(`${name(a)} était au nord ${deName(name(b))}.`);
      if (row(a) > row(b) && a < b) texts.push(`${name(a)} était au sud ${deName(name(b))}.`);
    }
  }

  // Head-counts (the victim's room is excluded: the house rule already says one).
  const counts = new Array(rooms.length).fill(0);
  for (let s = 0; s < n; s++) counts[room(s)]++;
  for (let r = 0; r < rooms.length; r++) {
    if (r === victimRoom) continue;
    const k = counts[r];
    texts.push(k === 0
      ? `Personne n'était ${rooms[r].loc}.`
      : `Il y avait exactement ${k} personne${k > 1 ? 's' : ''} ${rooms[r].loc}.`);
  }
  return [...new Set(texts)];
}

// Share of random legal placements a clue keeps: lower means more telling.
function keepRate(rule, n, body, rng, samples = 1500) {
  let kept = 0;
  for (let i = 0; i < samples; i++) {
    const rows = shuffled([...Array(n).keys()], rng);
    const cols = shuffled([...Array(n).keys()], rng);
    const pos = rows.map((r, s) => r * n + cols[s]);
    if (pos.includes(body)) { i--; continue; }
    if (rule.test(pos)) kept++;
  }
  return kept / samples;
}

// ---------------------------------------------------------------- case build
function buildCase({ seed, n, roomCount, difficulty }) {
  const rng = mulberry32(seed);
  const cells = buildRooms(rng, n, roomCount);
  const rooms = shuffled(ROOM_POOL, rng).slice(0, roomCount);
  const suspects = shuffled(SUSPECT_POOL, rng).slice(0, n)
    .map(({ name, gender }) => ({ name, gender, initial: name[0].toUpperCase() }));

  // Hidden placement: a random permutation of cells, dealt to the guests.
  const cols = shuffled([...Array(n).keys()], rng);
  const order = shuffled([...Array(n).keys()], rng);
  const truth = new Array(n);
  order.forEach((s, row) => { truth[s] = row * n + cols[row]; });
  const roomAt = (p) => cells[Math.floor(p / n)][p % n];

  // The victim's room must hold exactly one guest; the body takes a free cell of it.
  const perRoom = new Array(roomCount).fill(0);
  truth.forEach((p) => perRoom[roomAt(p)]++);
  const lonely = perRoom.map((k, r) => (k === 1 ? r : -1)).filter((r) => r >= 0);
  if (!lonely.length) return null;
  const victimRoom = pick(lonely, rng);
  const free = [];
  for (let p = 0; p < n * n; p++) if (roomAt(p) === victimRoom && !truth.includes(p)) free.push(p);
  if (!free.length) return null;
  const body = pick(free, rng);
  const victimName = pick(VICTIM_POOL, rng);
  const victim = {
    name: victimName, label: rooms[victimRoom].name, loc: rooms[victimRoom].loc,
    cell: [Math.floor(body / n), body % n], room: victimRoom,
  };
  const puzzle = { size: n, rooms, cells, suspects, victim, clues: [] };
  const truthKey = truth.join(',');

  const candidates = candidateTexts({ n, cells, rooms, suspects, truth, victimRoom })
    .map((text) => parseClue(text, puzzle));
  if (candidates.some((rule) => !rule.test(truth))) throw new Error(`seed ${seed}: a candidate clue misreads the truth`);

  // 1–2. Counterexample-driven growth.
  let open = shuffled(candidates, rng);
  const chosen = [];
  for (let guard = 0; guard < 80; guard++) {
    const sols = solve(puzzle, { rules: chosen, limit: SAMPLE });
    const rivals = sols.filter((p) => p.join(',') !== truthKey);
    if (!rivals.length) break;
    let best = null;
    let bestKill = 0;
    for (const rule of open) {
      let kill = 0;
      for (const rival of rivals) if (!rule.test(rival)) kill++;
      if (kill > bestKill) { best = rule; bestKill = kill; }
    }
    if (!best) return null;
    chosen.push(best);
    open = open.filter((rule) => rule !== best);
  }
  const unique = (rules) => {
    const sols = solve(puzzle, { rules, limit: 2 });
    return sols.length === 1 && sols[0].join(',') === truthKey;
  };
  if (!unique(chosen)) return null;

  // 3. Drop redundant clues, each removal re-checked exhaustively.
  let selected = chosen.slice();
  for (const rule of shuffled(chosen, rng)) {
    const rest = selected.filter((r) => r !== rule);
    if (unique(rest)) selected = rest;
  }

  // Most telling clues first.
  const ordered = selected
    .map((rule) => ({ rule, keep: keepRate(rule, n, body, rng) }))
    .sort((a, b) => a.keep - b.keep)
    .map((entry) => entry.rule.text);

  const killer = truth.findIndex((p) => roomAt(p) === victimRoom);
  return {
    id: `${difficulty.toLowerCase()}-${seed}`,
    size: n,
    difficulty,
    rooms,
    cells,
    suspects,
    victim,
    solution: truth.map((p) => [Math.floor(p / n), p % n]), // per suspect: [row, col]
    killer: { index: killer, name: suspects[killer].name, gender: suspects[killer].gender },
    clues: ordered,
    story: `Le corps de ${victimName} a été retrouvé ${victim.loc}. ${n} invités se trouvaient dans la maison cette nuit-là, ` +
      'jamais deux sur la même rangée ni sur la même colonne. Une seule personne se trouvait dans la pièce du crime.',
    validPlacements: 1,
    possibleKillers: [suspects[killer].name],
  };
}

// --------------------------------------------------------------------- main
const PLAN = [
  { n: 6, roomCount: 6, difficulty: 'Facile', count: 4 },
  { n: 7, roomCount: 6, difficulty: 'Moyen', count: 4 },
  { n: 8, roomCount: 7, difficulty: 'Difficile', count: 4 },
];

const started = performance.now();
const cases = [];
const victimsUsed = new Map();
for (const plan of PLAN) {
  for (let i = 0; i < plan.count; i++) {
    let built = null;
    let tried = 0;
    const t0 = performance.now();
    for (let attempt = 0; attempt < 400 && !built; attempt++) {
      tried++;
      const candidate = buildCase({ seed: plan.n * 1000 + i * 97 + attempt, n: plan.n, roomCount: plan.roomCount, difficulty: plan.difficulty });
      // Spread the six victims: at most two cases each.
      if (candidate && (victimsUsed.get(candidate.victim.name) || 0) < 2) built = candidate;
    }
    if (!built) throw new Error(`no case for ${plan.difficulty} #${i}`);
    victimsUsed.set(built.victim.name, (victimsUsed.get(built.victim.name) || 0) + 1);
    built.number = cases.length + 1;
    cases.push(built);
    console.log(`  #${built.number} ${built.difficulty.padEnd(9)} ${built.size}×${built.size} clues=${String(built.clues.length).padStart(2)} ` +
      `killer=${built.killer.name.padEnd(8)} victim=${built.victim.name} (${tried} essai(s), ${Math.round(performance.now() - t0)} ms)`);
  }
}

writeFileSync(new URL('./cases.json', import.meta.url), JSON.stringify({ cases }, null, 1));
console.log(`generated ${cases.length} cases in ${(performance.now() - started) / 1000} s`);
