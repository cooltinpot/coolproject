# NEON RIPOSTE

**A fast 3D rhythm-action game built around one mechanic: the parry.**

You are a cyber-ronin on a floating arena above a neon megacity. Every enemy attack
is timed to the soundtrack's beat. Parry on the beat to send projectiles back,
break enemy posture and set up a riposte. Then do it to music.

Everything is procedural: models, animation, VFX, the skybox, and all of the
**music and sound effects**, which are synthesized live with the Web Audio API.
The repo has no image, model or audio files.

---

## Running it

It's a static site using native ES modules, so it needs to be served over HTTP. Opening the file directly won't work.

```bash
# from the repository root
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static server works (`npx serve`, GitHub Pages, and so on). Three.js is in
`vendor/`, so the game runs offline. The only remote assets are Google Fonts, and
the game falls back to system fonts without them.

Requires a browser with **WebGL2** (recent Chrome, Edge, Firefox or Safari).
Headphones recommended: attack cues are panned in stereo.

## Controls

| Input | Keyboard / Mouse | Gamepad |
|---|---|---|
| Move | `W A S D` | Left stick |
| Look | Mouse | Right stick |
| Attack (3-hit combo, air attacks) | `LMB` / `J` | X / Square |
| **Parry** (tap) / Block (hold) | `RMB` / `F` | LB / RB / RT |
| Dash (invulnerable, 2 charges) | `Shift` | B / Circle, LT |
| Jump / double jump | `Space` | A / Cross |
| Overdrive | `Q` | Y / Triangle |
| Lock-on | `E` / `Tab` / `MMB` | R3 |
| Pause | `Esc` / `P` | Start |

## Mechanics

### The parry
- Tap parry to open a **0.18 s perfect window**. Any parryable hit that lands
  inside it is deflected. Several hits arriving together can all be parried.
- **Perfect parry:** hit-stop, a short slow-motion, sparks, a shockwave, a floor
  ripple and a metallic ring. Projectiles **fly back at whoever fired them**. One
  reflected orb kills a drone.
- **On-beat parry** (within ±95 ms of a beat): almost double Resonance, a gold
  flash, and a **chime tuned to the chord the soundtrack is playing**.
- **Parry chains:** consecutive parries within 1.4 s raise the pitch of the clang
  and add bonus Resonance.
- **No mashing:** a parry window that expires unused locks parry out for 0.3 s. A
  successful parry clears the lockout, so a correctly timed chain never stalls.
- **Holding** parry after the window turns into a **block**. A block takes 25%
  chip damage and slows you, but it is never perfect.
- The HUD shows your timing error in milliseconds after every parry.

### Posture and riposte
Parries damage an enemy's **posture**. When posture breaks, the enemy kneels
with a pulsing `◆ RIPOSTE` marker. Press attack to zip in for a cinematic
**riposte**: an instant execution on normal enemies, or a huge chunk of the
boss's health bar.

### Everything is on the beat
- Attack impacts are quantized to the music by a beat-slot scheduler, which also
  stops too many hits landing in the same slot.
- Enemy projectiles are steered so they **reach you exactly on a beat**, then fly
  straight for the last 0.25 s so dodging stays fair.
- A shrinking **gold ring** around the attacker closes onto the impact moment.
  **Red** marks unblockable attacks: jump or dash those.
- **Threat lane:** a rhythm-game strip at the bottom of the screen. Beats and
  incoming attacks slide toward a central strike zone from the side they're
  coming from (gold diamond = melee, cyan orb = projectile, red X = unblockable).
  Off-screen attackers also get edge arrows.

### Resonance and Overdrive
Parries (especially on-beat ones), ripostes and hits fill **Resonance**. At 100%,
press `Q` for **Overdrive**: 8 seconds in which enemies slow to 55%, your damage
doubles, every swing launches a crescent wave, holding guard parries
automatically, and the soundtrack goes to full intensity.

### Style
The style rank runs from D (Dull) up to **SSS (Symphonic)**. It rises with variety:
repeating the same action pays less and less. It decays during combat and drops
sharply when you get hit. Score multiplies with rank and wave.

## Enemies

| Enemy | Behaviour | How to beat it |
|---|---|---|
| **Wisp drone** | Hovers at range and fires beat-locked orbs (single, double, triple bursts; red unblockable orbs later). | Parry the orb straight back. One reflection kills it. |
| **Duelist** | Fast sword combos (1–3 strikes, syncopated in later waves). **Guards your swings.** | Parry every strike to break posture, then riposte. |
| **Lancer** | Telegraphed lance **charges** (gold line on the floor) and javelin volleys. | Parry the charge: a parried Lancer is broken instantly. |
| **Brute** | Hyper-armoured hammer. Parryable slams, a **red 360° sweep** and ground **quakes**. | Parry slams, jump sweeps and quake rings, punish recovery. |
| **The Conductor** (boss) | A three-movement fight: Blade Sonata (blades launched on consecutive beats), Crescendo rings with an escape gap, swooping baton combos, a sweeping red laser, quake finales, and summoned minions. | Parry the sonata blades back for big posture damage, then riposte. Jump the laser. |

After the Conductor falls you can continue into **Encore** (endless) waves.

## Soundtrack

`src/audio/Music.js` is an adaptive look-ahead sequencer running at 128 BPM in D minor:
- Synthesized kick (with sidechain ducking), snare, clap, closed and open hats, shaker, crash.
- Detuned saw bass with filter envelopes, supersaw pads, a plucked arpeggiator through a
  tempo-synced ping-pong delay, a vibrato lead with written melodies, and supersaw
  stabs at peak intensity.
- Five intensity layers that change on bar lines as the fight heats up, plus a
  separate **boss progression** (Dm – Gm – B♭ – A) with a galloping bass and
  its own lead.
- Snare-roll fills and noise risers into each wave, and a low-pass "underwater"
  muffle during slow motion and pause.
- An analyser drives the arena's equalizer towers. Kick and snare envelopes pulse
  the lights, floor, sky and bloom.

## Visuals

- Hex-tiled floor (custom `MeshStandardMaterial` shader): glowing seams, beat
  rings moving outward, impact ripples, light pooling under the player, and red
  danger tint when unblockables are coming.
- Procedural sky: gradient atmosphere, two star layers, nebula, aurora, a ringed
  gas giant and a moon. A glowing cloud sea below, a skyline of hundreds of lit
  towers with rooftop beacons, a colossal ring structure on the horizon, and
  floating crystal-studded rocks.
- Pillars with floating crystals and light beams, equalizer towers, rim chaser
  lights, a reactor core under the platform, and a hex-shield barrier that
  flares when you get close.
- Procedural armoured characters on a hierarchical rig, with keyframe attack
  and parry poses blended over procedural locomotion. Verlet-simulated
  scarves and capes, Catmull-Rom sword trails, hit flashes and noise-dissolve
  deaths with glowing edges.
- GPU particle streaks, slash arcs, shockwaves, debris shards that bounce off the
  floor, flash lights.
- Post-processing: bloom, ACES tone mapping, then chromatic aberration, radial
  zoom blur, slow-motion grade, Overdrive grade, damage and low-health vignette,
  film grain and scanline shimmer.
- Camera: trauma-based shake, FOV kicks, lock-on, and cinematic riposte and boss
  intro shots.

## Settings

Volume (master, music, SFX), mouse sensitivity, invert Y, threat-lane toggle,
graphics quality (Low / Medium / High / Ultra; applied on reload) and an
**audio latency offset** that shifts the on-beat check if your output device
lags. Settings are saved in `localStorage`.

## Code map

```
index.html, styles.css      Page, HUD and menu markup and styling
src/main.js                 Boot, settings, menu wiring, main loop
src/Game.js                 Orchestrator: systems, game flow, threats, quake hazard
src/core/                   Time (hit-stop and slow-mo), Input (KB/M + gamepad), math, geometry
src/audio/                  AudioEngine (bus graph), Music (sequencer), Sfx (synth SFX)
src/render/                 PostFX stack, CameraRig
src/world/                  Arena, Sky
src/fx/                     Particles, Effects (arcs, rings, warnings, shards), Trail (sword and cloth)
src/actors/Rig.js           Humanoid builder, poses, animator, locomotion
src/actors/Player.js        Player controller, combat and parry
src/actors/enemies/         Enemy base, Drone, Duelist/Brute/Lancer, Conductor boss
src/combat/Projectiles.js   Beat-locked projectiles and reflection
src/game/                   Director (waves, tokens, beat slots), Style (rank and score)
src/ui/HUD.js               HUD and threat lane
tools/posetest.html         Dev page that renders rig poses side by side
vendor/three/               three.js r170 (MIT) and the post-processing add-ons used
```

Debugging: `window.__game` is exposed in the console. `__game.startGame(7)` jumps
straight to the boss, and `__game.simulate(seconds)` advances the simulation
without rendering. Setting `__game.bot = 'fight'` enables a simple autoplayer used
for automated testing.

## Credits

Built with [three.js](https://threejs.org) (MIT License, see `vendor/three/LICENSE`).
All code, music and sound design are procedural and original to this project.
