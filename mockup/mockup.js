// Clu&doku UI/UX mockup: four screens with one job each, hash-routed.
//   #/accueil            pick a case (the only screen that scrolls)
//   #/dossier[/N]        the case file and the rules of that case, one primary button
//   #/jeu[/N]            the board, the clues, the actions
//   #/resultat[/N]       the solved case
// A design artefact: real cases, art and board renderer, no game logic beyond
// navigation (and a few visual-only interactions on the board).
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
const view = { clue: 0, caseNo: null };

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

function boardHtml(puzzle, placement) {
  const n = puzzle.size;
  const [vr, vc] = puzzle.victim.cell;
  let cells = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const room = puzzle.rooms[puzzle.cells[r][c]].name;
      const who = placement.findIndex((slot) => slot && slot[0] === r && slot[1] === c);
      if (r === vr && c === vc) {
        cells += `<span class="cell body" role="img" aria-label="Corps de ${esc(puzzle.victim.name)}, ${esc(room)}"><svg viewBox="0 0 40 34" aria-hidden="true"><path d="M4 32L14 4H26L36 32Z" fill="#f2c230" stroke="#3b2e26" stroke-width="2.2" stroke-linejoin="round"/><path d="M15.5 25L20 12L24.5 25M17 21H23" fill="none" stroke="#1f1712" stroke-width="2.6" stroke-linecap="round"/></svg></span>`;
      } else if (who >= 0) {
        const name = puzzle.suspects[who].name;
        cells += `<button type="button" class="cell" data-r="${r}" data-c="${c}" aria-label="${esc(name)}, ${esc(room)}"><span class="token"><img src="${portrait(name)}" alt="" width="80" height="80"></span></button>`;
      } else {
        cells += `<button type="button" class="cell" data-r="${r}" data-c="${c}" aria-label="Case libre, ${esc(room)}"></button>`;
      }
    }
  }
  return `<div class="board" style="--n:${n}">
    <div class="plan">${window.Floorplan.render(puzzle, ROOM_COLORS)}</div>
    <div class="cells" style="grid-template-columns:repeat(${n}, minmax(0, 1fr))">${cells}</div>
  </div>`;
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

function renderJeu(puzzle) {
  const placement = placementOf(puzzle);
  const placed = placement.filter(Boolean).length;
  const total = puzzle.clues.length;
  view.clue = Math.min(view.clue, total - 1);
  const dots = puzzle.clues.map((_, i) => `<i class="${i === view.clue ? 'on' : ''}"></i>`).join('');

  return `<div class="page fit jeu" data-n="${puzzle.size}">
    ${header({ back: `#/dossier/${puzzle.number}`, backLabel: 'Retour au dossier', eyebrow: `${placed} / ${puzzle.size} placés`, title: `Affaire n°${puzzle.number}` })}
    <div class="stage">
    ${boardHtml(puzzle, placement)}
    <section class="clue-card" aria-label="Témoignages">
      <div class="clue-head">
        <button type="button" class="icon-btn" data-clue="-1" aria-label="Témoignage précédent" ${view.clue === 0 ? 'disabled' : ''}>${ICON.back}</button>
        <div class="clue-count"><span>Témoignage ${view.clue + 1} / ${total}</span><span class="dots" aria-hidden="true">${dots}</span></div>
        <button type="button" class="icon-btn" data-clue="1" aria-label="Témoignage suivant" ${view.clue === total - 1 ? 'disabled' : ''}>${ICON.next}</button>
      </div>
      <div class="clue-body"><p class="clue-text" id="clue-text">${clueHtml(puzzle.clues[view.clue], puzzle)}</p></div>
    </section>
    </div>
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
    <div class="sheet-backdrop" id="picker" hidden>
      <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="picker-title">
        <div class="sheet-head">
          <div><strong id="picker-title">Qui se trouvait ici ?</strong><span id="picker-where"></span></div>
          <button type="button" class="icon-btn" data-action="close" aria-label="Fermer">${ICON.close}</button>
        </div>
        <div class="guests" id="guests"></div>
      </section>
    </div>
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
  const picker = $('#picker', root);
  let target = null;

  const setMenu = (open) => { menu.hidden = !open; menuButton.setAttribute('aria-expanded', String(open)); };
  const toast = (text) => {
    const box = $('#toast', root);
    box.textContent = text;
    box.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { box.hidden = true; }, 3200);
  };
  const closePicker = () => { picker.hidden = true; target = null; };

  root.querySelectorAll('[data-clue]').forEach((button) => button.addEventListener('click', () => {
    view.clue += Number(button.dataset.clue);
    render();
  }));
  menuButton.addEventListener('click', () => setMenu(menu.hidden));
  $('[data-action="hint"]', root).addEventListener('click', () => {
    const s = placement.findIndex((slot) => !slot);
    const who = puzzle.suspects[s < 0 ? 0 : s];
    const [r, c] = puzzle.solution[s < 0 ? 0 : s];
    toast(`Indice : ${who.name} était ${puzzle.rooms[puzzle.cells[r][c]].loc}.`);
  });
  $('[data-action="reveal"]', root).addEventListener('click', () => {
    puzzle.solution.forEach((slot, s) => { placement[s] = slot; });
    render();
  });
  $('[data-action="clear"]', root).addEventListener('click', () => {
    placement.fill(null);
    render();
  });
  $('[data-action="close"]', root).addEventListener('click', closePicker);
  picker.addEventListener('click', (event) => { if (event.target === picker) closePicker(); });

  // Tap a cell: a sheet asks who stood there (visual only, no validation).
  root.querySelectorAll('.cell[data-r]').forEach((cell) => cell.addEventListener('click', () => {
    target = [Number(cell.dataset.r), Number(cell.dataset.c)];
    $('#picker-where', root).textContent = `${puzzle.rooms[puzzle.cells[target[0]][target[1]]].name} · rangée ${target[0] + 1}, colonne ${target[1] + 1}`;
    $('#guests', root).innerHTML = puzzle.suspects.map((s, i) => `<button type="button" class="guest${placement[i] ? ' placed' : ''}" data-guest="${i}">
        <img src="${portrait(s.name)}" alt="" width="44" height="44"><span>${esc(s.name)}${placement[i] ? `<small>déjà ${agree(s.gender, 'placé')}</small>` : ''}</span></button>`).join('');
    root.querySelectorAll('[data-guest]').forEach((button) => button.addEventListener('click', () => {
      const s = Number(button.dataset.guest);
      placement.forEach((slot, i) => { if (slot && (slot[0] === target[0] || slot[1] === target[1])) placement[i] = null; });
      placement[s] = target;
      closePicker();
      render();
    }));
    picker.hidden = false;
    $('[data-guest]', root).focus();
  }));

  document.onkeydown = (event) => {
    if (event.key !== 'Escape') return;
    if (!picker.hidden) closePicker();
    else setMenu(false);
  };
}

// ------------------------------------------------------------------- router
function parse() {
  const [, name = 'accueil', num] = location.hash.match(/^#\/(\w+)(?:\/(\d+))?/) || [];
  const caseNo = Math.min(Math.max(Number(num) || CURRENT, 1), cases.length);
  return { name: ['accueil', 'dossier', 'jeu', 'resultat'].includes(name) ? name : 'accueil', caseNo };
}

function render() {
  const { name, caseNo } = parse();
  const puzzle = cases[caseNo - 1];
  if (view.caseNo !== caseNo) { view.clue = 0; view.caseNo = caseNo; }
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

function navigate() {
  const screen = $('#screen');
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
  render();
}

boot();
