// Entry point: settings, menus and the main loop.
import { Game } from './Game.js';

const DEFAULTS = {
  master: 0.8, music: 0.7, sfx: 0.85, sensitivity: 1, invertY: false, showLane: true, quality: 'high', latency: 0,
};

function loadSettings() {
  try {
    const raw = localStorage.getItem('neon-riposte-settings');
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (_) { /* storage unavailable */ }
  return { ...DEFAULTS };
}

function saveSettings(s) {
  try { localStorage.setItem('neon-riposte-settings', JSON.stringify(s)); } catch (_) { /* ignore */ }
}

const $ = (id) => document.getElementById(id);
const screens = ['title', 'howto', 'settings', 'pause', 'results', 'loading', 'fallback'];
function showScreen(name) {
  for (const s of screens) $(s).classList.toggle('hidden', s !== name);
}

function webgl2Available() {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch (_) {
    return false;
  }
}

async function boot() {
  if (!webgl2Available()) {
    showScreen('fallback');
    return;
  }
  const settings = loadSettings();
  const game = new Game($('game'), settings);
  game.applySettings(settings);
  window.__game = game; // handy for debugging from the console

  let backTarget = 'title';
  const audioKick = () => game.initAudio();
  window.addEventListener('pointerdown', audioKick);
  window.addEventListener('keydown', audioKick);

  // Hover / click sounds on every button
  document.querySelectorAll('button').forEach((b) => {
    b.addEventListener('mouseenter', () => game.sfx.ui('hover'));
    b.addEventListener('click', () => game.sfx.ui('click'));
  });

  $('btn-play').onclick = () => {
    game.initAudio();
    showScreen(null);
    game.startGame(0);
  };
  $('btn-howto').onclick = () => { backTarget = 'title'; showScreen('howto'); };
  $('btn-settings').onclick = () => { backTarget = 'title'; openSettings(); };
  $('btn-resume').onclick = () => { showScreen(null); game.resume(); };
  $('btn-pause-settings').onclick = () => { backTarget = 'pause'; openSettings(); };
  $('btn-pause-howto').onclick = () => { backTarget = 'pause'; showScreen('howto'); };
  $('btn-quit').onclick = () => { game.quitToTitle(); showScreen('title'); };
  $('btn-retry').onclick = () => { showScreen(null); game.startGame(0); };
  $('btn-retry-wave').onclick = () => { showScreen(null); game.startGame(game.lastWaveIndex || 0); };
  $('btn-title').onclick = () => { game.quitToTitle(); showScreen('title'); };
  $('btn-endless').onclick = () => { showScreen(null); game.continueEndless(); };
  document.querySelectorAll('.back').forEach((b) => (b.onclick = () => showScreen(backTarget)));

  game.on('pause', () => showScreen('pause'));
  game.on('resume', () => showScreen(null));
  game.on('results', (r) => {
    $('results-title').textContent = r.victory ? 'ENCORE!' : 'SILENCED';
    const gEl = $('results-grade');
    gEl.textContent = r.grade;
    gEl.style.color = r.gradeColor;
    $('results-stats').innerHTML = r.stats.map(([k, v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join('');
    $('btn-endless').classList.toggle('hidden', !r.victory);
    const canRetryWave = !r.victory && r.waveIndex > 0 && r.waveIndex < 8;
    $('btn-retry-wave').classList.toggle('hidden', !canRetryWave);
    $('btn-retry-wave').textContent = r.waveIndex === 7 ? 'RETRY BOSS' : `RETRY WAVE ${r.waveIndex + 1}`;
    showScreen('results');
  });

  // Settings form
  const S = {
    master: $('set-master'), music: $('set-music'), sfx: $('set-sfx'), sens: $('set-sens'),
    invert: $('set-invert'), lane: $('set-lane'), quality: $('set-quality'), latency: $('set-latency'),
  };
  function openSettings() {
    S.master.value = settings.master;
    S.music.value = settings.music;
    S.sfx.value = settings.sfx;
    S.sens.value = settings.sensitivity;
    S.invert.checked = settings.invertY;
    S.lane.checked = settings.showLane;
    S.quality.value = settings.quality;
    S.latency.value = settings.latency;
    showScreen('settings');
  }
  const onChange = () => {
    settings.master = +S.master.value;
    settings.music = +S.music.value;
    settings.sfx = +S.sfx.value;
    settings.sensitivity = +S.sens.value;
    settings.invertY = S.invert.checked;
    settings.showLane = S.lane.checked;
    const q = S.quality.value;
    const qChanged = q !== settings.quality;
    settings.quality = q;
    settings.latency = +S.latency.value || 0;
    game.applySettings(settings);
    saveSettings(settings);
    if (qChanged) S.quality.title = 'Reload the page to apply';
  };
  Object.values(S).forEach((el) => el.addEventListener('input', onChange));
  Object.values(S).forEach((el) => el.addEventListener('change', onChange));

  // Main loop
  const loop = () => {
    game.frame();
    requestAnimationFrame(loop);
  };
  game.frame();
  showScreen('title');
  requestAnimationFrame(loop);
}

boot().catch((err) => {
  console.error(err);
  const l = document.querySelector('.loading-text');
  if (l) l.textContent = 'FAILED TO START: ' + err.message;
});
