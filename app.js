import { TASKS } from './tasks.js';

// ── Constants ────────────────────────────────────────────────

const PARK_CENTER  = [51.4225, -0.0715];
const PARK_BOUNDS  = L.latLngBounds([51.4185, -0.0800], [51.4270, -0.0620]);
const TILE_URL     = 'https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg?api_key=2a3bce50-576d-4694-abff-ae82591547d0';
const ATTRIBUTION  = 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, ' +
                     '<a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; ' +
                     'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const STATE_KEY    = 'easter-hunt-state-v1';
const BASE_POINTS  = 10; // awarded for marking a task complete

// ── State ────────────────────────────────────────────────────

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY)) || { completed: {}, score: 0 };
  } catch {
    return { completed: {}, score: 0 };
  }
}

function saveState(state) {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

const state = loadState();
let sheetOpen = false;

// ── Map initialisation ───────────────────────────────────────

function initMap() {
  const map = L.map('map', {
    center: PARK_CENTER,
    zoom: 15,
    minZoom: 14,
    maxZoom: 17,
    maxBounds: PARK_BOUNDS.pad(0.05),
    maxBoundsViscosity: 1.0,
    zoomControl: false,
    attributionControl: true,
    tap: false,           // disable legacy Leaflet tap emulation
  });

  L.tileLayer(TILE_URL, {
    attribution: ATTRIBUTION,
    detectRetina: true,
  }).addTo(map);

  return map;
}

// ── Bottom sheet ─────────────────────────────────────────────

const fab       = document.getElementById('fab');
const sheet     = document.getElementById('bottom-sheet');
const backdrop  = document.getElementById('sheet-backdrop');

function openSheet() {
  sheetOpen = true;
  document.body.classList.add('sheet-open');
  fab.setAttribute('aria-expanded', 'true');
  fab.textContent = '✕';
  sheet.removeAttribute('aria-hidden');
}

function closeSheet() {
  sheetOpen = false;
  document.body.classList.remove('sheet-open');
  fab.setAttribute('aria-expanded', 'false');
  fab.textContent = '🥚';
  sheet.setAttribute('aria-hidden', 'true');
}

fab.addEventListener('click', () => sheetOpen ? closeSheet() : openSheet());
backdrop.addEventListener('click', closeSheet);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && sheetOpen) closeSheet();
});

// ── Score display ────────────────────────────────────────────

const scoreEl    = document.getElementById('score-value');
const progressEl = document.getElementById('task-progress');

function updateScoreDisplay() {
  scoreEl.textContent = state.score;
  const done = Object.keys(state.completed).length;
  progressEl.textContent = `${done} / ${TASKS.length} complete`;
}

// ── Task rendering ───────────────────────────────────────────

function totalBonusPoints(task) {
  return task.bonuses.reduce((sum, b) => sum + b.points, 0);
}

function renderTasks() {
  const listEl = document.getElementById('task-list');
  listEl.innerHTML = '';

  TASKS.forEach(task => {
    const isCompleted = !!state.completed[task.id];
    const totalPts    = totalBonusPoints(task);

    const card = document.createElement('div');
    card.className    = 'task-card' + (isCompleted ? ' completed' : '');
    card.dataset.taskId = task.id;
    card.dataset.color  = task.color;
    card.setAttribute('role', 'listitem');

    card.innerHTML = `
      <div class="task-card-main">
        <div class="task-status">
          <input
            type="checkbox"
            id="task-${task.id}-done"
            class="task-checkbox"
            ${isCompleted ? 'checked' : ''}
          >
          <label
            for="task-${task.id}-done"
            class="task-check-label"
            aria-label="Mark '${task.title}' complete"
          ></label>
        </div>
        <div class="task-content">
          <h3 class="task-title">${task.title}</h3>
          <p class="task-desc">${task.description}</p>
          <button
            class="bonus-toggle"
            aria-expanded="false"
            aria-controls="bonuses-${task.id}"
          >
            Bonus items (${task.bonuses.length})
            <span class="bonus-pts">+${totalPts} pts</span>
          </button>
        </div>
      </div>
      <div class="bonus-list" id="bonuses-${task.id}" hidden>
        ${task.bonuses.map(b => `
          <div class="bonus-item">
            <span class="bonus-pts-badge">+${b.points}</span>
            <p>${b.description}</p>
          </div>
        `).join('')}
      </div>
    `;

    // Checkbox — toggle completion and score
    const checkbox = card.querySelector('.task-checkbox');
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        state.completed[task.id] = true;
        state.score += BASE_POINTS;
        card.classList.add('completed');
      } else {
        delete state.completed[task.id];
        state.score = Math.max(0, state.score - BASE_POINTS);
        card.classList.remove('completed');
      }
      saveState(state);
      updateScoreDisplay();
    });

    // Bonus toggle — expand / collapse
    const bonusBtn  = card.querySelector('.bonus-toggle');
    const bonusList = card.querySelector('.bonus-list');
    bonusBtn.addEventListener('click', () => {
      const expanded = bonusBtn.getAttribute('aria-expanded') === 'true';
      bonusBtn.setAttribute('aria-expanded', String(!expanded));
      expanded ? bonusList.setAttribute('hidden', '') : bonusList.removeAttribute('hidden');
    });

    listEl.appendChild(card);
  });

  updateScoreDisplay();
}

// ── Bootstrap ────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  renderTasks();
  sheet.setAttribute('aria-hidden', 'true');
});
