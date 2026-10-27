// Independent verifier: re-parses the French clue text of every case and counts
// the solutions by exhaustive enumeration. It does not reuse the generator's
// predicates, so it can catch a clue that is ambiguous in plain language.
import { readFileSync } from 'node:fs';

const { cases } = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8'));

function permutations(n) {
  const out = [];
  const used = new Array(n).fill(false);
  const current = new Array(n).fill(0);
  (function walk(row) {
    if (row === n) { out.push(current.slice()); return; }
    for (let col = 0; col < n; col++) {
      if (used[col]) continue;
      used[col] = true;
      current[row] = col;
      walk(row + 1);
      used[col] = false;
    }
  })(0);
  return out;
}

function parseClue(text, puzzle) {
  const names = puzzle.suspects.map((s) => s.name);
  const roomIndex = puzzle.rooms.findIndex((room) => text.includes(room.loc));
  const roomOf = (perm, s) => puzzle.cells[s][perm[s]];

  if (text.startsWith('Il y avait exactement') || text.startsWith('Personne n')) {
    const match = text.match(/exactement (\d+)/);
    const expected = match ? Number(match[1]) : 0;
    if (roomIndex < 0) throw new Error(`no room in: ${text}`);
    return (perm) => {
      let seen = 0;
      for (let s = 0; s < names.length; s++) if (roomOf(perm, s) === roomIndex) seen++;
      return seen === expected;
    };
  }

  const first = names.findIndex((name) => text.startsWith(`${name} `));
  if (first < 0) throw new Error(`no suspect in: ${text}`);

  const pair = text.startsWith(`${names[first]} et `)
    ? names.findIndex((name) => text.startsWith(`${names[first]} et ${name} `))
    : -1;

  if (pair >= 0) {
    const same = text.includes('étaient dans la même pièce');
    return (perm) => (roomOf(perm, first) === roomOf(perm, pair)) === same;
  }

  const otherName = names.findIndex((name, i) => i !== first && text.endsWith(`${name}.`));

  if (text.includes('à côté')) {
    const other = otherName;
    if (other < 0) throw new Error(`no second suspect in: ${text}`);
    const near = !text.includes("n'était pas");
    return (perm) => {
      const adjacent = Math.abs(first - other) === 1 && Math.abs(perm[first] - perm[other]) <= 1;
      return adjacent === near;
    };
  }

  if (text.includes("à l'est") || text.includes("à l'ouest")) {
    const other = otherName;
    if (other < 0) throw new Error(`no second suspect in: ${text}`);
    const east = text.includes("à l'est");
    return (perm) => (perm[first] > perm[other]) === east;
  }

  if (roomIndex < 0) throw new Error(`no room in: ${text}`);
  if (text.includes("n'était pas")) {
    return (perm) => roomOf(perm, first) !== roomIndex;
  }
  return (perm) => roomOf(perm, first) === roomIndex;
}

let failures = 0;
for (const puzzle of cases) {
  const tests = puzzle.clues.map((text) => parseClue(text, puzzle));
  const victimRoom = puzzle.victim.room;
  const candidates = permutations(puzzle.size).filter((perm) => {
    let inVictimRoom = 0;
    for (let s = 0; s < puzzle.size; s++) if (puzzle.cells[s][perm[s]] === victimRoom) inVictimRoom++;
    if (inVictimRoom !== 1) return false;
    return tests.every((test) => test(perm));
  });

  const matchesStored = candidates.length === 1 && candidates[0].join(',') === puzzle.solution.join(',');
  const killer = candidates.length === 1
    ? puzzle.suspects.findIndex((_, s) => puzzle.cells[s][candidates[0][s]] === victimRoom)
    : -1;
  const ok = matchesStored && killer === puzzle.killer.index;
  if (!ok) failures++;
  console.log(`#${puzzle.number} ${puzzle.difficulty.padEnd(9)} solutions=${candidates.length} ` +
    `killer=${killer >= 0 ? puzzle.suspects[killer].name : '?'} stocké=${puzzle.killer.name} ${ok ? 'OK' : 'FAIL'}`);
}

console.log(failures === 0
  ? `\n${cases.length}/${cases.length} affaires à solution unique (ré-analyse du texte des indices).`
  : `\n${failures} affaire(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
