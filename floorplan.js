// Illustrated floorplan renderer: turns a case grid into a top-down interior
// (floor materials, walls with ambient shadow, doors, furniture, chalk outline).
// Pure string builder — app.js injects the result into the board.
(function floorplanModule(global) {
  const UNIT = 100; // one grid cell, in SVG user units

  // Floor material and furniture set per room name. Unknown rooms fall back
  // to parquet with a plant, so new generator rooms still render.
  const ROOM_ART = {
    Cuisine: { floor: 'tiles', items: ['kitchen', 'plant'] },
    Salon: { floor: 'parquet', items: ['sofa', 'lamp'], rug: true },
    'Bibliothèque': { floor: 'darkwood', items: ['books', 'armchair'] },
    Grenier: { floor: 'planks', items: ['trunk', 'crates'] },
    Chambre: { floor: 'carpet', items: ['bed', 'lamp'] },
    Serre: { floor: 'terracotta', items: ['plants', 'plant'] },
    Cave: { floor: 'stone', items: ['barrels', 'rack'] },
    Bureau: { floor: 'parquet', items: ['desk', 'books'] },
    Hall: { floor: 'marble', items: ['coat', 'plant'], rug: true },
    'Salle à manger': { floor: 'basket', items: ['dining', 'plant'] },
    'Véranda': { floor: 'terracotta', items: ['wicker', 'plants'] },
    Atelier: { floor: 'concrete', items: ['bench', 'easel'] },
  };

  function shade(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const mix = (c) => Math.max(0, Math.min(255, Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)));
    const r = mix(n >> 16), g = mix((n >> 8) & 255), b = mix(n & 255);
    return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
  }

  function hashString(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
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

  // ------------------------------------------------------------- floor patterns
  function floorPattern(kind, id, c) {
    const d = shade(c, -0.1);
    const e = shade(c, -0.26);
    const l = shade(c, 0.32);
    const open = (w, h, extra = '') => `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${w}" height="${h}"${extra}>`;
    switch (kind) {
      case 'tiles':
        return `${open(50, 50)}<rect width="50" height="50" fill="${c}"/><rect width="25" height="25" fill="${l}"/><rect x="25" y="25" width="25" height="25" fill="${l}"/>` +
          `<path d="M0 .5H50M0 25.5H50M.5 0V50M25.5 0V50" stroke="${d}" stroke-width="1.2"/></pattern>`;
      case 'marble':
        return `${open(60, 60, ' patternTransform="rotate(45)"')}<rect width="60" height="60" fill="${l}"/><rect width="30" height="30" fill="${c}"/><rect x="30" y="30" width="30" height="30" fill="${c}"/>` +
          `<path d="M2 40C14 34 20 46 34 38S52 44 58 36" fill="none" stroke="${d}" stroke-width=".9" opacity=".7"/><path d="M0 .5H60M0 30.5H60M.5 0V60M30.5 0V60" stroke="${shade(c, 0.5)}" stroke-width="1.2"/></pattern>`;
      case 'parquet':
      case 'darkwood': {
        const base = kind === 'darkwood' ? shade(c, -0.12) : c;
        const alt = shade(base, -0.06);
        const line = shade(base, -0.3);
        return `${open(100, 40)}<rect width="100" height="20" fill="${base}"/><rect y="20" width="50" height="20" fill="${alt}"/><rect x="50" y="20" width="50" height="20" fill="${shade(base, 0.05)}"/>` +
          `<path d="M0 .5H100M0 20.5H100M.5 0V20M50.5 20V40" stroke="${line}" stroke-width="1.1"/>` +
          `<path d="M8 8C30 6 50 11 92 8M14 31C26 29 36 33 46 31M58 28C70 26 82 30 96 27" fill="none" stroke="${line}" stroke-width=".6" opacity=".45"/></pattern>`;
      }
      case 'planks':
        return `${open(50, 200)}<rect width="25" height="200" fill="${c}"/><rect x="25" width="25" height="200" fill="${d}"/>` +
          `<path d="M.5 0V200M25.5 0V200M0 .5H25M25 100.5H50" stroke="${e}" stroke-width="1.3"/>` +
          `<g fill="${e}"><circle cx="5" cy="6" r="1.4"/><circle cx="20" cy="6" r="1.4"/><circle cx="30" cy="106" r="1.4"/><circle cx="45" cy="106" r="1.4"/></g>` +
          `<path d="M6 40C10 60 8 80 12 96M32 130C36 150 34 170 40 190" fill="none" stroke="${e}" stroke-width=".6" opacity=".4"/></pattern>`;
      case 'carpet':
        return `${open(24, 24)}<rect width="24" height="24" fill="${c}"/><path d="M12 0L24 12L12 24L0 12Z" fill="none" stroke="${d}" stroke-width="1"/>` +
          `<circle cx="12" cy="12" r="1.6" fill="${l}"/><circle cx="0" cy="0" r="1.2" fill="${d}"/><circle cx="24" cy="24" r="1.2" fill="${d}"/></pattern>`;
      case 'terracotta':
        return `${open(50, 50)}<rect width="50" height="50" fill="${l}"/>` +
          `<rect x="1.5" y="1.5" width="22" height="22" rx="2" fill="${c}"/><rect x="26.5" y="1.5" width="22" height="22" rx="2" fill="${d}"/>` +
          `<rect x="1.5" y="26.5" width="22" height="22" rx="2" fill="${shade(c, -0.04)}"/><rect x="26.5" y="26.5" width="22" height="22" rx="2" fill="${shade(c, 0.06)}"/></pattern>`;
      case 'stone':
        return `${open(100, 100)}<rect width="100" height="100" fill="${shade(c, 0.4)}"/>` +
          [[2, 2, 52, 36, c], [56, 2, 42, 36, d], [2, 40, 32, 58, d], [36, 40, 62, 28, shade(c, 0.06)], [36, 70, 36, 28, c], [74, 70, 24, 28, shade(c, -0.05)]]
            .map(([x, y, w, h, f]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${f}"/>`).join('') +
          `<path d="M12 14l6 4M70 20l8-3M50 82l5 3" stroke="${e}" stroke-width=".8" opacity=".5"/></pattern>`;
      case 'basket': {
        const plank = (x, y, horizontal) => {
          let s = '';
          for (let i = 0; i < 3; i++) {
            const o = i * (25 / 3);
            s += horizontal
              ? `<rect x="${x}" y="${(y + o).toFixed(2)}" width="25" height="${(25 / 3).toFixed(2)}" fill="${i % 2 ? d : c}" stroke="${e}" stroke-width=".7"/>`
              : `<rect x="${(x + o).toFixed(2)}" y="${y}" width="${(25 / 3).toFixed(2)}" height="25" fill="${i % 2 ? d : c}" stroke="${e}" stroke-width=".7"/>`;
          }
          return s;
        };
        return `${open(50, 50)}${plank(0, 0, true)}${plank(25, 0, false)}${plank(0, 25, false)}${plank(25, 25, true)}</pattern>`;
      }
      case 'concrete': {
        const rng = seeded(hashString(id));
        let specks = '';
        for (let i = 0; i < 40; i++) {
          specks += `<circle cx="${(rng() * 100).toFixed(1)}" cy="${(rng() * 100).toFixed(1)}" r="${(0.6 + rng() * 1.2).toFixed(1)}" fill="${rng() < 0.5 ? e : l}" opacity=".5"/>`;
        }
        return `${open(100, 100)}<rect width="100" height="100" fill="${c}"/>${specks}<path d="M0 .5H100M.5 0V100" stroke="${d}" stroke-width="1.4"/></pattern>`;
      }
      default:
        return floorPattern('parquet', id, c);
    }
  }

  // ------------------------------------------------------------------ furniture
  // Each drawing lives in a 100×100 cell with its "back" against the top wall;
  // the placer rotates it so the back touches whichever wall the cell has.
  const WOOD = '#8a5a35';
  const WOOD_DARK = '#5e3a20';
  const LINEN = '#f4efe6';
  const shadow = (shape) => `<g transform="translate(3 4)" fill="#2b1d12" opacity=".2">${shape}</g>`;

  function furniture(kind, c) {
    const fabric = shade(c, -0.45);
    const fabricLight = shade(c, -0.28);
    switch (kind) {
      case 'kitchen':
        return shadow('<rect x="6" y="5" width="88" height="26" rx="3"/>') +
          `<rect x="6" y="5" width="88" height="26" rx="3" fill="#ebe6dd" stroke="#9c9285" stroke-width="1.5"/>` +
          '<g fill="#3a3734"><circle cx="20" cy="18" r="6"/><circle cx="36" cy="18" r="6"/></g><g fill="none" stroke="#7c766f" stroke-width="1"><circle cx="20" cy="18" r="3"/><circle cx="36" cy="18" r="3"/></g>' +
          '<rect x="60" y="10" width="26" height="16" rx="5" fill="#c9d3d8" stroke="#8a979e" stroke-width="1.2"/><circle cx="73" cy="11" r="1.8" fill="#8a979e"/>';
      case 'sofa':
        return shadow('<rect x="12" y="5" width="76" height="30" rx="8"/>') +
          `<rect x="12" y="5" width="76" height="30" rx="8" fill="${fabric}"/><rect x="18" y="13" width="31" height="18" rx="5" fill="${fabricLight}"/><rect x="51" y="13" width="31" height="18" rx="5" fill="${fabricLight}"/>` +
          `<rect x="12" y="5" width="76" height="9" rx="4" fill="${shade(fabric, -0.2)}"/>`;
      case 'lamp':
        return '<circle cx="84" cy="16" r="12" fill="#ffe9a8" opacity=".55"/>' + shadow('<circle cx="84" cy="16" r="7"/>') +
          `<circle cx="84" cy="16" r="7" fill="#f3d27a" stroke="${WOOD_DARK}" stroke-width="1.5"/><circle cx="84" cy="16" r="2" fill="${WOOD_DARK}"/>`;
      case 'books': {
        const spines = ['#7a2e2e', '#2f4f6b', '#c19a3e', '#3f5e3a', '#6b3f6b', '#8a5a35', '#2b2b3a', '#a04a2a', '#3a6b6b', '#7a6a2e'];
        let s = shadow('<rect x="4" y="4" width="92" height="17" rx="2"/>') + `<rect x="4" y="4" width="92" height="17" rx="2" fill="${WOOD_DARK}"/>`;
        let x = 7;
        for (let i = 0; x < 92; i++) {
          const w = 4 + (i * 7) % 4;
          s += `<rect x="${x}" y="6" width="${Math.min(w, 93 - x)}" height="13" fill="${spines[i % spines.length]}"/>`;
          x += w + 0.8;
        }
        return s;
      }
      case 'armchair':
        return shadow('<rect x="68" y="66" width="26" height="26" rx="7"/>') +
          `<rect x="68" y="66" width="26" height="26" rx="7" fill="${fabric}"/><rect x="73" y="71" width="16" height="16" rx="4" fill="${fabricLight}"/>`;
      case 'trunk':
        return shadow('<rect x="8" y="6" width="44" height="26" rx="3"/>') +
          `<rect x="8" y="6" width="44" height="26" rx="3" fill="${WOOD}" stroke="${WOOD_DARK}" stroke-width="1.5"/>` +
          '<path d="M20 6V32M40 6V32" stroke="#b8a67a" stroke-width="3"/><rect x="27" y="16" width="6" height="7" rx="1" fill="#d8c48a"/>';
      case 'crates':
        return shadow('<rect x="66" y="64" width="28" height="28"/>') +
          `<rect x="66" y="64" width="28" height="28" fill="#b8915c" stroke="${WOOD_DARK}" stroke-width="1.5"/><path d="M66 64L94 92M94 64L66 92" stroke="${WOOD_DARK}" stroke-width="1.5"/>`;
      case 'bed':
        return shadow('<rect x="16" y="4" width="68" height="78" rx="4"/>') +
          `<rect x="16" y="4" width="68" height="78" rx="4" fill="${LINEN}" stroke="#b9ad99" stroke-width="1.2"/>` +
          `<rect x="16" y="4" width="68" height="8" rx="3" fill="${WOOD_DARK}"/><rect x="22" y="15" width="25" height="13" rx="5" fill="#fffdf8" stroke="#d6ccbb"/><rect x="53" y="15" width="25" height="13" rx="5" fill="#fffdf8" stroke="#d6ccbb"/>` +
          `<path d="M16 36H84V78C84 80 82 82 80 82H20C18 82 16 80 16 78Z" fill="${fabric}"/><path d="M16 42H84" stroke="${fabricLight}" stroke-width="3"/>`;
      case 'plants':
        return [[16, 16], [84, 18], [20, 84]].map(([x, y]) => shadow(`<circle cx="${x}" cy="${y}" r="10"/>`) +
          `<circle cx="${x}" cy="${y}" r="10" fill="#b8643a"/><circle cx="${x}" cy="${y}" r="8" fill="#3f6e3a"/>` +
          `<path d="M${x - 7} ${y}C${x - 3} ${y - 5} ${x + 3} ${y - 5} ${x + 7} ${y}M${x} ${y - 7}C${x + 4} ${y - 2} ${x + 4} ${y + 3} ${x} ${y + 7}" stroke="#7fae5a" stroke-width="1.6" fill="none"/>`).join('');
      case 'plant':
        return shadow('<circle cx="84" cy="84" r="10"/>') +
          '<circle cx="84" cy="84" r="10" fill="#c6763f"/><g fill="#4a7d3e"><ellipse cx="80" cy="80" rx="6" ry="3.5" transform="rotate(-35 80 80)"/><ellipse cx="88" cy="80" rx="6" ry="3.5" transform="rotate(35 88 80)"/><ellipse cx="84" cy="89" rx="6" ry="3.5"/></g>';
      case 'barrels':
        return [[22, 22], [52, 18]].map(([x, y]) => shadow(`<circle cx="${x}" cy="${y}" r="13"/>`) +
          `<circle cx="${x}" cy="${y}" r="13" fill="${WOOD}"/><circle cx="${x}" cy="${y}" r="13" fill="none" stroke="#4b4038" stroke-width="2.4"/><circle cx="${x}" cy="${y}" r="7.5" fill="none" stroke="#4b4038" stroke-width="1.4"/><circle cx="${x}" cy="${y}" r="2" fill="${WOOD_DARK}"/>`).join('');
      case 'rack': {
        let s = shadow('<rect x="72" y="40" width="22" height="54"/>') + `<rect x="72" y="40" width="22" height="54" fill="${WOOD_DARK}"/>`;
        for (let y = 46; y < 92; y += 9) s += `<circle cx="78" cy="${y}" r="3" fill="#4a1d2a"/><circle cx="88" cy="${y}" r="3" fill="#2d3a24"/>`;
        return s;
      }
      case 'desk':
        return shadow('<rect x="10" y="6" width="80" height="28" rx="2"/>') +
          `<rect x="10" y="6" width="80" height="28" rx="2" fill="${WOOD}" stroke="${WOOD_DARK}" stroke-width="1.5"/>` +
          '<rect x="22" y="12" width="20" height="14" fill="#fbf7ee" transform="rotate(-6 32 19)"/><rect x="26" y="14" width="20" height="14" fill="#fffdf8" stroke="#d6ccbb" stroke-width=".6" transform="rotate(5 36 21)"/>' +
          '<circle cx="76" cy="18" r="11" fill="#ffe9a8" opacity=".5"/><circle cx="76" cy="18" r="5" fill="#2f5a3e"/>' +
          `<circle cx="50" cy="46" r="9" fill="${fabric}"/>`;
      case 'coat':
        return shadow('<circle cx="16" cy="16" r="9"/>') +
          `<circle cx="16" cy="16" r="9" fill="${WOOD_DARK}"/><g stroke="${WOOD}" stroke-width="2.5" stroke-linecap="round"><path d="M16 16l-8-6M16 16l8-6M16 16l-7 8M16 16l7 8"/></g><circle cx="16" cy="16" r="3" fill="#c8a24a"/>`;
      case 'dining': {
        let s = shadow('<ellipse cx="50" cy="36" rx="36" ry="22"/>');
        for (const [x, y] of [[20, 12], [50, 6], [80, 12], [20, 60], [50, 66], [80, 60]]) s += `<rect x="${x - 7}" y="${y - 6}" width="14" height="12" rx="3" fill="${fabric}"/>`;
        s += `<ellipse cx="50" cy="36" rx="36" ry="22" fill="${WOOD}" stroke="${WOOD_DARK}" stroke-width="1.5"/><ellipse cx="50" cy="36" rx="28" ry="15" fill="none" stroke="${shade(WOOD, 0.2)}" stroke-width="1"/>`;
        s += '<circle cx="50" cy="36" r="5" fill="#fffdf8"/><circle cx="50" cy="36" r="2.4" fill="#c6463a"/>';
        return s;
      }
      case 'wicker':
        return [[18, 18], [50, 12]].map(([x, y]) => shadow(`<circle cx="${x}" cy="${y}" r="11"/>`) +
          `<circle cx="${x}" cy="${y}" r="11" fill="#d6b27a"/><circle cx="${x}" cy="${y}" r="11" fill="none" stroke="#9b7440" stroke-width="2" stroke-dasharray="2 2"/><circle cx="${x}" cy="${y + 1}" r="6" fill="${fabricLight}"/>`).join('');
      case 'bench':
        return shadow('<rect x="6" y="5" width="88" height="22" rx="2"/>') +
          `<rect x="6" y="5" width="88" height="22" rx="2" fill="#a77b4e" stroke="${WOOD_DARK}" stroke-width="1.5"/>` +
          '<path d="M16 14h18" stroke="#6b6f75" stroke-width="4" stroke-linecap="round"/><path d="M44 10l10 10M54 10l-10 10" stroke="#8a2f2f" stroke-width="2.4"/><rect x="66" y="10" width="20" height="10" rx="2" fill="#4a5a6b"/>';
      case 'easel':
        return shadow('<path d="M70 92L82 62L94 92Z"/>') +
          `<path d="M70 92L82 62L94 92" fill="none" stroke="${WOOD_DARK}" stroke-width="2.4"/><rect x="72" y="66" width="20" height="14" fill="#fffdf8" stroke="#b9ad99"/>` +
          '<circle cx="78" cy="72" r="2.6" fill="#c6463a"/><circle cx="85" cy="75" r="2.6" fill="#3f6d9a"/>';
      default:
        return '';
    }
  }

  function rug(w, h, c) {
    const deep = shade(c, -0.5);
    const mid = shade(c, -0.3);
    const W = w * UNIT, H = h * UNIT;
    return `<g opacity=".9"><rect x="20" y="22" width="${W - 40}" height="${H - 44}" rx="10" fill="${deep}"/>` +
      `<rect x="28" y="30" width="${W - 56}" height="${H - 60}" rx="7" fill="none" stroke="${shade(c, 0.35)}" stroke-width="2.5"/>` +
      `<rect x="40" y="42" width="${W - 80}" height="${H - 84}" rx="5" fill="${mid}"/>` +
      `<path d="M${W / 2} 52L${W - 52} ${H / 2}L${W / 2} ${H - 52}L52 ${H / 2}Z" fill="none" stroke="${shade(c, 0.35)}" stroke-width="2"/>` +
      `<g stroke="${shade(c, 0.2)}" stroke-width="1.4">${Array.from({ length: Math.floor((W - 48) / 8) }, (_, i) => `<path d="M${26 + i * 8} 16v6M${26 + i * 8} ${H - 22}v6"/>`).join('')}</g></g>`;
  }

  // ------------------------------------------------------------------ geometry
  function roomCells(puzzle, room) {
    const out = [];
    puzzle.cells.forEach((line, r) => line.forEach((value, c) => { if (value === room) out.push([r, c]); }));
    return out;
  }

  // Wall side of a cell, used to rotate furniture so it backs onto a wall.
  function wallSides(puzzle, r, c) {
    const n = puzzle.size;
    const room = puzzle.cells[r][c];
    const sides = [];
    if (r === 0 || puzzle.cells[r - 1][c] !== room) sides.push(0);
    if (c === n - 1 || puzzle.cells[r][c + 1] !== room) sides.push(90);
    if (r === n - 1 || puzzle.cells[r + 1][c] !== room) sides.push(180);
    if (c === 0 || puzzle.cells[r][c - 1] !== room) sides.push(270);
    return sides;
  }

  function findBlock(puzzle, room, w, h, avoid) {
    const n = puzzle.size;
    const hits = [];
    for (let r = 0; r + h <= n; r++) {
      for (let c = 0; c + w <= n; c++) {
        let ok = true;
        for (let dr = 0; dr < h && ok; dr++) {
          for (let dc = 0; dc < w && ok; dc++) {
            if (puzzle.cells[r + dr][c + dc] !== room) ok = false;
            if (avoid(r + dr, c + dc)) ok = false;
          }
        }
        if (ok) hits.push([r, c]);
      }
    }
    return hits;
  }

  // ------------------------------------------------------------- room labels
  // Font stack of the room plaques. Overridable (Floorplan.setLabelFont) so the
  // audit can re-render under any face the phone might fall back to.
  let LABEL_FONT = "Georgia, 'Noto Serif', 'DejaVu Serif', 'Liberation Serif', serif";
  const LETTER_SPACING = 0.05; // em, matches the letter-spacing attribute
  let measureCtx = null;

  // Advance width the browser will actually draw for `text` at `size` units,
  // letter-spacing included (SVG adds it after every glyph).
  function textWidth(text, size) {
    if (!measureCtx && typeof document !== 'undefined') measureCtx = document.createElement('canvas').getContext('2d');
    if (!measureCtx) return text.length * size * 0.85; // no DOM: conservative estimate
    measureCtx.font = `${size}px ${LABEL_FONT}`;
    return measureCtx.measureText(text).width + text.length * size * LETTER_SPACING;
  }

  // Every axis-aligned rectangle made only of `room` cells and free of `avoid`.
  function roomRects(puzzle, room, avoid) {
    const n = puzzle.size;
    const out = [];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        for (let h = 1; r + h <= n; h++) {
          for (let w = 1; c + w <= n; w++) {
            let ok = true;
            for (let dr = 0; dr < h && ok; dr++) {
              for (let dc = 0; dc < w && ok; dc++) {
                if (puzzle.cells[r + dr][c + dc] !== room || avoid(r + dr, c + dc)) ok = false;
              }
            }
            if (!ok) break; // wider rectangles from this corner fail too
            out.push([r, c, w, h]);
          }
        }
      }
    }
    return out;
  }

  function render(puzzle, colors) {
    const n = puzzle.size;
    const S = n * UNIT;
    const uid = `fp${hashString(puzzle.id).toString(36)}`;
    const [vr, vc] = puzzle.victim.cell;
    const isVictim = (r, c) => r === vr && c === vc;
    const defs = [];
    const floors = [];
    const decor = [];
    const rugs = [];

    const taken = new Set([`${vr},${vc}`]); // cells already busy with the body
    puzzle.rooms.forEach((room, i) => {
      const art = ROOM_ART[room.name] || { floor: 'parquet', items: ['plant'] };
      const color = colors[i % colors.length];
      const pid = `${uid}f${i}`;
      defs.push(floorPattern(art.floor, pid, color));
      const cells = roomCells(puzzle, i);
      // Overlap each tile by .5 unit so the room reads as one continuous floor.
      floors.push(`<g fill="url(#${pid})">${cells.map(([r, c]) => `<rect x="${c * UNIT - 0.5}" y="${r * UNIT - 0.5}" width="${UNIT + 1}" height="${UNIT + 1}"/>`).join('')}</g>`);

      const rng = seeded(hashString(`${puzzle.id}:${room.name}`));
      const used = new Set();
      if (art.rug) {
        const blocks = findBlock(puzzle, i, 2, 2, isVictim).concat(findBlock(puzzle, i, 2, 1, isVictim));
        if (blocks.length) {
          const [r, c] = blocks[Math.floor(rng() * blocks.length)];
          const big = findBlock(puzzle, i, 2, 2, isVictim).some(([a, b]) => a === r && b === c);
          rugs.push(`<g transform="translate(${c * UNIT} ${r * UNIT})">${rug(2, big ? 2 : 1, color)}</g>`);
        }
      }
      const free = cells.filter(([r, c]) => !isVictim(r, c));
      art.items.slice(0, cells.length >= 4 ? 2 : 1).forEach((item) => {
        const pool = free.filter(([r, c]) => !used.has(`${r},${c}`) && wallSides(puzzle, r, c).length);
        if (!pool.length) return;
        const [r, c] = pool[Math.floor(rng() * pool.length)];
        used.add(`${r},${c}`);
        taken.add(`${r},${c}`);
        const sides = wallSides(puzzle, r, c);
        const angle = sides[Math.floor(rng() * sides.length)];
        decor.push(`<g transform="translate(${c * UNIT} ${r * UNIT}) rotate(${angle} 50 50)">${furniture(item, color)}</g>`);
      });
    });

    // Room name tags: the map must be readable without opening the legend, so
    // every room carries its own label. Each plaque lives inside a real
    // rectangle of its own room's cells (never the victim's cell), inset from
    // the walls, and is sized from the width the device's font actually draws.
    const labels = [];
    const INSET = 10; // wall stroke half-width (4) + breathing room
    // Discreet on purpose: the name is a hint on the floor, not a headline.
    const MIN_SIZE = UNIT * 0.12;
    const MAX_SIZE = UNIT * 0.2;
    puzzle.rooms.forEach((room, i) => {
      const name = room.name.toUpperCase();
      const words = name.split(' ');
      const color = colors[i % colors.length];
      const cells = roomCells(puzzle, i);
      const centroidR = cells.reduce((sum, [r]) => sum + r, 0) / cells.length + 0.5;
      const centroidC = cells.reduce((sum, [, c]) => sum + c, 0) / cells.length + 0.5;

      // Greedy word wrap for a line budget, using measured widths.
      const wrap = (size, budget) => {
        const lines = [];
        let current = '';
        for (const word of words) {
          const test = current ? `${current} ${word}` : word;
          if (!current || textWidth(test, size) <= budget) current = test;
          else { lines.push(current); current = word; }
        }
        lines.push(current);
        return lines;
      };
      // Largest size whose plaque fits a length × thickness slot.
      const fit = (length, thickness) => {
        for (let size = MAX_SIZE; size >= MIN_SIZE; size -= 0.5) {
          const padX = size * 0.5;
          const lines = wrap(size, length - 2 * padX);
          const widest = Math.max(...lines.map((l) => textWidth(l, size)));
          const boxW = widest + 2 * padX;
          const boxH = lines.length * size * 1.14 + size * 0.44;
          if (boxW <= length && boxH <= thickness) return { size, lines, boxW, boxH };
        }
        return null;
      };

      let best = null;
      for (const [r, c, w, h] of roomRects(puzzle, i, isVictim)) {
        const W = w * UNIT - 2 * INSET;
        const H = h * UNIT - 2 * INSET;
        const busy = [...Array(w * h).keys()].filter((k) => taken.has(`${r + Math.floor(k / w)},${c + (k % w)}`)).length;
        const drift = Math.abs(r + h / 2 - centroidR) + Math.abs(c + w / 2 - centroidC);
        for (const vertical of h > w ? [false, true] : [false]) {
          const placed = vertical ? fit(H, W) : fit(W, H);
          if (!placed) continue;
          // Bigger type wins; vertical text and furniture underneath cost a little.
          const score = placed.size * (vertical ? 0.8 : 1) - busy * 1.5 - drift * 0.6;
          if (!best || score > best.score) best = { score, placed, vertical, cx: (c + w / 2) * UNIT, cy: (r + h / 2) * UNIT, rect: [r, c, w, h] };
        }
      }
      if (!best) return; // no slot can hold the name legibly: the legend still names the room

      const { size, lines, boxW, boxH } = best.placed;
      const lineHeight = size * 1.14;
      const text = lines.map((l, k) => `<text x="0" y="${(-boxH / 2 + size * 0.2 + lineHeight * (k + 0.82)).toFixed(2)}" `
        + `text-anchor="middle" font-family="${LABEL_FONT.replace(/"/g, "'")}" font-size="${size.toFixed(1)}" letter-spacing="${(size * LETTER_SPACING).toFixed(2)}" `
        // textLength pins the measured width: a font swap can never push glyphs out.
        + `textLength="${textWidth(l, size).toFixed(1)}" lengthAdjust="spacingAndGlyphs" fill="#241a12" fill-opacity=".84">${l}</text>`).join('');
      const turn = best.vertical ? ' rotate(-90)' : '';
      labels.push(
        `<g class="room-tag" data-room="${room.name}" data-rect="${best.rect.join(',')}" data-vertical="${best.vertical}" transform="translate(${best.cx} ${best.cy})${turn}" pointer-events="none">` +
        `<rect x="${(-boxW / 2).toFixed(2)}" y="${(-boxH / 2).toFixed(2)}" width="${boxW.toFixed(2)}" height="${boxH.toFixed(2)}" rx="${(size * 0.46).toFixed(2)}" fill="#fffdf6" fill-opacity=".52" stroke="${shade(color, 0.5)}" stroke-opacity=".28" stroke-width="1"/>` +
        text +
        '</g>',
      );
    });

    // Seams between cells of the same room keep the grid legible.
    const seams = [];
    const walls = [];
    const doorPairs = new Map();
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const room = puzzle.cells[r][c];
        if (c < n - 1) {
          const edge = { x1: (c + 1) * UNIT, y1: r * UNIT, x2: (c + 1) * UNIT, y2: (r + 1) * UNIT };
          if (puzzle.cells[r][c + 1] === room) seams.push(edge); else walls.push({ ...edge, key: [room, puzzle.cells[r][c + 1]].sort().join('-') });
        }
        if (r < n - 1) {
          const edge = { x1: c * UNIT, y1: (r + 1) * UNIT, x2: (c + 1) * UNIT, y2: (r + 1) * UNIT };
          if (puzzle.cells[r + 1][c] === room) seams.push(edge); else walls.push({ ...edge, key: [room, puzzle.cells[r + 1][c]].sort().join('-') });
        }
      }
    }
    walls.forEach((wall, i) => {
      if (!doorPairs.has(wall.key)) doorPairs.set(wall.key, []);
      doorPairs.get(wall.key).push(i);
    });
    const doors = new Set();
    for (const [key, list] of doorPairs) doors.add(list[hashString(puzzle.id + key) % list.length]);

    const line = (e) => `M${e.x1} ${e.y1}L${e.x2} ${e.y2}`;
    const wallPaths = [];
    const doorArt = [];
    walls.forEach((wall, i) => {
      if (!doors.has(i)) { wallPaths.push(line(wall)); return; }
      const vertical = wall.x1 === wall.x2;
      const a = 0.24, b = 0.76;
      const lerp = (t) => ({ x: wall.x1 + (wall.x2 - wall.x1) * t, y: wall.y1 + (wall.y2 - wall.y1) * t });
      const p1 = lerp(a), p2 = lerp(b);
      wallPaths.push(`M${wall.x1} ${wall.y1}L${p1.x} ${p1.y}`, `M${p2.x} ${p2.y}L${wall.x2} ${wall.y2}`);
      const len = (b - a) * UNIT;
      const leaf = vertical ? `M${p1.x} ${p1.y}L${p1.x + len * 0.7} ${p1.y + len * 0.7}` : `M${p1.x} ${p1.y}L${p1.x + len * 0.7} ${p1.y + len * 0.7}`;
      const arc = vertical
        ? `M${p2.x} ${p2.y}A${len} ${len} 0 0 0 ${p1.x + len * 0.7} ${p1.y + len * 0.7}`
        : `M${p2.x} ${p2.y}A${len} ${len} 0 0 1 ${p1.x + len * 0.7} ${p1.y + len * 0.7}`;
      doorArt.push(`<path d="${arc}" fill="none" stroke="#4a3b30" stroke-width="1.2" stroke-dasharray="3 3" opacity=".55"/><path d="${leaf}" stroke="#6e5240" stroke-width="3.2" stroke-linecap="round"/>`);
    });

    const chalk = `<g transform="translate(${vc * UNIT} ${vr * UNIT})">` +
      `<rect x="2" y="2" width="96" height="96" rx="10" fill="#20140f" opacity=".1"/>` +
      `<circle cx="50" cy="50" r="44" fill="none" stroke="#a3231f" stroke-width="1.6" stroke-dasharray="7 5" opacity=".55"/>` +
      `<g transform="rotate(-24 50 50) scale(1.18) translate(-7.6 -7.6)" fill="none" stroke="#fffdf6" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" filter="url(#${uid}chalk)" opacity=".95">` +
      '<circle cx="50" cy="20" r="8.5"/>' +
      '<path d="M44 29C40 32 33 34 26 30L18 34L28 38C34 40 40 40 43 42L41 58C39 66 34 74 30 84L37 86C41 78 46 70 50 62C54 70 58 78 64 86L71 83C66 74 61 66 59 58L57 42C61 40 67 40 72 36L82 30L73 28C66 32 60 32 56 29"/>' +
      '</g></g>';

    return `<svg class="plan-svg" viewBox="-8 -8 ${S + 16} ${S + 16}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">` +
      `<defs>${defs.join('')}` +
      `<filter id="${uid}ao" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="7"/></filter>` +
      `<filter id="${uid}chalk"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4"/><feDisplacementMap in="SourceGraphic" scale="2.6"/></filter>` +
      `<radialGradient id="${uid}light" cx=".22" cy=".16" r=".95"><stop offset="0" stop-color="#fff8e6" stop-opacity=".34"/><stop offset=".55" stop-color="#fff8e6" stop-opacity="0"/><stop offset="1" stop-color="#2a1c12" stop-opacity=".16"/></radialGradient>` +
      `</defs>` +
      `<rect x="-8" y="-8" width="${S + 16}" height="${S + 16}" rx="14" fill="#3b2e26"/>` +
      floors.join('') +
      rugs.join('') +
      `<path d="${wallPaths.join('')}M0 0H${S}V${S}H0Z" fill="none" stroke="#1c120c" stroke-width="22" opacity=".3" filter="url(#${uid}ao)"/>` +
      decor.join('') +
      `<path d="${seams.map(line).join('')}" stroke="#241610" stroke-opacity=".42" stroke-width="2.2" stroke-dasharray="4 5"/>` +
      chalk +
      doorArt.join('') +
      `<path d="${wallPaths.join('')}" stroke="#3b2e26" stroke-width="8" stroke-linecap="square"/>` +
      `<path d="${wallPaths.join('')}" stroke="#7d6656" stroke-width="2" stroke-linecap="square" transform="translate(-1 -1)" opacity=".7"/>` +
      `<rect x="-2" y="-2" width="${S + 4}" height="${S + 4}" rx="6" fill="none" stroke="#3b2e26" stroke-width="10"/>` +
      `<rect x="0" y="0" width="${S}" height="${S}" fill="url(#${uid}light)" pointer-events="none"/>` +
      // Labels are painted last: no wall stroke, seam or door arc may cross a name.
      labels.join('') +
      '</svg>';
  }

  // Small floor sample for the room legend: same material, same tint.
  function swatch(roomName, color, key) {
    const art = ROOM_ART[roomName] || { floor: 'parquet' };
    const id = `sw${key}`;
    return `<svg class="swatch-svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><defs>${floorPattern(art.floor, id, color)}</defs>` +
      `<rect width="100" height="100" fill="url(#${id})"/></svg>`;
  }

  function setLabelFont(stack) { LABEL_FONT = stack; }

  global.Floorplan = { render, swatch, shade, setLabelFont };
})(window);
