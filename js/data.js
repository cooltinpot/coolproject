// All game content: characters, abilities, maps and lore.
(function () {
  const G = window.G;

  G.CONFIG = {
    roundTime: 240, // seconds survivors must last
    genTime: 50, // seconds for one survivor to restore a generator
    genTimeCut: 24, // seconds removed from the clock per restored generator
  };

  G.DIFFICULTY = {
    easy: { name: 'Easy', think: 0.34, aimErr: 0.32, skill: 0.45, killerSpeed: 0.93 },
    normal: { name: 'Normal', think: 0.2, aimErr: 0.14, skill: 0.8, killerSpeed: 1.0 },
    hard: { name: 'Nightmare', think: 0.11, aimErr: 0.04, skill: 1.0, killerSpeed: 1.04 },
  };

  // ---------------------------------------------------------------- KILLERS
  G.KILLERS = {
    blitz: {
      id: 'blitz', team: 'killer', name: 'Blitz', title: 'The Red Courier', role: 'SPEED',
      color: '#d8323c', color2: '#ffcc33', r: 16,
      walk: 172, sprint: 236, terror: 340,
      m1: { id: 'm1', name: 'Slash', damage: 18, range: 56, arc: 1.5, windup: 0.16, cd: 1.0, moveMult: 0.75 },
      abilities: {
        Q: {
          id: 'blitz_dash', name: 'Lunge Dash', cd: 8, windup: 0.22, moveMult: 0.35,
          desc: 'Crouches for a split second, then rockets 220px forward. The first survivor clipped takes 20 damage. Slamming into a wall stuns Blitz briefly.',
          use: 'Aim where the survivor WILL be, not where they are. During Overdrive the dash goes 300px and hits for 28. Dashing a Marked survivor refunds most of the cooldown.',
        },
        E: {
          id: 'blitz_overdrive', name: 'Overdrive', cd: 20, windup: 0.1, moveMult: 1,
          desc: 'Ignites his legs: +25% speed for 4.5s, stamina refilled and no stamina drain. Leaves a burning trail.',
          use: 'Use it to close the gap the moment a chase starts, then finish with Lunge Dash while it is still burning.',
        },
        R: {
          id: 'blitz_tracer', name: 'Tracer Mark', cd: 20, windup: 0.32, moveMult: 0.5,
          desc: 'Flicks a glowing dart (long range). A survivor hit is Marked for 5s: visible through walls and fog, and Blitz runs 8% faster while any Marked survivor is near.',
          use: 'Open every chase with it from long range. A Marked survivor cannot hide, and your Dash cooldown refunds on them.',
        },
      },
      passive: { name: 'Momentum', desc: '+8% movement speed while a Marked survivor is within 700px.' },
      cosmetic: 'A crimson headband whose long tails whip behind him, golden lightning stripes, and a red afterimage trail that bursts into flame during Overdrive.',
      lore: 'Before the Hollow took him, Kade Ferro ran messages between the last lit towns, and he never once arrived late. The fog gave him a new route and a new list of names. He still runs it. He still is never late.',
      synergy: 'Tracer Mark → Overdrive → Lunge Dash. The Mark finds them, Overdrive catches them, and the Dash ends it and comes straight back off cooldown.',
      counter: 'Break line of sight before the dart lands. Vex\'s Slide i-frames dodge the Dash; Gorran\'s shield parries it.',
    },
    gravemaul: {
      id: 'gravemaul', team: 'killer', name: 'Gravemaul', title: 'The Iron Penitent', role: 'DAMAGE',
      color: '#5b5f6b', color2: '#ff5a1f', r: 21,
      walk: 174, sprint: 240, terror: 380,
      m1: { id: 'm1', name: 'Maul', damage: 34, range: 64, arc: 1.7, windup: 0.24, cd: 1.2, moveMult: 0.6 },
      abilities: {
        Q: {
          id: 'grave_cleave', name: 'Cleave', cd: 5, windup: 0.45, moveMult: 0.3,
          desc: 'Raises the maul overhead (long, visible windup) then sweeps a huge 150° arc for 38 damage. Survivors who are Slowed are CRUSHED for 57.',
          use: 'Never lead with it on a healthy, fast survivor; they will just step out. Slam first, then Cleave the slowed target.',
        },
        E: {
          id: 'grave_slam', name: 'Seismic Slam', cd: 10, windup: 0.7, moveMult: 0.15,
          desc: 'Drives the maul into the ground. Everything within 145px takes 14 damage and is Slowed by 50% for 2.5s. Shatters barricades and snare mines.',
          use: 'The setup tool. Hit it when a survivor is looping close, or to break Bolt\'s barricades, then follow up with Cleave.',
        },
        R: {
          id: 'grave_rage', name: 'Bloodrage', cd: 20, windup: 0.5, moveMult: 0.2,
          desc: 'A furious roar. For 7s he is IMMUNE to stuns and parries, moves 15% faster and deals 25% more damage.',
          use: 'Pop it the moment you see Juno or Gorran in the chase. Flashbangs, tasers and shield parries all fail during Bloodrage.',
        },
      },
      passive: { name: 'Juggernaut', desc: 'Pushes through survivors who try to body-block him and recovers from stuns 20% faster.' },
      cosmetic: 'A hulking iron frame with curved bone horns, spiked pauldrons and molten-orange seams that blaze red during Bloodrage.',
      lore: 'The Penitent swore an oath to guard the old foundry until his sins were paid. The debt was never counted, so the oath never ended. The iron grew into him, and he forgot which part was the armor.',
      synergy: 'Seismic Slam → Cleave (Crush) for 71 damage in two buttons. Bloodrage makes the whole combo impossible to interrupt.',
      counter: 'Every attack he has is slow. Watch for the raised maul and the glowing ground ring, and step out. Stun him BEFORE he roars.',
    },
    mournveil: {
      id: 'mournveil', team: 'killer', name: 'Mournveil', title: 'The Quiet Widow', role: 'CHASE START',
      color: '#3b2a5c', color2: '#b98cff', r: 17,
      walk: 174, sprint: 240, terror: 220,
      m1: { id: 'm1', name: 'Rend', damage: 27, range: 56, arc: 1.5, windup: 0.18, cd: 0.9, moveMult: 0.75 },
      abilities: {
        Q: {
          id: 'mourn_shade', name: 'Shade Walk', cd: 15, windup: 0.25, moveMult: 0.6,
          desc: 'Fades into the mist for 5.5s: invisible beyond 90px, +22% speed and no terror radius. The next Rend out of it is an AMBUSH (+25 damage).',
          use: 'Use it to cross open ground toward a survivor who hasn\'t seen you, then open with the Ambush hit. Any other ability ends it.',
        },
        E: {
          id: 'mourn_hook', name: 'Soul Hook', cd: 8, windup: 0.4, moveMult: 0.3,
          desc: 'Hurls a spectral chain. The first survivor hit takes 15 damage, is yanked up to 170px toward Mournveil and Slowed for 1.2s.',
          use: 'Throw at survivors running for a wall or window. The pull drops them right into Rend range.',
        },
        R: {
          id: 'mourn_dread', name: 'Dread Sense', cd: 22, windup: 0.6, moveMult: 0,
          desc: 'Listens to every heartbeat in the realm: ALL survivors are revealed through walls and fog for 5s. They feel watched.',
          use: 'Use it when you have lost everyone. Pick the most isolated survivor, then Shade Walk to them.',
        },
      },
      passive: { name: 'Quiet Dread', desc: 'Small terror radius. Survivors she wounds bleed visibly and are revealed for 3s.' },
      cosmetic: 'A tattered violet hood that trails into mist, two pale glowing eyes, and drifting wisps. She turns to translucent smoke during Shade Walk.',
      lore: 'She waited at the station for a train that never came, through one night, then a thousand. When the Hollow offered her company, she accepted. Now she makes sure nobody else ever leaves.',
      synergy: 'Dread Sense → Shade Walk → Ambush Rend, or Soul Hook → Rend when they see you coming. She decides when every chase begins.',
      counter: 'Stay near teammates. Stalk the shimmer at 90px. If you hear no heartbeat but feel watched, move.',
    },
  };

  // -------------------------------------------------------------- SURVIVORS
  G.SURVIVORS = {
    vex: {
      id: 'vex', team: 'survivor', name: 'Vex', title: 'The Runner', role: 'SPEED',
      color: '#ffd23f', color2: '#ff7b00', r: 14, hp: 100,
      walk: 156, sprint: 230, staminaRegen: 1.6, staminaDrain: 0.75, repairMult: 1,
      abilities: {
        Q: {
          id: 'vex_burst', name: 'Sprint Burst', cd: 14, windup: 0, moveMult: 1,
          desc: 'Instant: +55% speed for 2.2s without using stamina, plus 20 stamina.',
          use: 'Fire it the moment the killer commits to you, NOT after you are already hit. It turns a close chase into a lost one.',
        },
        E: {
          id: 'vex_slide', name: 'Slide', cd: 9, windup: 0.08, moveMult: 1,
          desc: 'Drops into a 165px slide in your movement direction with invulnerability frames.',
          use: 'Slide THROUGH a killer\'s windup: Cleave, Lunge Dash and Rend all miss if your i-frames line up.',
        },
      },
      passive: { name: 'Light Feet', desc: 'Stamina regenerates 60% faster and drains 25% slower.' },
      cosmetic: 'A bright yellow track jacket, a backwards cap and glowing orange sneakers that leave speed streaks.',
      lore: 'Vex was a courier too, a rival of a certain red-banded runner. She outran the fog on the day it rolled in. She has been outrunning it ever since, and has started to like it.',
      ai: { flee: 210, style: 'looper' },
      synergy: 'Bait the killer away from gens while Bolt repairs. Drag chases past Juno so she can flashbang.',
    },
    gorran: {
      id: 'gorran', team: 'survivor', name: 'Gorran', title: 'The Bulwark', role: 'HEALTH',
      color: '#3d7bd9', color2: '#c9d6e8', r: 17, hp: 160,
      walk: 145, sprint: 214, staminaRegen: 1, staminaDrain: 1, repairMult: 0.9,
      abilities: {
        Q: {
          id: 'gorran_shield', name: 'Bastion Shield', cd: 14, windup: 0.25, moveMult: 0.5,
          desc: 'Braces a tower shield for 2.6s (you move slower). The first killer attack from the front is fully blocked and PARRIED: the killer is stunned for 1.1s.',
          use: 'Raise it when you see a killer windup, not before. Face the killer! Attacks from behind still land. Bloodrage ignores the parry stun.',
        },
        E: {
          id: 'gorran_link', name: 'Guardian Link', cd: 18, windup: 0.4, moveMult: 0.5,
          desc: 'Tethers to the ally nearest your aim (within 260px) for 6s. Half of all damage they take is redirected to you.',
          use: 'Link to whoever is being chased, then stand between them and the killer. Your 160 HP buys them a whole extra hit.',
        },
      },
      passive: { name: 'Iron Hide', desc: '160 max health, the most of any survivor. Slower and less stamina efficient.' },
      cosmetic: 'Steel-blue plate armor, a slit-visored helmet and a tower shield that flares bright when braced.',
      lore: 'A city guard whose city vanished overnight. Gorran still keeps his post. The post is just wherever his friends are standing.',
      ai: { flee: 150, style: 'guard' },
      synergy: 'Pair with Rosa: Gorran soaks damage through Guardian Link, and Rosa heals the big HP pool back.',
    },
    juno: {
      id: 'juno', team: 'survivor', name: 'Juno', title: 'The Spark', role: 'STUNS',
      color: '#22c7b8', color2: '#e6ff4a', r: 14, hp: 100,
      walk: 150, sprint: 220, staminaRegen: 1, staminaDrain: 1, repairMult: 1,
      abilities: {
        Q: {
          id: 'juno_flash', name: 'Flashbang', cd: 16, windup: 0.35, moveMult: 0.6,
          desc: 'Pulls the pin (0.35s), lobs a grenade up to 330px; it pops 0.35s after landing. A killer within 115px with line of sight is STUNNED for 1.7s.',
          use: 'Lead your throw: aim where the killer will be in about a second. Best thrown at a killer chasing someone else.',
        },
        E: {
          id: 'juno_taser', name: 'Arc Taser', cd: 22, windup: 0.4, moveMult: 0.4,
          desc: 'Charges the taser (0.4s), then jolts everything in an 80px cone. A killer hit is STUNNED for 2.3s.',
          use: 'The windup is a commitment: start it as the killer closes in, before he swings, and face him.',
        },
      },
      passive: { name: 'Adrenaline Wire', desc: 'Stunning the killer gives Juno +30% speed for 1.5s to escape.' },
      cosmetic: 'Teal coveralls, yellow flash goggles, a battery pack on her back and electricity crackling around her.',
      lore: 'An electrician who wired the station\'s emergency lights. When the dark came, she taught it to be afraid of brightness.',
      ai: { flee: 230, style: 'stunner' },
      synergy: 'A stunned killer cannot interrupt anything: chain Juno\'s stuns with Vex baits, Rosa heals or a rescue.',
    },
    rosa: {
      id: 'rosa', team: 'survivor', name: 'Rosa', title: 'The Medic', role: 'SUPPORT',
      color: '#f1f1f1', color2: '#e0313b', r: 14, hp: 100,
      walk: 150, sprint: 220, staminaRegen: 1, staminaDrain: 1, repairMult: 1,
      abilities: {
        Q: {
          id: 'rosa_heal', name: 'Field Dressing', cd: 10, windup: 0.2, moveMult: 0,
          desc: 'Channels for 2.4s on the ally nearest your aim within 85px (or yourself), healing 45 health. Moving or being hit cancels it.',
          use: 'Only heal when the killer is far away. Ask your ally to stand still: AI teammates will wait for you.',
        },
        E: {
          id: 'rosa_shot', name: 'Adrenal Shot', cd: 16, windup: 0.2, moveMult: 0.6,
          desc: 'Fires a stim dart at the ally nearest your aim (within 320px), or yourself: +40% speed for 3s and +30 stamina.',
          use: 'Fire it at whoever the killer is chasing, before they are caught. It reaches across the room.',
        },
      },
      passive: { name: 'Bedside Manner', desc: 'Field Dressing also cleanses Slow and Mark effects.' },
      cosmetic: 'A white field coat, a red-cross armband and satchel, and soft green motes whenever she heals.',
      lore: 'A night-shift nurse who walked into the fog looking for a missing patient. She found five strangers instead, and decided they were her patients now.',
      ai: { flee: 300, style: 'support' },
      synergy: 'Her heal cleanses Gravemaul\'s Slow (no Crush!) and Blitz\'s Mark. Her Adrenal Shot saves a chased Vex or Juno.',
    },
    bolt: {
      id: 'bolt', team: 'survivor', name: 'Bolt', title: 'The Tinker', role: 'ENGINEER',
      color: '#ff8c1a', color2: '#ffe14d', r: 15, hp: 100,
      walk: 148, sprint: 216, staminaRegen: 1, staminaDrain: 1, repairMult: 1.5,
      abilities: {
        Q: {
          id: 'bolt_barricade', name: 'Barricade', cd: 17, windup: 0.5, moveMult: 0.3,
          desc: 'Hammers a barricade into the tile in front of you (0.5s). It blocks the path for 22s or until the killer breaks it (3 hits, one Slam).',
          use: 'Seal a doorway or corridor right behind you mid-chase, or wall off a generator while the team repairs.',
        },
        E: {
          id: 'bolt_mine', name: 'Snare Mine', cd: 14, windup: 0.3, moveMult: 0.5,
          desc: 'Plants a hidden mine at your feet (arms in 0.7s, max 2). A killer stepping on it is Slowed 50% for 2.2s and REVEALED to every survivor for 4s.',
          use: 'Drop them along your escape path or beside the generator you are fixing. The killer has to walk through them.',
        },
      },
      passive: { name: 'Handy', desc: 'Repairs generators 50% faster.' },
      cosmetic: 'An orange work suit, a yellow hard hat with a lamp and a heavy wrench on his belt.',
      lore: 'Bolt kept the foundry running until the night the furnaces lit themselves. He believes every machine can be fixed, even this place.',
      ai: { flee: 260, style: 'engineer' },
      synergy: 'Mines reveal the killer to everyone (perfect for Juno\'s flashbang aim). Barricades buy Rosa time to heal.',
    },
  };

  G.CHARS = Object.assign({}, G.KILLERS, G.SURVIVORS);

  // ------------------------------------------------------------------- MAPS
  // Legend: # wall, x crate (blocks movement, not sight), G generator,
  // S survivor spawn, K killer spawn, F furnace vent, > < conveyor,
  // , tall grass, T bear trap, = train track, O maintenance vent (teleport).
  G.MAPS = {
    foundry: {
      id: 'foundry', name: 'Rusted Foundry', vision: 560, dark: 0.5,
      palette: { floor: '#3a2f2a', floor2: '#352a25', wall: '#1d1714', wallTop: '#5b463b', crate: '#7a5530', accent: '#ff7a1a' },
      lore: 'The furnaces never cooled after the workers vanished. Molten iron still pulses through the floor, and the conveyor lines still run, carrying nothing, forever.',
      hazards: [
        ['Furnace Vents', 'The grates glow orange, then erupt. Survivors standing in fire take heavy damage over time; killers are badly slowed.'],
        ['Conveyor Lines', 'Arrow belts push anyone on them. Run with the belt to escape faster, or watch the killer get dragged backwards.'],
        ['Crate Stacks', 'Block movement but not sight. Great for looping.'],
      ],
      layout: [
        '################################################',
        '#..............#.................#.............#',
        '#..S...........#.....x.....G.....#.............#',
        '#..............#.....x...........#.............#',
        '#....xxxx......#.....x......FF...#....xx.......#',
        '#..........G...#............FF........xx.......#',
        '#..............#.....>>>>>>>>>>>>>>>...........#',
        '#.......#####..................................#',
        '#.......#..........######......#####...........#',
        '#..FF...#..........#....#..........#.....FF....#',
        '#..FF...#....x.....#....#..........#.....FF....#',
        '#.......#....x.....#..........x....#...........#',
        '#......................K.......x...............#',
        '###..#######...........................#####..##',
        '#..........#.......<<<<<<<<<<<<<<......#.......#',
        '#..........#...................................#',
        '#....G.....#....xxx.......#.......xxx....G.....#',
        '#..........#..............#....................#',
        '#.....S......FF...........#.......FF...........#',
        '#............FF.....#######.......FF.....S.....#',
        '#..xx..................................#.......#',
        '#..xx.......#####..........>>>>>>>>....#.......#',
        '#...........#.......x......................xx..#',
        '#.....#.....#.......x....#######...........xx..#',
        '#.....#..........S..x....#.....#...............#',
        '#.....#..................#..FF.#.......#.......#',
        '#.....#######.......FF......FF.........#...S...#',
        '#...................FF.....G...........#.......#',
        '#.......xxxx...................#####...........#',
        '#..............#...............................#',
        '#..............#.....................x.........#',
        '################################################',
      ],
    },
    woods: {
      id: 'woods', name: 'Hollow Woods', vision: 330, dark: 0.82,
      palette: { floor: '#1f2b1d', floor2: '#1c271a', wall: '#0f170e', wallTop: '#2d4a27', crate: '#4a3522', accent: '#9bd15c' },
      lore: 'A forest that grew over a village in a single night. The trees lean in to listen. Old hunters\' traps still wait under the leaves, and none of them remember who they were meant for.',
      hazards: [
        ['Thick Fog', 'Vision is short for everyone. Listen for the heartbeat.'],
        ['Tall Grass', 'Survivors crouched in grass are invisible to the killer unless he is right on top of them (or they are revealed).'],
        ['Bear Traps', 'Faint glints in the dirt. Stepping on one roots you (survivors also take damage). They re-arm after 12s.'],
      ],
      layout: [
        '################################################',
        '#,,,,,......#.........,,,,,.........#....,,,,,,#',
        '#,,S,,..........G.....,,,,,...............,,S,,#',
        '#,,,,,....#..........T,,,,,....#..........,,,,,#',
        '#.........#.....##.............#...T...........#',
        '#....T..........##.......xxx.........##........#',
        '#..............................,,,,..##........#',
        '#...##.....,,,,,,.......#......,,,,............#',
        '#...##.....,,,,,,.......#......,,,,.....T......#',
        '#..........,,,G,,.......#..............,,,,,...#',
        '#.......T..,,,,,,.......##.....#.......,,,,,...#',
        '#..................##..........#..##...,,,,,...#',
        '#....xx............##......K......##...........#',
        '#....xx.....T..................................#',
        '#.........................T.........xx....##...#',
        '#,,,,,.....##.......,,,,,...........xx....##...#',
        '#,,,,,.....##.......,,,,,......##..............#',
        '#,,,,,..............,,G,,......##.....T........#',
        '#...........#.......,,,,,..........,,,,,,......#',
        '#...T.......#..............#.......,,,,,,..##..#',
        '#.......................T..#.......,,S,,,..##..#',
        '#....##.........xxx............................#',
        '#....##...,,,,,.........##.........T...........#',
        '#.........,,,,,....#....##.......##......,,,,,.#',
        '#..G......,,S,,....#.............##......,,G,,.#',
        '#.........,,,,,..........,,,,,...........,,,,,.#',
        '#..##.......T............,,,,,......#..........#',
        '#..##..........##........,,S,,......#....T.....#',
        '#..............##...T....,,,,,.....##..........#',
        '#,,,,,,..............................,,,,,,....#',
        '#,,,,,,..........#..........##.......,,,,,,....#',
        '################################################',
      ],
    },
    station: {
      id: 'station', name: 'Sunken Station', vision: 470, dark: 0.6,
      palette: { floor: '#2a2e36', floor2: '#262a31', wall: '#121419', wallTop: '#4a5262', crate: '#59606e', accent: '#ffd23f' },
      lore: 'The last train out was supposed to leave at midnight. It still arrives every few minutes, but it never stops, and it does not slow down for anyone on the tracks.',
      hazards: [
        ['Phantom Train', 'Warning lights flash and a horn sounds, then a train tears across the tracks. Survivors hit lose most of their health; the killer is stunned for 2.5s.'],
        ['Blackouts', 'The power fails every so often: for 6s everyone can only see a short distance.'],
        ['Maintenance Vents', 'Survivors only: press F on a vent to crawl to its paired vent across the tracks. The killer is too big to follow.'],
      ],
      layout: [
        '################################################',
        '#.....................#........................#',
        '#..S.......G..........#...........G.......S....#',
        '#.....................#........................#',
        '#....######.....xx..........xx.....######......#',
        '#....#....................................#....#',
        '#....#..O.......#######....#######.....O..#....#',
        '#....#..........#.....#....#.....#........#....#',
        '#...............#..K..............x............#',
        '#.......xx......#..........#.....#.....xx......#',
        '#.......xx......####..######.....#.............#',
        '#..............................................#',
        '#..##..............x..........x............##..#',
        '#..##..................G.......................#',
        '#..............................................#',
        '#==============================================#',
        '#==============================================#',
        '#..............................................#',
        '#.....xx..........#.............#........xx....#',
        '#.....xx..........#....O........#........xx....#',
        '#.......................................O......#',
        '#..#######.....######.....######.....#######...#',
        '#..#.....................................#.....#',
        '#..#...G.......x.....S.....x......G......#.....#',
        '#..#.....................................#.....#',
        '#..#######.....######.....######.....#######...#',
        '#..............................................#',
        '#....S......................................S..#',
        '#........xx........xx.........xx.........xx....#',
        '#..............................................#',
        '#..............................................#',
        '################################################',
      ],
    },
  };

  G.LORE = {
    prologue: [
      'Nobody remembers the day the fog arrived. They only remember that, one by one, the roads stopped leading anywhere.',
      'Now there is only the Hollow: a patchwork of drowned places stitched together in the dark. Five strangers wake inside it. Something else wakes with them, and it is hungry.',
      'The old generators still hum. Restore them, and the night grows shorter. Survive until dawn, and the Hollow lets you go… for now.',
    ],
    rules: [
      ['Survivors win', 'if at least one of them is alive when the clock hits zero.'],
      ['The killer wins', 'by eliminating all five survivors before dawn.'],
      ['Generators', 'Every restored generator cuts ' + 24 + ' seconds off the clock. Team up on them: they go faster.'],
      ['Terror radius', 'Survivors hear a heartbeat when the killer is near. Mournveil\'s is very quiet.'],
      ['Windups', 'Every strong ability has a visible windup. Learn the tells, react to them, and punish them.'],
    ],
    controlsSurvivor: [
      ['WASD', 'Move'], ['Shift', 'Sprint (uses stamina)'], ['Mouse', 'Aim'], ['Q / E', 'Abilities'],
      ['Hold F', 'Repair generator'], ['F', 'Use vent (Station)'], ['Tab', 'Spectate next ally (when dead)'], ['Esc', 'Pause'],
    ],
    controlsKiller: [
      ['WASD', 'Move'], ['Shift', 'Sprint (uses stamina)'], ['Mouse', 'Aim'], ['Left Click', 'Basic attack'],
      ['Q / E / R', 'Abilities'], ['Esc', 'Pause'],
    ],
    teamwork: [
      ['The Wall & the Nurse', 'Gorran links the chased ally and tanks the hits, Rosa heals his huge HP pool back up between chases.'],
      ['Light Show', 'Bolt\'s Snare Mine reveals the killer to everyone, and Juno uses that to throw a perfect Flashbang.'],
      ['Bait & Switch', 'Vex pulls the killer away with Sprint Burst while Bolt\'s Handy passive speeds through the generator.'],
      ['Anti-Brute', 'Rosa\'s Field Dressing cleanses Slow, so Gravemaul\'s Cleave can\'t Crush. Stun him before Bloodrage.'],
      ['Anti-Blitz', 'Break line of sight from Tracer darts. Gorran\'s parry and Vex\'s Slide both beat Lunge Dash.'],
      ['Anti-Mournveil', 'Stay grouped: Shade Walk is visible within 90px, and Soul Hook can be body-blocked by Gorran.'],
    ],
  };
})();
