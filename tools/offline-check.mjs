// Offline proof for the PWA. Serves the site on localhost (the service worker
// registers on https or localhost only), loads it once, waits until the worker
// controls the page and has cached the shell, then cuts the network twice over:
// the HTTP server is killed and Chrome is switched to offline mode. A reload
// must still render the board, and a real click must place a guest.
// Usage: node tools/offline-check.mjs [screenshot.png]
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launch, sleep } from './cdp.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = 8200 + Math.floor(Math.random() * 300);
const origin = `http://localhost:${port}`;
const shot = process.argv[2];
let failures = 0;
const check = (ok, text) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${text}`); if (!ok) failures++; };

const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
for (let i = 0; i < 50; i++) {
  try { await fetch(`${origin}/index.html`); break; } catch { await sleep(100); }
}

const browser = await launch();
const { send, evaluate, click, waitFor } = browser;
try {
  await send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 1, mobile: true });
  await send('Page.enable');
  await send('Network.enable');

  // 1. First visit, online.
  await send('Page.navigate', { url: `${origin}/` });
  await waitFor(`document.querySelectorAll('.cell').length > 0`);
  await waitFor(`navigator.serviceWorker.controller !== null`, 10000);
  await waitFor(`caches.keys().then(async (names) => names.length === 1 && (await (await caches.open(names[0])).keys()).length >= 35)`, 10000);
  const cache = await evaluate(`caches.keys().then(async (names) => ({ name: names[0], files: (await (await caches.open(names[0])).keys()).length }))`);
  check(true, `première visite : service worker actif et maître de la page, cache « ${cache.name} » = ${cache.files} fichiers`);

  // 2. Cut the network: no server, and Chrome offline.
  server.kill();
  await sleep(300);
  const serverDown = await fetch(`${origin}/index.html`).then(() => false, () => true);
  check(serverDown, `serveur HTTP arrêté (fetch Node vers ${origin} : ${serverDown ? 'connexion refusée' : 'RÉPOND ENCORE'})`);
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  const pageOffline = await evaluate(`fetch('/not-cached-${Date.now()}.txt', { cache: 'no-store' }).then(() => false, () => true)`);
  check(pageOffline, `réseau coupé côté page (un fichier hors cache ${pageOffline ? 'échoue' : 'ARRIVE ENCORE'})`);

  // 3. Reload offline: the board must render from the cache.
  await send('Page.reload', { ignoreCache: false });
  await waitFor(`document.readyState === 'complete' && document.querySelectorAll('.cell').length > 0`, 10000);
  await sleep(400);
  const state = await evaluate(`(() => {
    const puzzle = document.getElementById('case-title').textContent;
    const portraits = [...document.querySelectorAll('#palette img')];
    return {
      puzzle,
      cells: document.querySelectorAll('.cell').length,
      clues: document.querySelectorAll('#clues li').length,
      guests: portraits.length,
      portraitsLoaded: portraits.filter((img) => img.complete && img.naturalWidth > 0).length,
      plan: Boolean(document.querySelector('#plan svg')),
      controlled: navigator.serviceWorker.controller !== null,
      online: navigator.onLine,
    };
  })()`);
  check(state.cells > 0 && state.plan, `rechargement hors ligne : ${state.puzzle}, ${state.cells} cases, plan SVG ${state.plan ? 'dessiné' : 'ABSENT'}, ${state.clues} témoignages`);
  check(state.portraitsLoaded === state.guests, `portraits des invités chargés depuis le cache : ${state.portraitsLoaded}/${state.guests}`);
  check(state.controlled && !state.online, `page servie par le service worker (navigator.onLine = ${state.online})`);

  // 4. Play offline: real clicks on a guest chip, then on a free cell.
  const target = await evaluate(`(() => {
    const cell = [...document.querySelectorAll('.cell')].find((c) => !c.classList.contains('victim') && !c.querySelector('.token'));
    return { row: cell.dataset.row, col: cell.dataset.col };
  })()`);
  await click('#palette .suspect:nth-child(1)');
  await click(`.cell[data-row="${target.row}"][data-col="${target.col}"]`);
  const placed = await evaluate(`(() => {
    const cell = document.querySelector('.cell[data-row="${target.row}"][data-col="${target.col}"]');
    return { token: Boolean(cell.querySelector('.token')), label: cell.getAttribute('aria-label') };
  })()`);
  check(placed.token, `invité placé hors ligne par clic réel : « ${placed.label} »`);

  if (shot) {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(shot, Buffer.from(data, 'base64'));
    console.log(`capture : ${shot}`);
  }
} catch (error) {
  check(false, `exception : ${error.message}`);
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `RESULT FAIL (${failures})` : 'RESULT PASS');
process.exit(failures ? 1 : 0);
