// Measures and captures the mockup in headless Chrome.
//   - every screen at 412×915 and 360×740: page scroll (Accueil may scroll;
//     Dossier, Jeu and Résultat must not), pinned button inside the viewport,
//     and the game's design laws (tools/audit-lib.js: no overflow, no clipped
//     text, targets ≥ 44 px, text ≥ 16 px, contrast ≥ 4.5:1, no distortion);
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
  { hash: '#/jeu/3', name: 'jeu-3-picker', picker: true },
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
    if (route.picker) {
      await click('.cell[data-r]:not(:has(.token))');
      await sleep(350);
    }
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
    console.log(`  ${route.name.padEnd(13)} pageScroll ${m.scroll} / clientHeight ${m.client} ${route.scrolls ? '(défile : attendu)' : m.scroll === m.client ? '(tient dans l’écran)' : '(DÉBORDE)'}` +
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

// Reduced motion: navigate through every screen and count running animations.
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await open('#/accueil', 412, 915);
let running = 0;
for (const hash of ['#/dossier/3', '#/jeu/3', '#/resultat/3', '#/accueil']) {
  await evaluate(`location.hash = ${JSON.stringify(hash)}`);
  await sleep(80);
  running += await evaluate(`document.getAnimations().filter((a) => a.playState === 'running').length`);
}
console.log(`\nprefers-reduced-motion: reduce → animations en cours après 4 navigations : ${running}`);
if (running) fail(`${running} animations under reduced motion`);

await browser.close();
console.log(failures ? `\nRESULT FAIL (${failures})` : '\nRESULT PASS');
process.exit(failures ? 1 : 0);
