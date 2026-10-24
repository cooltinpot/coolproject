import * as THREE from 'three';
import { B, I, BLOCKS, ITEMS, SOLID, OPAQUE, breakInfo, blockDrops, maxStack, CREATIVE_ITEMS, blockShapes, ARMOR_MATERIALS } from './blocks.js';
import { atlasTexture, tileCanvases, tileIndex } from './textures.js';
import { World } from './world/world.js';
import { CS, CH, SEA } from './world/chunk.js';
import { createChunkMaterials, createEntityBlockMaterial, lightToBrightness, setAmbient } from './render/materials.js';
import { Sky, DAY_TICKS } from './render/sky.js';
import { Weather } from './render/weather.js';
import { Player, GAMEMODE } from './entities/player.js';
import { MobManager, MOB_TYPES } from './entities/mobs.js';
import { ItemEntity, FallingBlock, PrimedTNT, Particles, Arrow, blockGeometry, isCubeItem, itemTexture, cloneBlockMat } from './entities/items.js';
import { buildModel, animateModel } from './entities/models.js';
import { newFurnace, newChest, tickFurnace } from './inventory.js';
import { audio } from './audio.js';
import { loadWorld, saveWorld, listWorlds } from './save.js';
import { makeRng } from './noise.js';

const TICK = 0.05;

export class Game {
  constructor(canvas, ui, input) {
    this.canvas = canvas;
    this.ui = ui;
    this.input = input;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.05, 1000);
    this.camera.rotation.order = 'YXZ';
    this.viewScene = new THREE.Scene();
    this.viewCam = new THREE.PerspectiveCamera(70, 1, 0.01, 10);
    this.materials = createChunkMaterials(atlasTexture);
    this.entityMat = createEntityBlockMaterial(atlasTexture, this.materials.shared);
    this.scene.fog = new THREE.Fog(0x9cc8ff, 60, 90);
    this.sky = new Sky(this.scene);
    this.weather = new Weather(this.scene);
    this.particles = new Particles(this.scene);
    this.running = false;
    this.paused = true;
    this.cameraMode = 0;
    this.showDebug = false;
    this.hudHidden = false;
    this.breaking = null;
    this.swing = 0;
    this.useCooldown = 0;
    this.attackCooldown = 0;
    this.tickAcc = 0;
    this.saveTimer = 0;
    this.fpsAcc = 0; this.fpsFrames = 0;
    this.shake = 0;
    this.sleepFade = 0;
    this.entities = [];
    this.openContainer = null;
    this.buildHighlight();
    this.buildViewmodel();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this._dir = new THREE.Vector3();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.viewCam.aspect = w / h; this.viewCam.updateProjectionMatrix();
  }

  buildHighlight() {
    const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    this.highlight = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45 }));
    this.highlight.visible = false;
    this.scene.add(this.highlight);
    this.crackTextures = [];
    for (let i = 0; i < 10; i++) {
      const t = new THREE.CanvasTexture(tileCanvases['destroy_' + i]);
      t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
      this.crackTextures.push(t);
    }
    this.crack = new THREE.Mesh(new THREE.BoxGeometry(1.004, 1.004, 1.004), new THREE.MeshBasicMaterial({
      map: this.crackTextures[0], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
    }));
    this.crack.visible = false;
    this.scene.add(this.crack);
  }

  buildViewmodel() {
    this.holder = new THREE.Group();
    this.viewScene.add(this.holder);
    const skinTex = (() => {
      const c = document.createElement('canvas'); c.width = 4; c.height = 12;
      const g = c.getContext('2d'); g.fillStyle = '#d2a07a'; g.fillRect(0, 0, 4, 12); g.fillStyle = '#c08a66'; g.fillRect(0, 0, 1, 12);
      const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; return t;
    })();
    this.armMat = new THREE.MeshBasicMaterial({ map: skinTex });
    this.arm = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.75, 0.25), this.armMat);
    this.heldMesh = null;
    this.heldId = -1;
    this.viewBlockMat = cloneBlockMat(this.entityMat);
    this.viewBlockMat.uniforms.fogFar = { value: 1e9 }; this.viewBlockMat.uniforms.fogNear = { value: 1e9 };
    this.viewItemMat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
  }

  // ---------------- lifecycle ----------------
  async start(worldId) {
    this.worldId = worldId;
    const info = listWorlds().find((w) => w.id === worldId);
    this.ui.show('loading');
    this.ui.setLoading('Loading world...', 0);
    const { meta, chunks, nether } = await loadWorld(worldId);
    const seed = meta ? meta.seed : info.seed;
    this.seed = seed;
    this.dimStore = {
      overworld: { saved: chunks, te: new Map(meta && meta.tileEntities ? meta.tileEntities : []) },
      nether: { saved: nether, te: new Map(meta && meta.netherTE ? meta.netherTE : []) },
    };
    this.createWorld((meta && meta.player && meta.player.dim) || 'overworld');
    this.world.time = meta ? meta.worldTime || 0 : 0;
    this.portalTime = 0; this.portalCooldown = 0;
    this.time = meta ? meta.time ?? 1000 : 1000;
    this.weatherState = (meta && meta.weather) || { type: 'clear', timer: 600 + Math.random() * 900 };
    this.weather.intensity = this.weatherState.type === 'clear' ? 0 : 1;
    this.player = new Player(this.world);
    this.player.onDeath = (src) => this.onDeath(src);
    this.mobs = new MobManager(this.world, this.scene);
    this.entities = [];
    if (meta && meta.player) this.player.load(meta.player);
    else {
      const sp = this.findSpawn();
      this.player.pos.copy(sp);
      this.player.spawn.copy(sp);
      this.player.setMode(info.mode === 'creative' ? GAMEMODE.CREATIVE : GAMEMODE.SURVIVAL);
      if (this.player.creative) this.giveCreativeKit();
    }
    this.thirdModel = buildModel('player');
    this.thirdModel.root.visible = false;
    this.scene.add(this.thirdModel.root);
    await this.loadArea('Generating terrain...');
    if (!meta || !meta.player) {
      this.player.pos.y = this.world.surfaceY(Math.floor(this.player.pos.x), Math.floor(this.player.pos.z)) + 1.01;
      this.player.spawn.copy(this.player.pos);
    }
    this.player.unstuck();
    if (meta && meta.mobs) this.mobs.load(meta.mobs);
    this.running = true;
    this.ui.message(`Welcome! Press E for inventory, T for chat/commands, F3 for debug.`, '#ffff80');
    this.ui.show(null);
    this.resume();
    this.lastFrame = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  createWorld(dim) {
    const store = this.dimStore[dim];
    const prevTime = this.world ? this.world.time : 0;
    this.world = new World(this.scene, this.materials, this.seed, store.saved, store.te, dim);
    this.world.time = prevTime;
    this.world.events = {
      fallingBlock: (x, y, z, id) => this.spawnFalling(x, y, z, id),
      blockBroken: (x, y, z, id, m, drop) => { this.particles.blockBreak(x, y, z, id); if (drop) this.dropBlock(x, y, z, id, m, true); },
      sound: (n, x, y, z) => audio.play(n, { x, y, z }),
    };
    this.particles.world = this.world;
    this.world.renderDist = this.ui.settings.renderDist;
    if (this.player) this.player.world = this.world;
    if (this.mobs) this.mobs.world = this.world;
  }

  // Generate and mesh the chunks around the player before play starts.
  async loadArea(label) {
    const R = Math.min(this.world.renderDist, 4);
    const total = (2 * R + 1) * (2 * R + 1);
    for (let iter = 0; iter < 2000; iter++) {
      const saveR = this.world.renderDist;
      this.world.renderDist = R;
      this.world.update(this.player.pos.x, this.player.pos.z, 40);
      this.world.renderDist = saveR;
      this.world._lastCenter = null;
      let meshed = 0;
      for (const c of this.world.chunks.values()) if (c.meshes) meshed++;
      this.ui.setLoading(label, Math.min(1, meshed / total));
      await new Promise((r) => setTimeout(r, 0));
      if (meshed >= total * 0.95) break;
    }
  }

  // Move the player to another dimension, landing at (x, z) and finding or building a portal if asked.
  async switchDimension(to, x, z, viaPortal) {
    if (this.switching) return;
    this.switching = true;
    const p = this.player;
    this.input.unlock();
    this.paused = true;
    this.ui.show('loading');
    this.ui.setLoading(to === 'nether' ? 'Entering the Nether...' : 'Leaving the Nether...', 0);
    await this.save();
    this.mobs.clear();
    for (const e of this.entities) e.remove();
    this.entities = [];
    this.particles.clear();
    this.breaking = null;
    this.world.dispose();
    this.createWorld(to);
    p.pos.set(Math.floor(x) + 0.5, 64, Math.floor(z) + 0.5);
    p.vel.set(0, 0, 0);
    await this.loadArea(to === 'nether' ? 'Building terrain...' : 'Generating terrain...');
    const w = this.world;
    const tx = Math.floor(x), tz = Math.floor(z);
    if (viaPortal) {
      let portal = w.findPortal(tx, 64, tz, 16);
      if (!portal) {
        let y = -1;
        if (to === 'nether') {
          for (let yy = 34; yy < 110 && y < 0; yy++) {
            let ok = SOLID[w.getBlock(tx, yy - 1, tz)] && w.getBlock(tx, yy - 1, tz) !== B.LAVA;
            for (let k = 0; k < 5 && ok; k++) for (let i = 0; i < 4 && ok; i++) if (w.getBlock(tx + i, yy + k, tz) !== 0) ok = false;
            if (ok) y = yy;
          }
          if (y < 0) y = 64;
        } else y = w.surfaceY(tx, tz) + 1;
        w.buildPortal(tx, y, tz);
        portal = [tx + 1, y + 1, tz];
      }
      p.pos.set(portal[0] + 0.5, portal[1], portal[2] + 0.5);
    } else {
      p.pos.y = w.surfaceY(tx, tz) + 1.01;
    }
    p.unstuck();
    p.fallDistance = 0;
    this.portalCooldown = 4;
    this.portalTime = 0;
    this.switching = false;
    this.ui.show(null);
    this.paused = false;
    this.input.lock();
  }

  giveCreativeKit() {
    const kit = [B.GRASS, B.STONE, B.PLANKS, B.GLASS, B.TORCH, B.OAK_LOG, B.BRICKS, B.TNT, I.FLINT_AND_STEEL];
    kit.forEach((id, i) => { this.player.inventory.slots[i] = { id, count: maxStack(id), dmg: 0 }; });
  }

  findSpawn() {
    const gen = this.world.gen;
    for (let r = 0; r < 2000; r += 16) {
      for (let a = 0; a < 8; a++) {
        const x = Math.round(Math.cos(a / 8 * Math.PI * 2) * r), z = Math.round(Math.sin(a / 8 * Math.PI * 2) * r);
        const c = gen.column(x, z);
        if (c.h > SEA + 1 && c.biome !== 6) return new THREE.Vector3(x + 0.5, c.h + 2, z + 0.5);
      }
    }
    return new THREE.Vector3(0.5, 90, 0.5);
  }

  resume() {
    if (!this.running || this.switching) return;
    this.closeContainer();
    this.ui.show(null);
    this.paused = false;
    this.input.lock();
  }

  pause() {
    if (!this.running || this.paused) return;
    this.paused = true;
    this.pausedAt = performance.now();
    this.input.unlock();
    this.ui.show('pause');
    this.save();
  }

  async quit() {
    if (!this.running) return;
    this.running = false;
    this.closeContainer();
    await this.save();
    this.input.unlock();
    this.mobs.clear();
    for (const e of this.entities) e.remove();
    this.entities = [];
    this.particles.clear();
    this.world.dispose();
    this.scene.remove(this.thirdModel.root);
    this.ui.show('title');
  }

  async save() {
    if (!this.world || this._saving) return;
    this._saving = true;
    try {
      const meta = {
        version: 1, seed: this.world.seed, time: this.time, worldTime: this.world.time, weather: this.weatherState,
        player: this.player.toJSON(),
        tileEntities: [...this.dimStore.overworld.te.entries()],
        netherTE: [...this.dimStore.nether.te.entries()],
        mobs: this.mobs.toJSON(),
      };
      meta.player.dim = this.world.dim;
      await saveWorld(this.worldId, meta, this.world.snapshotDirty(), this.world.dim);
    } catch (e) { console.warn('save error', e); }
    this._saving = false;
  }

  // ---------------- helpers ----------------
  get daylight() { return this.sky.daylight ?? 1; }

  lightAt(pos, yoff = 0) {
    const l = this.world.getLight(Math.floor(pos.x), Math.floor(pos.y + yoff), Math.floor(pos.z));
    return lightToBrightness(l, this.daylight);
  }

  xpInfo() {
    let xp = this.player.xp, level = 0;
    const need = (l) => (l < 16 ? 2 * l + 7 : l < 31 ? 5 * l - 38 : 9 * l - 158);
    while (xp >= need(level)) { xp -= need(level); level++; }
    return { level, progress: xp / need(level) };
  }
  xpLevel() { return this.xpInfo().level; }

  spawnItem(x, y, z, stack, vel = null, delay = 0.5) {
    if (!stack || stack.count <= 0) return;
    const e = new ItemEntity(this.world, this.scene, { id: stack.id, count: stack.count, dmg: stack.dmg || 0 }, this.entityMat);
    e.pos.set(x, y, z);
    if (vel) e.vel.copy(vel);
    else e.vel.set((Math.random() - 0.5) * 3, 3 + Math.random() * 2, (Math.random() - 0.5) * 3);
    e.pickupDelay = delay;
    this.entities.push(e);
    return e;
  }

  dropStack(stack) {
    if (!stack || stack.count <= 0) return;
    const p = this.player;
    const d = p.lookDir(new THREE.Vector3());
    const eye = p.eye;
    this.spawnItem(eye.x + d.x * 0.3, eye.y - 0.3 + d.y * 0.3, eye.z + d.z * 0.3, stack, d.multiplyScalar(6).add(new THREE.Vector3(0, 1.5, 0)), 1.5);
  }

  spawnFalling(x, y, z, id) {
    const e = new FallingBlock(this.world, this.scene, id, this.entityMat);
    e.pos.set(x + 0.5, y, z + 0.5);
    this.entities.push(e);
  }

  primeTNT(x, y, z, fuse = 4) {
    this.world.setBlock(x, y, z, 0);
    const e = new PrimedTNT(this.world, this.scene, this.entityMat, fuse);
    e.pos.set(x + 0.5, y, z + 0.5);
    this.entities.push(e);
  }

  dropBlock(x, y, z, id, meta, natural) {
    const drops = blockDrops(id, Math.random, true, meta);
    for (const [did, n] of drops) this.spawnItem(x + 0.5, y + 0.4, z + 0.5, { id: did, count: n, dmg: 0 });
    this.dropTileEntity(x, y, z);
    void natural;
  }

  dropTileEntity(x, y, z) {
    const key = `${x},${y},${z}`;
    const te = this.world.tileEntities.get(key) || this.world.removedTE.get(key);
    if (!te) return;
    this.world.removedTE.delete(key);
    for (const s of te.slots) if (s) this.spawnItem(x + 0.5, y + 0.5, z + 0.5, s);
    this.world.tileEntities.delete(key);
  }

  entityCtx() {
    if (!this._ctx) {
      this._ctx = {
        player: null, camera: this.camera, dayFactor: 1, daylight: 1, particles: this.particles,
        lightAt: (p, yo) => this.lightAt(p, yo),
        explode: (x, y, z, pw, src) => this.explode(x, y, z, pw, src),
        spawnItem: (x, y, z, s) => this.spawnItem(x, y, z, s),
        mobs: [],
        shootArrow: (mob, target, speed) => {
          const from = new THREE.Vector3(mob.pos.x, mob.pos.y + mob.h * 0.85, mob.pos.z);
          const to = new THREE.Vector3(target.pos.x, target.pos.y + 1.2, target.pos.z);
          const d = to.clone().sub(from);
          const dist = d.length();
          d.y += dist * dist * 10 / (speed * speed) ; // compensate for gravity drop
          d.normalize();
          d.x += (Math.random() - 0.5) * 0.06; d.z += (Math.random() - 0.5) * 0.06;
          from.addScaledVector(d, 0.6);
          this.entities.push(new Arrow(this.world, this.scene, mob, from, d.multiplyScalar(speed), false));
          audio.play('bow', mob.pos);
        },
        canSee: (mob, target) => {
          const from = new THREE.Vector3(mob.pos.x, mob.pos.y + mob.h * 0.85, mob.pos.z);
          const to = new THREE.Vector3(target.pos.x, target.pos.y + 1.5, target.pos.z);
          const d = to.clone().sub(from);
          const dist = d.length();
          const hit = this.world.raycast(from, d.normalize(), dist);
          return !hit || (hit.id > 0 && !BLOCKS[hit.id].opaque && !BLOCKS[hit.id].solid);
        },
        mate: (m) => this.mobs.mobs.find((o) => o !== m && o.type === m.type && o.love > 0 && !o.baby && !o.dying && o.pos.distanceTo(m.pos) < 8),
        breed: (a, b) => {
          a.love = 0; b.love = 0; a.breedCooldown = 300; b.breedCooldown = 300;
          const baby = this.mobs.spawn(a.type, a.pos.x, a.pos.y + 0.2, a.pos.z);
          baby.setBaby();
          this.player.xp += 3;
          for (let i = 0; i < 6; i++) this.particles.add(a.pos.x, a.pos.y + 1, a.pos.z, (Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2, [1, 0.3, 0.4], 0.1, 0.8, 2);
        },
      };
    }
    const c = this._ctx;
    c.player = this.player;
    c.mobs = this.mobs.mobs;
    c.raining = this.weatherState.type !== 'clear';
    c.dayFactor = this.sky.dayFactor ?? 1;
    c.daylight = this.daylight;
    return c;
  }

  explode(x, y, z, power, source) {
    const w = this.world;
    const r = power * 1.25;
    audio.play('explode', { x, y, z });
    this.particles.explosion(x, y, z, r);
    const dropChance = 1 / power;
    const ri = Math.ceil(r);
    for (let dy = -ri; dy <= ri; dy++) for (let dz = -ri; dz <= ri; dz++) for (let dx = -ri; dx <= ri; dx++) {
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > r * (0.65 + Math.random() * 0.35)) continue;
      const bx = Math.floor(x + dx), by = Math.floor(y + dy), bz = Math.floor(z + dz);
      const id = w.getBlock(bx, by, bz);
      if (id <= 0) continue;
      const def = BLOCKS[id];
      if (def.hardness < 0 || def.blastProof || def.fluid) continue;
      if (id === B.TNT) { this.primeTNT(bx, by, bz, 0.5 + Math.random()); continue; }
      const meta = w.getMeta(bx, by, bz);
      w.setBlock(bx, by, bz, 0);
      if (Math.random() < dropChance) this.dropBlock(bx, by, bz, id, meta, true);
      else this.dropTileEntity(bx, by, bz);
    }
    // entities
    const hitR = r * 2;
    const impact = (p) => {
      const d = p.distanceTo(new THREE.Vector3(x, y, z));
      if (d > hitR) return 0;
      return 1 - d / hitR;
    };
    const p = this.player;
    const ip = impact(p.pos.clone().add(new THREE.Vector3(0, 0.9, 0)));
    if (ip > 0) {
      const dmg = ((ip * ip + ip) / 2 * 7 * power * 2 + 1) * 0.5;
      p.damage(Math.floor(dmg), 'explosion');
      const dir = p.pos.clone().sub(new THREE.Vector3(x, y - 1, z)).normalize();
      p.vel.addScaledVector(dir, ip * 18);
      this.shake = Math.max(this.shake, ip);
    } else {
      const d = p.pos.distanceTo(new THREE.Vector3(x, y, z));
      if (d < 40) this.shake = Math.max(this.shake, 0.3 * (1 - d / 40));
    }
    const ctx = this.entityCtx();
    for (const m of this.mobs.mobs) {
      if (m === source) continue;
      const im = impact(m.pos);
      if (im > 0) { m.hurtTime = 0; m.hurt(Math.floor((im * im + im) / 2 * 7 * power * 2 + 1) * 0.5, { x, y, z }, ctx); }
    }
    for (const e of this.entities) {
      if (e === source) continue;
      const im = impact(e.pos);
      if (im > 0) {
        if (e instanceof ItemEntity && im > 0.5) { e.remove(); continue; }
        const dir = e.pos.clone().sub(new THREE.Vector3(x, y - 0.5, z)).normalize();
        e.vel.addScaledVector(dir, im * 15);
      }
    }
  }

  onDeath(src) {
    const names = { fall: 'fell from a high place', lava: 'tried to swim in lava', fire: 'burned to death', drown: 'drowned', zombie: 'was slain by Zombie',
      spider: 'was slain by Spider', lightning: 'was struck by lightning', arrow: 'was shot by Skeleton', explosion: 'blew up', starve: 'starved to death', cactus: 'was pricked to death', void: 'fell out of the world', kill: 'died' };
    const msg = `Player ${names[src] || 'died'}`;
    this.ui.message(msg, '#ff8080');
    document.getElementById('death-msg').textContent = msg;
    document.getElementById('death-score').textContent = `Score: ${this.player.xp}`;
    // drop everything
    const p = this.player;
    for (let i = 0; i < p.inventory.slots.length; i++) {
      const s = p.inventory.slots[i];
      if (s) { this.spawnItem(p.pos.x, p.pos.y + 1, p.pos.z, s, new THREE.Vector3((Math.random() - 0.5) * 6, 4, (Math.random() - 0.5) * 6), 2); p.inventory.slots[i] = null; }
    }
    p.xp = 0;
    this.closeContainer();
    this.input.unlock();
    this.paused = true;
    setTimeout(() => this.ui.show('death'), 800);
  }

  async respawn() {
    this.player.respawn();
    const sp = this.player.spawn;
    if (this.world.dim !== 'overworld') {
      await this.switchDimension('overworld', sp.x, sp.z, false);
      this.player.pos.copy(sp);
      this.awaitSpawn = this.world.getBlock(Math.floor(sp.x), Math.floor(sp.y), Math.floor(sp.z)) === -1;
      if (!this.awaitSpawn) this.player.unstuck();
      return;
    }
    if (this.world.getBlock(Math.floor(sp.x), Math.floor(sp.y), Math.floor(sp.z)) === -1) {
      // spawn chunk not loaded yet: settle onto the ground once it is
      this.awaitSpawn = true;
    } else this.player.unstuck();
    this.resume();
  }

  // ---------------- containers ----------------
  openUI(type, te = null) {
    this.input.unlock();
    this.paused = true;
    this.openContainer = type;
    this.ui.container.show(type, te);
    this.ui.show(null);
    document.body.classList.add('menu-open');
  }

  closeContainer() {
    if (!this.openContainer) return;
    this.openContainer = null;
    this.ui.container.close();
    document.body.classList.remove('menu-open');
  }

  // ---------------- main loop ----------------
  frame(t) {
    if (!this.running) return;
    requestAnimationFrame((tt) => this.frame(tt));
    let dt = (t - this.lastFrame) / 1000;
    this.lastFrame = t;
    if (dt > 0.25) dt = 0.25;
    if (dt <= 0) dt = 0.001;
    this.fpsAcc += dt; this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsAcc);
      this.fpsAcc = 0; this.fpsFrames = 0;
      this.ui.setFps(`${this.fps} fps`);
    }
    this.update(dt);
    this.render(dt);
    this.input.endFrame();
  }

  update(dt) {
    const p = this.player;
    const inGame = !this.paused;
    this.handleKeys();
    // world streaming always runs
    this.world.update(p.pos.x, p.pos.z, inGame ? 6 : 12);

    if (inGame || this.openContainer) {
      // fixed ticks
      this.tickAcc += dt;
      let n = 0;
      while (this.tickAcc >= TICK && n < 5) {
        this.tickAcc -= TICK; n++;
        this.gameTick();
      }
      if (n >= 5) this.tickAcc = 0;
    }
    if (inGame) {
      // mouse look
      const sens = 0.0022 * this.ui.settings.sensitivity;
      p.yaw -= this.input.mouse.dx * sens;
      p.pitch -= this.input.mouse.dy * sens;
      p.pitch = Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.001, p.pitch));
      if (this.input.mouse.wheel) {
        p.inventory.selected = (p.inventory.selected + this.input.mouse.wheel + 9) % 9;
      }
      // physics substeps
      const loaded = this.world.getBlock(Math.floor(p.pos.x), Math.floor(p.pos.y), Math.floor(p.pos.z)) !== -1;
      // nether portal travel
      this.portalCooldown = Math.max(0, (this.portalCooldown || 0) - dt);
      const inPortal = this.world.getBlock(Math.floor(p.pos.x), Math.floor(p.pos.y + 0.2), Math.floor(p.pos.z)) === B.PORTAL ||
        this.world.getBlock(Math.floor(p.pos.x), Math.floor(p.pos.y + 1.2), Math.floor(p.pos.z)) === B.PORTAL;
      if (inPortal && this.portalCooldown <= 0) {
        this.portalTime += dt;
        if (this.portalTime > (p.creative ? 0.5 : 3.5)) {
          const to = this.world.dim === 'nether' ? 'overworld' : 'nether';
          const s = to === 'nether' ? 1 / 8 : 8;
          this.switchDimension(to, p.pos.x * s, p.pos.z * s, true);
          return;
        }
      } else this.portalTime = Math.max(0, this.portalTime - dt * 2);
      if (inPortal && this.portalCooldown > 0) this.portalCooldown = 4;
      if (loaded && this.awaitSpawn) {
        this.awaitSpawn = false;
        p.pos.y = this.world.surfaceY(Math.floor(p.pos.x), Math.floor(p.pos.z)) + 1.01;
        p.unstuck(); p.fallDistance = 0; p.vel.set(0, 0, 0);
      }
      if (loaded) {
        const steps = Math.ceil(dt / 0.02);
        for (let i = 0; i < steps; i++) p.update(dt / steps, this.input);
      }
      this.handleInteraction(dt);
      this.sleepFade = Math.max(0, this.sleepFade - dt * 0.7);
    }
    if (inGame || this.openContainer) {
      const ctx = this.entityCtx();
      const steps = Math.min(5, Math.ceil(dt / 0.05));
      const sdt = dt / steps;
      for (let i = 0; i < steps; i++) {
        this.mobs.update(sdt, ctx);
        for (const e of this.entities) if (!e.dead) e.update(sdt, ctx);
      }
      this.entities = this.entities.filter((e) => !e.dead);
      this.mergeItems();
      // bubbles/flames
      if (p.headInWater && Math.random() < dt * 4) this.particles.bubble(p.pos.x + (Math.random() - 0.5) * 0.4, p.pos.y + 1.5, p.pos.z + (Math.random() - 0.5) * 0.4);
    }
    this.particles.update(dt, this.daylight);
    this.saveTimer += dt;
    if (this.saveTimer > 45) { this.saveTimer = 0; this.save(); }
    audio.listener = p.pos;
    audio.updateMusic(dt);
    // rain puts out fire
    const raining = this.weatherState.type !== 'clear' && this.world.dim === 'overworld';
    if (raining && (this.world.getLight(Math.floor(p.pos.x), Math.floor(p.pos.y + 1.6), Math.floor(p.pos.z)) >> 4) === 15) p.burning = 0;
    audio.rain(this.weather.intensity * (raining ? 1 : 0.0) * (this.paused && !this.openContainer ? 0 : 1));
    if (this.openContainer) this.ui.container.refresh();
  }

  mergeItems() {
    if (this.entities.length < 2 || Math.random() > 0.2) return;
    const items = this.entities.filter((e) => e instanceof ItemEntity && !e.dead && e.age > 0.5);
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      if (a.dead || b.dead || a.stack.id !== b.stack.id || ITEMS[a.stack.id].durability) continue;
      if (a.pos.distanceToSquared(b.pos) > 1) continue;
      if (a.stack.count + b.stack.count > maxStack(a.stack.id)) continue;
      a.stack.count += b.stack.count; b.remove();
    }
  }

  setWeather(type, duration) {
    this.weatherState = { type, timer: duration ?? (type === 'clear' ? 600 + Math.random() * 1200 : 240 + Math.random() * 360) };
  }

  gameTick() {
    const ws = this.weatherState;
    ws.timer -= TICK;
    if (ws.timer <= 0) this.setWeather(ws.type === 'clear' ? (Math.random() < 0.3 ? 'thunder' : 'rain') : 'clear');
    if (ws.type === 'thunder' && this.world.dim === 'overworld' && this.weather.intensity > 0.8 && Math.random() < TICK / 12) {
      const p = this.player.pos;
      const x = Math.floor(p.x + (Math.random() - 0.5) * 80), z = Math.floor(p.z + (Math.random() - 0.5) * 80);
      if (this.world.isLoaded(x, z)) {
        const y = this.world.surfaceY(x, z);
        this.weather.strike(x + 0.5, y + 1, z + 0.5);
        const d = Math.hypot(x - p.x, z - p.z);
        setTimeout(() => audio.play('thunder'), d * 8);
        if (d < 3) this.player.damage(5, 'lightning');
        for (const m of this.mobs.mobs) if (Math.hypot(m.pos.x - x, m.pos.z - z) < 3) { m.burning = 8; m.hurt(5, null, this.entityCtx()); }
      }
    }
    const w = this.world;
    this.time += 1;
    w.tick(TICK);
    w.randomTicks(this.player.pos.x, this.player.pos.z);
    // furnaces
    for (const [key, te] of w.tileEntities) {
      if (te.type !== 'furnace') continue;
      const [x, y, z] = key.split(',').map(Number);
      if (!w.isLoaded(x, z)) continue;
      const changed = tickFurnace(te, TICK);
      if (changed) {
        const id = w.getBlock(x, y, z);
        const meta = w.getMeta(x, y, z);
        if (id === B.FURNACE || id === B.FURNACE_LIT) w.setBlock(x, y, z, te.burn > 0 ? B.FURNACE_LIT : B.FURNACE, meta, { silent: true });
      }
      if (te.burn > 0 && Math.random() < 0.05) this.particles.smoke(x + 0.5, y + 1.05, z + 0.5);
    }
    // torch flames near player
    if (Math.random() < 0.5) {
      const p = this.player.pos;
      const x = Math.floor(p.x + (Math.random() - 0.5) * 16), y = Math.floor(p.y + (Math.random() - 0.5) * 8), z = Math.floor(p.z + (Math.random() - 0.5) * 16);
      const b = w.getBlock(x, y, z);
      if (b === B.TORCH) { this.particles.flame(x + 0.5, y + 0.72, z + 0.5); if (Math.random() < 0.5) this.particles.smoke(x + 0.5, y + 0.8, z + 0.5); }
      else if (b === B.LAVA && w.getBlock(x, y + 1, z) === 0 && Math.random() < 0.3) this.particles.add(x + Math.random(), y + 1, z + Math.random(), (Math.random() - 0.5), 4, (Math.random() - 0.5), [1, 0.6, 0.1], 0.06, 1, 10);
    }
  }

  handleKeys() {
    const inp = this.input;
    const p = this.player;
    if (this.openContainer) {
      for (let i = 0; i < 9; i++) if (inp.pressed.has(`Digit${i + 1}`)) this.ui.container.hotkey(i);
      if (inp.pressed.has('KeyQ')) this.ui.container.dropHovered(inp.keys.has('ControlLeft'));
      if (inp.pressed.has('KeyE') || inp.pressed.has('Escape')) this.resume();
      return;
    }
    if (this.paused) return;
    for (let i = 0; i < 9; i++) if (inp.keyPressed(`Digit${i + 1}`)) p.inventory.selected = i;
    if (inp.keyPressed('KeyE')) { this.openUI('inventory'); return; }
    if (inp.keyPressed('KeyT')) { this.input.unlock(); this.paused = true; this.ui.openChat(''); return; }
    if (inp.keyPressed('Slash')) { this.input.unlock(); this.paused = true; this.ui.openChat('/'); return; }
    if (inp.keyPressed('F3')) this.showDebug = !this.showDebug;
    if (inp.keyPressed('F5')) this.cameraMode = (this.cameraMode + 1) % 3;
    if (inp.keyPressed('F1')) { this.hudHidden = !this.hudHidden; document.body.classList.toggle('hud-hidden', this.hudHidden); }
    if (inp.keyPressed('KeyQ')) {
      const s = p.inventory.held;
      if (s) {
        const all = inp.key('ControlLeft');
        const n = all ? s.count : 1;
        this.dropStack({ ...s, count: n });
        p.inventory.consumeHeld(n);
      }
    }
  }

  // ---------------- interaction ----------------
  targetMob(eye, dir, reach) {
    let best = null, bd = reach;
    for (const m of this.mobs.mobs) {
      if (m.dying) continue;
      const d = m.rayHit(eye, dir, reach);
      if (d >= 0 && d < bd) { bd = d; best = m; }
    }
    return best ? { mob: best, dist: bd } : null;
  }

  handleInteraction(dt) {
    const p = this.player;
    if (p.dead) return;
    const inp = this.input;
    const eye = p.eye;
    const dir = p.lookDir(this._dir);
    const reach = p.creative ? 5 : 4.5;
    const hit = this.world.raycast(eye, dir, reach);
    const mobHit = this.targetMob(eye, dir, p.creative ? 5 : 3.2);
    const mobFirst = mobHit && (!hit || mobHit.dist < hit.dist);
    this.target = hit;
    this.useCooldown -= dt;
    this.attackCooldown -= dt;
    this.swing = Math.max(0, this.swing - dt * 4);

    // highlight
    if (hit && !mobFirst) {
      const def = BLOCKS[hit.id];
      let box = [0, 0, 0, 16, 16, 16];
      const shapes = blockShapes(hit.id, this.world.getMeta(hit.x, hit.y, hit.z));
      if (shapes) box = [0, 1, 2].map((k) => Math.min(...shapes.map((b) => b[k]))).concat([3, 4, 5].map((k) => Math.max(...shapes.map((b) => b[k]))));
      else if (def.render === 'cross') box = [2, 0, 2, 14, 13, 14];
      else if (def.render === 'torch') box = [6, 0, 6, 10, 10, 10];
      else if (def.render === 'ladder') box = [0, 0, 0, 16, 16, 16];
      const sx = (box[3] - box[0]) / 16, sy = (box[4] - box[1]) / 16, sz = (box[5] - box[2]) / 16;
      this.highlight.visible = true;
      this.highlight.scale.set(sx + 0.004, sy + 0.004, sz + 0.004);
      this.highlight.position.set(hit.x + (box[0] + box[3]) / 32, hit.y + (box[1] + box[4]) / 32, hit.z + (box[2] + box[5]) / 32);
    } else this.highlight.visible = false;

    // ---- eating ----
    const held = p.inventory.held;
    const heldDef = held ? ITEMS[held.id] : null;
    // ---- bow ----
    if (heldDef && heldDef.bow) {
      const hasArrow = p.creative || p.inventory.count(I.ARROW) > 0;
      if (inp.button(2) && hasArrow) this.bowCharge = Math.min(1, (this.bowCharge || 0) + dt);
      else if (this.bowCharge > 0) {
        const t = this.bowCharge;
        this.bowCharge = 0;
        if (t > 0.1) {
          const f = Math.min(1, (t * t + 2 * t) / 3);
          const d = p.lookDir(new THREE.Vector3());
          const from = p.eye.addScaledVector(d, 0.4);
          this.entities.push(new Arrow(this.world, this.scene, p, from, d.multiplyScalar(f * 55).add(new THREE.Vector3(p.vel.x * 0.5, 0, p.vel.z * 0.5)), true));
          audio.play('bow');
          if (!p.creative) { p.inventory.removeItem(I.ARROW, 1); p.inventory.damageHeld(1); }
        }
      }
    } else this.bowCharge = 0;
    if (heldDef && heldDef.food && inp.button(2) && (p.food < 20 || p.creative || held.id === I.GOLDEN_APPLE) && !(hit && BLOCKS[hit.id].interact && !p.sneaking)) {
      p.eatTimer += dt;
      if (Math.random() < dt * 8) audio.play('eat');
      if (p.eatTimer >= 1.6) {
        p.eatTimer = 0;
        p.eat(heldDef.food);
        if (heldDef.food.poison && Math.random() < 0.8) { p.addExhaustion(15); this.ui.message('You feel sick...', '#a0ff80'); }
        audio.play('burp');
        if (!p.creative) {
          p.inventory.consumeHeld(1);
          if (heldDef.food.returns) p.inventory.add({ id: heldDef.food.returns, count: 1, dmg: 0 });
        }
      }
      this.breaking = null; this.crack.visible = false;
      return;
    }
    p.eatTimer = 0;

    // ---- attack / break ----
    if (inp.button(0)) {
      if (mobFirst) {
        if (inp.clicked(0) || this.attackCooldown <= 0) {
          if (this.attackCooldown <= 0) this.attack(mobHit.mob);
        }
        this.breaking = null;
      } else if (hit) {
        this.mine(hit, dt, inp.clicked(0));
      } else {
        if (inp.clicked(0)) this.swing = 1;
        this.breaking = null;
      }
    } else {
      this.breaking = null;
    }
    if (!this.breaking) this.crack.visible = false;

    // ---- use / place ----
    if (inp.button(2) && this.useCooldown <= 0 && !(heldDef && heldDef.bow)) {
      if (mobFirst && this.interactMob(mobHit.mob)) { this.useCooldown = 0.25; return; }
      this.use(hit, inp.clicked(2));
    }
    // pick block
    if (inp.clicked(1) && hit) this.pickBlock(hit.id);
  }

  attack(mob) {
    const p = this.player;
    const held = p.inventory.held;
    const def = held ? ITEMS[held.id] : null;
    let dmg = def && def.damage ? def.damage : 1;
    if (!p.onGround && p.vel.y < 0 && !p.inWater) dmg *= 1.5; // critical
    if (mob.hurt(dmg, p.pos, this.entityCtx())) {
      if (p.sprinting) { mob.vel.x *= 1.6; mob.vel.z *= 1.6; p.sprinting = false; }
      p.addExhaustion(0.1);
      if (def && def.tool && !p.creative) p.inventory.damageHeld(def.tool.type === 'sword' ? 1 : 2);
      for (let i = 0; i < 6; i++) this.particles.add(mob.pos.x, mob.pos.y + mob.h * 0.7, mob.pos.z, (Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3, [0.6, 0.1, 0.1], 0.05, 0.5);
    }
    this.swing = 1;
    this.attackCooldown = 0.3;
  }

  interactMob(mob) {
    const p = this.player;
    const held = p.inventory.held;
    if (held && held.id === mob.def.food && !mob.baby && mob.breedCooldown <= 0 && mob.love <= 0) {
      mob.love = 30;
      if (!p.creative) p.inventory.consumeHeld(1);
      for (let i = 0; i < 5; i++) this.particles.add(mob.pos.x, mob.pos.y + mob.h, mob.pos.z, (Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2, [1, 0.3, 0.4], 0.08, 0.8, 2);
      this.swing = 1;
      return true;
    }
    return false;
  }

  mine(hit, dt, clicked) {
    const p = this.player;
    const w = this.world;
    if (p.creative) {
      if (clicked || this.useCooldownBreak === undefined || this.useCooldownBreak <= 0) {
        const held = p.inventory.held;
        if (held && ITEMS[held.id].tool && ITEMS[held.id].tool.type === 'sword') return;
        this.useCooldownBreak = 0.22;
        this.finishBreak(hit, false);
      } else this.useCooldownBreak -= dt;
      this.swing = 1;
      return;
    }
    const b = this.breaking;
    if (!b || b.x !== hit.x || b.y !== hit.y || b.z !== hit.z || b.id !== hit.id) {
      this.breaking = { x: hit.x, y: hit.y, z: hit.z, id: hit.id, progress: 0, soundT: 0 };
    }
    const br = this.breaking;
    const held = p.inventory.held;
    const info = breakInfo(hit.id, held ? held.id : 0);
    let time = info.time;
    if (p.headInWater) time *= 5;
    if (!p.onGround && !p.flying && !p.onLadder) time *= 5;
    if (time === Infinity) { this.swing = 1; return; }
    br.progress += time > 0 ? dt / time : 1;
    br.soundT -= dt;
    if (br.soundT <= 0) {
      br.soundT = 0.25;
      audio.block('hit', BLOCKS[hit.id].sound, { x: hit.x, y: hit.y, z: hit.z });
      this.particles.hit(hit.x, hit.y, hit.z, hit.face, hit.id);
    }
    this.swing = Math.max(this.swing, 0.6 + Math.random() * 0.1);
    if (br.progress >= 1) {
      this.finishBreak(hit, info.canHarvest);
      this.breaking = null;
      this.crack.visible = false;
      return;
    }
    const stage = Math.min(9, Math.floor(br.progress * 10));
    this.crack.visible = true;
    this.crack.material.map = this.crackTextures[stage];
    this.crack.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
  }

  finishBreak(hit, harvest) {
    const p = this.player;
    const w = this.world;
    const { x, y, z, id } = hit;
    const meta = w.getMeta(x, y, z);
    const def = BLOCKS[id];
    let replace = 0;
    if (id === B.ICE && !p.creative) {
      const below = w.getBlock(x, y - 1, z);
      if (below > 0 && (SOLID[below] || BLOCKS[below].fluid)) replace = B.WATER;
    }
    if (id === B.TNT && !p.creative) { this.primeTNT(x, y, z); return; }
    w.setBlock(x, y, z, replace);
    audio.block('break', def.sound, { x, y, z });
    this.particles.blockBreak(x, y, z, id);
    if (!p.creative) {
      if (harvest) {
        const drops = blockDrops(id, Math.random, true, meta);
        for (const [did, n] of drops) this.spawnItem(x + 0.5, y + 0.3, z + 0.5, { id: did, count: n, dmg: 0 });
        if (id === B.COAL_ORE) p.xp += 1;
        if (id === B.DIAMOND_ORE) p.xp += 5;
      }
      this.dropTileEntity(x, y, z);
      p.addExhaustion(0.005);
      const held = p.inventory.held;
      if (held && ITEMS[held.id].tool && def.hardness > 0) {
        if (p.inventory.damageHeld(ITEMS[held.id].tool.type === 'sword' ? 2 : 1)) audio.block('break', 'wood', null);
      }
    } else {
      this.world.tileEntities.delete(`${x},${y},${z}`);
    }
  }

  pickBlock(id) {
    const inv = this.player.inventory;
    let pick = id;
    if (id === B.FURNACE_LIT) pick = B.FURNACE;
    if (id === B.WHEAT) pick = I.WHEAT_SEEDS;
    for (let i = 0; i < 9; i++) if (inv.slots[i] && inv.slots[i].id === pick) { inv.selected = i; return; }
    if (this.player.creative) {
      let slot = inv.slots.findIndex((s, i) => i < 9 && !s);
      if (slot < 0) slot = inv.selected;
      inv.slots[slot] = { id: pick, count: maxStack(pick), dmg: 0 };
      inv.selected = slot;
      inv.changed();
    }
  }

  use(hit, clicked) {
    const p = this.player;
    const w = this.world;
    const inv = p.inventory;
    const held = inv.held;
    const heldDef = held ? ITEMS[held.id] : null;
    this.useCooldown = 0.22;

    // interact with blocks
    if (hit && !p.sneaking) {
      const def = BLOCKS[hit.id];
      const key = `${hit.x},${hit.y},${hit.z}`;
      if (def.interact === 'crafting') { this.openUI('crafting'); return; }
      if (def.interact === 'furnace') {
        if (w.tileEntities.get(key)?.type !== 'furnace') w.tileEntities.set(key, newFurnace());
        this.openUI('furnace', w.tileEntities.get(key));
        return;
      }
      if (def.interact === 'chest') {
        if (w.tileEntities.get(key)?.type !== 'chest') w.tileEntities.set(key, newChest());
        this.openUI('chest', w.tileEntities.get(key));
        audio.play('door', hit);
        return;
      }
      if (def.interact === 'bed') { this.trySleep(hit); return; }
      if (def.interact === 'door') {
        const m = w.getMeta(hit.x, hit.y, hit.z);
        const by = m & 8 ? hit.y - 1 : hit.y;
        for (const yy of [by, by + 1]) if (w.getBlock(hit.x, yy, hit.z) === hit.id) w.setBlock(hit.x, yy, hit.z, hit.id, w.getMeta(hit.x, yy, hit.z) ^ 4, { silent: true });
        audio.play('door', hit);
        this.swing = 1;
        return;
      }
      if (def.interact === 'tnt' && held && held.id === I.FLINT_AND_STEEL) {
        this.primeTNT(hit.x, hit.y, hit.z);
        audio.play('ignite', hit);
        if (!p.creative) inv.damageHeld(1);
        this.swing = 1;
        return;
      }
    }
    if (!held) return;

    // buckets
    if (held.id === I.BUCKET) {
      const fh = w.raycast(p.eye, p.lookDir(new THREE.Vector3()), 5, true);
      if (fh && BLOCKS[fh.id].fluid && w.getMeta(fh.x, fh.y, fh.z) === 0) {
        w.setBlock(fh.x, fh.y, fh.z, 0);
        const filled = fh.id === B.WATER ? I.WATER_BUCKET : I.LAVA_BUCKET;
        audio.play('bucket', fh);
        if (!p.creative) {
          if (held.count > 1) { inv.consumeHeld(1); inv.add({ id: filled, count: 1, dmg: 0 }); }
          else inv.held = { id: filled, count: 1, dmg: 0 };
        }
        this.swing = 1;
      }
      return;
    }
    // equip armor
    if (heldDef.armor) {
      const slot = heldDef.armor.slot;
      const prev = inv.armor[slot];
      inv.armor[slot] = held;
      inv.held = prev;
      audio.play('door');
      this.swing = 1;
      return;
    }
    if (!hit) return;
    const tx = hit.x + hit.face[0], ty = hit.y + hit.face[1], tz = hit.z + hit.face[2];
    const hitDef = BLOCKS[hit.id];
    // place into replaceable target block itself
    let px = tx, py = ty, pz = tz;
    if (hitDef.replaceable && !hitDef.fluid) { px = hit.x; py = hit.y; pz = hit.z; }

    if (held.id === I.WATER_BUCKET || held.id === I.LAVA_BUCKET) {
      const cur = w.getBlock(px, py, pz);
      if (cur === 0 || (cur > 0 && BLOCKS[cur].replaceable)) {
        if (held.id === I.WATER_BUCKET && w.dim === 'nether') {
          audio.play('fizz', hit);
          for (let i = 0; i < 8; i++) this.particles.smoke(px + Math.random(), py + Math.random(), pz + Math.random());
          if (!p.creative) inv.held = { id: I.BUCKET, count: 1, dmg: 0 };
          return;
        }
        w.setBlock(px, py, pz, held.id === I.WATER_BUCKET ? B.WATER : B.LAVA, 0);
        w.scheduleUpdate(px, py, pz, 0.1, 'fluid');
        audio.play('bucket', hit);
        if (!p.creative) inv.held = { id: I.BUCKET, count: 1, dmg: 0 };
        this.swing = 1;
      }
      return;
    }
    if (heldDef.tool && heldDef.tool.type === 'hoe') {
      if ((hit.id === B.GRASS || hit.id === B.DIRT) && hit.face[1] === 1 && w.getBlock(hit.x, hit.y + 1, hit.z) === 0) {
        w.setBlock(hit.x, hit.y, hit.z, B.FARMLAND);
        audio.block('place', 'gravel', hit);
        if (!p.creative) inv.damageHeld(1);
        this.swing = 1;
      }
      return;
    }
    if (heldDef.plants) {
      if (hit.id === B.FARMLAND && hit.face[1] === 1 && w.getBlock(hit.x, hit.y + 1, hit.z) === 0) {
        w.setBlock(hit.x, hit.y + 1, hit.z, heldDef.plants, 0);
        audio.block('place', 'grass', hit);
        if (!p.creative) inv.consumeHeld(1);
        this.swing = 1;
      }
      return;
    }
    if (held.id === I.BONE_MEAL) {
      if (this.applyBoneMeal(hit.x, hit.y, hit.z) && !p.creative) inv.consumeHeld(1);
      this.swing = 1;
      return;
    }
    if (held.id === I.FLINT_AND_STEEL) {
      if (hit.id === B.OBSIDIAN && w.tryLightPortal(tx, ty, tz)) {
        audio.play('ignite', hit);
        this.ui.message('A portal hums to life...', '#d0a0ff');
        if (!p.creative) inv.damageHeld(1);
        this.swing = 1;
      }
      return;
    }
    if (!heldDef.isBlock) return;

    // place block
    const id = held.id;
    const def = BLOCKS[id];
    const hitPoint = p.eye.addScaledVector(p.lookDir(new THREE.Vector3()), hit.dist);
    const upperHalf = hit.face[1] === -1 || (hit.face[1] === 0 && hitPoint.y - Math.floor(hitPoint.y) > 0.5);
    if (def.shape === 'slab') {
      const hm = w.getMeta(hit.x, hit.y, hit.z);
      let dx = null;
      if (hit.id === id && ((hit.face[1] === 1 && !(hm & 1)) || (hit.face[1] === -1 && (hm & 1)))) dx = [hit.x, hit.y, hit.z];
      else if (w.getBlock(px, py, pz) === id) dx = [px, py, pz];
      if (dx) {
        w.setBlock(dx[0], dx[1], dx[2], def.double, 0);
        audio.block('place', def.sound, hit);
        this.swing = 1;
        if (!p.creative) inv.consumeHeld(1);
        return;
      }
    }
    if (py < 0 || py >= CH) return;
    const cur = w.getBlock(px, py, pz);
    if (cur < 0) return;
    if (cur !== 0 && !(BLOCKS[cur].replaceable)) return;
    let meta = 0;
    const yaw = ((p.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const facing = [0, 3, 2, 1][Math.round(yaw / (Math.PI / 2)) % 4]; // front faces the player
    if (def.facing) meta = facing;
    if (def.shape === 'slab') meta = upperHalf ? 1 : 0;
    if (def.shape === 'stairs') meta = facing | (upperHalf ? 4 : 0);
    if (def.shape === 'door') {
      const above = w.getBlock(px, py + 1, pz);
      if (!(above === 0 || (above > 0 && BLOCKS[above].replaceable)) || !SOLID[w.getBlock(px, py - 1, pz)]) return;
      const box = [px, py, pz, px + 1, py + 2, pz + 1];
      const a = p.aabb();
      if (a[0] < box[3] && a[3] > box[0] && a[1] < box[4] && a[4] > box[1] && a[2] < box[5] && a[5] > box[2]) return;
      w.setBlock(px, py, pz, id, facing);
      w.setBlock(px, py + 1, pz, id, facing | 8);
      audio.block('place', def.sound, hit);
      this.swing = 1;
      if (!p.creative) inv.consumeHeld(1);
      return;
    }
    if (id === B.TORCH || id === B.LADDER) {
      const f = hit.face;
      if (f[1] === -1) return;
      if (f[1] === 1) { if (id === B.LADDER) return; meta = 0; }
      else {
        // support is opposite of the face normal
        const sup = [-f[0], -f[2]];
        meta = sup[0] === 1 ? 1 : sup[0] === -1 ? 2 : sup[1] === 1 ? 3 : 4;
      }
    }
    if (id === B.OAK_LEAVES || id === B.BIRCH_LEAVES || id === B.SPRUCE_LEAVES) meta = 1;
    // collision check
    if (def.solid) {
      const box = [px, py, pz, px + 1, py + 1, pz + 1];
      const overlaps = (e) => {
        const a = e.aabb();
        return a[0] < box[3] && a[3] > box[0] && a[1] < box[4] && a[4] > box[1] && a[2] < box[5] && a[5] > box[2];
      };
      if (overlaps(p)) return;
      for (const m of this.mobs.mobs) if (overlaps(m)) return;
    }
    // temporary place, check support
    w.setBlock(px, py, pz, id, meta);
    if (def.needsSupport && !w.isSupported(px, py, pz, id)) { w.setBlock(px, py, pz, cur); return; }
    if (def.fluid) w.scheduleUpdate(px, py, pz, 0.1, 'fluid');
    audio.block('place', def.sound, { x: px, y: py, z: pz });
    this.swing = 1;
    if (!p.creative) inv.consumeHeld(1);
  }

  applyBoneMeal(x, y, z) {
    const w = this.world;
    const id = w.getBlock(x, y, z);
    const sparkle = () => { for (let i = 0; i < 8; i++) this.particles.add(x + Math.random(), y + 0.5 + Math.random(), z + Math.random(), 0, 1, 0, [0.5, 1, 0.5], 0.06, 0.8, -0.5); };
    if (id === B.SAPLING) { if (Math.random() < 0.45) w.growTree(x, y, z); sparkle(); return true; }
    if (id === B.WHEAT) { w.setBlock(x, y, z, B.WHEAT, Math.min(7, w.getMeta(x, y, z) + 2 + Math.floor(Math.random() * 3))); sparkle(); return true; }
    if (id === B.GRASS && w.getBlock(x, y + 1, z) === 0) {
      for (let i = 0; i < 24; i++) {
        const gx = x + Math.floor((Math.random() - 0.5) * 7), gz = z + Math.floor((Math.random() - 0.5) * 7);
        for (let dy = 1; dy >= -1; dy--) {
          if (w.getBlock(gx, y + dy, gz) === B.GRASS && w.getBlock(gx, y + dy + 1, gz) === 0) {
            const r = Math.random();
            w.setBlock(gx, y + dy + 1, gz, r < 0.8 ? B.TALL_GRASS : r < 0.9 ? B.DANDELION : B.ROSE);
            break;
          }
        }
      }
      sparkle();
      return true;
    }
    return false;
  }

  trySleep(hit) {
    const p = this.player;
    if (this.world.dim === 'nether') {
      this.world.setBlock(hit.x, hit.y, hit.z, 0);
      this.explode(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, 5, null);
      return;
    }
    const day = this.sky.dayFactor;
    p.spawn.set(hit.x + 0.5, hit.y + 1, hit.z + 0.5);
    if (day > 0.35) { this.ui.message('You can only sleep at night. Respawn point set.', '#ffff80'); return; }
    const near = this.mobs.mobs.some((m) => m.def.hostile && !m.dying && m.pos.distanceTo(p.pos) < 10);
    if (near) { this.ui.message('You may not rest now; there are monsters nearby', '#ff8080'); return; }
    this.sleepFade = 1.6;
    const t = this.time % DAY_TICKS;
    this.time += (DAY_TICKS - t) + 200;
    this.ui.message('Good morning! Respawn point set.', '#ffff80');
  }

  // ---------------- commands ----------------
  command(text) {
    const p = this.player;
    if (!text.startsWith('/')) { this.ui.message(`<Player> ${text}`); return; }
    const [cmd, ...args] = text.slice(1).split(/\s+/);
    const msg = (m, c = '#c0c0c0') => this.ui.message(m, c);
    switch (cmd.toLowerCase()) {
      case 'help':
        msg('/gamemode <survival|creative>, /time set <day|night|noon|midnight|n>, /give <item> [n], /tp <x> <y> <z>, /summon <mob>, /kill, /heal, /seed, /spawnpoint, /clear, /locate, /fly, /weather <clear|rain|thunder>, /dimension <overworld|nether>');
        break;
      case 'gamemode': case 'gm': {
        const a = (args[0] || '').toLowerCase();
        const m = ['creative', 'c', '1'].includes(a) ? GAMEMODE.CREATIVE : ['survival', 's', '0'].includes(a) ? GAMEMODE.SURVIVAL : null;
        if (!m) { msg('Usage: /gamemode <survival|creative>'); break; }
        p.setMode(m); msg(`Set own game mode to ${m}`);
        break;
      }
      case 'time': {
        const v = (args[1] || args[0] || '').toLowerCase();
        const map = { day: 1000, noon: 6000, sunset: 12000, night: 13000, midnight: 18000, sunrise: 23500 };
        let t = map[v] ?? parseInt(v, 10);
        if (isNaN(t)) { msg('Usage: /time set <day|night|number>'); break; }
        this.time = Math.floor(this.time / DAY_TICKS) * DAY_TICKS + t;
        msg(`Set the time to ${t}`);
        break;
      }
      case 'give': {
        const q = (args[0] || '').toLowerCase().replace(/^minecraft:/, '');
        const n = parseInt(args[1] || '1', 10) || 1;
        const id = ITEMS.findIndex((it) => it && (it.name === q || it.display.toLowerCase() === q.replace(/_/g, ' ') || String(it.id) === q));
        if (id < 0) { msg(`Unknown item '${q}'`, '#ff8080'); break; }
        p.inventory.add({ id, count: n, dmg: 0 });
        msg(`Gave ${n} [${ITEMS[id].display}]`);
        break;
      }
      case 'tp': {
        const [x, y, z] = args.map((a, i) => (a.startsWith('~') ? p.pos.getComponent(i) + (parseFloat(a.slice(1)) || 0) : parseFloat(a)));
        if ([x, y, z].some((v) => isNaN(v))) { msg('Usage: /tp <x> <y> <z>'); break; }
        p.pos.set(x, y, z); p.vel.set(0, 0, 0); p.fallDistance = 0;
        msg(`Teleported to ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}`);
        break;
      }
      case 'summon': {
        const t = (args[0] || '').toLowerCase();
        if (!MOB_TYPES[t]) { msg(`Unknown mob. Try: ${Object.keys(MOB_TYPES).join(', ')}`, '#ff8080'); break; }
        const d = p.lookDir(new THREE.Vector3());
        this.mobs.spawn(t, p.pos.x + d.x * 3, p.pos.y + 0.5, p.pos.z + d.z * 3);
        msg(`Summoned new ${t}`);
        break;
      }
      case 'kill': p.damage(1000, 'kill'); break;
      case 'heal': p.health = 20; p.food = 20; p.saturation = 5; msg('Healed'); break;
      case 'seed': msg(`Seed: [${this.world.seed}]`); break;
      case 'spawnpoint': p.spawn.copy(p.pos); msg('Set spawn point'); break;
      case 'clear': p.inventory.slots.fill(null); p.inventory.changed(); msg('Cleared inventory'); break;
      case 'fly': if (p.creative) { p.flying = !p.flying; } else msg('Flying requires creative mode'); break;
      case 'xp': p.xp += parseInt(args[0] || '10', 10) || 0; break;
      case 'weather': {
        const t = (args[0] || '').toLowerCase();
        if (!['clear', 'rain', 'thunder'].includes(t)) { msg('Usage: /weather <clear|rain|thunder>'); break; }
        this.setWeather(t, args[1] ? parseInt(args[1], 10) : undefined);
        msg(`Changed the weather to ${t}`);
        break;
      }
      case 'dimension': case 'nether': {
        const to = (args[0] || (this.world.dim === 'nether' ? 'overworld' : 'nether')).toLowerCase();
        if (to !== 'nether' && to !== 'overworld') { msg('Usage: /dimension <overworld|nether>'); break; }
        if (to === this.world.dim) break;
        const s = to === 'nether' ? 1 / 8 : 8;
        this.switchDimension(to, p.pos.x * s, p.pos.z * s, true);
        break;
      }
      case 'locate': msg(`You are in biome: ${this.world.getBiome(Math.floor(p.pos.x), Math.floor(p.pos.z))}`); break;
      default: msg(`Unknown command: ${cmd}. Type /help`, '#ff8080');
    }
  }

  // ---------------- rendering ----------------
  render(dt) {
    const p = this.player;
    const r = this.renderer;
    const cam = this.camera;
    // camera
    const eye = p.eye;
    const settings = this.ui.settings;
    {
      const target = settings.fov * (p.sprinting ? 1.12 : 1) * (p.flying && p.sprinting ? 1.05 : 1) * (1 - 0.18 * (this.bowCharge || 0));
      if (Math.abs(cam.fov - target) > 0.01) {
        cam.fov += (target - cam.fov) * Math.min(1, dt * 10);
        cam.updateProjectionMatrix();
      }
    }
    let bobX = 0, bobY = 0;
    if (settings.bobbing && this.cameraMode === 0) {
      bobX = Math.sin(p.bob) * 0.05 * p.bobAmt;
      bobY = Math.abs(Math.cos(p.bob)) * 0.07 * p.bobAmt;
    }
    this.shake = Math.max(0, this.shake - dt * 1.5);
    const sh = this.shake * 0.3;
    cam.rotation.set(p.pitch + (Math.random() - 0.5) * sh, p.yaw + (Math.random() - 0.5) * sh, p.hurtTilt * 0.08 * Math.sin(p.hurtTilt * 8));
    cam.position.set(eye.x + Math.cos(p.yaw) * bobX, eye.y + bobY, eye.z - Math.sin(p.yaw) * bobX);
    this.thirdModel.root.visible = this.cameraMode !== 0;
    if (this.cameraMode !== 0) {
      const d = p.lookDir(new THREE.Vector3());
      const back = this.cameraMode === 1 ? -1 : 1;
      const dirv = d.clone().multiplyScalar(back);
      const hit = this.world.raycast(eye, dirv, 4);
      const dist = hit ? Math.max(0.5, hit.dist - 0.3) : 4;
      cam.position.copy(eye).addScaledVector(dirv, dist);
      cam.lookAt(eye);
      const m = this.thirdModel;
      m.root.position.copy(p.pos);
      m.root.rotation.y = p.yaw + Math.PI;
      const moving = Math.hypot(p.vel.x, p.vel.z);
      animateModel(m, p.distWalked * 2.5, Math.min(1, moving / 4), { headPitch: -p.pitch, swing: Math.sin(this.swing * Math.PI) });
      m.setBrightness(this.lightAt(p.pos, 1), p.invuln > 0.3);
      m.parts.head.rotation.x = p.pitch;
    }
    // environment
    const skyInfo = this.sky.update(this.time + (this.tickAcc / TICK), cam, dt);
    const u = this.materials.shared;
    // weather darkening
    this.weather.update(dt, cam.position, this.world, this.weatherState.type === 'clear' ? 0 : 1, skyInfo.daylight);
    const wi = this.world.dim === 'overworld' ? this.weather.intensity : 0;
    const storm = this.weatherState.type === 'thunder' ? wi : 0;
    skyInfo.daylight *= 1 - 0.3 * wi - 0.25 * storm;
    const grey = new THREE.Color().setScalar(0.42 * skyInfo.daylight + 0.03);
    skyInfo.skyColor = skyInfo.skyColor.clone().lerp(grey, wi * 0.85);
    skyInfo.fogColor = skyInfo.fogColor.clone().lerp(grey, wi * 0.85);
    if (this.weather.flash > 0) {
      skyInfo.daylight = Math.max(skyInfo.daylight, this.weather.flash);
      skyInfo.skyColor.lerp(new THREE.Color(0.9, 0.9, 1), this.weather.flash * 0.6);
    }
    this.sky.sun.visible = this.sky.moon.visible = wi < 0.6;
    this.sky.starMat.opacity *= 1 - wi;
    const nether = this.world.dim === 'nether';
    if (nether) {
      skyInfo.daylight = 0;
      skyInfo.skyColor = new THREE.Color(0.2, 0.03, 0.03);
      skyInfo.fogColor = skyInfo.skyColor;
    }
    u.uAmbient.value = nether ? 0.22 : 0;
    setAmbient(nether ? 0.22 : 0);
    this.sky.daylight = skyInfo.daylight;
    u.daylight.value = skyInfo.daylight;
    u.uTime.value = performance.now() / 1000;
    u.uGamma.value = settings.gamma;
    const R = this.world.renderDist * CS;
    const camBlock = this.world.getBlock(Math.floor(cam.position.x), Math.floor(cam.position.y), Math.floor(cam.position.z));
    const inWater = camBlock === B.WATER;
    this.cameraInLava = camBlock === B.LAVA;
    let fogC = skyInfo.fogColor, fogN = nether ? R * 0.15 : R * 0.55, fogF = nether ? R * 0.75 : R * 0.95;
    if (inWater) { fogC = new THREE.Color(0.05, 0.12, 0.35).multiplyScalar(skyInfo.daylight); fogN = 1; fogF = 24; }
    if (this.cameraInLava) { fogC = new THREE.Color(0.8, 0.3, 0.05); fogN = 0; fogF = 2.5; }
    u.fogColor.value.copy(fogC);
    u.fogNear.value = fogN; u.fogFar.value = fogF;
    this.scene.fog.color.copy(fogC); this.scene.fog.near = fogN; this.scene.fog.far = fogF;
    const bg = inWater || this.cameraInLava ? fogC : skyInfo.skyColor;
    // under-sky horizon: blend background to fog color when looking down
    r.setClearColor(bg.clone().lerp(fogC, Math.max(0, -p.pitch) * 0.8 + 0.25));
    this.sky.group.visible = !inWater && !this.cameraInLava && !nether;
    this.sky.clouds.visible = !this.cameraInLava && !nether;
    if (nether) r.setClearColor(fogC);
    u.uAnimLayer.value = tileIndex.water;
    u.uAnimLayer2.value = tileIndex.portal;
    cam.far = Math.max(400, R * 1.2);
    cam.updateProjectionMatrix();
    r.info.reset();
    r.clear();
    r.render(this.scene, cam);
    // viewmodel
    if (this.cameraMode === 0 && !this.hudHidden && !p.dead) {
      this.updateViewmodel(dt);
      r.clearDepth();
      r.render(this.viewScene, this.viewCam);
    }
    // HUD
    this.ui.updateHud(this, dt);
    if (this.showDebug) {
      const pp = p.pos;
      const bx = Math.floor(pp.x), by = Math.floor(pp.y), bz = Math.floor(pp.z);
      const l = this.world.getLight(bx, by, bz);
      const yawDeg = ((-p.yaw * 180 / Math.PI) % 360 + 360) % 360;
      const facing = ['north (-Z)', 'east (+X)', 'south (+Z)', 'west (-X)'][Math.round(yawDeg / 90) % 4];
      const t = this.time % DAY_TICKS;
      this.ui.setDebug([
        `Minecraft.js (${this.fps || 0} fps)`,
        `XYZ: ${pp.x.toFixed(3)} / ${pp.y.toFixed(3)} / ${pp.z.toFixed(3)}`,
        `Block: ${bx} ${by} ${bz}  Chunk: ${bx >> 4} ${bz >> 4}`,
        `Facing: ${facing}`,
        `Biome: ${this.world.getBiome(bx, bz)}`,
        `Light: sky ${l >> 4}, block ${l & 15}`,
        `Chunks: ${this.world.chunks.size} loaded, render dist ${this.world.renderDist}`,
        `Entities: ${this.mobs.mobs.length} mobs, ${this.entities.length} other, ${this.particles.list.length} particles`,
        `Time: ${t} (day ${Math.floor(this.time / DAY_TICKS)})`,
        `Mode: ${p.mode}${p.flying ? ' (flying)' : ''}  Dimension: ${this.world.dim}  Weather: ${this.weatherState.type}`,
        this.target ? `Looking at: ${BLOCKS[this.target.id].display} @ ${this.target.x} ${this.target.y} ${this.target.z}` : '',
        `Calls: ${r.info.render.calls}  Tris: ${r.info.render.triangles}`,
      ].join('\n'));
    } else this.ui.setDebug(null);
  }

  updateViewmodel(dt) {
    const p = this.player;
    const held = p.inventory.held;
    const id = held ? held.id : 0;
    if (id !== this.heldId) {
      this.heldId = id;
      while (this.holder.children.length) this.holder.remove(this.holder.children[0]);
      if (!id) {
        this.arm.position.set(0, 0, 0);
        this.arm.rotation.set(-1.15, 0.15, 0.35);
        this.holder.add(this.arm);
        this.holderBase = [0.5, -0.55, -0.62];
      } else if (isCubeItem(id)) {
        const m = new THREE.Mesh(blockGeometry(id, 0.22), this.viewBlockMat);
        m.rotation.set(0.1, Math.PI / 4, 0);
        this.holder.add(m);
        this.holderBase = [0.36, -0.3, -0.58];
      } else {
        this.viewItemMat.map = itemTexture(id);
        this.viewItemMat.needsUpdate = true;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), this.viewItemMat);
        const tool = ITEMS[id].tool;
        m.rotation.set(0, -Math.PI / 2.6, tool ? 0.2 : 0);
        this.holder.add(m);
        this.holderBase = [0.36, -0.28, -0.6];
      }
    }
    const b = this.lightAt(p.pos, 1.2);
    this.armMat.color.setRGB(b, b, b);
    this.viewItemMat.color.setRGB(b, b, b);
    this.viewBlockMat.uniforms.brightness.value = b;
    const s = this.swing;
    const sw = Math.sin((1 - s) * Math.PI);
    const bob = this.ui.settings.bobbing ? p.bobAmt : 0;
    const [bx, by, bz] = this.holderBase;
    let ex = 0, ey = 0;
    if (this.bowCharge > 0) { ex = -0.12 * this.bowCharge; ey = 0.08; }
    if (p.eatTimer > 0) { ex = -0.15; ey = 0.12 + Math.abs(Math.sin(p.eatTimer * 18)) * 0.04; }
    this.holder.position.set(
      bx + Math.sin(p.bob) * 0.03 * bob - sw * 0.15 * (s > 0 ? 1 : 0) + ex,
      by - Math.abs(Math.cos(p.bob)) * 0.03 * bob + sw * 0.1 * (s > 0 ? 1 : 0) + ey,
      bz - sw * 0.15 * (s > 0 ? 1 : 0));
    this.holder.rotation.set(-sw * 0.8 * (s > 0 ? 1 : 0), sw * 0.3 * (s > 0 ? 1 : 0), 0);
  }
}
