# Hollowed

An asymmetrical survival-horror game inspired by *Forsaken*. Five survivors repair generators and try to last until dawn. One killer hunts them. It runs in the browser with HTML5 canvas and plain JavaScript, with no build step and no dependencies.

## Play

Open `index.html` in a desktop browser. You can also serve the folder, for example with `python3 -m http.server`, and open `http://localhost:8000`.

The main menu is **The Hollowed Codex**, a lore book. Click it to open it and turn the pages to read the story, every ability with its windup and cooldown, how to use each one, map hazards, and team synergies. Press **PLAY** to pick a side, a character, a realm and the bot difficulty.

| Survivor | | Killer | |
|---|---|---|---|
| WASD | move | WASD | move |
| Shift | sprint | Shift | sprint |
| Mouse | aim | Mouse | aim |
| Q / E | abilities | Left click | basic attack |
| Hold F | repair a generator | Q / E / R | abilities |
| F | use a vent (Station) | Esc | pause |
| Tab | spectate when dead | | |

**Rules.** Survivors win if anyone is alive when the clock hits zero. Every restored generator takes 24s off the clock. The killer wins by eliminating all five.

## Roster

**Killers** (3 abilities each):

| Killer | Class | Kit | Look |
|---|---|---|---|
| Blitz | Speed | Lunge Dash, Overdrive, Tracer Mark | red headband with whipping tails, afterimage and fire trail |
| Gravemaul | Damage | Cleave (crushes slowed targets), Seismic Slam, Bloodrage (stun immune) | horns, spiked pauldrons, molten seams, raised maul on windup |
| Mournveil | Chase start | Shade Walk (invisible ambush), Soul Hook, Dread Sense (reveal all) | trailing violet hood, glowing eyes, mist |

**Survivors** (2 abilities and a passive each):

| Survivor | Class | Kit | Look |
|---|---|---|---|
| Vex | Speed | Sprint Burst, Slide (i-frames) | track jacket, backwards cap, glowing sneakers |
| Gorran | Health (160 HP) | Bastion Shield (parry stun), Guardian Link (shares damage) | plate armor, visored helmet, tower shield |
| Juno | Stuns | Flashbang, Arc Taser, each with a windup | goggles, battery pack, crackling arcs |
| Rosa | Support | Field Dressing (heal and cleanse), Adrenal Shot | white coat, red cross, healing motes |
| Bolt | Engineer | Barricade, Snare Mine; repairs 50% faster | hard hat with lamp, wrench |

**Realms**:

- **Rusted Foundry**: erupting furnace vents and conveyor belts.
- **Hollow Woods**: thick fog, tall grass that hides survivors, bear traps.
- **Sunken Station**: the phantom train, blackouts, and survivor-only vents.

## AI

The bots play to their class. Survivors pick generators away from the killer and spread out over them. They flee using paths weighted by distance from the killer, use loops, grass and vents, and juke telegraphed swings. They also play support:

- Gorran links and body-blocks for a chased ally, and raises his shield against windups.
- Juno leads her flashbangs and comes in to stun a killer chasing a teammate.
- Rosa heals hurt allies away from danger and darts whoever is being chased.
- Bolt barricades and mines behind himself and around his generator.
- Vex baits the killer off badly hurt teammates.

Killers listen for repairs, chase with target stickiness, break barricades, and combo their kits:

- Blitz: Mark, then Overdrive, then Dash.
- Gravemaul: Slam, then Cleave, with Bloodrage when stunners are near.
- Mournveil: Dread Sense, then Shade Walk, then Hook.

Bots of both sides route around hazards. In AI-only simulation runs on Normal, killers won about half of the rounds, and most rounds were close.

## Code layout

```
index.html, style.css   menus, book, overlays
js/util.js              math, input, synthesized audio
js/data.js              characters, abilities, maps, lore
js/world.js             tile map, collision, line of sight, A*, hazards
js/entities.js          movement, effects, damage, stuns, every ability
js/ai.js                survivor and killer bots
js/render.js            map, character cosmetics, telegraphs, fog, HUD
js/game.js              round logic, projectiles, generators, main loop
js/menu.js              Codex book, setup, pause, results
```

---

# SCRATED

A second game in this repo, in `scrated/`, based on **SCRATED: A Mythological Story** by peppinospaletti. Open `scrated/index.html` to play.

SC's realm runs the rounds. Three survivors stolen from heaven try to last until SC resets the round, while one of five hackers pulled from broken dimensions hunts them. Compiling Code Terminals brings the reset closer.

**The menu is the story.** Click the grey DESTROY block to open it. The book holds the complete story, chapters I–X and the Epilogue, word for word. It also has a page for every hacker and survivor (lore, abilities with windups and cooldowns, how to use them, synergy and counters), the realms, the between-rounds life, and the PLAY button.

| Hacker | Class | Abilities | Look |
|---|---|---|---|
| SC | Power | DESTROY Laser, Reshape (code walls), Flight; passive *Fed by THE END* | pale 0.4 cat, grey eyes, crown, the block |
| PROTOCOL2 | Chaos | Account Hack (reversed controls), Arson, Royal Decree; passive *Boredom* | cape, silver crown, scrolling code visor |
| BURGERS | Adaptive | ROAR, Deletion Dive, Grease Slick; passive *Adapt* (stuns make him stronger) | robot with a chef hat and spatula |
| THE CREAKER | Stealth | Vine Lash, Overgrowth, Echo of the Deleted; no heartbeat | vine-covered robot with a cracked, glowing face |
| THE REVENGEST | Speed | Fork Throw + Warp, Quickdraw, Corruption; passive *Father's Scarf* | glowing orange, sheriff hat, scarf, fork |

| Survivor | Class | Abilities |
|---|---|---|
| Scratchy | Support | Lesson Plan (team buff), Charm Offensive; compiles faster |
| GRIFFPATCH | Stuns | Showstopper, Create Clone of Myself; Quiet Regen |
| NANO | Health | General's Guard (parry), Rally Banner; Became Better |

**Realms:**

- **The Forums:** it's always snowing. The fountain water slows everyone, and forum posts reveal survivors.
- **MIT Ruins:** debris falls from above, laser holes scar the floor, and survivors can ride service elevators.
- **The Mountain Cave:** it's dark. Bones crack and give survivors away, and THE END whispers.

**The Final Round** unlocks after you finish one round. You play GRIFFPATCH in round 500 and the story's ending plays out, ending in a cutscene (Esc skips it).

**Balance:** in AI-only runs on Normal, hackers won about 47% of rounds. Each hacker's win rate fell between 25% and 67% over 12 rounds.

Controls are the same as Hollowed, with F to compile and Q/E (+R for hackers) for abilities.
