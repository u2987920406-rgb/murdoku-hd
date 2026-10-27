// Shared audit helpers (colour maths, layout measurement, reporting).
// Loaded by audit.js (desktop + narrow widths) and audit-mobile.js (phone shell).
const WIDTHS = [360, 412, 1440];
const HEIGHT = 900;
const MIN_TARGET = 44;
const MIN_FONT = 16;
const MIN_CONTRAST = 4.5;
const lines = [];
const failures = [];
const log = (text) => lines.push(text);
const fail = (text) => { failures.push(text); lines.push(`FAIL ${text}`); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ----------------------------------------------------------------- colour
function parseColor(text) {
  const m = text.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const [r, g, b, a = '1'] = m[1].split(/[ ,/]+/).filter(Boolean);
  return [Number(r), Number(g), Number(b), Number(a)];
}
function blend(top, bottom) {
  const a = top[3];
  return [0, 1, 2].map((i) => top[i] * a + bottom[i] * (1 - a)).concat(1);
}
function luminance([r, g, b]) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
const hex = (c) => `#${c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

// Candidate backgrounds behind an element: walk up, alpha-compositing solid
// colours; a gradient contributes each of its stops (worst case is kept).
function backgrounds(win, node) {
  const chain = [];
  for (let n = node; n && n.nodeType === 1; n = n.parentElement) chain.push(n);
  let stack = [[255, 255, 255, 1]];
  for (let i = chain.length - 1; i >= 0; i--) {
    const style = win.getComputedStyle(chain[i]);
    const stops = (style.backgroundImage.match(/rgba?\([^)]+\)/g) || []).map(parseColor);
    const solid = parseColor(style.backgroundColor);
    if (stops.length && !style.backgroundImage.includes('url(')) {
      stack = stack.flatMap((under) => stops.map((stop) => blend(stop, under)));
    } else if (solid && solid[3] > 0) {
      stack = stack.map((under) => blend(solid, under));
    }
  }
  return stack;
}

// ------------------------------------------------------------- page checks
// Rendered and perceivable: screen-reader-only boxes (1 px, clip-path inset 50%)
// are deliberately excluded — they carry text for assistive tech, not for eyes.
function visible(win, node) {
  if (!node.getClientRects().length) return false;
  const rect = node.getBoundingClientRect();
  if (rect.width <= 1 || rect.height <= 1) return false;
  for (let n = node; n && n.nodeType === 1; n = n.parentElement) {
    const style = win.getComputedStyle(n);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    if (style.clipPath.startsWith('inset(50%')) return false;
  }
  return true;
}
// A scroll container keeps overflowing content reachable: not clipping.
const scrolls = (style) => ['auto', 'scroll'].includes(style.overflowX) || ['auto', 'scroll'].includes(style.overflowY);
function blockContainer(win, node) {
  let n = node.parentElement;
  while (n && ['inline', 'contents'].includes(win.getComputedStyle(n).display)) n = n.parentElement;
  return n;
}
const decorative = (node) => node.closest('svg, [data-fx], .confetti-layer');

function textElements(doc) {
  const out = new Set();
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if (t.nodeValue.trim() && t.parentElement && !t.parentElement.closest('script, style, option')) out.add(t);
  }
  return [...out];
}

function measure(frame, label) {
  const win = frame.contentWindow;
  const doc = frame.contentDocument;
  const result = { label, fontMin: Infinity, contrastMin: Infinity, worstPair: '', targetMin: Infinity, worstTarget: '', overflow: [], clipped: [], distortion: 0 };

  // Horizontal scroll of the page.
  result.hScroll = Math.max(doc.documentElement.scrollWidth, doc.body.scrollWidth) - doc.documentElement.clientWidth;

  // Text: font size, contrast, clipping/spill against its block container.
  const range = doc.createRange();
  for (const t of textElements(doc)) {
    const host = t.parentElement;
    if (!visible(win, host) || decorative(host)) continue;
    const style = win.getComputedStyle(host);
    const size = parseFloat(style.fontSize);
    if (size < result.fontMin) { result.fontMin = size; result.fontMinAt = `${host.tagName.toLowerCase()}.${host.className} "${t.nodeValue.trim().slice(0, 24)}"`; }
    const fg = parseColor(style.color);
    for (const bg of backgrounds(win, host)) {
      const r = ratio(blend(fg, bg), bg);
      if (r < result.contrastMin) { result.contrastMin = r; result.worstPair = `${hex(fg)} on ${hex(bg)} (${host.tagName.toLowerCase()}.${host.className || host.id} "${t.nodeValue.trim().slice(0, 24)}")`; }
    }
    range.selectNodeContents(t);
    const box = range.getBoundingClientRect();
    for (let n = host; n && n !== doc.body; n = n.parentElement) {
      const s = win.getComputedStyle(n);
      if (scrolls(s)) break;
      const clips = s.overflowX !== 'visible' || s.overflowY !== 'visible' || s.textOverflow === 'ellipsis';
      const isBlock = !['inline', 'contents'].includes(s.display);
      if (!clips && !isBlock) continue;
      const c = n.getBoundingClientRect();
      const out = Math.max(c.left - box.left, box.right - c.right, clips ? Math.max(c.top - box.top, box.bottom - c.bottom) : 0);
      if (out > 1) result.clipped.push(`${n.tagName.toLowerCase()}.${n.className} "${t.nodeValue.trim().slice(0, 30)}" ${out.toFixed(1)}px`);
      if (isBlock) break;
    }
  }
  // Pseudo-element text (clue numbers).
  doc.querySelectorAll('.clue').forEach((node) => {
    const style = win.getComputedStyle(node, '::before');
    if (!style.content || style.content === 'none') return;
    const size = parseFloat(style.fontSize);
    if (size < result.fontMin) { result.fontMin = size; result.fontMinAt = '.clue::before'; }
    const fg = parseColor(style.color);
    const bg = parseColor(style.backgroundColor);
    const r = ratio(fg, bg);
    if (r < result.contrastMin) { result.contrastMin = r; result.worstPair = `${hex(fg)} on ${hex(bg)} (.clue::before)`; }
  });
  // <select>: the selected label must fit its content box (minus the arrow).
  doc.querySelectorAll('select').forEach((select) => {
    const style = win.getComputedStyle(select);
    const ctx = doc.createElement('canvas').getContext('2d');
    ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const text = select.options[select.selectedIndex]?.textContent || '';
    const room = select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 20;
    const need = ctx.measureText(text).width;
    if (need > room) result.clipped.push(`select "${text}" needs ${need.toFixed(0)}px, has ${room.toFixed(0)}px`);
  });

  // Every element inside its container.
  doc.querySelectorAll('body *').forEach((node) => {
    if (!visible(win, node) || decorative(node) || node.matches('script, style, option')) return;
    if (win.getComputedStyle(node).position === 'fixed') return;
    const parent = blockContainer(win, node);
    if (!parent || parent === doc.documentElement || scrolls(win.getComputedStyle(parent))) return;
    const a = node.getBoundingClientRect();
    const b = parent.getBoundingClientRect();
    const out = Math.max(b.left - a.left, a.right - b.right, b.top - a.top, a.bottom - b.bottom);
    if (out > 0.5) result.overflow.push(`${node.tagName.toLowerCase()}.${node.className || node.id} in ${parent.tagName.toLowerCase()}.${parent.className || parent.id}: ${out.toFixed(1)}px`);
  });

  // Interactive targets.
  doc.querySelectorAll('button, select, a[href], input, [role="button"], [tabindex]:not([tabindex="-1"])').forEach((node) => {
    if (!visible(win, node)) return;
    const r = node.getBoundingClientRect();
    const m = Math.min(r.width, r.height);
    if (m < result.targetMin) { result.targetMin = m; result.worstTarget = `${node.tagName.toLowerCase()}.${node.className || node.id} ${r.width.toFixed(1)}×${r.height.toFixed(1)}`; }
  });

  // Image aspect ratio: rendered box vs intrinsic, unless object-fit handles it.
  doc.querySelectorAll('img').forEach((img) => {
    if (!visible(win, img)) return;
    if (!img.naturalWidth) { result.overflow.push(`img not loaded: ${img.getAttribute('src')}`); return; }
    const r = img.getBoundingClientRect();
    const fit = win.getComputedStyle(img).objectFit;
    const d = Math.abs((r.width / r.height) / (img.naturalWidth / img.naturalHeight) - 1);
    const effective = ['contain', 'cover', 'scale-down', 'none'].includes(fit) ? 0 : d;
    result.distortion = Math.max(result.distortion, effective);
  });

  const cells = [...doc.querySelectorAll('.cell')].map((c) => c.getBoundingClientRect());
  result.cellMin = Math.min(...cells.map((c) => Math.min(c.width, c.height)));
  return result;
}

async function settle(frame) {
  const imgs = [...frame.contentDocument.images];
  await Promise.all(imgs.map((img) => (img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r; }))));
  await sleep(1600); // let pop/rise animations finish before measuring boxes
}
const cellAt = (doc, r, c) => doc.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
function tap(doc, node) { node.dispatchEvent(new MouseEvent('click', { bubbles: true })); }

function report(r) {
  log(`[${r.label}] cell min ${r.cellMin.toFixed(1)}px · font min ${r.fontMin}px (${r.fontMinAt}) · h-scroll ${r.hScroll}px · target min ${r.targetMin.toFixed(1)}px (${r.worstTarget})`);
  log(`[${r.label}] contrast min ${r.contrastMin.toFixed(2)}:1 — ${r.worstPair} · aspect distortion ${(r.distortion * 100).toFixed(2)}%`);
  if (r.cellMin < MIN_TARGET) fail(`${r.label}: cell ${r.cellMin}px < ${MIN_TARGET}`);
  if (r.fontMin < MIN_FONT) fail(`${r.label}: font ${r.fontMin}px at ${r.fontMinAt}`);
  if (r.hScroll > 0) fail(`${r.label}: horizontal scroll ${r.hScroll}px`);
  if (r.targetMin < MIN_TARGET) fail(`${r.label}: target ${r.worstTarget}`);
  if (r.contrastMin < MIN_CONTRAST) fail(`${r.label}: contrast ${r.contrastMin.toFixed(2)} ${r.worstPair}`);
  if (r.distortion > 0.01) fail(`${r.label}: image distortion ${(r.distortion * 100).toFixed(1)}%`);
  r.overflow.slice(0, 8).forEach((o) => fail(`${r.label}: overflow ${o}`));
  r.clipped.slice(0, 8).forEach((o) => fail(`${r.label}: clipped ${o}`));
  log(`[${r.label}] overflowing elements ${r.overflow.length} · clipped text ${r.clipped.length}`);
}

