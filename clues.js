// Clue parser and placement solver, shared by the client (window.Clues),
// generate.mjs and verify-free.mjs. Free placement: a guest may stand on any
// free cell; a placement is a position per suspect, row * size + col.
// A winning placement fills every row and every column once, leaves the body's
// cell empty, puts exactly one guest in the victim's room and makes every clue true.
// North is the top of the plan (row 0), east its right edge (last column).
(function (root) {
  function findName(names, test) {
    // Longest first, so a name that prefixes another one cannot steal the match.
    const order = names.map((name, i) => i).sort((a, b) => names[b].length - names[a].length);
    const hit = order.find((i) => test(names[i], i));
    return hit === undefined ? -1 : hit;
  }

  function headCount(puzzle, text, room, expected) {
    const n = puzzle.size;
    const count = (pos) => pos.reduce((seen, p) => seen + (p >= 0 && puzzle.cells[Math.floor(p / n)][p % n] === room ? 1 : 0), 0);
    return { text, kind: 'count', room, expected, who: puzzle.suspects.map((_, i) => i), test: (pos) => count(pos) === expected };
  }

  const EDGE = /^(.+) se trouvait sur la (rangée|colonne) la plus (au nord|au sud|à l'est|à l'ouest)\.$/;

  // Returns { text, kind, who, test(pos) }: `who` lists the suspects the clue
  // reads, `test` decides a placement where all of them stand somewhere.
  // Single-suspect clues also carry `cell(p)`, used to shrink that suspect's domain.
  function parseClue(text, puzzle) {
    const n = puzzle.size;
    const names = puzzle.suspects.map((s) => s.name);
    const roomIndex = puzzle.rooms.findIndex((room) => text.includes(room.loc));
    const roomAt = (p) => puzzle.cells[Math.floor(p / n)][p % n];
    const rowOf = (p) => Math.floor(p / n);
    const colOf = (p) => p % n;
    const unary = (s, cell) => ({ text, kind: 'unary', who: [s], cell, test: (pos) => cell(pos[s]) });
    const binary = (a, b, holds) => ({ text, kind: 'pair', who: [a, b], test: (pos) => holds(pos[a], pos[b]) });

    if (text.startsWith('Il y avait exactement') || text.startsWith('Personne n')) {
      const match = text.match(/exactement (\d+)/);
      if (roomIndex < 0) throw new Error(`no room in: ${text}`);
      return headCount(puzzle, text, roomIndex, match ? Number(match[1]) : 0);
    }

    const edge = text.match(EDGE);
    if (edge) {
      const s = names.indexOf(edge[1]);
      if (s < 0) throw new Error(`no suspect in: ${text}`);
      if (edge[2] === 'rangée' && edge[3] === 'au nord') return unary(s, (p) => rowOf(p) === 0);
      if (edge[2] === 'rangée' && edge[3] === 'au sud') return unary(s, (p) => rowOf(p) === n - 1);
      if (edge[2] === 'colonne' && edge[3] === "à l'ouest") return unary(s, (p) => colOf(p) === 0);
      if (edge[2] === 'colonne' && edge[3] === "à l'est") return unary(s, (p) => colOf(p) === n - 1);
      throw new Error(`unknown edge in: ${text}`);
    }

    const first = findName(names, (name) => text.startsWith(`${name} `));
    if (first < 0) throw new Error(`no suspect in: ${text}`);

    const pair = text.startsWith(`${names[first]} et `)
      ? findName(names, (name) => text.startsWith(`${names[first]} et ${name} `))
      : -1;

    if (pair >= 0) {
      const same = text.includes('étaient dans la même pièce');
      return binary(first, pair, (a, b) => (roomAt(a) === roomAt(b)) === same);
    }

    const other = findName(names, (name, i) => i !== first && text.endsWith(`${name}.`));
    const needOther = () => { if (other < 0) throw new Error(`no second suspect in: ${text}`); };

    if (text.includes('à côté')) {
      needOther();
      const near = !text.includes("n'était pas");
      return binary(first, other, (a, b) => (a !== b && Math.abs(rowOf(a) - rowOf(b)) <= 1 && Math.abs(colOf(a) - colOf(b)) <= 1) === near);
    }

    if (text.includes("à l'est") || text.includes("à l'ouest")) {
      needOther();
      const east = text.includes("à l'est");
      return binary(first, other, (a, b) => (colOf(a) > colOf(b)) === east);
    }

    if (text.includes('au nord') || text.includes('au sud')) {
      needOther();
      const north = text.includes('au nord');
      return binary(first, other, (a, b) => (rowOf(a) < rowOf(b)) === north);
    }

    if (roomIndex < 0) throw new Error(`no room in: ${text}`);
    if (text.includes("n'était pas")) return unary(first, (p) => roomAt(p) !== roomIndex);
    return unary(first, (p) => roomAt(p) === roomIndex);
  }

  // The house rule, written as one more clue: one guest alone with the body.
  function victimRule(puzzle) {
    return headCount(puzzle, `Une seule personne se trouvait ${puzzle.victim.loc}.`, puzzle.victim.room, 1);
  }

  function parseCase(puzzle) {
    return puzzle.clues.map((text) => parseClue(text, puzzle));
  }

  // Every winning placement, as arrays of positions (up to `limit`).
  // Backtracking with pruning: each suspect starts from the cells its own clues
  // allow; rows, columns and per-room head-counts are tracked incrementally
  // (bitmasks and counters); the next suspect is the one with the fewest legal
  // cells left, so a dead end is caught as soon as any domain empties; a
  // head-count fails early when the guests still able to reach the room cannot
  // make up the number. `rules` (optional) replaces the case's parsed clues.
  function solve(puzzle, { limit = Infinity, rules: given } = {}) {
    const n = puzzle.size;
    const cellsCount = n * n;
    const rules = [...(given || parseCase(puzzle)), victimRule(puzzle)];
    const body = puzzle.victim.cell[0] * n + puzzle.victim.cell[1];
    const roomOf = new Int8Array(cellsCount);
    for (let p = 0; p < cellsCount; p++) roomOf[p] = puzzle.cells[Math.floor(p / n)][p % n];

    // Static domains from single-suspect clues.
    const domain = Array.from({ length: n }, () => {
      const cells = [];
      for (let p = 0; p < cellsCount; p++) if (p !== body) cells.push(p);
      return cells;
    });
    rules.filter((rule) => rule.kind === 'unary').forEach((rule) => {
      const s = rule.who[0];
      domain[s] = domain[s].filter(rule.cell);
    });
    const pairsOf = Array.from({ length: n }, () => []);
    rules.filter((rule) => rule.kind === 'pair').forEach((rule) => {
      const [a, b] = rule.who;
      pairsOf[a].push({ rule, other: b });
      pairsOf[b].push({ rule, other: a });
    });
    const counts = rules.filter((rule) => rule.kind === 'count');
    const roomTotal = new Array(puzzle.rooms.length).fill(0);
    // Cap per room: the tightest head-count clue that names it.
    const cap = new Array(puzzle.rooms.length).fill(Infinity);
    counts.forEach((rule) => { cap[rule.room] = Math.min(cap[rule.room], rule.expected); });

    const pos = new Array(n).fill(-1);
    let rowMask = 0;
    let colMask = 0;
    const out = [];
    const legal = new Array(n);

    function legalCells(s) {
      const list = [];
      for (const p of domain[s]) {
        if ((rowMask >> Math.floor(p / n)) & 1 || (colMask >> (p % n)) & 1) continue;
        if (roomTotal[roomOf[p]] >= cap[roomOf[p]]) continue;
        pos[s] = p;
        let ok = true;
        for (const { rule, other } of pairsOf[s]) {
          if (pos[other] >= 0 && !rule.test(pos)) { ok = false; break; }
        }
        pos[s] = -1;
        if (ok) list.push(p);
      }
      return list;
    }

    (function walk(placed) {
      if (out.length >= limit) return;
      if (placed === n) {
        if (rules.every((rule) => rule.test(pos))) out.push(pos.slice());
        return;
      }
      let best = -1;
      let reach = new Array(puzzle.rooms.length).fill(0);
      for (let s = 0; s < n; s++) {
        if (pos[s] >= 0) continue;
        legal[s] = legalCells(s);
        if (!legal[s].length) return;
        if (best < 0 || legal[s].length < legal[best].length) best = s;
        let seen = 0;
        for (const p of legal[s]) seen |= 1 << roomOf[p];
        for (let room = 0; room < reach.length; room++) if ((seen >> room) & 1) reach[room]++;
      }
      for (const rule of counts) if (roomTotal[rule.room] + reach[rule.room] < rule.expected) return;
      reach = null;
      const s = best;
      for (const p of legal[s]) {
        const row = Math.floor(p / n);
        const col = p % n;
        pos[s] = p;
        rowMask |= 1 << row;
        colMask |= 1 << col;
        roomTotal[roomOf[p]]++;
        walk(placed + 1);
        roomTotal[roomOf[p]]--;
        rowMask &= ~(1 << row);
        colMask &= ~(1 << col);
        pos[s] = -1;
        if (out.length >= limit) return;
      }
    })(0);
    return out;
  }

  // Plain reference enumeration (suspects in index order, each clue tested once
  // all its suspects stand), kept deliberately naive to cross-check `solve`.
  function solveReference(puzzle) {
    const n = puzzle.size;
    const rules = [...parseCase(puzzle), victimRule(puzzle)];
    const due = Array.from({ length: n }, () => []);
    rules.forEach((rule) => due[Math.max(...rule.who)].push(rule));
    const body = puzzle.victim.cell[0] * n + puzzle.victim.cell[1];
    const pos = new Array(n).fill(-1);
    const rowUsed = new Array(n).fill(false);
    const colUsed = new Array(n).fill(false);
    const out = [];
    (function walk(s) {
      if (s === n) { out.push(pos.slice()); return; }
      for (let row = 0; row < n; row++) {
        if (rowUsed[row]) continue;
        for (let col = 0; col < n; col++) {
          const p = row * n + col;
          if (colUsed[col] || p === body) continue;
          pos[s] = p;
          if (due[s].every((rule) => rule.test(pos))) {
            rowUsed[row] = colUsed[col] = true;
            walk(s + 1);
            rowUsed[row] = colUsed[col] = false;
          }
          pos[s] = -1;
        }
      }
    })(0);
    return out;
  }

  const api = { parseClue, parseCase, victimRule, solve, solveReference };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Clues = api;
})(typeof window !== 'undefined' ? window : globalThis);
