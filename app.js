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
const MIN_RECORD_DISTANCE_M = 5; // ignore GPS jitter smaller than this

// ── State ────────────────────────────────────────────────────

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY));
    return {
      completed:  {},
      score:      0,
      path:       [],   // [[lat, lng, timestamp], ...]
      mazeTimer:  { startedAt: null, stoppedAt: null },
      ...saved,
    };
  } catch {
    return { completed: {}, score: 0, path: [], mazeTimer: { startedAt: null, stoppedAt: null } };
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

    // Maze-specific stopwatch (Task 4 only)
    if (task.id === 4) buildMazeTimer(card);

    listEl.appendChild(card);
  });

  updateScoreDisplay();
}

// ── Location tracking ────────────────────────────────────────

function initLocationTracking(map) {
  if (!navigator.geolocation) return;

  // Path polyline
  const pathLine = L.polyline(
    (state.path || []).map(p => [p[0], p[1]]),
    { color: '#e07baa', weight: 3.5, opacity: 0.75, lineCap: 'round', lineJoin: 'round' }
  ).addTo(map);

  // Pulsing current-position marker
  const locIcon = L.divIcon({
    className: '',
    html: '<div class="loc-dot"></div><div class="loc-pulse"></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
  const locMarker = L.marker(PARK_CENTER, { icon: locIcon, zIndexOffset: 500, interactive: false });

  let lastRecorded = null;

  navigator.geolocation.watchPosition(
    pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      const latlng = [lat, lng];

      // Show / move marker
      if (!map.hasLayer(locMarker)) locMarker.addTo(map);
      locMarker.setLatLng(latlng);

      // Only append to path if moved meaningfully (suppress GPS drift)
      const moved = lastRecorded
        ? L.latLng(lastRecorded).distanceTo(L.latLng(latlng))
        : Infinity;

      if (moved >= MIN_RECORD_DISTANCE_M) {
        lastRecorded = latlng;
        state.path.push([lat, lng, Date.now()]);
        pathLine.addLatLng(latlng);
        saveState(state);
      }
    },
    null,
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );
}

// ── Maze timer ───────────────────────────────────────────────

let mazeTickInterval = null;

function formatElapsed(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
  const s = (totalSec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function buildMazeTimer(card) {
  const section = document.createElement('div');
  section.className = 'maze-timer';
  section.innerHTML = `
    <span class="maze-timer-label">Maze time</span>
    <span class="maze-timer-display" id="maze-display">--:--</span>
    <div class="maze-timer-controls">
      <button class="maze-btn maze-btn-start" id="maze-start" touch-action="manipulation">▶ Start</button>
      <button class="maze-btn maze-btn-stop"  id="maze-stop"  touch-action="manipulation" disabled>■ Stop</button>
    </div>
  `;
  card.querySelector('.task-content').appendChild(section);

  const display  = section.querySelector('#maze-display');
  const startBtn = section.querySelector('#maze-start');
  const stopBtn  = section.querySelector('#maze-stop');

  function tick() {
    const elapsed = Date.now() - state.mazeTimer.startedAt;
    display.textContent = formatElapsed(elapsed);
  }

  // Restore persisted timer state
  if (state.mazeTimer.startedAt && !state.mazeTimer.stoppedAt) {
    // Was running when app closed — continue
    startBtn.disabled = true;
    stopBtn.disabled  = false;
    tick();
    mazeTickInterval = setInterval(tick, 1000);
  } else if (state.mazeTimer.startedAt && state.mazeTimer.stoppedAt) {
    // Finished — show final time
    const elapsed = state.mazeTimer.stoppedAt - state.mazeTimer.startedAt;
    display.textContent = formatElapsed(elapsed);
    startBtn.disabled = true;
    stopBtn.disabled  = true;
  }

  startBtn.addEventListener('click', () => {
    state.mazeTimer = { startedAt: Date.now(), stoppedAt: null };
    saveState(state);
    startBtn.disabled = true;
    stopBtn.disabled  = false;
    tick();
    mazeTickInterval = setInterval(tick, 1000);
  });

  stopBtn.addEventListener('click', () => {
    clearInterval(mazeTickInterval);
    mazeTickInterval = null;
    state.mazeTimer.stoppedAt = Date.now();
    saveState(state);
    stopBtn.disabled  = true;
    startBtn.disabled = true;
    const elapsed = state.mazeTimer.stoppedAt - state.mazeTimer.startedAt;
    display.textContent = formatElapsed(elapsed);
  });
}

// ── Wake lock ────────────────────────────────────────────────
// Keeps the screen on while the app is open.
// Re-acquires automatically when the user returns to the tab,
// because the lock is released whenever the page becomes hidden.

async function requestWakeLock() {
  if (!navigator.wakeLock) return;
  try {
    await navigator.wakeLock.request('screen');
  } catch {
    // Battery saver mode or other system refusal — silently ignore.
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') requestWakeLock();
});

// ── Bootstrap ────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const map = initMap();
  renderTasks();
  initLocationTracking(map);
  requestWakeLock();
  sheet.setAttribute('aria-hidden', 'true');
});
