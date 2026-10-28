// Renders the PWA icons from assets/ui/emblem.svg with headless Chrome, offline:
// the SVG is inlined into a blank page (no network, no data URL) and each size
// is captured as a PNG into assets/icons/. Rerun only when the emblem changes.
//   icon-192.png, icon-512.png   transparent, emblem nearly full-bleed ("any")
//   apple-touch-icon.png (180)   paper background: iOS paints transparency black
//   icon-maskable-512.png        paper background, emblem inside the 80 % safe circle
// Usage: node tools/make-icons.mjs
import { mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { launch } from './cdp.mjs';

const PAPER = '#f4eee3';
const ICONS = [
  { file: 'icon-192.png', size: 192, background: null, scale: 0.94 },
  { file: 'icon-512.png', size: 512, background: null, scale: 0.94 },
  { file: 'apple-touch-icon.png', size: 180, background: PAPER, scale: 0.8 },
  { file: 'icon-maskable-512.png', size: 512, background: PAPER, scale: 0.66 },
];

const emblem = readFileSync(new URL('../assets/ui/emblem.svg', import.meta.url), 'utf8')
  .replace(/<\?xml[^>]*>\s*/, '')
  .replace(/\swidth="\d+"\s+height="\d+"/, ' width="100%" height="100%"');
const out = new URL('../assets/icons/', import.meta.url);
mkdirSync(out, { recursive: true });

const browser = await launch();
const { send, evaluate } = browser;
await send('Page.enable');
for (const icon of ICONS) {
  await send('Emulation.setDeviceMetricsOverride', { width: icon.size, height: icon.size, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  const side = Math.round(icon.size * icon.scale);
  await evaluate(`(() => {
    document.documentElement.innerHTML = ${JSON.stringify(
      `<head><style>html,body{margin:0;width:${icon.size}px;height:${icon.size}px;overflow:hidden;` +
      `background:${icon.background || 'transparent'};display:grid;place-items:center}` +
      `.e{width:${side}px;height:${side}px}</style></head><body><div class="e">${emblem}</div></body>`,
    )};
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  })()`);
  const { data } = await send('Page.captureScreenshot', {
    format: 'png', clip: { x: 0, y: 0, width: icon.size, height: icon.size, scale: 1 }, captureBeyondViewport: false,
  });
  const target = new URL(icon.file, out);
  writeFileSync(target, Buffer.from(data, 'base64'));
  console.log(`${icon.file.padEnd(24)} ${icon.size}×${icon.size}  ${statSync(target).size} octets`);
}
await browser.close();
