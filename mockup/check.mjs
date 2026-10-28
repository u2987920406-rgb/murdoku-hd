// Measures and captures the mockup in headless Chrome.
//   - every screen at 412×915 and 360×740: page scroll (Accueil may scroll;
//     Dossier, Jeu and Résultat must not), pinned button inside the viewport,
//     and the game's design laws (tools/audit-lib.js: no overflow, no clipped
//     text, targets ≥ 44 px, text ≥ 16 px, contrast ≥ 4.5:1, no distortion);
//   - the Jeu selection model, driven by real clicks (arm, disarm three ways,
//     place, select, Déplacer, Retirer, swap and Annuler);
//   - the compass on all 12 cases: room labels and tokens never covered, letter
//     contrast (worst case over a black floor), and agreement with every clue;
//   - prefers-reduced-motion: no running animation after a navigation;
//   - screenshots into mockup/shots/.
// Usage: node mockup/check.mjs [baseUrl]   (default http://127.0.0.1:8131)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { launch, sleep } from '../tools/cdp.mjs';

const base = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8131';
const auditLib = readFileSync(new URL('../tools/audit-lib.js', import.meta.url), 'utf8');
const shots = new URL('./shots/', import.meta.url);
mkdirSync(shots, { recursive: true });

const VIEWPORTS = [[412, 915], [360, 740]];
const ROUTES = [
  { hash: '#/accueil', name: 'accueil', scrolls: true },
  { hash: '#/dossier/3', name: 'dossier-3' },
  { hash: '#/dossier/9', name: 'dossier-9' },
  { hash: '#/jeu/3', name: 'jeu-3' },
  { hash: '#/jeu/9', name: 'jeu-9' },
  { hash: '#/jeu/3?vue=arme', name: 'jeu-3-arme' },
  { hash: '#/jeu/3?vue=place', name: 'jeu-3-place' },
  { hash: '#/jeu/3?vue=deplacer', name: 'jeu-3-deplacer' },
  { hash: '#/jeu/3?vue=echange', name: 'jeu-3-echange' },
  { hash: '#/jeu/3?vue=boussole', name: 'jeu-3-boussole' },
  { hash: '#/jeu/3?vue=direction', name: 'jeu-3-direction' },
  { hash: '#/jeu/9?vue=arme', name: 'jeu-9-arme' },
  { hash: '#/jeu/9?vue=direction', name: 'jeu-9-direction' },
  { hash: '#/resultat/3', name: 'resultat-3' },
];

let failures = 0;
const fail = (text) => { failures++; console.log(`  FAIL ${text}`); };
const browser = await launch();
const { send, evaluate, click } = browser;
await send('Page.enable');

async function open(hash, width, height) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url: `${base}/mockup/index.html${hash}` });
  await browser.waitFor(`document.querySelector('#screen .page') && [...document.images].every((img) => img.complete)`);
  await sleep(450); // entrance animation
}

for (const [width, height] of VIEWPORTS) {
  console.log(`\n${width}×${height}`);
  for (const route of ROUTES) {
    await open(route.hash, width, height);
    const m = await evaluate(`(() => {
      const root = document.scrollingElement;
      const dock = document.querySelector('.dock .btn.primary, .actions .btn.primary');
      const board = document.querySelector('.cells');
      const cells = [...document.querySelectorAll('.cell')].map((c) => c.getBoundingClientRect());
      return {
        scroll: root.scrollHeight, client: root.clientHeight,
        primaryBottom: dock ? Math.round(dock.getBoundingClientRect().bottom * 10) / 10 : null,
        cell: cells.length ? Math.round(Math.min(...cells.map((c) => Math.min(c.width, c.height))) * 10) / 10 : null,
      };
    })()`);
    const scrollOk = route.scrolls ? m.scroll > m.client : m.scroll === m.client;
    const dockOk = m.primaryBottom === null || m.primaryBottom <= height;
    console.log(`  ${route.name.padEnd(16)} pageScroll ${m.scroll} / clientHeight ${m.client} ${route.scrolls ? '(défile : attendu)' : m.scroll === m.client ? '(tient dans l’écran)' : '(DÉBORDE)'}` +
      `${m.primaryBottom !== null ? ` · bouton principal bas ${m.primaryBottom}px ≤ ${height}` : ''}${m.cell ? ` · case min ${m.cell}px` : ''}`);
    if (!scrollOk) fail(`${width}×${height} ${route.name}: page scroll ${m.scroll} vs ${m.client}`);
    if (!dockOk) fail(`${width}×${height} ${route.name}: primary button below the fold`);

    // Design laws, measured by the game's own audit helpers.
    const laws = await evaluate(`(() => {
      ${auditLib}
      const r = measure({ contentWindow: window, contentDocument: document }, ${JSON.stringify(`${width} ${route.name}`)});
      report(r);
      return { lines, failures };
    })()`);
    laws.lines.filter((line) => !line.startsWith('FAIL')).forEach((line) => console.log(`    ${line.replace(/^\[[^\]]+\] /, '')}`));
    laws.failures.forEach((f) => fail(f));

    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(new URL(`${route.name}-${width}.png`, shots), Buffer.from(data, 'base64'));
    if (route.scrolls && width === 412) {
      const full = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: m.scroll, scale: 1 } });
      writeFileSync(new URL(`${route.name}-full-${width}.png`, shots), Buffer.from(full.data, 'base64'));
    }
  }
}

// Navigation graph, with real clicks: every edge of the README graph.
await open('#/accueil', 412, 915);
const where = () => evaluate('location.hash');
const steps = [
  ['a.case-row[href="#/dossier/5"]', '#/dossier/5', 'Accueil → ligne « Affaire n°5 »'],
  ['.dock .btn.primary', '#/jeu/5', 'Dossier → Commencer l’enquête'],
  ['.actions .btn.primary', '#/resultat/5', 'Jeu → Vérifier'],
  ['.bar a[aria-label="Retour à la grille"]', '#/jeu/5', 'Résultat → ‹ retour'],
  ['.bar a[aria-label="Retour au dossier"]', '#/dossier/5', 'Jeu → ‹ retour'],
  ['.bar a[aria-label="Retour à la liste des affaires"]', '#/accueil', 'Dossier → ‹ retour'],
  ['a.resume', '#/jeu/3', 'Accueil → carte Reprendre'],
  ['[data-action="menu"]', '#/jeu/3', 'Jeu → ⋯ (menu ouvert)'],
  ['#more-menu a', '#/dossier/3', 'menu ⋯ → Règles de l’affaire'],
  ['.bar a[aria-label="Accueil"]', '#/accueil', 'Dossier → ⌂ accueil'],
  ['a.case-row[href="#/dossier/12"]', '#/dossier/12', 'Accueil → ligne « Affaire n°12 »'],
  ['.dock .btn.primary', '#/jeu/12', 'Dossier → Commencer'],
  ['.bar a[aria-label="Accueil"]', '#/accueil', 'Jeu → ⌂ accueil'],
  ['a.resume', '#/jeu/3', 'Accueil → Reprendre'],
  ['.actions .btn.primary', '#/resultat/3', 'Jeu → Vérifier'],
  ['.dock .btn:not(.primary)', '#/jeu/3', 'Résultat → Revoir la grille'],
  ['.actions .btn.primary', '#/resultat/3', 'Jeu → Vérifier'],
  ['.dock .btn.primary', '#/dossier/4', 'Résultat → Affaire suivante'],
  ['.bar a[aria-label="Accueil"]', '#/accueil', 'Dossier → ⌂ accueil'],
];
console.log('\nnavigation (clics réels) :');
for (const [selector, expected, label] of steps) {
  const hit = await click(selector);
  await sleep(350);
  const now = await where();
  const ok = hit && now === expected;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${label.padEnd(36)} → ${now}`);
  if (!ok) fail(`navigation ${label}: got ${now}${hit ? '' : ' (target covered)'}`);
}

// Selection model, with real clicks, on the tightest viewport.
await open('#/jeu/3', 360, 740);
const state = () => evaluate(`(() => ({
  bar: document.querySelector('.prompt').textContent.replace(/\\s+/g, ' ').trim(),
  barKind: document.querySelector('.prompt').className.replace('prompt', '').trim() || 'neutre',
  chips: [...document.querySelectorAll('.chip')].map((c) => c.className.replace('chip', '').trim()),
  targets: document.querySelectorAll('.cell.target').length,
  swaps: document.querySelectorAll('.cell.swap').length,
  muted: document.querySelectorAll('.cell.muted').length,
  plain: [...document.querySelectorAll('.cell[data-r]')].filter((c) => !c.classList.contains('target') && !c.classList.contains('muted') && !c.classList.contains('ghost')).length,
  neutralCells: document.querySelectorAll('.cell.muted:not(.swap)').length,
  selected: document.querySelectorAll('.cell.selected').length,
  ghost: document.querySelectorAll('.cell.ghost').length,
  tokens: [...document.querySelectorAll('.cell.has-token')].map((c) => c.getAttribute('aria-label').split(',')[0]),
}))()`);
async function clickAt(x, y) {
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
  }
  await sleep(120);
}
const chip = (name) => `.chip[aria-label^="${name},"]`;
const flow = [];
const step = async (label, action, test) => {
  await action();
  await sleep(150);
  const st = await state();
  const ok = test(st);
  flow.push([ok, label, `barre « ${st.bar} »`]);
  if (!ok) fail(`selection ${label}: ${JSON.stringify(st)}`);
  return st;
};
const armed = (st, name) => st.barKind === 'armed' && st.bar.includes(`poser ${name}`) && st.chips.includes('armed');
const neutral = (st) => st.barKind === 'neutre' && !st.chips.some((c) => ['armed', 'selected'].includes(c)) && st.targets + st.swaps === 0 && st.muted === 0;
const firstSwap = '.cell.swap';
let st = await step('état neutre', async () => {}, neutral);
st = await step('toucher Inès → armée', () => click(chip('Inès')), (x) => armed(x, 'Inès') && x.targets > 0 && x.plain === 0);
flow[flow.length - 1][2] += ` · ${st.targets} cases libres (anneau +), ${st.swaps} cases d'échange (badge ⇄), ${st.neutralCells} cases neutres (voile), ${st.plain} case ambiguë`;
await step('retoucher Inès → désarmée', () => click(chip('Inès')), neutral);
await step('armer puis ✕ de la barre', async () => { await click(chip('Inès')); await click('[data-action="cancel"]'); }, neutral);
await step('armer puis toucher le corps (fond)', async () => { await click(chip('Inès')); await click('.cell.body'); }, neutral);
await step('armer puis toucher un pion (case neutre)', async () => { await click(chip('Inès')); await click('.cell.has-token[aria-label^="Camille"]'); }, neutral);
await step('armer puis toucher le coin du cadre', async () => {
  await click(chip('Inès'));
  const p = await evaluate(`(() => { const r = document.querySelector('.board').getBoundingClientRect(); return { x: r.left + 2, y: r.top + 2 }; })()`);
  await clickAt(p.x, p.y);
}, neutral);
await step('armer puis toucher une case libre → posée', async () => { await click(chip('Inès')); await click('.cell.target'); },
  (x) => neutral(x) && x.tokens.includes('Inès') && x.chips[3] === 'placed');
await step('toucher la case d’Inès → sélectionnée', () => click('.cell[aria-label^="Inès, sélectionné"], .cell.has-token[aria-label^="Inès"]'),
  (x) => x.barKind === 'selected' && x.bar.includes('Déplacer') && x.bar.includes('Retirer') && x.selected === 1 && x.chips[3] === 'selected');
await step('Retirer → Inès revient dans la liste', () => click('[data-action="remove"]'), (x) => neutral(x) && !x.tokens.includes('Inès') && x.chips[3] === 'idle');
const beforeSwap = (await state()).tokens.slice().sort().join(',');
await step('armer puis case d’échange → échange visible', async () => { await click(chip('Inès')); await click(firstSwap); },
  (x) => x.barKind === 'swap' && /revien/.test(x.bar) && x.chips.includes('returned') && x.tokens.includes('Inès'));
await step('Annuler → état d’avant l’échange', () => click('[data-action="undo"]'), (x) => neutral(x) && x.tokens.slice().sort().join(',') === beforeSwap);
await step('toucher Maud puis Déplacer → fantôme + cases', async () => { await click('.cell.has-token[aria-label^="Maud"]'); await click('[data-action="move"]'); },
  (x) => x.barKind === 'armed' && x.bar.includes('déplacer Maud') && x.ghost === 1 && x.targets + x.swaps > 0);
await step('toucher une case marquée → Maud déplacée', () => click('.cell.target'), (x) => neutral(x) && x.tokens.includes('Maud') && x.ghost === 0);
await step('toucher Camille (rien d’armé) → sélectionnée', () => click('.cell.has-token[aria-label^="Camille"]'),
  (x) => x.barKind === 'selected' && x.bar.includes('Camille') && !x.chips.includes('armed'));
await step('toucher une case vide → désélection', () => click('.cell[data-r]:not(.has-token)'), neutral);
await step('retoucher Camille puis Échap… (après sélection)', () => click('.cell.has-token[aria-label^="Camille"]'), (x) => x.barKind === 'selected');
await step('Échap → neutre', async () => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); }, neutral);
console.log('\nmodèle de sélection (clics réels, 360×740, affaire n°3) :');
flow.forEach(([ok, label, detail]) => console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${label.padEnd(40)} ${detail}`));

// Compass on every case: labels and tokens clear, letter contrast, clue agreement.
const DIRS = [[/à l['’]est/, 'E'], [/à l['’]ouest/, 'O'], [/au nord/, 'N'], [/au sud/, 'S']];
const expectDir = (text) => (DIRS.find(([re]) => re.test(text)) || [null, ''])[1];
const allCases = JSON.parse(readFileSync(new URL('../cases.json', import.meta.url), 'utf8')).cases;
console.log('\nboussole (12 affaires, toutes les cases occupées par la solution = pire cas) :');
let agree = 0;
let clueTotal = 0;
for (const [width, height] of VIEWPORTS) {
  const rows = [];
  for (const puzzle of allCases) {
    await open(`#/jeu/${puzzle.number}`, width, height);
    const m = await evaluate(`(() => {
      ${auditLib}
      const puzzle = cases[${puzzle.number - 1}];
      const placement = placementOf(puzzle);
      puzzle.solution.forEach((slot, s) => { placement[s] = slot; });
      render();
      const inter = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      const compass = document.querySelector('.compass');
      const ring = document.querySelector('.plan .rose .ring').getBoundingClientRect();
      const marks = [...document.querySelectorAll('.compass .mark')];
      const markBoxes = marks.map((m) => m.getBoundingClientRect());
      const plaques = [...document.querySelectorAll('.room-tag')].map((g) => g.getBoundingClientRect());
      const tokens = [...document.querySelectorAll('.token')].map((t) => t.getBoundingClientRect());
      const board = document.querySelector('.board').getBoundingClientRect();
      const circle = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 });
      let plaqueOverlap = 0;
      // Letters only: the rose is painted under the labels, so it cannot hide one.
      for (const p of plaques) for (const box of markBoxes) plaqueOverlap += inter(p, box);
      const labelsAboveRose = [...document.querySelectorAll('.plan svg > *')].indexOf(document.querySelector('.plan .rose')) < [...document.querySelectorAll('.plan svg > *')].findIndex((el) => el.classList.contains('room-tag'));
      let roseUnderLabel = 0;
      for (const p of plaques) roseUnderLabel += inter(p, ring);
      let tokenHits = 0;
      let minGap = Infinity;
      for (const mb of markBoxes) for (const tb of tokens) {
        const a = circle(mb); const b = circle(tb);
        const gap = Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
        minGap = Math.min(minGap, gap);
        if (gap < -0.5) tokenHits++;
      }
      let contrast = Infinity;
      for (const node of marks) {
        const style = getComputedStyle(node);
        const fg = parseColor(style.color);
        const bg = parseColor(style.backgroundColor);
        for (const floor of [[0, 0, 0, 1], [255, 255, 255, 1]]) {
          const under = blend(bg, floor);
          contrast = Math.min(contrast, ratio(blend(fg, under), under));
        }
      }
      const area = Math.PI * (ring.width / 2) ** 2 + markBoxes.reduce((sum, b) => sum + Math.PI * (b.width / 2) ** 2, 0);
      const font = Math.min(...marks.map((m) => parseFloat(getComputedStyle(m).fontSize)));
      // Clue agreement: compass, clue mark and header tag, clue by clue.
      const seen = puzzle.clues.map((_, k) => {
        view.clue = k; render();
        return [
          document.querySelector('.compass').dataset.dir,
          document.querySelector('.compass .mark.on')?.textContent || '',
          document.querySelector('mark.dir')?.dataset.dir || '',
          document.querySelector('.dir-tag')?.dataset.dir || '',
        ];
      });
      return { at: compass.dataset.at, offset: Number(compass.dataset.offset), plaqueOverlap, labelsAboveRose, roseUnderLabel, tokenHits, minGap, contrast, share: area / (board.width * board.height), font, seen, plaques: plaques.length };
    })()`);
    const expected = puzzle.clues.map(expectDir);
    const ok = m.seen.map((row, k) => row.every((v) => v === expected[k]));
    if (width === 412) { agree += ok.filter(Boolean).length; clueTotal += ok.length; }
    rows.push(m);
    const line = `#${String(puzzle.number).padStart(2)} centre ${m.at} (écart ${m.offset.toFixed(2)} case) · lettres sur étiquette ${Math.round(m.plaqueOverlap)} px² · rose sous étiquette ${Math.round(m.roseUnderLabel)} px² (étiquette peinte au-dessus : ${m.labelsAboveRose ? 'oui' : 'NON'}) · lettres sous un pion ${m.tokenHits} (marge mini ${m.minGap.toFixed(1)} px) · contraste mini ${m.contrast.toFixed(2)}:1 · surface ${(m.share * 100).toFixed(1)} % · accord ${ok.filter(Boolean).length}/${ok.length}`;
    if (width === 412 || m.plaqueOverlap || m.tokenHits || m.contrast < 4.5 || m.font < 16 || ok.includes(false)) console.log(`  ${width}px ${line}`);
    if (!m.labelsAboveRose) fail(`${width} case ${puzzle.number}: rose painted over the labels`);
    if (m.plaqueOverlap > 0) fail(`${width} case ${puzzle.number}: compass covers a room label (${Math.round(m.plaqueOverlap)} px²)`);
    if (m.tokenHits) fail(`${width} case ${puzzle.number}: ${m.tokenHits} compass letters under a token`);
    if (m.contrast < 4.5 || m.font < 16) fail(`${width} case ${puzzle.number}: compass letters ${m.font}px, ${m.contrast.toFixed(2)}:1`);
    if (ok.includes(false)) fail(`${width} case ${puzzle.number}: compass and clue disagree on ${ok.filter((v) => !v).length} clue(s)`);
  }
  const worst = (key, pick) => pick(...rows.map((r) => r[key]));
  console.log(`  ${width}px bilan : lettres sur étiquette ${worst('plaqueOverlap', Math.max)} px² max · lettres sous un pion ${rows.reduce((a, r) => a + r.tokenHits, 0)} · contraste mini ${worst('contrast', Math.min).toFixed(2)}:1 · surface ${(worst('share', Math.min) * 100).toFixed(1)}–${(worst('share', Math.max) * 100).toFixed(1)} % du plan · décalage max ${worst('offset', Math.max).toFixed(2)} case · ${rows.filter((r) => r.offset > 0.75).length} affaire(s) décalée(s)`);
}
console.log(`  accord témoignage ↔ boussole : ${agree}/${clueTotal} témoignages`);

// Reduced motion: navigate through every screen and count running animations.
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await open('#/accueil', 412, 915);
let running = 0;
for (const hash of ['#/dossier/3', '#/jeu/3', '#/jeu/3?vue=arme', '#/jeu/3?vue=direction', '#/resultat/3', '#/accueil']) {
  await evaluate(`location.hash = ${JSON.stringify(hash)}`);
  await sleep(80);
  running += await evaluate(`document.getAnimations().filter((a) => a.playState === 'running').length`);
}
console.log(`\nprefers-reduced-motion: reduce → animations en cours après 6 navigations : ${running}`);
if (running) fail(`${running} animations under reduced motion`);

await browser.close();
console.log(failures ? `\nRESULT FAIL (${failures})` : '\nRESULT PASS');
process.exit(failures ? 1 : 0);
