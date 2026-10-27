// Clu&Do client: grid placement, clue checking, illustrated presentation.
// Rule shared with generate.mjs / verify.mjs: suspect i sits in row i; the
// player chooses each suspect's column.
const ROOM_COLORS = [
  '#f0c2a2', '#c4dfb4', '#bfd2ee', '#ecd596',
  '#d8bde6', '#ade0dc', '#f0bccb', '#ddd3b0',
];
const SUSPECT_COLORS = [
  '#8c2f39', '#26506b', '#4a6b2f', '#7a4a1e', '#5b3a72',
  '#1f6b5e', '#8a5c00', '#3d3d6b', '#6b2f4a', '#2f5d2f',
];
const VICTIM_ART = {
  'Madame Rousseau': 'rousseau',
  'le notaire Vasseur': 'vasseur',
  'Monsieur Aubert': 'aubert',
  'Madame Le Goff': 'legoff',
  'Monsieur Delaunay': 'delaunay',
  'l’antiquaire Molina': 'molina',
};

const state = {
  cases: [],
  index: 0,
  placement: [], // suspect index -> { row, col } | null
  selected: null,
  revealed: false,
  solved: new Set(),
  celebrating: false,
  marks: [], // per suspect: null (unchecked) | true (correct) | false (wrong)
  freshMarks: false, // animate marks only on the render right after a check
  popped: null, // suspect whose portrait should pop on the next render
  nudgeRow: null, // row to wiggle after a placement outside the suspect's row
  sheet: 'peek', // phone bottom sheet snap: 'closed' | 'peek' | 'full'
};

const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const el = (id) => document.getElementById(id);

function slug(name) {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
}

const portraitSrc = (name) => `assets/portraits/${slug(name)}.svg`;
const victimSrc = (name) => `assets/victims/${VICTIM_ART[name] || slug(name.split(' ').pop())}.svg`;
const agree = (gender, word) => (gender === 'f' ? `${word}e` : word);

async function boot() {
  const response = await fetch('cases.json');
  const data = await response.json();
  state.cases = data.cases;
  populateSelect();
  initSlots();
  loadCase(0);
  bindActions();
  bindSheet();
  syncMode();
  mobileQuery.addEventListener('change', syncMode);
}

function current() { return state.cases[state.index]; }

function populateSelect() {
  const select = el('case-select');
  select.innerHTML = '';
  state.cases.forEach((item, i) => {
    const option = document.createElement('option');
    const size = `${item.size}×${item.size}`;
    option.value = String(i);
    option.textContent = `N°${i + 1} — ${item.difficulty} (${size})`;
    select.appendChild(option);
  });
  select.addEventListener('change', () => loadCase(Number(select.value)));
}

function bindActions() {
  el('btn-check').addEventListener('click', check);
  el('btn-hint').addEventListener('click', hint);
  el('btn-reveal').addEventListener('click', reveal);
  el('btn-reset').addEventListener('click', reset);
  el('next-case').addEventListener('click', nextCase);
  el('btn-next-m').addEventListener('click', nextCase);
  el('win-next').addEventListener('click', nextCase);
  el('win-close').addEventListener('click', clearCelebration);
  el('btn-more').addEventListener('click', () => setMoreMenu(!el('btn-more').classList.contains('open')));
  ['btn-reveal', 'btn-reset', 'btn-next-m'].forEach((id) => el(id).addEventListener('click', () => setMoreMenu(false)));
  el('verdict').addEventListener('click', () => { if (isMobile()) el('verdict').hidden = true; });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (state.celebrating) { clearCelebration(); return; }
    if (el('btn-more').classList.contains('open')) { setMoreMenu(false); el('btn-more').focus(); return; }
    if (isMobile() && state.sheet === 'full') { setSheet('peek'); return; }
    state.selected = null;
    renderAll();
  });
}

function nextCase() { loadCase((state.index + 1) % state.cases.length); }

function loadCase(index) {
  clearCelebration();
  setMoreMenu(false);
  state.index = index;
  const puzzle = current();
  state.placement = puzzle.suspects.map(() => null);
  state.marks = puzzle.suspects.map(() => null);
  state.selected = null;
  state.revealed = false;
  el('case-select').value = String(index);
  el('case-meta').textContent = `${puzzle.difficulty} · grille ${puzzle.size}×${puzzle.size} · ${puzzle.clues.length} témoignages`;
  el('case-title').textContent = `Affaire n°${index + 1}`;
  el('case-story').textContent = puzzle.story;
  el('verdict').hidden = true;
  renderVictim();
  el('plan').innerHTML = window.Floorplan.render(puzzle, ROOM_COLORS);
  el('board').style.setProperty('--n', String(puzzle.size));
  renderRoomLegend();
  renderClues();
  renderAll();
}

function renderAll() {
  renderBoard();
  renderPalette();
  renderBadge();
  state.freshMarks = false;
  state.popped = null;
  state.nudgeRow = null;
}

function renderBadge() {
  const badge = el('case-badge');
  const done = state.solved.has(current().id);
  badge.textContent = done ? 'Résolue' : 'En cours';
  badge.classList.toggle('win', done);
}

function renderVictim() {
  const { victim } = current();
  const photo = el('victim-photo');
  photo.src = victimSrc(victim.name);
  photo.alt = `Photo d'archive : ${victim.name}`;
  el('victim-name').textContent = victim.name;
  el('victim-room').textContent = `Corps retrouvé ${victim.loc}`;
}

function roomOf(row, col) { return current().cells[row][col]; }

function suspectAt(row, col) {
  return state.placement.findIndex((slot) => slot && slot.row === row && slot.col === col);
}

function makeToken(index, extra = '') {
  const suspect = current().suspects[index];
  const token = document.createElement('span');
  token.className = `token ${extra}`.trim();
  token.style.setProperty('--ring', SUSPECT_COLORS[index % SUSPECT_COLORS.length]);
  const img = document.createElement('img');
  img.src = portraitSrc(suspect.name);
  img.alt = '';
  img.width = 164;
  img.height = 164;
  img.decoding = 'async';
  token.appendChild(img);
  return token;
}

function crimeMarker() {
  const marker = document.createElement('span');
  marker.className = 'crime-marker';
  marker.setAttribute('aria-hidden', 'true');
  marker.innerHTML = '<span class="pulse"></span><span class="pulse late"></span>' +
    '<svg class="tent" viewBox="0 0 40 34"><path d="M4 32L14 4H26L36 32Z" fill="#f2c230" stroke="#3b2e26" stroke-width="2.2" stroke-linejoin="round"/>' +
    '<path d="M14 4L20 32L26 4" fill="#d9a514" opacity=".6"/><path d="M15.5 25L20 12L24.5 25M17 21H23" fill="none" stroke="#1f1712" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  return marker;
}

function renderBoard() {
  const puzzle = current();
  const cells = el('cells');
  cells.innerHTML = '';
  cells.style.gridTemplateColumns = `repeat(${puzzle.size}, minmax(0, 1fr))`;
  let markOrder = 0;

  for (let row = 0; row < puzzle.size; row++) {
    for (let col = 0; col < puzzle.size; col++) {
      const room = roomOf(row, col);
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);
      cell.title = puzzle.rooms[room].name;
      const roomName = puzzle.rooms[room].name;
      const owner = puzzle.suspects[row];

      const isVictim = puzzle.victim.cell[0] === row && puzzle.victim.cell[1] === col;
      const occupant = suspectAt(row, col);

      if (isVictim) {
        cell.classList.add('victim');
        cell.appendChild(crimeMarker());
        cell.setAttribute('aria-label', `Corps de ${puzzle.victim.name}, ${roomName}`);
        cell.addEventListener('click', () => {
          showVerdict(`Le corps de ${puzzle.victim.name} occupe cette case : personne ne peut s'y tenir.`, '');
        });
      } else if (occupant >= 0) {
        const isKiller = state.celebrating && occupant === puzzle.killer.index;
        const extra = [state.popped === occupant ? 'pop' : '', isKiller ? 'killer' : ''].join(' ');
        cell.appendChild(makeToken(occupant, extra));
        cell.classList.add('occupied');
        cell.setAttribute('aria-label', `${puzzle.suspects[occupant].name}, rangée ${row + 1} colonne ${col + 1}, ${roomName}`);
        cell.addEventListener('click', () => {
          if (state.selected !== null && state.selected !== occupant) {
            place(row, col); // the selected suspect tries to take this cell
            return;
          }
          if (state.selected === occupant) {
            state.selected = null; // already in place: just drop the selection
            renderAll();
            return;
          }
          clearMarks();
          state.placement[occupant] = null;
          renderAll();
        });
      } else {
        cell.setAttribute('aria-label', `Case libre, rangée ${row + 1} (${owner.name}) colonne ${col + 1}, ${roomName}`);
        cell.addEventListener('click', () => place(row, col));
      }

      if (occupant >= 0 && state.marks[occupant] !== null && state.marks[occupant] !== undefined) {
        const ok = state.marks[occupant];
        const mark = document.createElement('span');
        mark.className = `mark ${ok ? 'ok' : 'bad'}${state.freshMarks ? ' fresh' : ''}`;
        mark.style.setProperty('--i', String(markOrder++));
        mark.textContent = ok ? '✓' : '✗';
        mark.setAttribute('aria-hidden', 'true');
        cell.appendChild(mark);
        if (!ok) cell.classList.add('mismatch');
        if (!ok && state.freshMarks) cell.classList.add('shake');
        cell.setAttribute('aria-label', `${cell.getAttribute('aria-label')} — ${ok ? 'placement validé' : 'placement erroné'}`);
      }

      if (state.selected !== null && row === state.selected) {
        cell.classList.add('row-active');
        if (!isVictim && occupant < 0) cell.classList.add('target');
      }
      if (state.nudgeRow === row) cell.classList.add('nudge');
      cells.appendChild(cell);
    }
  }
  renderBoardStatus();
}

function renderBoardStatus() {
  const status = el('board-status');
  const marks = state.marks || [];
  const good = marks.filter((mark) => mark === true).length;
  const bad = marks.filter((mark) => mark === false).length;
  const left = state.placement.filter((slot) => !slot).length;

  if (!good && !bad) {
    status.hidden = true;
    status.textContent = '';
    status.className = 'board-status';
    return;
  }
  status.hidden = false;
  status.className = `board-status ${bad > 0 ? 'bad' : 'ok'}`;
  const parts = [];
  if (good) parts.push(`${good} validé${good > 1 ? 's' : ''} ✓`);
  if (bad) parts.push(`${bad} erroné${bad > 1 ? 's' : ''} ✗`);
  if (left) parts.push(`${left} à placer`);
  status.textContent = parts.join(' · ');
}

function renderRoomLegend() {
  const puzzle = current();
  const legend = el('room-legend');
  legend.innerHTML = '';
  puzzle.rooms.forEach((room, i) => {
    const item = document.createElement('span');
    item.className = 'room-item';
    item.style.setProperty('--room', ROOM_COLORS[i % ROOM_COLORS.length]);
    const swatch = document.createElement('i');
    swatch.innerHTML = window.Floorplan.swatch(room.name, ROOM_COLORS[i % ROOM_COLORS.length], `${puzzle.id}-${i}`);
    item.appendChild(swatch);
    item.appendChild(document.createTextNode(room.name));
    if (i === puzzle.victim.room) {
      item.classList.add('crime-room');
      const skull = document.createElement('span');
      skull.className = 'crime-mark';
      skull.textContent = '☠';
      skull.title = 'Pièce du crime';
      item.appendChild(skull);
    }
    legend.appendChild(item);
  });
}

function renderPalette() {
  const puzzle = current();
  const palette = el('palette');
  const railScroll = palette.scrollLeft; // rebuilding the chips must not jump the phone rail
  palette.innerHTML = '';
  puzzle.suspects.forEach((suspect, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'suspect';
    button.style.setProperty('--ring', SUSPECT_COLORS[i % SUSPECT_COLORS.length]);
    if (state.selected === i) button.classList.add('selected');
    if (state.placement[i]) button.classList.add('placed');

    const avatar = document.createElement('span');
    avatar.className = 'avatar-wrap';
    avatar.appendChild(makeToken(i, 'avatar'));
    if (state.placement[i]) {
      const check = document.createElement('span');
      check.className = 'check';
      check.setAttribute('aria-hidden', 'true');
      check.textContent = '✓';
      avatar.appendChild(check);
    }
    const who = document.createElement('span');
    who.className = 'who';
    const name = document.createElement('strong');
    name.textContent = suspect.name;
    const sub = document.createElement('span');
    sub.className = 'sub';
    const rowLabel = document.createElement('span');
    rowLabel.textContent = `Rangée ${i + 1}`;
    const status = document.createElement('span');
    status.className = 'status';
    status.textContent = state.placement[i] ? agree(suspect.gender, 'placé') : 'à placer';
    const sep = document.createElement('span');
    sep.className = 'sep';
    sep.textContent = ' · ';
    sub.append(rowLabel, sep, status);
    who.append(name, sub);

    button.append(avatar, who);
    button.setAttribute('aria-pressed', state.selected === i ? 'true' : 'false');
    button.addEventListener('click', () => {
      state.selected = state.selected === i ? null : i;
      renderAll();
    });
    palette.appendChild(button);
  });
  palette.scrollLeft = railScroll;
  if (state.selected !== null && isMobile()) revealChip(palette.children[state.selected]);

  const remaining = state.placement.filter((slot) => slot === null).length;
  el('palette-hint').textContent = remaining === 0
    ? 'Tous les invités sont placés — vérifiez votre déduction.'
    : `Sélectionnez un invité puis une case de sa rangée (${remaining} restant${remaining > 1 ? 's' : ''}). Un pion posé se retire en cliquant dessus.`;
}

// Clue text is rendered verbatim; suspect names only gain a decorative
// portrait (empty alt), so the text content stays identical to cases.json.
function renderClues() {
  const puzzle = current();
  const list = el('clues');
  list.innerHTML = '';
  const names = puzzle.suspects.map((s) => s.name).sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`(${names.join('|')})`, 'u');
  puzzle.clues.forEach((text) => {
    const item = document.createElement('li');
    item.className = 'clue';
    const body = document.createElement('p');
    const parts = text.split(pattern);
    parts.forEach((part, k) => {
      if (typeof part === 'object') {
        body.appendChild(namedTag(puzzle.suspects.findIndex((s) => s.name === part.name), part.name, part.elision));
        return;
      }
      const index = puzzle.suspects.findIndex((s) => s.name === part);
      if (index < 0) {
        // Keep an elided "d’" glued to the name that follows it.
        const glued = k + 1 < parts.length ? part.match(/d[’']$/) : null;
        const plain = glued ? part.slice(0, -2) : part;
        if (plain) body.appendChild(document.createTextNode(plain));
        if (glued) parts[k + 1] = { elision: glued[0], name: parts[k + 1] };
        return;
      }
      body.appendChild(namedTag(index, part));
    });
    item.appendChild(body);
    list.appendChild(item);
  });
  el('clue-count').textContent = `${puzzle.clues.length} pièces`;
  el('tab-count').textContent = String(puzzle.clues.length);

  const pane = el('pane-clues');
  if (pane) {
    const total = puzzle.clues.length;
    const more = document.createElement('p');
    more.className = 'sheet-more';
    more.textContent = total > 1 ? `1 / ${total} · toucher pour la suite` : '';
    pane.appendChild(more);
  }
  syncPeekHeight();
}

// The peek must show the hint and the first clue in full, whatever the phone
// height: its size is derived from the real content instead of a fixed guess.
function syncPeekHeight() {
  const sheet = el('sheet');
  if (!sheet || !window.matchMedia('(max-width: 860px)').matches) return;
  const head = document.querySelector('.sheet-head');
  const pane = el('pane-clues');
  if (!head || !pane) return;
  const firstClue = pane.querySelector('.clue');
  const more = pane.querySelector('.sheet-more');
  const content = Math.ceil(
    head.getBoundingClientRect().height +
    (more ? more.getBoundingClientRect().height : 0) +
    (firstClue ? firstClue.getBoundingClientRect().height : 0) +
    16,
  );
  // The peek is exactly what the content needs: a taller sheet would only add
  // empty space under the first clue. The spacer follows so the board grows.
  const ceiling = Math.round(window.innerHeight * 0.62);
  const peek = Math.min(content, ceiling);
  sheet.style.setProperty('--peek-px', `${peek}px`);
}

function namedTag(index, name, elision = '') {
  const who = document.createElement('span');
  who.className = 'who-inline';
  if (elision) who.appendChild(document.createTextNode(elision));
  who.appendChild(makeToken(index, 'mini'));
  who.appendChild(document.createTextNode(name));
  return who;
}

function clearMarks() {
  state.marks = current().suspects.map(() => null);
}

function place(row, col) {
  const puzzle = current();
  if (state.selected === null) {
    const occupant = suspectAt(row, col);
    if (occupant >= 0) { state.placement[occupant] = null; renderAll(); return; }
    state.selected = row; // an empty cell belongs to its row's guest
  }
  if (state.selected !== row) {
    const suspect = puzzle.suspects[state.selected];
    state.nudgeRow = state.selected;
    showVerdict(`${suspect.name} se trouvait sur la rangée ${state.selected + 1} : choisissez une case de cette rangée.`, '');
    renderAll();
    return;
  }
  clearMarks();
  state.placement[state.selected] = { row, col };

  // One suspect per row and per column: bounce the conflicting one out.
  state.placement.forEach((slot, i) => {
    if (!slot || i === state.selected) return;
    if (slot.row === row || slot.col === col) state.placement[i] = null;
  });

  state.popped = state.selected;
  state.selected = null;
  renderAll();
}

function aloneWord(gender) { return gender === 'f' ? 'seule' : 'seul'; }

function isCorrectSlot(slot, i) {
  return Boolean(slot) && slot.row === i && slot.col === current().solution[i];
}

function isCorrect() { return state.placement.every(isCorrectSlot); }

function showVerdict(text, tone) {
  const box = el('verdict');
  box.hidden = false;
  box.className = `verdict ${tone}`.trim();
  box.textContent = text;
  // On phones the verdict is a toast over the board: it hides itself.
  clearTimeout(showVerdict.timer);
  if (isMobile()) showVerdict.timer = setTimeout(() => { box.hidden = true; }, 5000);
}

function keepBoardInView() {
  if (isMobile()) { if (state.sheet === 'full') setSheet('peek'); return; }
  const wrap = document.querySelector('.board-wrap');
  requestAnimationFrame(() => {
    const rect = wrap.getBoundingClientRect();
    const offscreen = rect.bottom > window.innerHeight || rect.top < 0;
    if (offscreen) {
      wrap.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
  });
}

function check() {
  const puzzle = current();
  const placed = state.placement.filter(Boolean).length;
  const marks = state.placement.map((slot, i) => (slot ? isCorrectSlot(slot, i) : null));
  state.marks = marks;
  state.freshMarks = true;
  const good = marks.filter((mark) => mark === true).length;
  const bad = marks.filter((mark) => mark === false).length;

  const tally = placed === 0
    ? ''
    : ` ${good} placement${good > 1 ? 's' : ''} validé${good > 1 ? 's' : ''} (✓)` +
      (bad > 0 ? `, ${bad} erroné${bad > 1 ? 's' : ''} (✗).` : '.');

  if (placed < puzzle.size) {
    renderAll();
    keepBoardInView();
    const missing = puzzle.size - placed;
    showVerdict(`Il reste ${missing} invité${missing > 1 ? 's' : ''} à placer.${tally}`, 'bad');
    return;
  }

  if (isCorrect()) {
    const firstTime = !state.solved.has(puzzle.id);
    state.solved.add(puzzle.id);
    state.celebrating = true;
    renderAll();
    showVerdict(
      `Affaire résolue. ${puzzle.killer.name} se trouvait ${aloneWord(puzzle.killer.gender)} ${puzzle.victim.loc} avec ${puzzle.victim.name} : c'est le coupable.`,
      'ok',
    );
    celebrate(firstTime);
  } else {
    renderAll();
    keepBoardInView();
    const wrongNames = state.placement
      .map((slot, i) => (marks[i] === false ? puzzle.suspects[i].name : null))
      .filter(Boolean);
    showVerdict(
      `Solution unique : ${good} placement${good > 1 ? 's' : ''} validé${good > 1 ? 's' : ''} (✓) et ${bad} erroné${bad > 1 ? 's' : ''} (✗) — ${wrongNames.join(', ')}. ` +
      'Cliquez sur un pion pour le retirer, puis reposez-le ailleurs.',
      'bad',
    );
  }
}

// ---------------------------------------------------------------- celebration
function celebrate(firstTime) {
  const puzzle = current();
  const board = el('board');
  board.classList.remove('celebrate');
  void board.offsetWidth; // restart the CSS animation
  board.classList.add('celebrate');
  [...board.querySelectorAll('.token')].forEach((token, i) => {
    token.style.animationDelay = prefersReducedMotion() ? '0ms' : `${i * 70}ms`;
  });
  showWinBanner(puzzle, firstTime);
  if (!prefersReducedMotion()) spawnConfetti();
}

function showWinBanner(puzzle, firstTime) {
  const banner = el('win-banner');
  el('win-eyebrow').textContent = firstTime ? 'Énigme résolue' : 'Grille validée';
  el('win-title').textContent = `${puzzle.killer.name}, coupable`;
  const alone = aloneWord(puzzle.killer.gender);
  el('win-detail').textContent = `${alone[0].toUpperCase()}${alone.slice(1)} ${puzzle.victim.loc} avec ${puzzle.victim.name}.`;
  const photo = el('win-photo');
  photo.src = portraitSrc(puzzle.killer.name);
  photo.alt = `Portrait de ${puzzle.killer.name}`;
  banner.style.setProperty('--ring', SUSPECT_COLORS[puzzle.killer.index % SUSPECT_COLORS.length]);

  banner.hidden = false;
  banner.classList.remove('visible');
  void banner.offsetWidth;
  banner.classList.add('visible');
  el('win-next').focus({ preventScroll: true });
}

function spawnConfetti() {
  const layer = document.createElement('div');
  layer.className = 'confetti-layer';
  layer.dataset.fx = 'confetti';
  layer.setAttribute('aria-hidden', 'true');
  const colors = ['#8c2f39', '#c68a3a', '#3f6b4a', '#3a5a7a', '#7a4a8c', '#f2c230'];
  for (let i = 0; i < 42; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetti';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${Math.random() * 320}ms`;
    piece.style.animationDuration = `${1500 + Math.random() * 900}ms`;
    piece.style.setProperty('--drift', `${(Math.random() - 0.5) * 120}px`);
    piece.style.setProperty('--spin', `${(Math.random() - 0.5) * 900}deg`);
    layer.appendChild(piece);
  }
  // Radial spark burst behind the killer's portrait.
  const burst = document.createElement('div');
  burst.className = 'burst';
  for (let i = 0; i < 18; i++) {
    const spark = document.createElement('span');
    spark.style.setProperty('--a', `${(i / 18) * 360}deg`);
    spark.style.setProperty('--d', `${90 + Math.random() * 70}px`);
    spark.style.background = colors[i % colors.length];
    burst.appendChild(spark);
  }
  layer.appendChild(burst);
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 2800);
}

function clearCelebration() {
  const wasCelebrating = state.celebrating;
  state.celebrating = false;
  el('board').classList.remove('celebrate');
  const banner = el('win-banner');
  banner.classList.remove('visible');
  banner.hidden = true;
  document.querySelectorAll('.confetti-layer').forEach((node) => node.remove());
  if (wasCelebrating && state.cases.length) renderBoard();
}

function hint() {
  const puzzle = current();
  clearMarks();
  const slots = state.placement.map((slot, i) => ({ slot, i }));
  const wrong = slots.filter(({ slot, i }) => !isCorrectSlot(slot, i));
  if (!wrong.length) { showVerdict('Tout est déjà juste : vérifiez.', 'ok'); return; }
  const target = wrong[Math.floor(Math.random() * wrong.length)];
  const row = target.i;
  const col = puzzle.solution[row];
  state.placement.forEach((slot, i) => {
    if (slot && (slot.row === row || slot.col === col)) state.placement[i] = null;
  });
  state.placement[row] = { row, col };
  state.selected = null;
  state.popped = row;
  renderAll();
  const suspect = puzzle.suspects[row];
  showVerdict(`Indice : ${suspect.name} est ${agree(suspect.gender, 'placé')} ${puzzle.rooms[puzzle.cells[row][col]].loc}.`, '');
}

function reveal() {
  const puzzle = current();
  clearMarks();
  state.placement = puzzle.solution.map((col, row) => ({ row, col }));
  state.selected = null;
  state.revealed = true;
  renderAll();
  showVerdict(
    `Solution : ${puzzle.killer.name} était ${aloneWord(puzzle.killer.gender)} ${puzzle.victim.loc} avec ${puzzle.victim.name}.`,
    'bad',
  );
}

function reset() {
  clearCelebration();
  clearMarks();
  state.placement = current().suspects.map(() => null);
  state.selected = null;
  state.revealed = false;
  el('verdict').hidden = true;
  renderAll();
}

// ------------------------------------------------------------ phone layout
// Under 860 px the page becomes one screen: board, chip rail and action bar
// stay put, and the dossier/clues live in a bottom sheet. The same DOM nodes
// are moved into the sheet (and back), so desktop markup stays untouched.
const mobileQuery = window.matchMedia('(max-width: 860px)');
mobileQuery.addEventListener('change', syncMode);
window.addEventListener('resize', syncPeekHeight);
const isMobile = () => mobileQuery.matches;
const MOBILE_SLOTS = [
  ['.case-panel', 'pane-dossier'],
  ['#room-legend', 'pane-dossier'],
  ['.clues-panel .legend', 'pane-dossier'],
  ['.footer', 'pane-dossier'],
  ['.clues-panel', 'pane-clues'],
  ['#board-status', 'slot-tally'],
];
const slots = [];

function initSlots() {
  for (const [selector, target] of MOBILE_SLOTS) {
    const node = document.querySelector(selector);
    const home = document.createComment(`home of ${selector}`);
    node.before(home);
    slots.push({ node, home, target });
  }
}

function syncMode() {
  const mobile = isMobile();
  for (const { node, home, target } of slots) {
    if (mobile) el(target).appendChild(node);
    else home.after(node);
  }
  const sheet = el('sheet');
  if (mobile) {
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'false');
  } else {
    sheet.removeAttribute('role');
    sheet.removeAttribute('aria-modal');
    setMoreMenu(false);
    clearTimeout(showVerdict.timer);
  }
  setSheet(state.sheet, false);
  syncPeekHeight();
}

function setMoreMenu(open) {
  const button = el('btn-more');
  button.classList.toggle('open', open);
  button.setAttribute('aria-expanded', String(open));
  button.setAttribute('aria-label', open ? 'Fermer le menu' : "Plus d'actions");
  button.textContent = open ? '✕' : '⋯';
  document.querySelector('.actions').classList.toggle('more-open', open);
}

function revealChip(chip) {
  if (!chip) return;
  const rail = chip.parentElement;
  const left = chip.offsetLeft - rail.offsetLeft;
  if (left < rail.scrollLeft || left + chip.offsetWidth > rail.scrollLeft + rail.clientWidth) {
    rail.scrollTo({ left: left - (rail.clientWidth - chip.offsetWidth) / 2, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }
}

function setSheet(snap, animate = true) {
  const sheet = el('sheet');
  if (animate && snap !== sheet.dataset.snap && !prefersReducedMotion()) {
    sheet.classList.add('animate');
    clearTimeout(setSheet.timer);
    setSheet.timer = setTimeout(() => sheet.classList.remove('animate'), 450);
  }
  state.sheet = snap;
  sheet.classList.remove('is-closed', 'is-peek', 'is-full');
  sheet.classList.add(`is-${snap}`);
  sheet.dataset.snap = snap;
  const toggle = el('sheet-toggle');
  toggle.setAttribute('aria-expanded', String(snap === 'full'));
  toggle.setAttribute('aria-label', snap === 'full' ? 'Réduire le volet' : 'Agrandir le volet');
  el('sheet-body').inert = snap === 'closed';
  if (snap === 'full' && isMobile()) el('verdict').hidden = true; // the toast would cover the tabs
}

const nextSnap = () => ({ closed: 'peek', peek: 'full', full: 'peek' })[state.sheet];

function selectTab(name) {
  ['clues', 'dossier'].forEach((tab) => {
    const on = tab === name;
    el(`tab-${tab}`).setAttribute('aria-selected', String(on));
    el(`tab-${tab}`).tabIndex = on ? 0 : -1;
    el(`pane-${tab}`).hidden = !on;
  });
  el('sheet-body').scrollTop = 0;
  if (state.sheet === 'closed') setSheet('peek');
}

// Snap offsets (translateY, px) for the sheet; mirrors the CSS classes.
function snapOffsets() {
  const sheet = el('sheet');
  const height = sheet.offsetHeight;
  const safeBottom = parseFloat(getComputedStyle(el('sheet-body')).paddingBottom) - 16;
  return {
    full: 0,
    peek: height - el('sheet-space').offsetHeight,
    closed: height - el('sheet-head').offsetHeight - Math.max(0, safeBottom),
  };
}

function bindSheet() {
  const sheet = el('sheet');
  const head = el('sheet-head');
  const metrics = () => {
    sheet.style.setProperty('--head-px', `${head.offsetHeight}px`);
    syncPeekHeight();
  };
  new ResizeObserver(metrics).observe(el('sheet-space'));
  new ResizeObserver(metrics).observe(head);
  metrics();

  el('sheet-toggle').addEventListener('click', () => setSheet(nextSnap()));
  ['clues', 'dossier'].forEach((tab) => el(`tab-${tab}`).addEventListener('click', () => selectTab(tab)));
  el('sheet-head').querySelector('[role="tablist"]').addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const next = el('tab-clues').getAttribute('aria-selected') === 'true' ? 'dossier' : 'clues';
    selectTab(next);
    el(`tab-${next}`).focus();
  });

  // Tap on the bare header cycles the snap; a vertical drag moves the sheet.
  let drag = null;
  let swallowClick = false;
  head.addEventListener('click', (event) => {
    if (swallowClick) { swallowClick = false; event.stopPropagation(); event.preventDefault(); return; }
    if (event.target.closest('button')) return;
    setSheet(nextSnap());
  }, true);
  head.addEventListener('pointerdown', (event) => {
    if (!isMobile() || event.button !== 0) return;
    swallowClick = false;
    const base = new DOMMatrixReadOnly(getComputedStyle(sheet).transform).m42;
    drag = { id: event.pointerId, y0: event.clientY, base, moved: false, lastY: event.clientY, lastT: performance.now(), v: 0 };
  });
  head.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dy = event.clientY - drag.y0;
    if (!drag.moved && Math.abs(dy) < 8) return;
    if (!drag.moved) {
      drag.moved = true;
      try { head.setPointerCapture(drag.id); } catch { /* synthetic pointer: no capture */ }
      sheet.classList.remove('animate');
    }
    const now = performance.now();
    drag.v = (event.clientY - drag.lastY) / Math.max(1, now - drag.lastT);
    drag.lastY = event.clientY;
    drag.lastT = now;
    const { closed } = snapOffsets();
    sheet.style.transform = `translateY(${Math.min(closed, Math.max(0, drag.base + dy))}px)`;
  });
  const release = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const moved = drag.moved;
    const y = drag.base + (event.clientY - drag.y0);
    const projected = y + drag.v * 220; // a flick carries the sheet further
    drag = null;
    if (!moved) return;
    swallowClick = true; // eat the click this gesture may produce, and only that one
    setTimeout(() => { swallowClick = false; }, 0);
    sheet.style.transform = '';
    if (event.type === 'pointercancel') { setSheet(state.sheet); return; }
    const offsets = snapOffsets();
    const nearest = Object.entries(offsets).sort((a, b) => Math.abs(a[1] - projected) - Math.abs(b[1] - projected))[0][0];
    setSheet(nearest);
  };
  head.addEventListener('pointerup', release);
  head.addEventListener('pointercancel', release);
}

boot();
