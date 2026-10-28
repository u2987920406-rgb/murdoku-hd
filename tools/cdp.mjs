// Minimal Chrome DevTools Protocol driver over Node's built-in WebSocket: no
// dependency. Shared by play-free.mjs, make-icons.mjs and offline-check.mjs.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Starts a headless Chrome with a fresh profile and attaches to its first page.
export async function launch({ flags = [] } = {}) {
  const port = 9300 + Math.floor(Math.random() * 500);
  const profile = mkdtempSync(join(tmpdir(), 'cludo-cdp-'));
  const chrome = spawn('/usr/bin/google-chrome', [
    '--headless=new', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, ...flags, 'about:blank',
  ], { stdio: 'ignore' });

  let url = null;
  for (let i = 0; i < 50 && !url; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      url = targets.find((t) => t.type === 'page')?.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    if (!url) await sleep(100);
  }
  if (!url) throw new Error('Chrome did not start');

  const socket = new WebSocket(url);
  await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
  let nextId = 1;
  const pending = new Map();
  const listeners = new Map();
  socket.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method) (listeners.get(msg.method) || []).forEach((fn) => fn(msg.params));
  });

  function send(method, params = {}) {
    const id = nextId++;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, (msg) => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result))));
  }

  async function evaluate(expression) {
    const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
    return result.value;
  }

  // Scrolls the element into view, then presses and releases the mouse on its
  // centre. Returns false when another element covers that point.
  async function click(selector) {
    const point = await evaluate(`(() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      if (!node) return null;
      node.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'instant' });
      const r = node.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      return { x, y, hit: Boolean(hit && (hit === node || node.contains(hit))) };
    })()`);
    if (!point) throw new Error(`no element ${selector}`);
    for (const type of ['mousePressed', 'mouseReleased']) {
      await send('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
    }
    await sleep(60);
    return point.hit;
  }

  // Resolves once `test` (a page expression) is truthy, or rejects after `ms`.
  async function waitFor(test, ms = 5000) {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      if (await evaluate(test).catch(() => false)) return;
      await sleep(100);
    }
    throw new Error(`timed out waiting for ${test}`);
  }

  const on = (method, fn) => listeners.set(method, [...(listeners.get(method) || []), fn]);

  async function close() {
    socket.close();
    chrome.kill();
    await sleep(200);
    rmSync(profile, { recursive: true, force: true });
  }

  return { send, evaluate, click, waitFor, on, close };
}
