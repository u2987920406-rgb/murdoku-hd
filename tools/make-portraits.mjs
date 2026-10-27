// Portrait generator: writes one standalone vector bust per character into
// assets/portraits (suspects) and assets/victims (victims, sepia file photo).
// Run once with `node tools/make-portraits.mjs`; the output SVGs are the
// committed assets — the web client never runs this script.
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = new URL('../assets/', import.meta.url);

// ------------------------------------------------------------------ palettes
const SKIN = {
  porcelain: ['#fde6d8', '#f3cbb4', '#d99f86'],
  fair: ['#fadcc4', '#eebf9d', '#cf9573'],
  warm: ['#f1c9a2', '#dda57a', '#b77b52'],
  olive: ['#e4b98d', '#c99567', '#9f6c43'],
  tan: ['#d9a578', '#b97f52', '#8c5a34'],
  brown: ['#b97f55', '#93603a', '#6a4124'],
  deep: ['#8f5d3c', '#6c4128', '#472816'],
};

const HAIR = {
  black: ['#4a3f3c', '#221b19', '#0e0a09'],
  espresso: ['#6b4a36', '#3d281c', '#21140d'],
  chestnut: ['#9a6440', '#6b3f22', '#432410'],
  auburn: ['#c0623a', '#8e3a1d', '#5b200d'],
  ginger: ['#e48a4a', '#c0602a', '#8a3e16'],
  blond: ['#f4dc9a', '#d9b465', '#a8823a'],
  platinum: ['#fbf4e2', '#e3d6b5', '#b6a682'],
  grey: ['#d9d6d2', '#a9a49e', '#76716b'],
  salt: ['#b8b2aa', '#7d766e', '#4b453f'],
  white: ['#ffffff', '#ece8e2', '#c4beb5'],
};

const IRIS = {
  brown: '#5b3a22', hazel: '#7c6a2e', green: '#3f6e4a', blue: '#3f6d9a',
  grey: '#6c7a84', dark: '#2b1d14', amber: '#9a6420',
};

// ---------------------------------------------------------------- characters
// Each spec is hand-tuned so that every suspect reads differently at 44 px:
// silhouette (hair), value (skin/hair contrast), and one signature accessory.
const SUSPECTS = {
  marc: {
    skin: 'fair', hair: 'salt', hairStyle: 'sidepart', face: 'square', iris: 'grey',
    brows: 'stern', mouth: 'flat', nose: 'long', facial: 'mustache',
    bg: ['#f2dfd3', '#c98f86'], outfit: { kind: 'blazer', main: '#6e2430', inner: '#f4efe6', tie: '#203a5a' },
  },
  ines: {
    skin: 'olive', hair: 'espresso', hairStyle: 'wavy', face: 'oval', iris: 'brown',
    brows: 'soft', mouth: 'smile', nose: 'small', lashes: true, lips: '#b5525a',
    earrings: 'hoop', bg: ['#d8efe9', '#5f9f96'], outfit: { kind: 'blouse', main: '#1f6b68' },
  },
  lucie: {
    skin: 'porcelain', hair: 'ginger', hairStyle: 'bob', face: 'round', iris: 'green',
    brows: 'raised', mouth: 'open', nose: 'button', lashes: true, freckles: true, lips: '#d06d6a',
    glasses: 'round', bg: ['#e8f0d9', '#8aa86b'], outfit: { kind: 'cardigan', main: '#4d6b34', inner: '#f6f0e0' },
  },
  roxane: {
    skin: 'fair', hair: 'platinum', hairStyle: 'bun', face: 'heart', iris: 'blue',
    brows: 'arched', mouth: 'smirk', nose: 'small', lashes: true, lids: 'heavy', lips: '#b3122e',
    mole: true, necklace: 'pearls', bg: ['#f1dde3', '#a2566c'], outfit: { kind: 'dress', main: '#1d1a22' },
  },
  etienne: {
    skin: 'warm', hair: 'grey', hairStyle: 'bald', face: 'oval', iris: 'brown',
    brows: 'bushy', mouth: 'frown', nose: 'round', facial: 'fullbeard', glasses: 'round',
    wrinkles: true, bg: ['#efe3cf', '#a98a5c'], outfit: { kind: 'tweed', main: '#7a5a3a', inner: '#efe7d6', tie: '#8c2f39', bow: true },
  },
  maud: {
    skin: 'porcelain', hair: 'white', hairStyle: 'curlsShort', face: 'round', iris: 'blue',
    brows: 'thin', mouth: 'purse', nose: 'small', glasses: 'cateye', wrinkles: true, lashes: true, lips: '#b76a78',
    earrings: 'pearl', bg: ['#ebe1f2', '#8f74a8'], outfit: { kind: 'shawl', main: '#7b5c96', inner: '#e9dff0' },
  },
  victor: {
    skin: 'porcelain', hair: 'black', hairStyle: 'slick', face: 'long', iris: 'dark',
    brows: 'skeptic', mouth: 'smirk', nose: 'long', facial: 'pencil', lids: 'heavy',
    bg: ['#dfe3ea', '#59627a'], outfit: { kind: 'tux', main: '#15161b', inner: '#fbfaf7', tie: '#15161b', bow: true },
  },
  anais: {
    skin: 'deep', hair: 'black', hairStyle: 'puffs', face: 'round', iris: 'dark',
    brows: 'raised', mouth: 'grin', nose: 'wide', lashes: true, lips: '#7a3a35',
    earrings: 'stud', bg: ['#fbe3c9', '#d9863e'], outfit: { kind: 'scarf', main: '#c8591d', inner: '#f3c14a' },
  },
  karim: {
    skin: 'brown', hair: 'black', hairStyle: 'curlyShort', face: 'square', iris: 'dark',
    brows: 'stern', mouth: 'flat', nose: 'wide', facial: 'trimmed',
    bg: ['#e4e7d2', '#7e8a4f'], outfit: { kind: 'jacket', main: '#55603a', inner: '#e8e1cf' },
  },
  nadia: {
    skin: 'tan', hair: 'black', hairStyle: 'long', face: 'oval', iris: 'brown',
    brows: 'stern', mouth: 'flat', nose: 'long', lashes: true, lips: '#8e4146',
    earrings: 'drop', bg: ['#f2dcdc', '#9a3d4a'], outfit: { kind: 'turtleneck', main: '#6a1f2e' },
  },
  camille: {
    skin: 'fair', hair: 'chestnut', hairStyle: 'pixie', face: 'heart', iris: 'hazel',
    brows: 'soft', mouth: 'smile', nose: 'button', lashes: true, lips: '#c4545b',
    hat: 'beret', bg: ['#dbe6f3', '#4f72a3'], outfit: { kind: 'stripes', main: '#f7f4ee', inner: '#243f73' },
  },
  helene: {
    skin: 'porcelain', hair: 'auburn', hairStyle: 'braid', face: 'long', iris: 'green',
    brows: 'worried', mouth: 'flat', nose: 'small', lashes: true, lips: '#b0575b',
    bg: ['#dcefe2', '#3f8a5c'], outfit: { kind: 'dress', main: '#1e5a3e' },
  },
  sofia: {
    skin: 'warm', hair: 'chestnut', hairStyle: 'ponytail', face: 'oval', iris: 'amber',
    brows: 'arched', mouth: 'smirk', nose: 'small', lashes: true, mole: true, lips: '#b04a3c',
    earrings: 'hoop', bg: ['#f8ecc8', '#c99a2a'], outfit: { kind: 'blouse', main: '#c48a12' },
  },
  julien: {
    skin: 'fair', hair: 'blond', hairStyle: 'tousled', face: 'oval', iris: 'blue',
    brows: 'soft', mouth: 'grin', nose: 'round', facial: 'stubble',
    bg: ['#dfeaf2', '#5d87a6'], outfit: { kind: 'denim', main: '#3f6488', inner: '#d6e2ec' },
  },
  bastien: {
    skin: 'fair', hair: 'ginger', hairStyle: 'buzz', face: 'square', iris: 'blue',
    brows: 'bushy', mouth: 'flat', nose: 'round', facial: 'bigbeard',
    bg: ['#f3e0d0', '#b5643a'], outfit: { kind: 'plaid', main: '#8c2a22', inner: '#2a2a2a' },
  },
  theo: {
    skin: 'deep', hair: 'black', hairStyle: 'flattop', face: 'oval', iris: 'dark',
    brows: 'soft', mouth: 'shy', nose: 'wide', glasses: 'square',
    bg: ['#dde2f0', '#3d4f86'], outfit: { kind: 'sweater', main: '#24315c', inner: '#f2eee6' },
  },
};

const VICTIMS = {
  rousseau: {
    skin: 'fair', hair: 'grey', hairStyle: 'chignon', face: 'oval', iris: 'grey',
    brows: 'thin', mouth: 'flat', nose: 'small', lashes: true, wrinkles: true, lips: '#a5636b',
    necklace: 'pearls', earrings: 'pearl', bg: ['#d9cbb6', '#6f604e'], outfit: { kind: 'dress', main: '#3c3542' },
  },
  vasseur: {
    skin: 'warm', hair: 'salt', hairStyle: 'receding', face: 'long', iris: 'brown',
    brows: 'stern', mouth: 'flat', nose: 'long', glasses: 'half', wrinkles: true,
    bg: ['#d9cbb6', '#6f604e'], outfit: { kind: 'blazer', main: '#2a2d36', inner: '#f4efe6', tie: '#5b2330' },
  },
  aubert: {
    skin: 'fair', hair: 'chestnut', hairStyle: 'sidepart', face: 'round', iris: 'hazel',
    brows: 'soft', mouth: 'flat', nose: 'round', facial: 'mustache', wrinkles: true,
    bg: ['#d9cbb6', '#6f604e'], outfit: { kind: 'tweed', main: '#55483a', inner: '#efe7d6', tie: '#3b4a2a' },
  },
  legoff: {
    skin: 'porcelain', hair: 'auburn', hairStyle: 'bob', face: 'heart', iris: 'green',
    brows: 'arched', mouth: 'flat', nose: 'small', lashes: true, lips: '#a0454a',
    earrings: 'drop', bg: ['#d9cbb6', '#6f604e'], outfit: { kind: 'turtleneck', main: '#2f3d4a' },
  },
  delaunay: {
    skin: 'olive', hair: 'white', hairStyle: 'receding', face: 'square', iris: 'dark',
    brows: 'bushy', mouth: 'flat', nose: 'long', facial: 'fullbeard', wrinkles: true,
    bg: ['#d9cbb6', '#6f604e'], outfit: { kind: 'tux', main: '#1d1d22', inner: '#f8f6f0', tie: '#1d1d22', bow: true },
  },
  molina: {
    skin: 'tan', hair: 'black', hairStyle: 'chignon', face: 'oval', iris: 'brown',
    brows: 'arched', mouth: 'flat', nose: 'long', lashes: true, lips: '#8a3d3f',
    glasses: 'cateye', earrings: 'drop', bg: ['#d9cbb6', '#6f604e'], outfit: { kind: 'shawl', main: '#6b3a2a', inner: '#e7d6bf' },
  },
};

// ----------------------------------------------------------------- geometry
const FACES = {
  // half-width at temples, half-width at the jaw corner, chin y, crown y
  oval: { w: 33, jaw: 23, chin: 140, top: 50 },
  round: { w: 35, jaw: 27, chin: 137, top: 52 },
  square: { w: 34, jaw: 29, chin: 140, top: 50 },
  heart: { w: 34, jaw: 19, chin: 139, top: 51 },
  long: { w: 31, jaw: 22, chin: 144, top: 48 },
};

function headPath(f) {
  const { w, jaw, chin, top } = f;
  const L = 100 - w, R = 100 + w;
  return `M100 ${top}C${100 + w * 0.78} ${top} ${R} ${top + 17} ${R} 90` +
    `C${R} 106 ${100 + jaw + 7} 120 ${100 + jaw} 129` +
    `C${100 + jaw - 7} ${chin - 3} 109 ${chin} 100 ${chin}` +
    `C91 ${chin} ${100 - jaw + 7} ${chin - 3} ${100 - jaw} 129` +
    `C${100 - jaw - 7} 120 ${L} 106 ${L} 90` +
    `C${L} ${top + 17} ${100 - w * 0.78} ${top} 100 ${top}Z`;
}

// ------------------------------------------------------------------- layers
function defs(spec, id) {
  const [sl, sm, sd] = SKIN[spec.skin];
  const [hl, hm, hd] = HAIR[spec.hair];
  const [bgl, bgd] = spec.bg;
  return `<defs>
<radialGradient id="${id}bg" cx=".38" cy=".3" r=".85"><stop offset="0" stop-color="${bgl}"/><stop offset="1" stop-color="${bgd}"/></radialGradient>
<radialGradient id="${id}sk" cx=".4" cy=".36" r=".72"><stop offset="0" stop-color="${sl}"/><stop offset=".62" stop-color="${sm}"/><stop offset="1" stop-color="${sd}"/></radialGradient>
<linearGradient id="${id}sh" x1="0" y1="0" x2="1" y2="0"><stop offset=".45" stop-color="${sd}" stop-opacity="0"/><stop offset="1" stop-color="${sd}" stop-opacity=".55"/></linearGradient>
<linearGradient id="${id}nk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sd}"/><stop offset=".5" stop-color="${sm}"/></linearGradient>
<linearGradient id="${id}hr" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="${hl}"/><stop offset=".45" stop-color="${hm}"/><stop offset="1" stop-color="${hd}"/></linearGradient>
<radialGradient id="${id}vg" cx=".5" cy=".42" r=".7"><stop offset=".7" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></radialGradient>
</defs>`;
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.max(0, Math.min(255, Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)));
  const r = mix(n >> 16), g = mix((n >> 8) & 255), b = mix(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function clothing(spec, id) {
  const o = spec.outfit;
  const main = o.main;
  const dark = shade(main, -0.35);
  const light = shade(main, 0.18);
  const torso = 'M24 200C26 170 46 156 76 150L100 158L124 150C154 156 174 170 176 200Z';
  const grad = `<linearGradient id="${id}cl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${light}"/><stop offset=".55" stop-color="${main}"/><stop offset="1" stop-color="${dark}"/></linearGradient>`;
  let out = `<defs>${grad}</defs><path d="${torso}" fill="url(#${id}cl)"/>`;
  const inner = o.inner || '#f4efe6';
  switch (o.kind) {
    case 'blazer':
    case 'tweed':
    case 'tux':
    case 'jacket': {
      out += `<path d="M82 151L100 200L118 151L100 160Z" fill="${inner}"/>`;
      if (o.tie && !o.bow) out += `<path d="M96 160L104 160L106 168L102 196L98 196L94 168Z" fill="${o.tie}"/><path d="M95.5 158h9l-2 6h-5z" fill="${shade(o.tie, -0.25)}"/>`;
      if (o.bow) out += `<path d="M100 162L86 155L86 169ZM100 162L114 155L114 169Z" fill="${o.tie}"/><circle cx="100" cy="162" r="3.2" fill="${shade(o.tie, 0.2)}"/>`;
      const lapel = o.kind === 'tux' ? shade(main, 0.12) : dark;
      out += `<path d="M76 150L90 186L84 168L92 160L82 151Z" fill="${lapel}"/><path d="M124 150L110 186L116 168L108 160L118 151Z" fill="${lapel}"/>`;
      if (o.kind === 'tweed') {
        out += `<g stroke="${shade(main, 0.3)}" stroke-width=".8" opacity=".45">${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<path d="M${30 + i * 20} 200L${46 + i * 20} 160"/>`).join('')}</g>`;
      }
      if (o.kind === 'tux') out += '<circle cx="100" cy="176" r="1.6" fill="#2a2a2a"/><circle cx="100" cy="186" r="1.6" fill="#2a2a2a"/>';
      if (o.kind === 'jacket') out += `<path d="M58 176h18v10H58z" fill="${dark}" opacity=".6"/>`;
      break;
    }
    case 'blouse':
      out += `<path d="M80 151C88 166 112 166 120 151L124 150C118 172 82 172 76 150Z" fill="${dark}" opacity=".55"/>`;
      out += `<path d="M86 153C92 162 108 162 114 153" fill="none" stroke="${light}" stroke-width="2"/>`;
      break;
    case 'cardigan':
      out += `<path d="M84 151C90 160 110 160 116 151L112 200H88Z" fill="${inner}"/>`;
      out += `<path d="M84 151L96 200M116 151L104 200" stroke="${dark}" stroke-width="3"/>`;
      out += `<circle cx="95" cy="176" r="2" fill="${shade(main, 0.45)}"/><circle cx="94" cy="190" r="2" fill="${shade(main, 0.45)}"/>`;
      break;
    case 'dress':
      out += `<path d="M78 151C86 170 114 170 122 151" fill="none" stroke="${light}" stroke-width="1.6" opacity=".7"/>`;
      break;
    case 'shawl':
      out += `<path d="M70 152C84 176 116 176 130 152L150 162C132 192 68 192 50 162Z" fill="${inner}" opacity=".9"/>`;
      out += `<path d="M54 166C74 186 126 186 146 166" fill="none" stroke="${main}" stroke-width="1.5" stroke-dasharray="3 3"/>`;
      break;
    case 'scarf':
      out += `<path d="M72 148C84 166 116 166 128 148C134 160 126 172 100 174C74 172 66 160 72 148Z" fill="${inner}"/>`;
      out += `<path d="M106 170L118 200H100Z" fill="${shade(inner, -0.15)}"/>`;
      out += `<path d="M78 156C90 166 110 166 122 156" fill="none" stroke="${shade(inner, -0.25)}" stroke-width="1.5"/>`;
      break;
    case 'turtleneck':
      out += `<path d="M82 136H118V156C112 162 88 162 82 156Z" fill="${light}"/>`;
      out += `<g stroke="${dark}" stroke-width="1" opacity=".5"><path d="M86 142H114M85 148H115M84 154H116"/></g>`;
      break;
    case 'stripes': {
      out += `<clipPath id="${id}st"><path d="${torso}"/></clipPath><g clip-path="url(#${id}st)" fill="${inner}">`;
      for (let y = 158; y < 200; y += 10) out += `<rect x="20" y="${y}" width="160" height="4.5"/>`;
      out += '</g><path d="M84 151C90 158 110 158 116 151" fill="none" stroke="#f7f4ee" stroke-width="3"/>';
      break;
    }
    case 'denim':
      out += `<path d="M80 151L92 166L100 160L108 166L120 151L114 150L100 158L86 150Z" fill="${inner}"/>`;
      out += `<path d="M100 160V200" stroke="${shade(main, 0.35)}" stroke-width="1.2" stroke-dasharray="2.5 2"/>`;
      out += `<path d="M62 174h20v12H62z" fill="none" stroke="${shade(main, 0.35)}" stroke-width="1.2" stroke-dasharray="2.5 2"/>`;
      break;
    case 'plaid': {
      out += `<clipPath id="${id}pl"><path d="${torso}"/></clipPath><g clip-path="url(#${id}pl)" opacity=".55">`;
      for (let x = 20; x < 180; x += 18) out += `<rect x="${x}" y="140" width="5" height="60" fill="${inner}"/>`;
      for (let y = 160; y < 200; y += 18) out += `<rect x="20" y="${y}" width="160" height="5" fill="${inner}"/>`;
      out += '</g>';
      out += `<path d="M82 151L92 168L100 158L108 168L118 151" fill="${shade(main, -0.2)}"/>`;
      break;
    }
    case 'sweater':
      out += `<path d="M82 150C88 162 112 162 118 150" fill="none" stroke="${shade(main, 0.25)}" stroke-width="5"/>`;
      out += `<path d="M90 154L100 166L110 154" fill="${inner}"/>`;
      break;
    default:
      break;
  }
  return out;
}

function hairBack(spec, id) {
  const fill = `url(#${id}hr)`;
  switch (spec.hairStyle) {
    case 'long':
      return `<path d="M60 92C56 52 80 36 100 36C120 36 144 52 140 92L146 176C130 186 70 186 54 176Z" fill="${fill}"/>`;
    case 'wavy':
      return `<path d="M60 90C54 50 80 36 100 36C122 36 146 50 140 90C150 108 138 120 148 136C156 152 140 162 146 176C128 184 72 184 54 176C60 162 44 152 52 136C62 120 50 108 60 90Z" fill="${fill}"/>`;
    case 'bob':
      return `<path d="M60 96C54 54 80 38 100 38C120 38 146 54 140 96C142 116 146 130 140 140C126 146 74 146 60 140C54 130 58 116 60 96Z" fill="${fill}"/>`;
    case 'braid':
      return `<path d="M62 92C58 52 82 38 100 38C118 38 142 52 138 92L136 120C124 112 76 112 64 120Z" fill="${fill}"/>`;
    case 'ponytail':
      return `<path d="M128 70C150 72 160 96 154 124C150 146 158 160 150 172C142 156 134 140 134 118C134 100 128 86 122 78Z" fill="${fill}"/>`;
    case 'puffs':
      return `<circle cx="62" cy="52" r="24" fill="${fill}"/><circle cx="138" cy="52" r="24" fill="${fill}"/>`;
    case 'bun':
      return `<circle cx="100" cy="34" r="17" fill="${fill}"/><path d="M90 26C96 22 106 22 112 28" fill="none" stroke="${HAIR[spec.hair][0]}" stroke-width="2" opacity=".8"/>`;
    case 'chignon':
      return `<circle cx="126" cy="64" r="16" fill="${fill}"/>`;
    default:
      return '';
  }
}

function curls(cx, cy, rx, ry, n, r, fill, rng) {
  let out = '';
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (i / (n - 1)) * Math.PI;
    const x = cx + Math.cos(a) * rx;
    const y = cy + Math.sin(a) * ry;
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r + rng() * 2.5).toFixed(1)}" fill="${fill}"/>`;
  }
  return out;
}

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hairFront(spec, id, f) {
  const fill = `url(#${id}hr)`;
  const [hl, , hd] = HAIR[spec.hair];
  const rng = seeded(spec.hairStyle.length * 97 + spec.hair.length * 13);
  const L = 100 - f.w, R = 100 + f.w;
  const shine = (d) => `<path d="${d}" fill="none" stroke="${hl}" stroke-width="2.2" stroke-linecap="round" opacity=".55"/>`;
  switch (spec.hairStyle) {
    case 'sidepart':
      return `<path d="M${L - 1} 96C${L - 6} 58 78 40 102 40C128 40 ${R + 5} 58 ${R + 1} 96C${R - 2} 82 ${R - 6} 70 ${R - 12} 64C114 66 90 62 80 54C78 64 ${L + 4} 74 ${L - 1} 96Z" fill="${fill}"/>` +
        shine('M88 48C100 44 116 46 126 54');
    case 'receding':
      return `<path d="M${L - 1} 98C${L - 4} 78 ${L + 2} 62 ${L + 10} 56C${L + 8} 70 ${L + 4} 82 ${L + 2} 98Z" fill="${fill}"/>` +
        `<path d="M${R + 1} 98C${R + 4} 78 ${R - 2} 62 ${R - 10} 56C${R - 8} 70 ${R - 4} 82 ${R - 2} 98Z" fill="${fill}"/>` +
        `<path d="M84 52C94 48 106 48 116 52C108 50 92 50 84 52Z" fill="${fill}" opacity=".7"/>`;
    case 'bald':
      return `<path d="M${L - 2} 100C${L - 5} 86 ${L - 2} 74 ${L + 4} 68C${L + 4} 80 ${L + 3} 90 ${L + 3} 100Z" fill="${fill}"/>` +
        `<path d="M${R + 2} 100C${R + 5} 86 ${R + 2} 74 ${R - 4} 68C${R - 4} 80 ${R - 3} 90 ${R - 3} 100Z" fill="${fill}"/>` +
        `<ellipse cx="90" cy="60" rx="12" ry="6" fill="#fff" opacity=".22" transform="rotate(-18 90 60)"/>`;
    case 'slick':
      return `<path d="M${L - 1} 92C${L - 4} 54 80 40 100 40C122 40 ${R + 4} 54 ${R + 1} 92C${R - 1} 76 ${R - 4} 66 ${R - 8} 62C112 58 88 58 ${L + 8} 64C${L + 3} 70 ${L + 1} 80 ${L - 1} 92Z" fill="${fill}"/>` +
        `<g fill="none" stroke="${hl}" stroke-width="1.6" stroke-linecap="round" opacity=".5"><path d="M78 52C92 44 112 44 124 52"/><path d="M74 58C90 50 112 50 128 58"/></g>`;
    case 'buzz':
      return `<path d="M${L} 88C${L - 2} 56 80 44 100 44C120 44 ${R + 2} 56 ${R} 88C${R - 3} 74 ${R - 8} 64 ${R - 14} 60C110 56 90 56 ${L + 14} 60C${L + 8} 64 ${L + 3} 74 ${L} 88Z" fill="${fill}" opacity=".9"/>` +
        `<g fill="${hd}" opacity=".35">${Array.from({ length: 40 }, () => `<circle cx="${(72 + rng() * 56).toFixed(1)}" cy="${(48 + rng() * 14).toFixed(1)}" r=".9"/>`).join('')}</g>`;
    case 'curlyShort':
      return `<path d="M${L} 90C${L - 2} 56 80 42 100 42C120 42 ${R + 2} 56 ${R} 90C${R - 4} 74 ${R - 10} 64 100 62C${L + 10} 64 ${L + 4} 74 ${L} 90Z" fill="${fill}"/>` +
        curls(100, 66, 34, 24, 13, 6, fill, rng) +
        `<g fill="${hl}" opacity=".35">${Array.from({ length: 10 }, () => `<circle cx="${(76 + rng() * 48).toFixed(1)}" cy="${(46 + rng() * 10).toFixed(1)}" r="1.6"/>`).join('')}</g>`;
    case 'curlsShort':
      return `<path d="M${L - 2} 96C${L - 6} 58 80 40 100 40C120 40 ${R + 6} 58 ${R + 2} 96C${R - 2} 76 ${R - 8} 66 100 64C${L + 8} 66 ${L + 2} 76 ${L - 2} 96Z" fill="${fill}"/>` +
        curls(100, 72, 40, 32, 15, 7, fill, rng) +
        `<g fill="${hl}" opacity=".6">${Array.from({ length: 8 }, () => `<circle cx="${(72 + rng() * 50).toFixed(1)}" cy="${(46 + rng() * 10).toFixed(1)}" r="2.2"/>`).join('')}</g>`;
    case 'puffs':
      return `<path d="M${L} 86C${L - 2} 58 80 46 100 46C120 46 ${R + 2} 58 ${R} 86C${R - 4} 72 ${R - 10} 64 100 60C${L + 10} 64 ${L + 4} 72 ${L} 86Z" fill="${fill}"/>` +
        `<path d="M86 50L74 40M114 50L126 40" stroke="${hd}" stroke-width="3"/>` +
        `<g fill="${hl}" opacity=".3"><circle cx="56" cy="44" r="5"/><circle cx="132" cy="44" r="5"/></g>`;
    case 'flattop':
      return `<path d="M${L} 86C${L - 2} 70 ${L + 2} 50 ${L + 6} 36H${R - 6}C${R - 2} 50 ${R + 2} 70 ${R} 86C${R - 4} 74 ${R - 8} 64 100 62C${L + 8} 64 ${L + 4} 74 ${L} 86Z" fill="${fill}"/>` +
        `<path d="M${L + 8} 40H${R - 8}" stroke="${hl}" stroke-width="2" opacity=".35"/>`;
    case 'tousled':
      return `<path d="M${L - 1} 92C${L - 6} 66 ${L} 50 76 42L72 30L88 38L94 26L104 36L116 26L118 40L134 34L128 48C${R + 4} 58 ${R + 3} 76 ${R + 1} 92C${R - 4} 78 ${R - 8} 70 ${R - 14} 66C120 70 108 62 104 58C96 66 84 66 ${L + 10} 64C${L + 4} 72 ${L + 1} 80 ${L - 1} 92Z" fill="${fill}"/>` +
        shine('M84 44C92 40 104 40 112 44');
    case 'pixie':
      return `<path d="M${L - 1} 98C${L - 6} 60 78 40 102 40C126 40 ${R + 4} 58 ${R + 1} 92C${R - 3} 80 ${R - 10} 72 ${R - 16} 70C120 74 104 72 92 62C88 74 ${L + 8} 80 ${L - 1} 98Z" fill="${fill}"/>` +
        shine('M90 48C104 44 118 48 126 56');
    case 'bob':
      return `<path d="M${L - 2} 104C${L - 6} 62 78 42 100 42C122 42 ${R + 6} 62 ${R + 2} 104C${R - 2} 86 ${R - 4} 76 ${R - 8} 72C${R - 8} 74 120 76 100 74C86 74 80 72 ${L + 8} 72C${L + 4} 78 ${L + 2} 88 ${L - 2} 104Z" fill="${fill}"/>` +
        `<path d="M${L + 8} 72C80 66 90 66 100 74C110 66 120 66 ${R - 8} 72" fill="none" stroke="${hd}" stroke-width="1.4" opacity=".5"/>` +
        shine('M80 52C92 46 110 46 122 54');
    case 'long':
      return `<path d="M${L - 2} 112C${L - 6} 62 78 40 100 40C122 40 ${R + 6} 62 ${R + 2} 112C${R - 2} 88 ${R - 4} 70 ${R - 14} 60C114 56 104 52 100 48C96 52 86 56 ${L + 14} 60C${L + 4} 70 ${L + 2} 88 ${L - 2} 112Z" fill="${fill}"/>` +
        shine('M100 50C108 52 118 56 124 62');
    case 'wavy':
      return `<path d="M${L - 3} 110C${L - 8} 62 78 40 102 40C124 40 ${R + 8} 62 ${R + 3} 104C${R - 2} 90 ${R - 2} 78 ${R - 10} 70C114 70 96 64 86 54C82 64 ${L + 6} 72 ${L + 2} 84C${L} 92 ${L - 1} 100 ${L - 3} 110Z" fill="${fill}"/>` +
        shine('M86 48C98 44 114 46 124 54');
    case 'braid': {
      let out = `<path d="M${L - 1} 98C${L - 6} 60 78 40 100 40C122 40 ${R + 6} 60 ${R + 1} 98C${R - 2} 80 ${R - 6} 70 ${R - 14} 64C112 60 96 56 90 50C84 60 ${L + 8} 68 ${L - 1} 98Z" fill="${fill}"/>`;
      for (let i = 0; i < 6; i++) {
        const y = 112 + i * 13;
        const x = 132 - i * 2.5;
        out += `<ellipse cx="${x}" cy="${y}" rx="${9 - i * 0.6}" ry="8" fill="${fill}" stroke="${hd}" stroke-width="1"/>`;
      }
      out += `<path d="M118 192l6 -8 6 8" fill="none" stroke="${hd}" stroke-width="1.5"/>`;
      return out + shine('M88 48C100 44 114 46 124 54');
    }
    case 'ponytail':
      return `<path d="M${L - 1} 94C${L - 6} 58 80 42 100 42C120 42 ${R + 4} 58 ${R + 1} 94C${R - 3} 78 ${R - 8} 68 ${R - 16} 64C112 62 94 58 ${L + 12} 64C${L + 4} 72 ${L + 1} 82 ${L - 1} 94Z" fill="${fill}"/>` +
        `<path d="M${L + 14} 64C92 56 112 58 ${R - 10} 62" fill="none" stroke="${hd}" stroke-width="1.2" opacity=".5"/>` +
        `<rect x="128" y="70" width="8" height="6" rx="2" fill="#b8323c" transform="rotate(30 132 73)"/>` +
        shine('M84 50C96 46 110 46 122 52');
    case 'bun':
      return `<path d="M${L - 1} 96C${L - 6} 60 80 42 100 42C120 42 ${R + 6} 60 ${R + 1} 96C${R - 3} 78 ${R - 6} 68 ${R - 12} 62C112 56 92 56 ${L + 12} 62C${L + 6} 68 ${L + 3} 78 ${L - 1} 96Z" fill="${fill}"/>` +
        `<path d="M${L + 12} 62C88 52 112 52 ${R - 12} 62" fill="none" stroke="${hd}" stroke-width="1" opacity=".5"/>` +
        shine('M82 52C94 46 108 46 120 52');
    case 'chignon':
      return `<path d="M${L - 1} 96C${L - 6} 60 80 42 100 42C120 42 ${R + 6} 60 ${R + 1} 96C${R - 3} 80 ${R - 6} 70 ${R - 12} 64C112 58 92 56 ${L + 10} 62C${L + 5} 70 ${L + 2} 80 ${L - 1} 96Z" fill="${fill}"/>` +
        `<g fill="none" stroke="${hd}" stroke-width="1" opacity=".45"><path d="M${L + 10} 62C86 50 112 50 ${R - 6} 60"/><path d="M${L + 6} 72C88 58 112 58 ${R - 4} 70"/></g>`;
    default:
      return '';
  }
}

function eyes(spec, id) {
  const iris = IRIS[spec.iris];
  const [, sm, sd] = SKIN[spec.skin];
  const lidColor = shade(sd, -0.35);
  let out = '';
  for (const [cx, dir] of [[86, -1], [114, 1]]) {
    const y = 95;
    out += `<path d="M${cx - 8} ${y}C${cx - 5} ${y - 5} ${cx + 5} ${y - 5} ${cx + 8} ${y}C${cx + 5} ${y + 4} ${cx - 5} ${y + 4} ${cx - 8} ${y}Z" fill="#fbf7f1"/>`;
    out += `<circle cx="${cx + 0.5}" cy="${y}" r="4.3" fill="${iris}"/><circle cx="${cx + 0.5}" cy="${y}" r="4.3" fill="none" stroke="${shade(iris, -0.4)}" stroke-width=".8"/>`;
    out += `<circle cx="${cx + 0.5}" cy="${y}" r="2" fill="#120c08"/><circle cx="${cx + 2}" cy="${y - 1.6}" r="1.3" fill="#fff"/>`;
    if (spec.lids === 'heavy') {
      out += `<path d="M${cx - 9} ${y - 0.5}C${cx - 5} ${y - 7} ${cx + 5} ${y - 7} ${cx + 9} ${y - 0.5}C${cx + 5} ${y - 2.5} ${cx - 5} ${y - 2.5} ${cx - 9} ${y - 0.5}Z" fill="${sm}"/>`;
    }
    const lidY = spec.lids === 'heavy' ? y - 1.5 : y - 3.6;
    out += `<path d="M${cx - 8.5} ${y}C${cx - 5} ${lidY - 1.5} ${cx + 5} ${lidY - 1.5} ${cx + 8.5} ${y}" fill="none" stroke="${lidColor}" stroke-width="${spec.lashes ? 2.4 : 1.7}" stroke-linecap="round"/>`;
    if (spec.lashes) out += `<path d="M${cx + 8 * dir} ${y - 0.5}l${3 * dir} -2.6" stroke="${lidColor}" stroke-width="1.6" stroke-linecap="round"/>`;
    out += `<path d="M${cx - 6} ${y + 4.6}C${cx - 2} ${y + 6} ${cx + 2} ${y + 6} ${cx + 6} ${y + 4.6}" fill="none" stroke="${sd}" stroke-width="1" opacity=".55"/>`;
    if (spec.wrinkles) out += `<path d="M${cx + 11 * dir} ${y - 1}l${3 * dir} -1.5M${cx + 11 * dir} ${y + 2}l${3 * dir} 1" stroke="${sd}" stroke-width=".9" opacity=".7"/>`;
  }
  return out;
}

function brows(spec) {
  const color = shade(HAIR[spec.hair][2], spec.hair === 'white' || spec.hair === 'platinum' ? -0.35 : 0);
  const thick = { bushy: 4.4, stern: 3.4, soft: 2.8, raised: 2.8, arched: 2.4, thin: 1.8, worried: 2.6, skeptic: 3 }[spec.brows] || 2.8;
  // [inner y, peak y, outer y] per side; side 0 is the viewer's left brow
  const shapes = {
    stern: [[83, 82, 84], [83, 82, 84]],
    soft: [[84, 81, 83], [84, 81, 83]],
    raised: [[81, 77, 80], [81, 77, 80]],
    arched: [[84, 78, 82], [84, 78, 82]],
    thin: [[83, 80, 82], [83, 80, 82]],
    bushy: [[84, 81, 84], [84, 81, 84]],
    worried: [[80, 81, 85], [80, 81, 85]],
    skeptic: [[84, 82, 84], [82, 76, 80]],
  }[spec.brows];
  let out = '';
  shapes.forEach(([inner, peak, outer], side) => {
    const dir = side === 0 ? -1 : 1;
    const xi = 100 + dir * 6, xo = 100 + dir * 24;
    const xp = 100 + dir * 16;
    out += `<path d="M${xi} ${inner}Q${xp} ${peak - 2} ${xo} ${outer}" fill="none" stroke="${color}" stroke-width="${thick}" stroke-linecap="round"/>`;
  });
  return out;
}

function nose(spec) {
  const [, , sd] = SKIN[spec.skin];
  const c = shade(sd, -0.1);
  const n = {
    small: 'M101 100C102 106 104 110 102 112C100 113 98 112.5 96.5 111.5',
    button: 'M101 102C103 107 104 110 101 111.5C99 112.2 97.5 112 96 111',
    long: 'M101 96C103 104 106 110 103 113.5C100 115 97 114.5 95.5 113',
    round: 'M101 100C104 106 107 110 103 113C100 114.5 97 114 95 112.5',
    wide: 'M101 101C103 106 108 109 105 113C101 115 97 115 93 112.5',
  }[spec.nose];
  return `<path d="${n}" fill="none" stroke="${c}" stroke-width="1.7" stroke-linecap="round" opacity=".85"/>` +
    `<ellipse cx="104" cy="104" rx="3" ry="6" fill="${sd}" opacity=".18"/>` +
    `<ellipse cx="97" cy="105" rx="2.2" ry="4" fill="#fff" opacity=".18"/>`;
}

function mouth(spec) {
  const [, sm, sd] = SKIN[spec.skin];
  const lip = spec.lips || shade(sm, -0.22);
  const line = shade(sd, -0.4);
  const y = 124;
  switch (spec.mouth) {
    case 'smile':
      return `<path d="M89 ${y - 1}C94 ${y + 6} 106 ${y + 6} 111 ${y - 1}C106 ${y + 2} 94 ${y + 2} 89 ${y - 1}Z" fill="${lip}"/>` +
        `<path d="M89 ${y - 1}C94 ${y + 3} 106 ${y + 3} 111 ${y - 1}" fill="none" stroke="${line}" stroke-width="1.6" stroke-linecap="round"/>`;
    case 'grin':
      return `<path d="M87 ${y - 2}C92 ${y + 9} 108 ${y + 9} 113 ${y - 2}Z" fill="#5a1f1c"/>` +
        `<path d="M89 ${y - 1.5}H111C110 ${y + 1.5} 90 ${y + 1.5} 89 ${y - 1.5}Z" fill="#fffaf2"/>` +
        `<path d="M87 ${y - 2}C92 ${y + 9} 108 ${y + 9} 113 ${y - 2}" fill="none" stroke="${lip}" stroke-width="2"/>` +
        `<path d="M85 ${y - 4}C86 ${y - 2} 86 ${y} 87 ${y - 1}M115 ${y - 4}C114 ${y - 2} 114 ${y} 113 ${y - 1}" stroke="${sd}" stroke-width="1" opacity=".6"/>`;
    case 'open':
      return `<ellipse cx="100" cy="${y + 1}" rx="6" ry="4.6" fill="#5a1f1c"/><path d="M95 ${y - 1.5}H105C104 ${y} 96 ${y} 95 ${y - 1.5}Z" fill="#fffaf2"/>` +
        `<ellipse cx="100" cy="${y + 1}" rx="6" ry="4.6" fill="none" stroke="${lip}" stroke-width="1.8"/>`;
    case 'smirk':
      return `<path d="M90 ${y + 1}C96 ${y + 3} 104 ${y + 2} 111 ${y - 3}C105 ${y + 5} 95 ${y + 5} 90 ${y + 1}Z" fill="${lip}"/>` +
        `<path d="M90 ${y + 1}C97 ${y + 2.5} 104 ${y + 1.5} 111 ${y - 3}" fill="none" stroke="${line}" stroke-width="1.5" stroke-linecap="round"/>`;
    case 'frown':
      return `<path d="M91 ${y + 3}C95 ${y - 1} 105 ${y - 1} 109 ${y + 3}" fill="none" stroke="${line}" stroke-width="1.8" stroke-linecap="round"/>` +
        `<path d="M94 ${y + 3}C98 ${y + 5} 102 ${y + 5} 106 ${y + 3}" fill="none" stroke="${lip}" stroke-width="2.4" opacity=".7"/>`;
    case 'purse':
      return `<ellipse cx="100" cy="${y}" rx="5" ry="3.4" fill="${lip}"/><path d="M96 ${y}H104" stroke="${line}" stroke-width="1.1"/>`;
    case 'shy':
      return `<path d="M93 ${y}C97 ${y + 3} 103 ${y + 3} 107 ${y}" fill="none" stroke="${line}" stroke-width="1.7" stroke-linecap="round"/>` +
        `<path d="M95 ${y + 2.4}C98 ${y + 4.4} 102 ${y + 4.4} 105 ${y + 2.4}" fill="none" stroke="${lip}" stroke-width="2" opacity=".6"/>`;
    default: // flat
      return `<path d="M91 ${y}C96 ${y + 1.4} 104 ${y + 1.4} 109 ${y}" fill="none" stroke="${line}" stroke-width="1.7" stroke-linecap="round"/>` +
        `<path d="M93 ${y + 2}C97 ${y + 4.6} 103 ${y + 4.6} 107 ${y + 2}" fill="none" stroke="${lip}" stroke-width="2.2" opacity=".65"/>`;
  }
}

function facialHair(spec, id, f) {
  const fill = `url(#${id}hr)`;
  const [, hm, hd] = HAIR[spec.hair];
  const jaw = f.jaw, chin = f.chin;
  switch (spec.facial) {
    case 'mustache':
      return `<path d="M88 120C92 114 98 115 100 117C102 115 108 114 112 120C108 119 104 120 100 120C96 120 92 119 88 120Z" fill="${fill}"/>`;
    case 'pencil':
      return `<path d="M90 119C94 117 98 117 100 118C102 117 106 117 110 119" fill="none" stroke="${hd}" stroke-width="1.8" stroke-linecap="round"/>`;
    case 'stubble': {
      const rng = seeded(7);
      return `<path d="M${100 - jaw - 6} 112C${100 - jaw} 136 92 ${chin} 100 ${chin}C108 ${chin} ${100 + jaw} 136 ${100 + jaw + 6} 112C${100 + jaw} 126 110 132 100 132C90 132 ${100 - jaw} 126 ${100 - jaw - 6} 112Z" fill="${hm}" opacity=".22"/>` +
        `<g fill="${hd}" opacity=".35">${Array.from({ length: 46 }, () => {
          const a = rng() * Math.PI;
          const r = 0.6 + rng() * 0.4;
          return `<circle cx="${(100 + Math.cos(a) * (jaw + 2) * r).toFixed(1)}" cy="${(118 + Math.sin(a) * (chin - 118) * r).toFixed(1)}" r=".7"/>`;
        }).join('')}</g>`;
    }
    case 'trimmed':
      return `<path d="M${100 - f.w + 1} 100C${100 - f.w + 3} 126 88 ${chin + 2} 100 ${chin + 2}C112 ${chin + 2} ${100 + f.w - 3} 126 ${100 + f.w - 1} 100C${100 + f.w - 6} 118 112 128 100 128C88 128 ${100 - f.w + 6} 118 ${100 - f.w + 1} 100Z" fill="${fill}"/>` +
        `<path d="M89 120C93 115 98 116 100 117C102 116 107 115 111 120C106 119 94 119 89 120Z" fill="${fill}"/>`;
    case 'fullbeard':
      return `<path d="M${100 - f.w} 98C${100 - f.w} 132 86 ${chin + 10} 100 ${chin + 10}C114 ${chin + 10} ${100 + f.w} 132 ${100 + f.w} 98C${100 + f.w - 6} 116 112 128 100 128C88 128 ${100 - f.w + 6} 116 ${100 - f.w} 98Z" fill="${fill}"/>` +
        `<path d="M86 121C92 113 98 115 100 117C102 115 108 113 114 121C108 119 92 119 86 121Z" fill="${fill}"/>` +
        `<g fill="none" stroke="${hd}" stroke-width=".9" opacity=".4"><path d="M88 136c2 6 4 9 6 11M100 138v10M112 136c-2 6-4 9-6 11"/></g>`;
    case 'bigbeard':
      return `<path d="M${100 - f.w - 1} 94C${100 - f.w - 4} 140 82 ${chin + 22} 100 ${chin + 22}C118 ${chin + 22} ${100 + f.w + 4} 140 ${100 + f.w + 1} 94C${100 + f.w - 6} 114 112 129 100 129C88 129 ${100 - f.w + 6} 114 ${100 - f.w - 1} 94Z" fill="${fill}"/>` +
        `<path d="M85 122C91 112 98 115 100 117C102 115 109 112 115 122C109 119 91 119 85 122Z" fill="${fill}"/>` +
        `<g fill="none" stroke="${HAIR[spec.hair][0]}" stroke-width="1.2" opacity=".45" stroke-linecap="round"><path d="M84 136c2 8 6 14 10 18M100 140v16M116 136c-2 8-6 14-10 18M74 120c2 8 4 14 8 20M126 120c-2 8-4 14-8 20"/></g>`;
    default:
      return '';
  }
}

function accessories(spec, f) {
  let out = '';
  const [, , sd] = SKIN[spec.skin];
  if (spec.freckles) {
    const rng = seeded(31);
    out += `<g fill="${shade(sd, -0.1)}" opacity=".5">${Array.from({ length: 18 }, () => {
      const side = rng() < 0.5 ? -1 : 1;
      return `<circle cx="${(100 + side * (8 + rng() * 14)).toFixed(1)}" cy="${(104 + rng() * 8).toFixed(1)}" r="${(0.7 + rng() * 0.6).toFixed(1)}"/>`;
    }).join('')}</g>`;
  }
  if (spec.mole) out += `<circle cx="113" cy="117" r="1.4" fill="#3a2418"/>`;
  if (spec.wrinkles) out += `<path d="M88 115C86 119 87 122 89 124M112 115C114 119 113 122 111 124" fill="none" stroke="${sd}" stroke-width="1" opacity=".55"/><path d="M90 66C96 64 104 64 110 66" fill="none" stroke="${sd}" stroke-width=".9" opacity=".4"/>`;
  switch (spec.glasses) {
    case 'round':
      out += '<g fill="#fff" fill-opacity=".14" stroke="#3a2a20" stroke-width="2"><circle cx="86" cy="95" r="10.5"/><circle cx="114" cy="95" r="10.5"/></g>';
      out += '<path d="M96.5 94C99 92 101 92 103.5 94M75.5 93L66 90M124.5 93L134 90" stroke="#3a2a20" stroke-width="2" fill="none"/>';
      out += '<path d="M80 89l5 -3M108 89l5 -3" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>';
      break;
    case 'square':
      out += '<g fill="#fff" fill-opacity=".12" stroke="#16121a" stroke-width="2.6"><rect x="74" y="87" width="23" height="16" rx="4"/><rect x="103" y="87" width="23" height="16" rx="4"/></g>';
      out += '<path d="M97 93H103M74 92L66 90M126 92L134 90" stroke="#16121a" stroke-width="2.4"/>';
      out += '<path d="M78 91l6 -2M107 91l6 -2" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".75"/>';
      break;
    case 'cateye':
      out += '<g fill="#fff" fill-opacity=".14" stroke="#7a1f3d" stroke-width="2.4"><path d="M73 89C80 86 92 87 97 90C97 98 92 103 85 103C78 103 74 97 73 89Z"/><path d="M127 89C120 86 108 87 103 90C103 98 108 103 115 103C122 103 126 97 127 89Z"/></g>';
      out += '<path d="M97 92H103M73 89L68 84M127 89L132 84" stroke="#7a1f3d" stroke-width="2.4" fill="none" stroke-linecap="round"/>';
      break;
    case 'half':
      out += '<g fill="#fff" fill-opacity=".14" stroke="#4b3a2a" stroke-width="2"><path d="M75 96H97C97 103 92 105 86 105C80 105 75 103 75 96Z"/><path d="M103 96H125C125 103 120 105 114 105C108 105 103 103 103 96Z"/></g>';
      out += '<path d="M97 97C99 95 101 95 103 97M75 96L66 92M125 96L134 92" stroke="#4b3a2a" stroke-width="1.8" fill="none"/>';
      break;
    default:
      break;
  }
  const L = 100 - f.w, R = 100 + f.w;
  switch (spec.earrings) {
    case 'hoop':
      out += `<g fill="none" stroke="#d4a632" stroke-width="2"><circle cx="${L - 1}" cy="114" r="5.5"/><circle cx="${R + 1}" cy="114" r="5.5"/></g>`;
      break;
    case 'pearl':
      out += `<g fill="#fbf6ec" stroke="#cfc3ae" stroke-width=".6"><circle cx="${L - 1}" cy="108" r="2.8"/><circle cx="${R + 1}" cy="108" r="2.8"/></g>`;
      break;
    case 'stud':
      out += `<g fill="#f2c23a"><circle cx="${L - 1}" cy="107" r="2.2"/><circle cx="${R + 1}" cy="107" r="2.2"/></g>`;
      break;
    case 'drop':
      out += `<g fill="#b8243a" stroke="#d4a632" stroke-width=".8"><path d="M${L - 1} 106v4"/><path d="M${R + 1} 106v4"/><ellipse cx="${L - 1}" cy="114" rx="2.4" ry="3.6"/><ellipse cx="${R + 1}" cy="114" rx="2.4" ry="3.6"/></g>`;
      break;
    default:
      break;
  }
  return out;
}

function necklace(spec) {
  if (spec.necklace !== 'pearls') return '';
  let out = '<g fill="#fbf6ec" stroke="#cdbfa8" stroke-width=".5">';
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const x = 82 + t * 36;
    const y = 150 + Math.sin(t * Math.PI) * 10;
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.3"/>`;
  }
  return `${out}</g>`;
}

function hat(spec) {
  if (spec.hat !== 'beret') return '';
  return '<path d="M60 64C58 42 88 30 112 32C138 34 150 50 140 62C128 56 80 54 60 64Z" fill="#a3242f"/>' +
    '<path d="M62 62C82 54 124 54 140 60" fill="none" stroke="#6e121b" stroke-width="2.4"/>' +
    '<path d="M110 32l3 -7" stroke="#6e121b" stroke-width="3" stroke-linecap="round"/>' +
    '<path d="M76 44C90 36 108 34 122 38" fill="none" stroke="#d6535d" stroke-width="2" opacity=".6"/>';
}

function portrait(spec, slug, { sepia = false } = {}) {
  const id = `p${slug}`;
  const f = FACES[spec.face];
  const [, sm, sd] = SKIN[spec.skin];
  const head = headPath(f);
  const L = 100 - f.w, R = 100 + f.w;
  const body = [
    `<rect width="200" height="200" fill="url(#${id}bg)"/>`,
    `<circle cx="100" cy="96" r="78" fill="#fff" opacity=".12"/>`,
    hairBack(spec, id),
    clothing(spec, id),
    `<path d="M85 118V148C91 158 109 158 115 148V118Z" fill="url(#${id}nk)"/>`,
    `<path d="M80 148C88 156 112 156 120 148" fill="none" stroke="${sd}" stroke-width="1.2" opacity=".35"/>`,
    necklace(spec),
    `<ellipse cx="${L}" cy="98" rx="6.5" ry="10.5" fill="${sm}"/><ellipse cx="${L + 1}" cy="98" rx="3" ry="6" fill="${sd}" opacity=".45"/>`,
    `<ellipse cx="${R}" cy="98" rx="6.5" ry="10.5" fill="${sm}"/><ellipse cx="${R - 1}" cy="98" rx="3" ry="6" fill="${sd}" opacity=".45"/>`,
    `<path d="${head}" fill="url(#${id}sk)"/>`,
    `<path d="${head}" fill="url(#${id}sh)"/>`,
    `<clipPath id="${id}hc"><path d="${head}"/></clipPath><g clip-path="url(#${id}hc)" opacity=".32"><g transform="translate(1 4)" fill="${sd}">${hairFront({ ...spec, hair: spec.hair }, `${id}s`, f).replace(/fill="(?!none)[^"]+"/g, `fill="${sd}"`).replace(/stroke="[^"]+"/g, 'stroke="none"')}</g></g>`,
    `<ellipse cx="84" cy="112" rx="8" ry="4.5" fill="#e0706a" opacity=".16"/><ellipse cx="116" cy="112" rx="8" ry="4.5" fill="#e0706a" opacity=".16"/>`,
    `<path d="M${100 - f.jaw} 129C${100 - f.jaw + 6} ${f.chin} 94 ${f.chin} 100 ${f.chin}C106 ${f.chin} ${100 + f.jaw - 6} ${f.chin} ${100 + f.jaw} 129" fill="none" stroke="${sd}" stroke-width="3" opacity=".25"/>`,
    accessories(spec, f),
    eyes(spec, id),
    brows(spec),
    nose(spec),
    facialHair(spec, id, f),
    mouth(spec),
    hairFront(spec, id, f),
    hat(spec),
    `<rect width="200" height="200" fill="url(#${id}vg)"/>`,
  ].join('');
  const filter = sepia
    ? `<filter id="${id}sp" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values=".31 .6 .11 0 .03 .27 .52 .1 0 .01 .21 .41 .08 0 0 0 0 0 1 0"/></filter>`
    : '';
  const wrapOpen = sepia ? `<g filter="url(#${id}sp)">` : '<g>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="18 14 164 164" width="164" height="164" role="img">` +
    `${defs(spec, id)}${filter ? `<defs>${filter}</defs>` : ''}${wrapOpen}${body}</g></svg>\n`;
}

// ------------------------------------------------------------------- output
function write(dir, entries, options) {
  const target = new URL(`${dir}/`, OUT);
  mkdirSync(target, { recursive: true });
  let total = 0;
  for (const [slug, spec] of Object.entries(entries)) {
    const svg = portrait(spec, slug, options);
    writeFileSync(new URL(`${slug}.svg`, target), svg);
    total += svg.length;
  }
  return total;
}

const bytes = write('portraits', SUSPECTS) + write('victims', VICTIMS, { sepia: true });
console.log(`${Object.keys(SUSPECTS).length} suspects, ${Object.keys(VICTIMS).length} victims, ${bytes} bytes`);
