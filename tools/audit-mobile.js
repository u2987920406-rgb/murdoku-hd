// Phone-shell audit: at each portrait size the play screen must fit one
// viewport (no page scroll), the board must keep ≥ 44 px cells, the tally must
// stay visible with the board, and the bottom sheet must snap full/peek/closed.
// Shared helpers (measure, report, tap, settle…) come from audit-lib.js.
const SIZES = [[360, 740], [393, 852], [412, 915]];
const TOL = 1; // px tolerance for snap positions

async function loadPhone(width, height) {
  const frame = document.createElement('iframe');
  frame.width = String(width);
  frame.height = String(height);
  document.body.appendChild(frame);
  await new Promise((resolve) => { frame.onload = resolve; frame.src = '../index.html'; });
  for (let i = 0; i < 50 && !frame.contentDocument.querySelector('.cell'); i++) await sleep(100);
  return frame;
}

const box = (node) => node.getBoundingClientRect();
const px = (v) => `${Math.round(v * 10) / 10}px`;

function pageFit(frame) {
  const doc = frame.contentDocument;
  const scroller = doc.scrollingElement;
  const cells = doc.getElementById('cells');
  return {
    pageScroll: scroller.scrollHeight,
    viewport: scroller.clientHeight,
    inner: frame.contentWindow.innerHeight,
    hScroll: scroller.scrollWidth - scroller.clientWidth,
    cellsScroll: cells.scrollHeight,
    cellsClient: cells.clientHeight,
    cellMin: Math.min(...[...doc.querySelectorAll('.cell')].map((c) => Math.min(box(c).width, box(c).height))),
    boardBottom: box(doc.getElementById('board')).bottom,
    barBottom: box(doc.querySelector('.actions')).bottom,
    sheetTop: box(doc.getElementById('sheet')).top,
  };
}

// Visible height of the sheet = viewport bottom − sheet top. Running snap
// transitions are finished first: we check where each snap lands, not timing.
function sheetState(frame) {
  const doc = frame.contentDocument;
  const sheet = doc.getElementById('sheet');
  const anims = sheet.getAnimations().length;
  sheet.getAnimations().forEach((a) => a.finish());
  const win = frame.contentWindow;
  return {
    snap: sheet.dataset.snap,
    top: box(sheet).top,
    visible: win.innerHeight - box(sheet).top,
    height: sheet.offsetHeight,
    head: doc.getElementById('sheet-head').offsetHeight,
    space: doc.getElementById('sheet-space').offsetHeight,
    expanded: doc.getElementById('sheet-toggle').getAttribute('aria-expanded'),
    role: sheet.getAttribute('role'),
    modal: sheet.getAttribute('aria-modal'),
    inert: doc.getElementById('sheet-body').inert,
    anims,
  };
}

// Six pointer moves 16 ms apart (a 60 Hz touch stream) along the grip.
async function swipe(frame, dy) {
  const win = frame.contentWindow;
  const head = frame.contentDocument.getElementById('sheet-head');
  const grip = head.querySelector('.sheet-grip').getBoundingClientRect();
  const x = grip.left + grip.width / 2;
  let y = grip.top + 2;
  const fire = (type, clientY) => head.dispatchEvent(new win.PointerEvent(type, {
    bubbles: true, pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, clientX: x, clientY,
  }));
  fire('pointerdown', y);
  for (let i = 1; i <= 6; i++) { await sleep(16); y += dy / 6; fire('pointermove', y); }
  fire('pointerup', y);
}

async function run() {
  const { cases } = await (await fetch('../cases.json')).json();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  log(`phone shell · cases ${cases.length} · prefers-reduced-motion ${reduced ? 'reduce' : 'no-preference'}`);

  for (const [width, height] of SIZES) {
    const tag = `${width}×${height}`;
    const frame = await loadPhone(width, height);
    const win = frame.contentWindow;
    const doc = frame.contentDocument;

    // 1. Fit: every case, no page scroll, board above the bar, cells ≥ 44.
    let worst = null;
    for (let i = 0; i < cases.length; i++) {
      win.loadCase(i);
      await sleep(20);
      const f = pageFit(frame);
      const bad = f.pageScroll !== f.viewport || f.viewport !== height || f.hScroll !== 0 ||
        f.cellsScroll !== f.cellsClient || f.cellMin < MIN_TARGET || f.boardBottom > f.barBottom || f.barBottom > f.sheetTop + TOL;
      if (bad) fail(`${tag}: case ${i + 1} fit ${JSON.stringify(f)}`);
      if (!worst || f.cellMin < worst.cellMin) worst = { ...f, caseNo: i + 1 };
    }
    log(`[${tag}] pageScrollHeight ${worst.pageScroll} === viewportHeight ${worst.viewport} (innerHeight ${worst.inner}) · hScroll ${worst.hScroll}`);
    log(`[${tag}] #cells scrollHeight ${px(worst.cellsScroll)} === clientHeight ${px(worst.cellsClient)} · board cell min ${px(worst.cellMin)} (case ${worst.caseNo}, all 12 checked)`);
    log(`[${tag}] board bottom ${px(worst.boardBottom)} ≤ action bar bottom ${px(worst.barBottom)} ≤ sheet top ${px(worst.sheetTop)}`);

    // 2. Idle 7×7, sheet peeked: full design-law suite.
    win.loadCase(8);
    await settle(frame);
    let s = sheetState(frame);
    log(`[${tag}] sheet role=${s.role} aria-modal=${s.modal} · snap ${s.snap} · visible ${px(s.visible)} (peek row ${px(s.space)}) · toggle aria-expanded=${s.expanded}`);
    if (s.role !== 'dialog' || s.modal !== 'false' || s.snap !== 'peek' || Math.abs(s.visible - s.space) > TOL || s.expanded !== 'false') fail(`${tag}: peek state ${JSON.stringify(s)}`);
    const firstClue = doc.querySelector('#pane-clues .clue');
    if (!firstClue || box(firstClue).top > height || box(firstClue).bottom > height + TOL) fail(`${tag}: first clue not fully inside the peek`);
    log(`[${tag}] peek shows tab count "${doc.getElementById('tab-count').textContent}" and clue 1 (${px(box(firstClue).top)}–${px(box(firstClue).bottom)} of ${height})`);
    report(measure(frame, `${tag} idle peek`));

    // 3. Vérifier with mistakes: marks + tally visible with the board.
    const puzzle = cases[8];
    for (let r = 0; r < puzzle.size; r++) {
      const [row, good] = puzzle.solution[r];
      const col = r < 2 ? (good + 1) % puzzle.size : good;
      const [vr, vc] = puzzle.victim.cell;
      if (vr === row && vc === col) continue;
      tap(doc, doc.querySelectorAll('#palette .suspect')[r]);
      tap(doc, doc.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`));
    }
    tap(doc, doc.getElementById('btn-check'));
    await settle(frame);
    const tally = doc.getElementById('board-status');
    const tb = box(tally);
    const onTop = doc.elementFromPoint(tb.left + tb.width / 2, tb.top + tb.height / 2);
    const marks = doc.querySelectorAll('.cell .mark').length;
    log(`[${tag}] after Vérifier: ${marks} marks · tally "${tally.textContent}" at ${px(tb.top)}–${px(tb.bottom)}, in sheet header, uncovered=${tally.contains(onTop)} · board bottom ${px(box(doc.getElementById('board')).bottom)}`);
    if (tally.hidden || !marks || !tally.contains(onTop) || tb.bottom > height || !doc.getElementById('sheet-head').contains(tally)) fail(`${tag}: tally not visible with the board`);
    doc.getElementById('verdict').hidden = true;
    report(measure(frame, `${tag} checked`));

    // 4. Sheet: toggle → full, toggle → peek, swipe down → closed, tap head → peek.
    tap(doc, doc.getElementById('sheet-toggle'));
    await sleep(600);
    s = sheetState(frame);
    const headBottom = box(doc.querySelector('.masthead')).bottom;
    log(`[${tag}] toggle → ${s.snap}: sheet top ${px(s.top)} (header bottom ${px(headBottom)} + 8) · height ${px(s.visible)} of ${s.height} · aria-expanded=${s.expanded} · snap animations ${s.anims}`);
    if (reduced && s.anims) fail(`${tag}: sheet animates under reduced motion`);
    if (s.snap !== 'full' || Math.abs(s.top - (headBottom + 8)) > TOL || Math.abs(s.visible - s.height) > TOL || s.expanded !== 'true') fail(`${tag}: full state ${JSON.stringify(s)}`);
    report(measure(frame, `${tag} sheet full (Témoignages)`));

    tap(doc, doc.getElementById('tab-dossier'));
    await sleep(50);
    const dossier = doc.getElementById('pane-dossier');
    const has = ['#case-story', '#victim-card', '#room-legend', '.legend', '.footer'].map((q) => `${q}:${dossier.querySelector(q) && box(dossier.querySelector(q)).height > 0 ? 'ok' : 'MISSING'}`);
    log(`[${tag}] Dossier tab: ${has.join(' ')} · Témoignages aria-selected=${doc.getElementById('tab-clues').getAttribute('aria-selected')}`);
    if (has.some((h) => h.endsWith('MISSING'))) fail(`${tag}: dossier tab incomplete`);
    report(measure(frame, `${tag} sheet full (Dossier)`));
    tap(doc, doc.getElementById('tab-clues'));

    tap(doc, doc.getElementById('sheet-toggle'));
    await sleep(600);
    s = sheetState(frame);
    log(`[${tag}] toggle → ${s.snap}: visible ${px(s.visible)} (peek row ${px(s.space)}) · aria-expanded=${s.expanded}`);
    if (s.snap !== 'peek' || Math.abs(s.visible - s.space) > TOL) fail(`${tag}: back to peek ${JSON.stringify(s)}`);

    await swipe(frame, 160);
    await sleep(600);
    s = sheetState(frame);
    log(`[${tag}] swipe down → ${s.snap}: visible ${px(s.visible)} (header ${px(s.head)}) · body inert=${s.inert}`);
    if (s.snap !== 'closed' || Math.abs(s.visible - s.head) > TOL || !s.inert) fail(`${tag}: swipe close ${JSON.stringify(s)}`);
    const tallyClosed = box(tally);
    if (tallyClosed.bottom > height + TOL) fail(`${tag}: tally hidden when sheet closed`);

    tap(doc, doc.querySelector('#sheet-head .sheet-grip'));
    await sleep(600);
    s = sheetState(frame);
    log(`[${tag}] tap header → ${s.snap}: visible ${px(s.visible)}`);
    if (s.snap !== 'peek') fail(`${tag}: header tap did not reopen`);

    await swipe(frame, -420);
    await sleep(600);
    const up = sheetState(frame).snap;
    await swipe(frame, 140);
    await sleep(600);
    const down = sheetState(frame).snap;
    log(`[${tag}] swipe up → ${up} · swipe down → ${down}`);
    if (up !== 'full' || down !== 'peek') fail(`${tag}: drag snaps ${up}/${down}`);

    // 5. Overflow menu: Solution / Effacer / Suivante replace the primaries.
    tap(doc, doc.getElementById('btn-more'));
    await sleep(50);
    const shown = (id) => getComputedStyle(doc.getElementById(id)).display !== 'none';
    const face = ['btn-check', 'btn-hint', 'btn-reveal', 'btn-reset', 'btn-next-m'].map((id) => `${id}:${shown(id) ? 'on' : 'off'}`).join(' ');
    log(`[${tag}] overflow open: ${face} · aria-expanded=${doc.getElementById('btn-more').getAttribute('aria-expanded')}`);
    if (shown('btn-check') || !shown('btn-reveal') || !shown('btn-reset')) fail(`${tag}: overflow face`);
    report(measure(frame, `${tag} overflow open`));
    win.setMoreMenu(false);

    // 6. Solved grid: win overlay inside the viewport.
    win.loadCase(8);
    for (let r = 0; r < puzzle.size; r++) {
      tap(doc, doc.querySelectorAll('#palette .suspect')[r]);
      tap(doc, doc.querySelector(`.cell[data-row="${puzzle.solution[r][0]}"][data-col="${puzzle.solution[r][1]}"]`));
    }
    tap(doc, doc.getElementById('btn-check'));
    await settle(frame);
    const card = box(doc.querySelector('.win-card'));
    const banner = doc.getElementById('win-banner');
    const running = doc.getAnimations().filter((a) => a.playState === 'running').length;
    log(`[${tag}] solved: banner ${!banner.hidden ? 'visible' : 'MISSING'} · card ${px(card.top)}–${px(card.bottom)} of ${height} · running animations ${running}`);
    if (banner.hidden || card.top < 0 || card.bottom > height || card.right > width) fail(`${tag}: win card`);
    if (reduced && running) fail(`${tag}: ${running} animations under reduced motion`);
    const fit = pageFit(frame);
    if (fit.pageScroll !== fit.viewport) fail(`${tag}: page scrolls on win (${fit.pageScroll})`);
    report(measure(frame, `${tag} solved`));
    frame.remove();
  }
  log(failures.length ? `RESULT FAIL (${failures.length})` : 'RESULT PASS');
}

run().catch((error) => { fail(`audit crashed: ${error.stack || error}`); log('RESULT FAIL'); })
  .finally(() => { document.getElementById('audit-out').textContent = lines.join('\n'); });
