import * as THREE from 'three';
import { buildTextures } from './textures.js';
import { UI } from './ui/ui.js';
import { ContainerScreen } from './ui/container.js';
import { Input } from './input.js';
import { Game } from './game.js';
import { audio } from './audio.js';
import { saveSettings } from './save.js';

THREE.ColorManagement.enabled = false;

function boot() {
  const canvas = document.getElementById('c');
  try {
    const gl = canvas.getContext('webgl2');
    if (!gl) throw new Error('WebGL2 not supported');
  } catch (e) {
    document.getElementById('fatal').textContent = 'Sorry, this game needs a browser with WebGL2 support.';
    document.getElementById('fatal').style.display = 'flex';
    return;
  }
  buildTextures();
  const ui = new UI();
  const input = new Input(canvas);
  const game = new Game(canvas, ui, input);
  ui.container = new ContainerScreen(document.getElementById('container'), game);
  window.game = game; // handy for debugging from the console

  const applySettings = (s) => {
    audio.setVolume(s.volume);
    audio.setMusicVolume(s.music);
    if (game.world) game.world.renderDist = s.renderDist;
    saveSettings(s);
  };
  applySettings(ui.settings);
  ui.onSettings = applySettings;

  ui.onPlay = async (id) => {
    audio.init();
    try {
      await game.start(id);
    } catch (e) {
      console.error(e);
      ui.show('title');
      alert('Failed to start world: ' + e.message);
    }
  };
  ui.onResume = () => { audio.init(); game.resume(); };
  ui.onQuit = () => game.quit();
  ui.onRespawn = () => game.respawn();
  ui.onChat = (t) => game.command(t);

  input.onLockChange = (locked) => {
    if (!locked && game.running && !game.paused && !ui.chatOpen && !game.openContainer) game.pause();
  };
  // Clicking the canvas while paused-without-menu (e.g. after lock was refused) re-locks
  canvas.addEventListener('click', () => {
    if (game.running && !game.paused && !input.locked) input.lock();
  });
  input.onKeyDown = (e) => {
    if (e.code === 'Escape' && game.running) {
      if (game.openContainer) { game.resume(); return; }
      if (ui.screen === 'pause' && performance.now() - (game.pausedAt || 0) > 400) { game.resume(); return; }
      if (ui.screen === 'options' || ui.screen === 'controls') { ui.show(game.running ? 'pause' : 'title'); }
    }
  };
  window.addEventListener('beforeunload', () => { if (game.running) game.save(); });
  ui.show('title');
}

boot();
