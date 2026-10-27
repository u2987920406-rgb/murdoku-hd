// Layout / accessibility / flow audit. Loads the real page in iframes at the
// three target widths (media queries follow the iframe viewport) and measures.
// Results are written as text into #audit-out for `chrome --dump-dom`.
// Helpers live in audit-lib.js.
// ------------------------------------------------------------------- flows
async function load(width) {
  const frame = document.createElement('iframe');
  frame.width = String(width);
  frame.height = String(HEIGHT);
  document.body.appendChild(frame);
  await new Promise((resolve) => { frame.onload = resolve; frame.src = '../index.html'; });
  for (let i = 0; i < 50 && !frame.contentDocument.querySelector('.cell'); i++) await sleep(100);
  return frame;
}
async function run() {
  const { cases } = await (await fetch('../cases.json')).json();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  log(`cases ${cases.length} · prefers-reduced-motion ${reduced ? 'reduce' : 'no-preference'}`);

  for (const width of WIDTHS) {
    const frame = await load(width);
    const win = frame.contentWindow;
    const doc = frame.contentDocument;
    let worstCell = Infinity;
    for (let i = 0; i < cases.length; i++) {
      win.loadCase(i);
      await sleep(30);
      const texts = [...doc.querySelectorAll('#clues li')].map((li) => li.textContent);
      if (texts.join('\n') !== cases[i].clues.join('\n')) fail(`${width}: case ${i + 1} clue text differs from cases.json`);
      const min = Math.min(...[...doc.querySelectorAll('.cell')].map((c) => Math.min(c.offsetWidth, c.offsetHeight)));
      worstCell = Math.min(worstCell, min);
    }
    log(`[${width}px] smallest cell over all 12 cases: ${worstCell}px (7×7 cases included)`);
    if (worstCell < MIN_TARGET) fail(`${width}: cell ${worstCell}px`);

    // Idle state on the largest grid.
    win.loadCase(8);
    await settle(frame);
    report(measure(frame, `${width}px idle 7×7`));

    // Vérifier on a partly wrong grid: every placed suspect gets a mark.
    const puzzle = cases[8];
    win.loadCase(8);
    const placed = [];
    for (let s = 0; s < puzzle.size; s++) {
      const col = s < 3 ? (puzzle.solution[s] + 1) % puzzle.size : puzzle.solution[s];
      const [vr, vc] = puzzle.victim.cell;
      if (vr === s && vc === col) continue;
      tap(doc, doc.querySelectorAll('#palette .suspect')[s]);
      tap(doc, cellAt(doc, s, col));
      placed.push(s);
    }
    tap(doc, doc.getElementById('btn-check'));
    await settle(frame);
    const placedNow = doc.querySelectorAll('.cell .token').length;
    const marks = doc.querySelectorAll('.cell .mark').length;
    const ok = doc.querySelectorAll('.cell .mark.ok').length;
    const bad = doc.querySelectorAll('.cell .mark.bad').length;
    const tally = doc.getElementById('board-status');
    log(`[${width}px] after Vérifier: ${placedNow} placed, ${marks} marks (${ok} ✓ / ${bad} ✗), tally "${tally.hidden ? '(hidden)' : tally.textContent}"`);
    if (!marks || marks !== placedNow || tally.hidden) fail(`${width}: marks ${marks} for ${placedNow} placed`);
    report(measure(frame, `${width}px checked`));

    // Solved grid: win overlay with the killer.
    win.loadCase(8);
    for (let s = 0; s < puzzle.size; s++) {
      tap(doc, doc.querySelectorAll('#palette .suspect')[s]);
      tap(doc, cellAt(doc, s, puzzle.solution[s]));
    }
    tap(doc, doc.getElementById('btn-check'));
    await settle(frame);
    const banner = doc.getElementById('win-banner');
    const title = doc.getElementById('win-title').textContent;
    const photo = doc.getElementById('win-photo');
    const killerToken = doc.querySelector('.cell .token.killer');
    const shown = !banner.hidden && banner.classList.contains('visible');
    log(`[${width}px] solved: banner ${shown ? 'visible' : 'MISSING'} · title "${title}" · portrait ${photo.getAttribute('src')} (${photo.naturalWidth}px) · killer token ${killerToken ? 'breathing' : 'missing'} · next button "${doc.getElementById('win-next').textContent}"`);
    if (!shown || !title.includes(puzzle.killer.name) || !killerToken || !photo.naturalWidth) fail(`${width}: win sequence incomplete`);
    const card = doc.querySelector('.win-card').getBoundingClientRect();
    if (card.right > win.innerWidth || card.left < 0) fail(`${width}: win card outside viewport`);
    const running = doc.getAnimations().filter((a) => a.playState === 'running').length;
    log(`[${width}px] running animations on win screen: ${running}`);
    if (reduced && running) fail(`${width}: ${running} animations run under reduced motion`);
    if (!reduced && !running) fail(`${width}: no motion on win screen`);
    report(measure(frame, `${width}px solved`));
    frame.remove();
  }
  log(failures.length ? `RESULT FAIL (${failures.length})` : 'RESULT PASS');
}

run().catch((error) => { fail(`audit crashed: ${error.stack || error}`); log('RESULT FAIL'); })
  .finally(() => { document.getElementById('audit-out').textContent = lines.join('\n'); });
