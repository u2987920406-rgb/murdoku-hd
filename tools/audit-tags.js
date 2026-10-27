// Room-name plaque audit. For every .room-tag of every case, at phone and
// desktop sizes, checks the four ways a name can look truncated:
//   1. glyphs wider/taller than the plaque (drawn box and natural width)
//   2. walls / seams / doors / furniture painted over the letters, or a wall
//      running under the plaque (the plaque straddles two rooms)
//   3. plaque outside the board, outside its own room's cells, or over another plaque
//   4. letters squeezed by textLength (natural vs pinned width, > 15 % = defect)
// Output goes to #audit-out for `chrome --dump-dom` (see audit.mjs --tags).
const SIZES = [[360, 740], [393, 852], [412, 915], [1440, 980]];
const MAX_SQUEEZE = 0.15;
// Each case is re-rendered with the page's own stack, then with each fallback
// face alone (what a phone without Georgia resolves), then monospace as a
// hostile font. Squeeze is measured in the face the plaque was rendered with.
const FACES = [null, "'DejaVu Serif'", "'Liberation Serif'", 'serif', 'monospace'];
const DEFAULT_STACK = "Georgia, 'Noto Serif', 'DejaVu Serif', 'Liberation Serif', serif";
const out = [];
let failures = 0;
const log = (t) => out.push(t);
const fail = (t) => { failures++; out.push(`FAIL ${t}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);

// Plaque box on the board (SVG units). A vertical plaque is rotated −90°,
// so its on-board footprint swaps width and height.
function tagGeometry(g) {
  const [, tx, ty] = g.getAttribute('transform').match(/translate\(([-\d.]+) ([-\d.]+)\)/).map(Number);
  const vertical = /rotate\(-90\)/.test(g.getAttribute('transform'));
  const rect = g.querySelector('rect');
  const lw = Number(rect.getAttribute('width'));
  const lh = Number(rect.getAttribute('height'));
  const w = vertical ? lh : lw;
  const h = vertical ? lw : lh;
  return { tx, ty, vertical, lx: Number(rect.getAttribute('x')), ly: Number(rect.getAttribute('y')), lw, lh, x: tx - w / 2, y: ty - h / 2, w, h, x2: tx + w / 2, y2: ty + h / 2 };
}

// Natural advance width of a <text> without textLength, optionally in one face.
function naturalWidth(text) {
  const probe = text.cloneNode(true);
  probe.removeAttribute('textLength');
  probe.removeAttribute('lengthAdjust');
  probe.setAttribute('visibility', 'hidden');
  text.parentNode.appendChild(probe);
  const width = probe.getBBox().width;
  probe.remove();
  return width;
}

function auditCase(win, doc, puzzle, tag, caseNo, stats) {
  const face = stats.face;
  const svg = doc.querySelector('#plan svg');
  const n = puzzle.size;
  const S = n * 100;
  const kids = [...svg.children];
  const firstTag = kids.findIndex((k) => k.classList.contains('room-tag'));
  const lastArt = kids.reduce((last, k, i) => (k.classList.contains('room-tag') ? last : i), -1);
  const orderOk = firstTag > lastArt; // every non-label element precedes every label
  if (!orderOk) fail(`${tag} case ${caseNo}: paint order — label at ${firstTag}, art up to ${lastArt}`);
  stats.order = stats.order && orderOk;

  // Wall segments: every edge between two different rooms, plus the outer frame.
  const walls = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (c < n - 1 && puzzle.cells[r][c] !== puzzle.cells[r][c + 1]) walls.push({ v: true, at: (c + 1) * 100, from: r * 100, to: (r + 1) * 100 });
      if (r < n - 1 && puzzle.cells[r][c] !== puzzle.cells[r + 1][c]) walls.push({ v: false, at: (r + 1) * 100, from: c * 100, to: (c + 1) * 100 });
    }
  }
  const WALL_HALF = 4; // wall stroke is 8 units wide

  const tags = [...svg.querySelectorAll('.room-tag')];
  const boxes = [];
  for (const g of tags) {
    const name = g.dataset.room;
    const room = puzzle.rooms.findIndex((rm) => rm.name === name);
    const b = tagGeometry(g);
    boxes.push({ name, b });
    const notes = [];
    let bad = false;

    // 1. Drawn and natural text boxes inside the plaque (plaque-local units).
    const texts = [...g.querySelectorAll('text')];
    let worstSqueeze = -Infinity;
    let worstStretch = Infinity;
    for (const t of texts) {
      const bb = t.getBBox();
      const natural = naturalWidth(t);
      const spill = Math.max(b.lx - bb.x, bb.x + bb.width - (b.lx + b.lw), b.ly - bb.y, bb.y + bb.height - (b.ly + b.lh));
      const naturalSpill = natural - b.lw;
      if (spill > 0.5) { bad = true; notes.push(`text spills ${f1(spill)}u`); }
      if (naturalSpill > 0.5) { bad = true; notes.push(`unpinned word ${f1(natural)}u > plaque ${f1(b.lw)}u`); }
      const squeeze = 1 - Number(t.getAttribute('textLength')) / natural; // > 0 compressed, < 0 stretched
      worstSqueeze = Math.max(worstSqueeze, squeeze);
      worstStretch = Math.min(worstStretch, squeeze);
      stats.squeezes.push(squeeze);
      stats.px.push(Number(t.getAttribute('font-size')) * svg.getScreenCTM().a);
    }
    if (worstSqueeze > MAX_SQUEEZE) { bad = true; notes.push(`squeezed ${f1(worstSqueeze * 100)} %`); }
    if (worstStretch < -MAX_SQUEEZE) { bad = true; notes.push(`stretched ${f1(-worstStretch * 100)} %`); }
    if (b.vertical) stats.vertical++;
    // 3d. Inside the rectangle the generator claims, which must be all-room, victim-free.
    if (g.dataset.rect) {
      const [rr, rc, rw, rh] = g.dataset.rect.split(',').map(Number);
      const outside = Math.max(rc * 100 - b.x, b.x2 - (rc + rw) * 100, rr * 100 - b.y, b.y2 - (rr + rh) * 100);
      if (outside > 0) { bad = true; notes.push(`leaves its rect by ${f1(outside)}u`); }
    }

    // 3a. Inside the board.
    if (b.x < 0 || b.y < 0 || b.x2 > S || b.y2 > S) { bad = true; notes.push('outside board'); }
    // 3b. Only over its own room's cells (overlap > .5 unit on both axes counts).
    const foreign = [];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const ox = Math.min(b.x2, (c + 1) * 100) - Math.max(b.x, c * 100);
        const oy = Math.min(b.y2, (r + 1) * 100) - Math.max(b.y, r * 100);
        if (ox > 0.5 && oy > 0.5 && puzzle.cells[r][c] !== room) foreign.push(`${puzzle.rooms[puzzle.cells[r][c]].name}@${r},${c}`);
      }
    }
    if (foreign.length) { bad = true; notes.push(`over ${foreign.join(' ')}`); }
    // 2b. A wall running under the plaque (hidden wall = plaque crosses rooms).
    const crossed = walls.filter((w) => (w.v
      ? w.at > b.x - WALL_HALF && w.at < b.x2 + WALL_HALF && Math.min(w.to, b.y2) - Math.max(w.from, b.y) > 0.5
      : w.at > b.y - WALL_HALF && w.at < b.y2 + WALL_HALF && Math.min(w.to, b.x2) - Math.max(w.from, b.x) > 0.5));
    if (crossed.length) { bad = true; notes.push(`${crossed.length} wall segment(s) under plaque`); }
    // Victim cell: the crime marker is drawn above the SVG.
    const [vr, vc] = puzzle.victim.cell;
    const overVictim = Math.min(b.x2, (vc + 1) * 100) - Math.max(b.x, vc * 100) > 0.5 && Math.min(b.y2, (vr + 1) * 100) - Math.max(b.y, vr * 100) > 0.5;
    if (overVictim) { bad = true; notes.push('over the victim cell'); }

    const label = `${tag} ${face.padEnd(18)} case ${String(caseNo).padStart(2)} ${name.padEnd(15)} plaque ${f1(b.w)}×${f1(b.h)}u${b.vertical ? ' (vertical)' : ''} squeeze ${f1(worstSqueeze * 100).padStart(5)} %`;
    stats.total++;
    if (bad) { stats.failed++; fail(`${label} — ${notes.join('; ')}`); } else if (stats.verbose) log(`PASS ${label}`);
  }
  // 3c. Plaques overlapping each other.
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].b, c = boxes[j].b;
      const ox = Math.min(a.x2, c.x2) - Math.max(a.x, c.x);
      const oy = Math.min(a.y2, c.y2) - Math.max(a.y, c.y);
      if (ox > 0 && oy > 0) { stats.overlaps++; fail(`${tag} case ${caseNo}: ${boxes[i].name} overlaps ${boxes[j].name} by ${f1(ox)}×${f1(oy)}u`); }
    }
  }
  // Rooms without a tag.
  if (tags.length !== puzzle.rooms.length) fail(`${tag} ${face} case ${caseNo}: ${tags.length} tags for ${puzzle.rooms.length} rooms`);
}

async function run() {
  const { cases } = await (await fetch('../cases.json')).json();
  const verbose = new URLSearchParams(location.search).has('verbose');
  for (const [w, h] of SIZES) {
    const frame = document.createElement('iframe');
    frame.width = String(w);
    frame.height = String(h);
    document.body.appendChild(frame);
    await new Promise((r) => { frame.onload = r; frame.src = '../index.html'; });
    for (let i = 0; i < 50 && !frame.contentDocument.querySelector('.room-tag'); i++) await sleep(100);
    await frame.contentDocument.fonts.ready;
    const tag = `${w}×${h}`;
    for (const faceStack of FACES) {
      const face = faceStack ? faceStack.replace(/'/g, '') : 'page stack';
      if (!faceStack && !frame.contentWindow.Floorplan.setLabelFont) log(`[${tag}] (generator has no setLabelFont: page stack only)`);
      if (faceStack && !frame.contentWindow.Floorplan.setLabelFont) continue;
      if (frame.contentWindow.Floorplan.setLabelFont) frame.contentWindow.Floorplan.setLabelFont(faceStack || DEFAULT_STACK);
      const stats = { face, total: 0, failed: 0, overlaps: 0, squeezes: [], px: [], vertical: 0, order: true, verbose };
      for (let i = 0; i < cases.length; i++) {
        frame.contentWindow.loadCase(i);
        await sleep(30);
        auditCase(frame.contentWindow, frame.contentDocument, cases[i], tag, i + 1, stats);
      }
      const sq = stats.squeezes;
      log(`[${tag} ${face}] ${stats.total} plaques (${stats.vertical} vertical) · ${stats.failed} failing · ${stats.overlaps} overlaps · paint order ${stats.order ? 'labels last ×12' : 'BROKEN'} · squeeze worst ${f1(Math.max(...sq) * 100)} %, most stretched ${f1(Math.min(...sq) * 100)} % · label font ${f1(Math.min(...stats.px))}–${f1(Math.max(...stats.px))} CSS px`);
    }
    if (frame.contentWindow.Floorplan.setLabelFont) frame.contentWindow.Floorplan.setLabelFont(DEFAULT_STACK);
    frame.remove();
  }
  log(failures ? `RESULT FAIL (${failures})` : 'RESULT PASS');
}

run().catch((e) => { fail(`crashed: ${e.stack || e}`); })
  .finally(() => { document.getElementById('audit-out').textContent = out.join('\n'); });
