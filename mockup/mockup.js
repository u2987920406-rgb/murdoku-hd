// Clu&doku UI/UX mockup: four screens with one job each, hash-routed.
//   #/accueil            pick a case (the only screen that scrolls)
//   #/dossier[/N]        the case file and the rules of that case, one primary button
//   #/jeu[/N]            the board, the clues, the actions
//   #/resultat[/N]       the solved case
// A design artefact: real cases, art and board renderer, no game logic beyond
// navigation (and a few visual-only interactions on the board).
//   #/jeu/N?vue=…        screenshot states of the Jeu screen (see setupVue)
const ROOM_COLORS = ['#f0c2a2', '#c4dfb4', '#bfd2ee', '#ecd596', '#d8bde6', '#ade0dc', '#f0bccb', '#ddd3b0'];
const VICTIM_ART = {
  'Madame Rousseau': 'rousseau', 'le notaire Vasseur': 'vasseur', 'Monsieur Aubert': 'aubert',
  'Madame Le Goff': 'legoff', 'Monsieur Delaunay': 'delaunay', 'l’antiquaire Molina': 'molina',
};

// ------------------------------------------------------------- mock data
// Progress shown on Accueil (cases 1–2 solved, case 3 in progress).
const STATUS = { 1: 'resolue', 2: 'resolue', 3: 'encours' };
const CURRENT = 3;
const PLACED_AT_START = { 3: 3 }; // guests already on the board in a case in progress

// Rules per case. The shipped game uses STANDARD everywhere; cases 3 and 9 show
// how the Dossier reads when a rule changes (the variants are mockup data).
const STANDARD = { row: 1, col: 1, crime: 1 };
const RULES = {
  3: { row: 1, colMax: 2, crime: 1 },
  9: { row: 1, col: 1, roomMax: 3, crime: 1 },
};

const STATUS_LABEL = { resolue: 'Résolue', encours: 'En cours', decouvrir: 'À découvrir' };
const DIFFICULTY_NOTE = { Facile: '6 invités', Moyen: '7 invités', Difficile: '8 invités' };

let cases = [];
const placements = new Map(); // case number -> per suspect [row, col] | null
const view = { clue: 0, caseNo: null, rail: 0 };

// ----------------------------------------------------------------- helpers
const $ = (selector, root = document) => root.querySelector(selector);
const esc = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const slug = (name) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const portrait = (name) => `../assets/portraits/${slug(name)}.svg`;
const victimPhoto = (name) => `../assets/victims/${VICTIM_ART[name] || slug(name.split(' ').pop())}.svg`;
const agree = (gender, word) => (gender === 'f' ? `${word}e` : word);
const statusOf = (n) => STATUS[n] || 'decouvrir';
const rulesOf = (n) => RULES[n] || STANDARD;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const ICON = {
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5L12 5l8 6.5M6.5 10v9h11v-9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 19v-5h4v5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="2.2" fill="currentColor"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><circle cx="19" cy="12" r="2.2" fill="currentColor"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
};

// Rule pictograms: a 4×4 mini plan with the constrained line or room picked out.
function pictogram(kind) {
  const cells = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const on = (kind === 'row' && r === 1) || (kind === 'col' && c === 2) ||
        (kind === 'room' && r >= 2 && c <= 1) || (kind === 'crime' && r <= 1 && c >= 2);
      cells.push(`<rect x="${3 + c * 9}" y="${3 + r * 9}" width="8" height="8" rx="1.6" fill="${on ? (kind === 'crime' ? '#8a2433' : '#b8892f') : '#e6dccb'}"/>`);
    }
  }
  const dots = { row: [[1, 0], [1, 3]], col: [[0, 2], [3, 2]], room: [[2, 0], [3, 1]], crime: [[0, 3]] }[kind]
    .map(([r, c]) => `<circle cx="${7 + c * 9}" cy="${7 + r * 9}" r="2.4" fill="#fffcf6"/>`).join('');
  return `<svg class="picto" viewBox="0 0 42 42" aria-hidden="true">${cells.join('')}${dots}</svg>`;
}

// Plain-French rule lines; `unusual` flags a rule that departs from the standard set.
function ruleLines(rules) {
  const lines = [];
  const plural = (k, word) => `${word}${k > 1 ? 's' : ''}`;
  if (rules.row) lines.push({ kind: 'row', html: `<b>${rules.row}</b> ${plural(rules.row, 'invité')} par rangée`, unusual: rules.row !== 1 });
  if (rules.col) lines.push({ kind: 'col', html: `<b>${rules.col}</b> ${plural(rules.col, 'invité')} par colonne`, unusual: rules.col !== 1 });
  if (rules.colMax) lines.push({ kind: 'col', html: `<b>${rules.colMax}</b> invités maximum par colonne`, unusual: true });
  if (rules.roomMax) lines.push({ kind: 'room', html: `<b>${rules.roomMax}</b> invités maximum par pièce`, unusual: true });
  if (rules.crime) lines.push({ kind: 'crime', html: `<b>${rules.crime}</b> seul invité dans la pièce du crime : le coupable`, unusual: rules.crime !== 1 });
  return lines;
}

function header({ back, backLabel, eyebrow, title }) {
  return `<header class="bar">
    <a class="icon-btn" href="${back}" aria-label="${esc(backLabel)}">${ICON.back}</a>
    <div class="bar-title"><span class="eyebrow">${esc(eyebrow)}</span><strong>${esc(title)}</strong></div>
    <a class="icon-btn" href="#/accueil" aria-label="Accueil">${ICON.home}</a>
  </header>`;
}

// Clue text verbatim, each suspect name gaining its portrait.
function clueHtml(text, puzzle) {
  const names = puzzle.suspects.map((s) => s.name).sort((a, b) => b.length - a.length);
  return text.split(new RegExp(`(${names.join('|')})`, 'u')).map((part) => {
    if (!names.includes(part)) return esc(part);
    return `<span class="who"><img src="${portrait(part)}" alt="" width="26" height="26">${esc(part)}</span>`;
  }).join('');
}

function placementOf(puzzle) {
  if (!placements.has(puzzle.number)) {
    const start = PLACED_AT_START[puzzle.number] || 0;
    placements.set(puzzle.number, puzzle.suspects.map((_, s) => (s < start ? puzzle.solution[s] : null)));
  }
  return placements.get(puzzle.number);
}

// ---------------------------------------------------------- Jeu: model
// Placement model shown by the mockup (visual only, no validation):
//   tap a chip            arm that guest; tap it again, ✕, Échap or anything unmarked: disarm
//   while armed           ring + plus = free cell, place her there; ⇄ badge = her row or
//                         column is taken, placing her there sends that guest back to
//                         the rail (shown, with Annuler); every other cell is neutral
//   tap a placed guest    select him: the bar offers Déplacer / Retirer
const ui = { armed: null, moving: false, selected: null, notice: null };
const resetUi = () => Object.assign(ui, { armed: null, moving: false, selected: null, notice: null });

const DIRECTIONS = [
  { re: /à l['’]est/, dir: 'E', word: 'Est', of: "de l'est" },
  { re: /à l['’]ouest/, dir: 'O', word: 'Ouest', of: "de l'ouest" },
  { re: /au nord/, dir: 'N', word: 'Nord', of: 'du nord' },
  { re: /au sud/, dir: 'S', word: 'Sud', of: 'du sud' },
];
const directionOf = (text) => DIRECTIONS.find((d) => d.re.test(text)) || null;

// Guests standing in the row or the column of a cell (the guest himself aside).
function conflicts(placement, s, r, c) {
  return placement.map((slot, i) => (i !== s && slot && (slot[0] === r || slot[1] === c) ? i : -1)).filter((i) => i >= 0);
}

function place(puzzle, s, r, c) {
  const placement = placementOf(puzzle);
  const before = placement.map((slot) => slot && slot.slice());
  const displaced = conflicts(placement, s, r, c);
  displaced.forEach((i) => { placement[i] = null; });
  placement[s] = [r, c];
  resetUi();
  if (displaced.length) ui.notice = { kind: 'swap', who: s, displaced, before };
}

const roomAt = (puzzle, r, c) => puzzle.rooms[puzzle.cells[r][c]];

function boardHtml(puzzle, placement) {
  const n = puzzle.size;
  const [vr, vc] = puzzle.victim.cell;
  const active = ui.armed;
  let cells = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const room = roomAt(puzzle, r, c).name;
      const who = placement.findIndex((slot) => slot && slot[0] === r && slot[1] === c);
      if (r === vr && c === vc) {
        cells += `<span class="cell body${active !== null ? ' muted' : ''}" role="img" aria-label="Corps de ${esc(puzzle.victim.name)}, ${esc(room)}"><svg viewBox="0 0 40 34" aria-hidden="true"><path d="M4 32L14 4H26L36 32Z" fill="#f2c230" stroke="#3b2e26" stroke-width="2.2" stroke-linejoin="round"/><path d="M15.5 25L20 12L24.5 25M17 21H23" fill="none" stroke="#1f1712" stroke-width="2.6" stroke-linecap="round"/></svg></span>`;
        continue;
      }
      if (who >= 0) {
        const name = puzzle.suspects[who].name;
        const ghost = ui.moving && who === active;
        const selected = ui.selected === who;
        const cls = ['cell', 'has-token', active !== null && !ghost ? 'muted' : '', ghost ? 'ghost' : '', selected ? 'selected' : ''].join(' ').trim();
        const label = ghost ? `${name}, en cours de déplacement` : selected ? `${name}, sélectionné` : name;
        cells += `<button type="button" class="${cls}" data-r="${r}" data-c="${c}" aria-label="${esc(label)}, ${esc(room)}">` +
          `<span class="token"><img src="${portrait(name)}" alt="" width="80" height="80"></span>` +
          (selected ? '<svg class="frame" viewBox="0 0 100 100" aria-hidden="true"><path d="M4 26V4h22M74 4h22v22M96 74v22H74M26 96H4V74"/></svg>' : '') +
          '</button>';
        continue;
      }
      if (active !== null) {
        const others = conflicts(placement, active, r, c);
        const verb = ui.moving ? 'Déplacer' : 'Poser';
        const armedName = puzzle.suspects[active].name;
        if (others.length) {
          const names = others.map((i) => puzzle.suspects[i].name).join(' et ');
          cells += `<button type="button" class="cell swap muted" data-r="${r}" data-c="${c}" aria-label="${verb} ${esc(armedName)} ici, ${esc(room)} : ${esc(names)} revien${others.length > 1 ? 'nent' : 't'} dans la liste">` +
            '<svg class="swap-badge" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9h11l-3-3M18 15H7l3 3"/></svg></button>';
        } else {
          cells += `<button type="button" class="cell target" data-r="${r}" data-c="${c}" aria-label="${verb} ${esc(armedName)} ici, ${esc(room)}">` +
            '<svg class="spot" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="33" stroke-dasharray="9 6"/><path d="M50 38v24M38 50h24"/></svg></button>';
        }
        continue;
      }
      cells += `<button type="button" class="cell" data-r="${r}" data-c="${c}" aria-label="Case libre, ${esc(room)}"></button>`;
    }
  }
  const lit = directionOf(puzzle.clues[view.clue]);
  const plan = window.Floorplan.render(puzzle, ROOM_COLORS);
  const at = plan.indexOf('<g class="room-tag"');
  const withRose = at < 0 ? plan.replace('</svg>', `${roseSvg(lit)}</svg>`) : plan.slice(0, at) + roseSvg(lit) + plan.slice(at);
  return `<div class="board" style="--n:${n}">
    <div class="plan">${withRose}</div>
    ${compassHtml(lit)}
    <div class="cells" style="grid-template-columns:repeat(${n}, minmax(0, 1fr))">${cells}</div>
  </div>`;
}

// Compass, in two layers. The rose is drawn inside the plan SVG, before the room
// labels, so a label is always painted over it and never hidden. The four
// letters are HTML above the plan and below the tokens; they sit on the grid
// intersections one cell from the centre, where a token (centred in its cell,
// 78 % wide) cannot reach. placeCompass() picks the centre intersection.
function roseSvg(lit) {
  const arrow = lit ? {
    N: 'M0 -14V-58M-11 -48L0 -62L11 -48', S: 'M0 14V58M-11 48L0 62L11 48',
    E: 'M14 0H58M48 -11L62 0L48 11', O: 'M-14 0H-58M-48 -11L-62 0L-48 11',
  }[lit.dir] : '';
  return `<g class="rose${lit ? ' lit' : ''}" pointer-events="none">
    <circle r="36" class="ring"/>
    <path class="star" d="M0 -70L8 -8L70 0L8 8L0 70L-8 8L-70 0L-8 -8Z"/>
    <path class="north" d="M0 -70L8 -8L0 0L-8 -8Z"/>
    ${lit ? `<path class="arrow" d="${arrow}"/>` : ''}
  </g>`;
}

function compassHtml(lit) {
  const label = `Boussole : nord en haut, sud en bas, est à droite, ouest à gauche${lit ? ` ; le témoignage parle ${lit.of}` : ''}`;
  return `<div class="compass-layer">
    <div class="compass${lit ? ' lit' : ''}" data-dir="${lit ? lit.dir : ''}" role="img" aria-label="${esc(label)}">
      ${['N', 'E', 'S', 'O'].map((d) => `<span class="mark ${d}${lit && lit.dir === d ? ' on' : ''}" aria-hidden="true">${d}</span>`).join('')}
    </div>
  </div>`;
}

function placeCompass(root, puzzle) {
  const compass = $('.compass', root);
  const cells = $('.cells', root);
  if (!compass || !cells) return;
  const n = puzzle.size;
  const box = cells.getBoundingClientRect();
  const unit = box.width / n;
  const plaques = [...root.querySelectorAll('.plan .room-tag')].map((g) => g.getBoundingClientRect());
  const chip = 13 + 2; // letter radius + margin, px
  // Circle-against-rectangle test: only the letters must stay clear of labels.
  const hits = (x, y) => plaques.some((p) => Math.hypot(x - Math.max(p.left, Math.min(x, p.right)), y - Math.max(p.top, Math.min(y, p.bottom))) < chip);
  const candidates = [];
  for (let i = 1; i < n; i++) for (let j = 1; j < n; j++) candidates.push([i, j, Math.hypot(i - n / 2, j - n / 2)]);
  candidates.sort((a, b) => a[2] - b[2]);
  const free = candidates.find(([i, j]) => {
    const x = box.left + j * unit;
    const y = box.top + i * unit;
    return ![[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dy]) => hits(x + dx * unit, y + dy * unit));
  }) || candidates[0];
  compass.style.left = `${(free[1] / n) * 100}%`;
  compass.style.top = `${(free[0] / n) * 100}%`;
  const rose = $('.plan .rose', root);
  if (rose) rose.setAttribute('transform', `translate(${8 + free[1] * 100} ${8 + free[0] * 100})`);
  compass.dataset.at = `${free[0]},${free[1]}`;
  compass.dataset.offset = free[2].toFixed(2);
}

// ------------------------------------------------------------------ screens
function renderAccueil() {
  const solved = cases.filter((c) => statusOf(c.number) === 'resolue').length;
  const current = cases[CURRENT - 1];
  const placed = placementOf(current).filter(Boolean).length;
  const groups = ['Facile', 'Moyen', 'Difficile'].map((difficulty) => {
    const items = cases.filter((c) => c.difficulty === difficulty).map((c) => {
      const status = statusOf(c.number);
      return `<li><a class="case-row" href="#/dossier/${c.number}">
        <span class="case-no" aria-hidden="true">${c.number}</span>
        <span class="case-text"><strong>Affaire n°${c.number}</strong><span>${esc(c.victim.name)} · ${c.size}×${c.size}</span></span>
        <span class="pill ${status}">${STATUS_LABEL[status]}</span>
      </a></li>`;
    }).join('');
    return `<section class="group" aria-labelledby="g-${difficulty}">
      <h2 id="g-${difficulty}">${difficulty} <span>${DIFFICULTY_NOTE[difficulty]}</span></h2>
      <ul class="case-list">${items}</ul>
    </section>`;
  }).join('');

  return `<div class="page home">
    <header class="brand-bar">
      <img src="../assets/ui/emblem.svg" alt="" width="48" height="48">
      <div><strong class="wordmark">Clu&amp;doku</strong><span>Affaires de déduction</span></div>
    </header>
    <p class="progress"><b>${solved}</b> affaires résolues sur ${cases.length}</p>
    <a class="resume" href="#/jeu/${current.number}">
      <span class="resume-plan" aria-hidden="true">${window.Floorplan.render(current, ROOM_COLORS)}</span>
      <span class="resume-text">
        <span class="eyebrow">Reprendre</span>
        <strong>Affaire n°${current.number}</strong>
        <span>${current.difficulty} · ${current.size}×${current.size} · ${placed} invités placés sur ${current.size}</span>
      </span>
      <span class="resume-go" aria-hidden="true">${ICON.next}</span>
    </a>
    ${groups}
  </div>`;
}

function renderDossier(puzzle) {
  const n = puzzle.number;
  const status = statusOf(n);
  const lines = ruleLines(rulesOf(n)).map((line) => `<li class="${line.unusual ? 'unusual' : ''}">
      ${pictogram(line.kind)}<span>${line.html}${line.unusual ? ' <em class="flag">Inhabituel</em>' : ''}</span>
    </li>`).join('');
  const cta = status === 'encours' ? "Reprendre l'enquête" : status === 'resolue' ? 'Revoir l’enquête' : "Commencer l'enquête";

  return `<div class="page fit dossier">
    ${header({ back: '#/accueil', backLabel: "Retour à la liste des affaires", eyebrow: `${puzzle.difficulty} · ${puzzle.size}×${puzzle.size}`, title: `Affaire n°${n}` })}
    <div class="content">
      <figure class="victim">
        <img src="${victimPhoto(puzzle.victim.name)}" alt="Photo d'archive : ${esc(puzzle.victim.name)}" width="88" height="88">
        <figcaption>
          <span class="eyebrow">Victime</span>
          <strong>${esc(puzzle.victim.name)}</strong>
          <span>Corps retrouvé ${esc(puzzle.victim.loc)}</span>
        </figcaption>
      </figure>
      <p class="lede">${puzzle.size} invités cette nuit-là. Un seul est resté ${esc(puzzle.victim.loc)} avec le corps : trouvez-le.</p>
      <section class="rules" aria-labelledby="rules-title">
        <h2 id="rules-title">Règles de cette affaire</h2>
        <p class="rules-note">Elles changent d'une affaire à l'autre.</p>
        <ul>${lines}</ul>
      </section>
      <section class="cast" aria-labelledby="cast-title">
        <h2 id="cast-title">Les invités</h2>
        <div class="faces">${puzzle.suspects.map((s) => `<img src="${portrait(s.name)}" alt="${esc(s.name)}" title="${esc(s.name)}" width="44" height="44">`).join('')}</div>
      </section>
    </div>
    <footer class="dock">
      <p class="dock-note">${puzzle.clues.length} témoignages vous attendent</p>
      <a class="btn primary" href="#/jeu/${n}">${cta}</a>
    </footer>
  </div>`;
}

// Instruction bar: one line, fixed height, always present so arming never shifts the layout.
function promptHtml(puzzle) {
  const name = (i) => esc(puzzle.suspects[i].name);
  const face = (i) => `<img src="${portrait(puzzle.suspects[i].name)}" alt="" width="32" height="32">`;
  const cancel = '<button type="button" class="icon-btn" data-action="cancel" aria-label="Annuler">' + ICON.close + '</button>';
  if (ui.armed !== null) {
    return `<div class="prompt armed" role="status">${face(ui.armed)}<p>Touchez une case pour ${ui.moving ? 'déplacer' : 'poser'} <b>${name(ui.armed)}</b></p>${cancel}</div>`;
  }
  if (ui.selected !== null) {
    return `<div class="prompt selected" role="status"><p><b>${name(ui.selected)}</b></p>
      <button type="button" class="btn small" data-action="move">Déplacer</button>
      <button type="button" class="btn small" data-action="remove">Retirer</button>${cancel}</div>`;
  }
  if (ui.notice && ui.notice.kind === 'swap') {
    const back = ui.notice.displaced;
    return `<div class="prompt swap" role="status">${face(back[0])}<p><b>${back.map(name).join(' et ')}</b> revien${back.length > 1 ? 'nent' : 't'} dans la liste</p>
      <button type="button" class="btn small" data-action="undo">Annuler</button></div>`;
  }
  return '<div class="prompt" role="status"><svg class="hand" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11V5.5a1.5 1.5 0 013 0V10m0-1.5a1.5 1.5 0 013 0V11m0-1a1.5 1.5 0 013 0v4.5a6 6 0 01-6 6h-.6a6 6 0 01-4.6-2.2L4.6 15a1.5 1.5 0 012.3-1.9L9 15"/></svg><p>Choisissez un invité, puis une case</p></div>';
}

function railHtml(puzzle, placement) {
  const returned = ui.notice && ui.notice.kind === 'swap' ? ui.notice.displaced : [];
  return puzzle.suspects.map((s, i) => {
    const state = ui.armed === i ? 'armed' : ui.selected === i ? 'selected' : returned.includes(i) ? 'returned' : placement[i] ? 'placed' : 'idle';
    const badge = {
      armed: '<path d="M12 5v9m-4-4l4 4 4-4M7 19h10"/>',
      selected: '<path d="M5 9V5h4M15 5h4v4M19 15v4h-4M9 19H5v-4"/>',
      returned: '<path d="M9 7L5 11l4 4M5 11h9a5 5 0 010 10h-2"/>',
      placed: '<path d="M6 12.5l4 4 8-9"/>',
      idle: '',
    }[state];
    const status = { armed: 'prêt à poser', selected: 'sélectionné', returned: 'revenu dans la liste', placed: agree(s.gender, 'placé'), idle: 'à placer' }[state];
    return `<button type="button" class="chip ${state}" data-guest="${i}" aria-pressed="${state === 'armed' || state === 'selected'}" aria-label="${esc(s.name)}, ${status}">
      <span class="face"><img src="${portrait(s.name)}" alt="" width="40" height="40">${badge ? `<svg class="badge" viewBox="0 0 24 24" aria-hidden="true">${badge}</svg>` : ''}</span>
      <span class="name">${esc(s.name)}</span>
    </button>`;
  }).join('');
}

// Clue text verbatim; a direction word is marked the way the compass lights it.
function clueWithDirection(text, puzzle) {
  const lit = directionOf(text);
  let html = clueHtml(text, puzzle);
  if (lit) {
    html = html.replace(lit.re, (match) => `<mark class="dir" data-dir="${lit.dir}">${match}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h12m-5-5l5 5-5 5"/></svg></mark>`);
  }
  return html;
}

function renderJeu(puzzle) {
  const placement = placementOf(puzzle);
  const placed = placement.filter(Boolean).length;
  const total = puzzle.clues.length;
  view.clue = Math.min(view.clue, total - 1);
  const lit = directionOf(puzzle.clues[view.clue]);

  return `<div class="page fit jeu" data-n="${puzzle.size}">
    ${header({ back: `#/dossier/${puzzle.number}`, backLabel: 'Retour au dossier', eyebrow: `${placed} / ${puzzle.size} placés`, title: `Affaire n°${puzzle.number}` })}
    <div class="stage">
    ${boardHtml(puzzle, placement)}
    <section class="clue-card" aria-label="Témoignages">
      <div class="clue-head">
        <button type="button" class="icon-btn" data-clue="-1" aria-label="Témoignage précédent" ${view.clue === 0 ? 'disabled' : ''}>${ICON.back}</button>
        <div class="clue-count">Témoignage ${view.clue + 1} / ${total}${lit ? `<span class="dir-tag" data-dir="${lit.dir}">${lit.word}</span>` : ''}</div>
        <button type="button" class="icon-btn" data-clue="1" aria-label="Témoignage suivant" ${view.clue === total - 1 ? 'disabled' : ''}>${ICON.next}</button>
      </div>
      <div class="clue-body"><p class="clue-text" id="clue-text">${clueWithDirection(puzzle.clues[view.clue], puzzle)}</p></div>
    </section>
    </div>
    ${promptHtml(puzzle)}
    <div class="rail" role="group" aria-label="Invités">${railHtml(puzzle, placement)}</div>
    <nav class="actions" aria-label="Actions">
      <a class="btn primary" href="#/resultat/${puzzle.number}">Vérifier</a>
      <button type="button" class="btn" data-action="hint">Indice</button>
      <button type="button" class="btn icon" data-action="menu" aria-label="Plus d'actions" aria-expanded="false" aria-controls="more-menu">${ICON.more}</button>
      <div class="menu" id="more-menu" hidden>
        <button type="button" data-action="reveal">Voir la solution</button>
        <button type="button" data-action="clear">Effacer la grille</button>
        <a href="#/dossier/${puzzle.number}">Règles de l'affaire</a>
      </div>
    </nav>
    <div class="toast" id="toast" role="status" hidden></div>
  </div>`;
}

function renderResultat(puzzle) {
  const killer = puzzle.suspects[puzzle.killer.index];
  const next = cases[puzzle.number % cases.length];
  return `<div class="page fit resultat">
    ${header({ back: `#/jeu/${puzzle.number}`, backLabel: 'Retour à la grille', eyebrow: `Affaire n°${puzzle.number}`, title: 'Affaire résolue' })}
    <div class="content verdict">
      <div class="culprit">
        <img src="${portrait(killer.name)}" alt="Portrait de ${esc(killer.name)}" width="168" height="168">
        <span class="stamp" aria-hidden="true">Coupable</span>
      </div>
      <h1>${esc(killer.name)}, coupable</h1>
      <p>${agree(killer.gender, 'Seul')} ${esc(puzzle.victim.loc)} avec ${esc(puzzle.victim.name)}.</p>
      <dl class="stats">
        <div><dt>Essais</dt><dd>2</dd></div>
        <div><dt>Indices</dt><dd>1</dd></div>
        <div><dt>Temps</dt><dd>6 min</dd></div>
      </dl>
    </div>
    <footer class="dock">
      <a class="btn primary" href="#/dossier/${next.number}">Affaire suivante</a>
      <a class="btn" href="#/jeu/${puzzle.number}">Revoir la grille</a>
    </footer>
  </div>`;
}

// ------------------------------------------------------------- interactions
function bindJeu(puzzle) {
  const root = $('#screen');
  const placement = placementOf(puzzle);
  const menuButton = $('[data-action="menu"]', root);
  const menu = $('#more-menu', root);
  const rail = $('.rail', root);
  rail.scrollLeft = view.rail || 0;
  rail.addEventListener('scroll', () => { view.rail = rail.scrollLeft; });
  const reveal = (i) => { const chip = rail.children[i]; if (chip) chip.scrollIntoView({ inline: 'nearest', block: 'nearest' }); };
  placeCompass(root, puzzle);

  const setMenu = (open) => { menu.hidden = !open; menuButton.setAttribute('aria-expanded', String(open)); };
  const on = (action, fn) => { const node = $(`[data-action="${action}"]`, root); if (node) node.addEventListener('click', fn); };
  const toast = (text) => {
    const box = $('#toast', root);
    box.textContent = text;
    box.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { box.hidden = true; }, 3200);
  };
  const cancel = () => { resetUi(); render(); };

  root.querySelectorAll('[data-clue]').forEach((button) => button.addEventListener('click', () => {
    view.clue += Number(button.dataset.clue);
    render();
  }));
  menuButton.addEventListener('click', () => setMenu(menu.hidden));
  on('hint', () => {
    const s = placement.findIndex((slot) => !slot);
    const who = puzzle.suspects[s < 0 ? 0 : s];
    const [r, c] = puzzle.solution[s < 0 ? 0 : s];
    toast(`Indice : ${who.name} était ${roomAt(puzzle, r, c).loc}.`);
  });
  on('reveal', () => { puzzle.solution.forEach((slot, s) => { placement[s] = slot; }); resetUi(); render(); });
  on('clear', () => { placement.fill(null); resetUi(); render(); });
  on('cancel', cancel);
  on('move', () => { Object.assign(ui, { armed: ui.selected, moving: true, selected: null, notice: null }); render(); });
  on('remove', () => { placement[ui.selected] = null; resetUi(); render(); });
  on('undo', () => { ui.notice.before.forEach((slot, i) => { placement[i] = slot; }); resetUi(); render(); });

  // Chips: arm, disarm, or select a guest already on the board.
  rail.querySelectorAll('[data-guest]').forEach((chip) => chip.addEventListener('click', () => {
    const s = Number(chip.dataset.guest);
    if (ui.armed === s) { resetUi(); render(); return; }
    resetUi();
    if (placement[s]) ui.selected = s; else ui.armed = s;
    render();
    reveal(s);
  }));

  // Cells: place on a marked cell, select a placed guest; anything else cancels.
  root.querySelectorAll('.cell[data-r]').forEach((cell) => cell.addEventListener('click', (event) => {
    event.stopPropagation();
    const r = Number(cell.dataset.r);
    const c = Number(cell.dataset.c);
    const who = placement.findIndex((slot) => slot && slot[0] === r && slot[1] === c);
    if (ui.armed !== null) {
      if (cell.classList.contains('target') || cell.classList.contains('swap')) place(puzzle, ui.armed, r, c);
      else resetUi(); // unmarked: neutral, cancels
      render();
      return;
    }
    resetUi();
    if (who >= 0) ui.selected = who;
    render();
    if (who >= 0) reveal(who);
  }));
  // The board's background (frame, walls, the body's cell) and the stage around it cancel.
  $('.stage', root).addEventListener('click', (event) => {
    if (event.target.closest('.cell[data-r], .clue-card')) return;
    if (ui.armed !== null || ui.selected !== null || ui.notice) cancel();
  });

  document.onkeydown = (event) => {
    if (event.key !== 'Escape') return;
    if (!menu.hidden) setMenu(false);
    else cancel();
  };
}

// Screenshot states: #/jeu/N?vue=arme|place|deplacer|echange|boussole|direction.
function setupVue(puzzle, vue) {
  placements.delete(puzzle.number);
  const placement = placementOf(puzzle);
  resetUi();
  view.clue = 0;
  view.rail = 0;
  const firstFree = () => placement.findIndex((slot) => !slot);
  const firstPlaced = () => {
    let s = placement.findIndex(Boolean);
    if (s < 0) { s = 0; placement[0] = puzzle.solution[0]; }
    return s;
  };
  const clueAbout = (s, wantDirection) => {
    const name = puzzle.suspects[s].name;
    const k = puzzle.clues.findIndex((t) => t.includes(name) && Boolean(directionOf(t)) === wantDirection);
    return k < 0 ? 0 : k;
  };
  if (vue === 'arme') { ui.armed = firstFree(); view.clue = clueAbout(ui.armed, false); }
  if (vue === 'place') { ui.selected = firstPlaced(); view.clue = clueAbout(ui.selected, true); }
  if (vue === 'deplacer') { ui.armed = firstPlaced(); ui.moving = true; view.clue = clueAbout(ui.armed, true); }
  if (vue === 'echange') {
    const s = firstFree();
    const n = puzzle.size;
    const [vr, vc] = puzzle.victim.cell;
    for (let k = 0; k < n * n; k++) {
      const r = Math.floor(k / n);
      const c = k % n;
      const taken = placement.some((slot) => slot && slot[0] === r && slot[1] === c);
      if (!taken && !(r === vr && c === vc) && conflicts(placement, s, r, c).length === 1) { place(puzzle, s, r, c); break; }
    }
  }
  if (vue === 'boussole') view.clue = Math.max(0, puzzle.clues.findIndex((t) => !directionOf(t)));
  if (vue === 'direction') view.clue = Math.max(0, puzzle.clues.findIndex((t) => directionOf(t)));
}

// ------------------------------------------------------------------- router
function parse() {
  const [, name = 'accueil', num, query = ''] = location.hash.match(/^#\/(\w+)(?:\/(\d+))?(?:\?(.*))?/) || [];
  const caseNo = Math.min(Math.max(Number(num) || CURRENT, 1), cases.length);
  const vue = new URLSearchParams(query).get('vue');
  return { name: ['accueil', 'dossier', 'jeu', 'resultat'].includes(name) ? name : 'accueil', caseNo, vue };
}

function render() {
  const { name, caseNo } = parse();
  const puzzle = cases[caseNo - 1];
  if (view.caseNo !== caseNo) { view.clue = 0; view.rail = 0; view.caseNo = caseNo; resetUi(); }
  const screen = $('#screen');
  screen.dataset.route = name;
  document.onkeydown = null;
  screen.innerHTML = {
    accueil: renderAccueil,
    dossier: () => renderDossier(puzzle),
    jeu: () => renderJeu(puzzle),
    resultat: () => renderResultat(puzzle),
  }[name]();
  document.title = `Clu&doku — ${{ accueil: 'Accueil', dossier: 'Dossier', jeu: 'Jeu', resultat: 'Résultat' }[name]}`;
  if (name === 'jeu') bindJeu(puzzle);
}

// A route change (not a re-render) applies the ?vue= screenshot state.
function applyVue() {
  const { name, caseNo, vue } = parse();
  if (name !== 'jeu') { resetUi(); return; }
  if (!vue) return;
  view.caseNo = caseNo;
  setupVue(cases[caseNo - 1], vue);
}

function navigate() {
  const screen = $('#screen');
  applyVue();
  render();
  window.scrollTo(0, 0);
  if (!reducedMotion()) {
    screen.classList.remove('enter');
    void screen.offsetWidth; // restart the entrance animation
    screen.classList.add('enter');
  }
  screen.focus({ preventScroll: true }); // screen readers start at the new screen
}

async function boot() {
  cases = (await (await fetch('../cases.json')).json()).cases;
  window.addEventListener('hashchange', navigate);
  if (!location.hash) history.replaceState(null, '', '#/accueil');
  applyVue();
  render();
}

boot();
