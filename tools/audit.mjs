// Runs an audit page in headless Chrome and prints its report.
// Usage: node tools/audit.mjs [baseUrl] [--mobile|--tags] [--verbose] [--reduced-motion]
//   default   tools/audit.html        — design laws + flows at 360 / 412 / 1440 px
//   --mobile  tools/audit-mobile.html — phone shell at 360×740, 393×852, 412×915
//   --tags    tools/audit-tags.html   — room-name plaques: spill, walls, cells, squeeze
// Needs the site served over http (fetch of cases.json), e.g. on port 8130.
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const base = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8130';
const reduced = args.includes('--reduced-motion');
const page = args.includes('--mobile') ? 'audit-mobile.html' : args.includes('--tags') ? 'audit-tags.html' : 'audit.html';
const query = args.includes('--verbose') ? '?verbose' : '';
const flags = [
  '--headless=new',
  '--hide-scrollbars',
  '--virtual-time-budget=90000',
  '--window-size=1500,1000',
  ...(reduced ? ['--force-prefers-reduced-motion'] : []),
  '--dump-dom',
  `${base}/tools/${page}${query}`,
];
const dom = execFileSync('/usr/bin/google-chrome', flags, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 24 });
const match = dom.match(/<pre id="audit-out">([\s\S]*?)<\/pre>/);
const text = (match ? match[1] : 'no audit output').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
console.log(text);
process.exit(text.includes('RESULT PASS') ? 0 : 1);
