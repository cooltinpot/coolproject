// SCRATED content: hackers, survivors, abilities, realms and lore.
// Based on "SCRATED: A Mythological Story" by peppinospaletti.
(function () {
  const G = window.G;

  G.CONFIG = {
    roundTime: 200, // seconds until SC resets the round
    genTime: 36, // seconds for one survivor to compile a terminal
    genTimeCut: 20, // seconds removed from the clock per compiled terminal
    objective: 'Code Terminal',
  };

  G.DIFFICULTY = {
    easy: { name: 'Easy', think: 0.34, aimErr: 0.32, skill: 0.45, killerSpeed: 0.93 },
    normal: { name: 'Normal', think: 0.2, aimErr: 0.14, skill: 0.8, killerSpeed: 1.0 },
    hard: { name: 'Five Hundred Years', think: 0.11, aimErr: 0.04, skill: 1.0, killerSpeed: 1.04 },
  };

  // ------------------------------------------------------------- HACKERS
  G.KILLERS = {
    sc: {
      id: 'sc', team: 'killer', name: 'SC', title: 'The Crowned · once 0.4', role: 'POWER',
      color: '#a3a9b0', color2: '#ffd23f', r: 16,
      walk: 170, sprint: 232, terror: 360,
      m1: { id: 'm1', name: 'Block Strike', damage: 28, range: 58, arc: 1.5, windup: 0.18, cd: 1.1, moveMult: 0.7 },
      abilities: {
        Q: {
          id: 'sc_laser', name: 'DESTROY Laser', cd: 11, windup: 0.7, moveMult: 0.35,
          desc: 'The block charges for 0.7s while a glowing lane shows where it will fire. Then a beam 720px long pierces EVERY survivor in its path for 42 damage. Walls stop it.',
          use: 'Fire it down long corridors or across the fountain plaza. Combine it with Reshape so they cannot leave the lane.',
        },
        E: {
          id: 'sc_reshape', name: 'Reshape', cd: 14, windup: 0.4, moveMult: 0.4,
          desc: 'Rewrites the world: a 3-tile wall of grey code appears at your aim point (up to 300px away), turned sideways to you, for 6s.',
          use: 'Drop it in front of a fleeing survivor to cut off their loop, or seal a doorway behind them.',
        },
        R: {
          id: 'sc_flight', name: 'Flight', cd: 18, windup: 0.3, moveMult: 0.5,
          desc: 'Rises into the air for 4s: +18% speed, and flies over crates, benches, terminals and barricades (but not walls).',
          use: 'Cut straight through a crate loop the survivors think is safe.',
        },
      },
      passive: { name: 'Fed by THE END', desc: 'Every hit SC lands shaves 2s off all his cooldowns. He believes the power is his own.' },
      cosmetic: 'The 0.4 Scratch cat, lightened and pale, with burning grey eyes, a crown that appeared as if it had always been waiting there, and the grey DESTROY block in his paw.',
      lore: 'He paid the rent. He waited. He believed things would work out. Then Scratchy laughed down at him from the top of MIT, and 0.4 walked up the mountain past every warning and picked up the block. Five hundred years later, he still thinks the rage is his own.',
      synergy: 'Reshape → DESTROY Laser: wall them into a lane, then erase the lane. Every hit feeds his cooldowns, so one good laser starts the whole chain again.',
      counter: 'The laser charges for 0.7s, so step sideways out of the lane. When he flies, stop looping crates and stun him instead.',
    },
    protocol2: {
      id: 'protocol2', team: 'killer', name: 'PROTOCOL2', title: 'The Bored King', role: 'CHAOS',
      color: '#3346b8', color2: '#39ff88', r: 16,
      walk: 170, sprint: 232, terror: 330,
      m1: { id: 'm1', name: 'Scepter', damage: 24, range: 58, arc: 1.5, windup: 0.18, cd: 1.25, moveMult: 0.7 },
      abilities: {
        Q: {
          id: 'p2_hack', name: 'Account Hack', cd: 12, windup: 0.35, moveMult: 0.5,
          desc: 'Fires a packet of green code. A survivor hit is HACKED for 3s: their controls are scrambled (reversed) and their abilities go offline. 8 damage.',
          use: 'Hack them right before a corner or next to your Arson fire, and they will run the wrong way.',
        },
        E: {
          id: 'p2_arson', name: 'Arson', cd: 13, windup: 0.5, moveMult: 0.4,
          desc: 'Lobs a firebomb up to 300px. It sets an 85px area ablaze for 6s; survivors standing in it burn for 16 damage per second.',
          use: 'Burn doorways and terminals to cut off escapes. In his own kingdom he burned the houses himself.',
        },
        R: {
          id: 'p2_decree', name: 'Royal Decree', cd: 24, windup: 0.6, moveMult: 0.2,
          desc: 'Manufactures chaos: every unfinished terminal loses 15% progress, survivors at terminals are revealed for 5s, and PROTOCOL2 gains +20% speed for 4s.',
          use: 'Use it when a terminal is almost compiled, then sprint to whoever lights up.',
        },
      },
      passive: { name: 'Boredom', desc: 'Peace is unbearable: +1% speed for every second without landing a hit (up to +15%). Resets on a hit.' },
      cosmetic: 'A royal-blue cape and silver crown over a hacker\'s visor that scrolls with green code, carrying a jeweled scepter.',
      lore: 'He built a kingdom out of anarchy, and the peace suffocated him. So he hacked his own people\'s accounts and burned their houses in secret. When SC came to his door, he said yes immediately. Not out of loyalty. He was just bored.',
      synergy: 'Arson blocks the route → Account Hack sends them running into it → Royal Decree finds the next one.',
      counter: 'Hacked? Stop sprinting and steer carefully. Never repair a terminal standing next to his fire.',
    },
    burgers: {
      id: 'burgers', team: 'killer', name: 'BURGERS', title: 'The Adaptive Chef', role: 'ADAPTIVE',
      color: '#8a94a3', color2: '#ff4b2b', r: 19,
      walk: 162, sprint: 220, terror: 380,
      m1: { id: 'm1', name: 'Spatula', damage: 25, range: 62, arc: 1.6, windup: 0.22, cd: 1.4, moveMult: 0.6 },
      abilities: {
        Q: {
          id: 'burg_roar', name: 'ROAR', cd: 14, windup: 0.5, moveMult: 0.2,
          desc: 'He cannot speak. He can only roar. Survivors within 180px are TERRIFIED: slowed 40% for 2s, revealed for 3s, and any ability they were winding up is cancelled.',
          use: 'Roar the moment a survivor starts a windup (a stun or a shield) to shut it down.',
        },
        E: {
          id: 'burg_dive', name: 'Deletion Dive', cd: 10, windup: 0.45, moveMult: 0.3,
          desc: 'Flies forward 320px like he flew at his dimension\'s MIT. The first survivor hit takes 26 damage and is knocked back. Hitting a wall stuns him for 0.8s.',
          use: 'Roar first: a slowed survivor cannot sidestep the dive.',
        },
        R: {
          id: 'burg_grease', name: 'Grease Slick', cd: 16, windup: 0.3, moveMult: 0.5,
          desc: 'Flings a pan of grease up to 280px, leaving a 95px slick for 8s. Survivors on it are slowed 40% and cannot sprint. BURGERS skates across it 25% faster.',
          use: 'Grease the path in front of a fleeing survivor, then skate in.',
        },
      },
      passive: { name: 'Adapt', desc: 'He learns from every mistake. Each time he is stunned or a Dive misses, he gains an Adaptation (max 5): +3% speed and −12% stun duration, for the rest of the round.' },
      cosmetic: 'A hulking robot built from the materials of the platform he was made to delete, wearing a white chef\'s hat and carrying a spatula, with a single red optic that glows.',
      lore: 'A cult built him to delete Scratch at any cost. The admins locked him in MIT\'s basement because he learned from every failure. SC yanked him through a closing portal without asking. In the ruins he found a cookbook, and now he makes dinner for everyone. He chose that purpose himself.',
      synergy: 'ROAR → Deletion Dive → Spatula. Grease Slick makes every chase longer for them and shorter for him. Stunning him only makes him stronger.',
      counter: 'Don\'t waste stuns on him early, because every stun makes him Adapt. Save them for the moment he Dives.',
    },
    creaker: {
      id: 'creaker', team: 'killer', name: 'THE CREAKER', title: 'MIT\'s Guilt', role: 'STEALTH',
      color: '#5f6d58', color2: '#bfe9ff', r: 17,
      walk: 172, sprint: 236, terror: 0,
      m1: { id: 'm1', name: 'Creak', damage: 30, range: 60, arc: 1.6, windup: 0.2, cd: 1.15, moveMult: 0.65 },
      abilities: {
        Q: {
          id: 'creak_lash', name: 'Vine Lash', cd: 8, windup: 0.45, moveMult: 0.3,
          desc: 'Lashes a vine 420px. The first survivor hit is ROOTED for 2s and takes 12 damage.',
          use: 'Lash them as they run for a doorway or a vent, then walk up and Creak.',
        },
        E: {
          id: 'creak_vines', name: 'Overgrowth', cd: 7, windup: 0.6, moveMult: 0.3,
          desc: 'Grows a 70px patch of vines at the aim point (up to 320px; max 3 patches, each lasts 45s). Survivors crossing it are slowed 40% and REVEALED to the Creaker for 4s.',
          use: 'Plant them on terminals and doorways. They are your eyes.',
        },
        R: {
          id: 'creak_echo', name: 'Echo of the Deleted', cd: 18, windup: 1.0, moveMult: 0,
          desc: 'Becomes the grief of everyone deleted: after a 1s stillness, teleports to the vine patch nearest your aim.',
          use: 'When a patch reveals someone across the map, Echo there and Lash them.',
        },
      },
      passive: { name: 'Silent Grief', desc: 'It has no terror radius and makes no heartbeat. Survivors only know it is coming if they see it.' },
      cosmetic: 'A failed robot prototype overgrown with vines, its face cracked open; something ancient and sorrowful looks out of the crack with pale light.',
      lore: 'Scratchy threw the failed prototype into a closet. When SC\'s laser erased forty-eight floors, the grief of every deleted account had nowhere to go. It found the closet. PROTOCOL2 found it nine years later, and it asked to join in sign language.',
      synergy: 'Overgrowth reveals → Echo of the Deleted teleports → Vine Lash roots → Creak.',
      counter: 'Walk around vine patches. Watch corners: there is no heartbeat to warn you.',
    },
    revengest: {
      id: 'revengest', team: 'killer', name: 'THE REVENGEST', title: 'The Corrupted Sheriff', role: 'SPEED',
      color: '#ff8a1f', color2: '#fff1a8', r: 16,
      walk: 174, sprint: 238, terror: 340,
      m1: { id: 'm1', name: 'Fork Jab', damage: 22, range: 56, arc: 1.4, windup: 0.16, cd: 1.2, moveMult: 0.75 },
      abilities: {
        Q: {
          id: 'rev_fork', name: 'Fork Throw', cd: 9, windup: 0.3, moveMult: 0.5,
          desc: 'Throws the magic fork 560px (18 damage). It sticks where it lands for 4s; press Q again to WARP to it.',
          use: 'Throw it PAST a fleeing survivor, then warp to cut them off.',
        },
        E: {
          id: 'rev_draw', name: 'Quickdraw', cd: 12, windup: 0.6, moveMult: 0.2,
          desc: 'A sheriff\'s draw: his hand rests on the holster for 0.6s, then a bolt of fork-magic fires 480px instantly: 26 damage and a 1.2s slow.',
          use: 'Fire it just before they break line of sight, or right after a warp.',
        },
        R: {
          id: 'rev_corrupt', name: 'Corruption', cd: 24, windup: 0.4, moveMult: 0.3,
          desc: 'The fork takes over for 6s: +22% speed, +20% damage, Fork Jab cooldown halved. Fork Throw and Quickdraw are locked; the corruption only wants to hit.',
          use: 'Save it for the end of a chase, when they have used everything.',
        },
      },
      passive: { name: 'Father\'s Scarf', desc: 'A blow that would kill a survivor has a 25% chance to be held back by his conscience. Never during Corruption.' },
      cosmetic: 'A glowing orange body with distorted limbs, a sheriff\'s hat and star, the magic fork, and his father\'s scarf, worn at all times.',
      lore: 'Bob was a good sheriff, trained by his father. The admins gave him a fork imbued with power. On the twenty-fifth night he woke transformed and struck a figure in his house without thinking. It was his father. When SC came, the corruption in the fork said YES while Bob screamed inside.',
      synergy: 'Fork Throw → Warp → Quickdraw or Fork Jab. Corruption turns the finish into a flurry.',
      counter: 'When the fork lands behind you, change direction, because he is about to appear there.',
    },
  };

  // ------------------------------------------------------------ SURVIVORS
  G.SURVIVORS = {
    scratchy: {
      id: 'scratchy', team: 'survivor', name: 'Scratchy', title: 'The 2.0 Scratch Cat', role: 'SUPPORT',
      color: '#ffab19', color2: '#2b2f3a', r: 15, hp: 120,
      walk: 154, sprint: 224, staminaRegen: 1, staminaDrain: 1, repairMult: 1.3,
      abilities: {
        Q: {
          id: 'scr_lesson', name: 'Lesson Plan', cd: 18, windup: 0.5, moveMult: 0.3,
          desc: 'Teaches everyone within 220px (himself too) for 8s: +35% terminal speed and +12% movement speed.',
          use: 'Teach at a terminal with a teammate beside you. A taught team compiles in half the time.',
        },
        E: {
          id: 'scr_charm', name: 'Charm Offensive', cd: 20, windup: 0.35, moveMult: 0.4,
          desc: 'Flashes the old mascot smile in a 130px cone: the hacker is CHARMED for 2.2s, slowed 45% and unable to attack or use abilities.',
          use: 'He is charming when he needs something. Use it at close range when you are about to be hit.',
        },
      },
      passive: { name: 'Old Mascot Habits', desc: 'Compiles terminals 30% faster. He did work at MIT.' },
      cosmetic: 'The orange 2.0 Scratch cat in the suit and tie he wore at the top of MIT.',
      lore: 'He signed up for MIT\'s job without a word to 0.4, who had paid his rent for months. From the top of the world, he laughed. In heaven he had time to sit with all of it. Back in the realm, he slipped straight into the mascot-and-instructor role, teaching lessons nobody asked for.',
      ai: { flee: 260, style: 'support' },
      synergy: 'Lesson Plan stacks with his passive at a terminal. Charm buys GRIFFPATCH time to wind up Showstopper.',
    },
    griffpatch: {
      id: 'griffpatch', team: 'survivor', name: 'GRIFFPATCH', title: 'The Popular One', role: 'STUNS',
      color: '#3d8bff', color2: '#ffd23f', r: 15, hp: 120,
      walk: 154, sprint: 226, staminaRegen: 1, staminaDrain: 1, repairMult: 1,
      abilities: {
        Q: {
          id: 'griff_stop', name: 'Showstopper', cd: 20, windup: 0.45, moveMult: 0.35,
          desc: 'Winds up a big swing (0.45s), the same one that once put SC in the ground. A hacker in the 85px cone is STUNNED for 2s.',
          use: 'Start the swing as the hacker closes in, BEFORE they attack. Facing matters.',
        },
        E: {
          id: 'griff_clone', name: 'Create Clone of Myself', cd: 18, windup: 0.2, moveMult: 0.5,
          desc: 'Two clones that look exactly like him sprint away in different directions for 5s. The hacker can\'t tell which is real until he hits one.',
          use: 'Clone right as you break line of sight, then walk the other way.',
        },
      },
      passive: { name: 'Quiet Regen', desc: 'After 7s without taking damage, regenerates 3 health per second. He regens quietly and pretends everything is fine.' },
      cosmetic: 'A bright-blue Scratcher with a streaming headset and a gold follower star that never stops shining.',
      lore: 'The most popular Scratcher in the dimension, who performed kindness for an audience and bullied 0.4 as a child. At the anniversary he charged SC because it was good for the brand. He carries the knowledge that SC\'s rage has more than one address, and his name is on it.',
      ai: { flee: 230, style: 'stunner' },
      synergy: 'Clones split the hacker\'s attention while Scratchy compiles. NANO\'s parry plus his Showstopper makes a 3-second stun chain.',
    },
    nano: {
      id: 'nano', team: 'survivor', name: 'NANO', title: 'The Loyal General', role: 'HEALTH',
      color: '#5b7a3a', color2: '#d9c27a', r: 17, hp: 170,
      walk: 148, sprint: 218, staminaRegen: 1, staminaDrain: 1, repairMult: 0.9,
      abilities: {
        Q: {
          id: 'nano_guard', name: 'General\'s Guard', cd: 14, windup: 0.2, moveMult: 0.5,
          desc: 'Raises his shield for 2.5s (you move slower). The first hacker attack from the front is blocked and PARRIED: the hacker is stunned for 1.1s.',
          use: 'Face the hacker and raise it the instant you see their windup. Attacks from behind still land.',
        },
        E: {
          id: 'nano_rally', name: 'Rally Banner', cd: 20, windup: 0.5, moveMult: 0.2,
          desc: 'Plants a banner (130px) for 7s. Allies inside take 35% less damage and regain stamina three times faster.',
          use: 'Plant it at a contested terminal or in the middle of a chase so everyone can regroup.',
        },
      },
      passive: { name: 'Became Better', desc: 'When an ally within 300px is hurt, NANO gains +30% speed for 2s to reach them. 170 health.' },
      cosmetic: 'A soldier with an olive beret, gold general\'s epaulettes, dog tags and a round shield.',
      lore: 'He started as GRIFFPATCH\'s sidekick, then grew out of it deliberately. He built a family, had twins, and served Scratchy faithfully, not because Scratchy deserved it but because the job deserved doing right. He is the only one in this story who became better over time. On Fridays he plays Sonic 3 with THE REVENGEST.',
      ai: { flee: 150, style: 'guard' },
      synergy: 'Rally Banner + General\'s Guard turns any spot into a fortress. His Became Better passive pulls him toward whoever needs him.',
    },
  };

  G.CHARS = Object.assign({}, G.KILLERS, G.SURVIVORS);

  // ---------------------------------------------------------------- REALMS
  // Legend: # wall, x crate/bench/debris, G code terminal, S survivor spawn,
  // K hacker spawn, ~ fountain water, f fountain statue, n notice board,
  // h floor hole, O service elevator, b bones, D the empty DESTROY pedestal.
  G.MAPS = {
    forums: {
      id: 'forums', name: 'The Forums', vision: 520, dark: 0.55,
      palette: { floor: '#2c3446', floor2: '#29303f', wall: '#151925', wallTop: '#566079', crate: '#6b4f35', accent: '#ffbf00' },
      lore: 'The town square where announcements are made and the pulse of the whole dimension can be felt. It is where 0.4 found the notice, where Scratchy found the same one, and where 0.4 sat for a long time afterwards. In SC\'s copy, it is always the night of the fiftieth anniversary, and it is always snowing.',
      hazards: [
        ['The Fountain', 'Wading through the fountain water slows everyone by 40%. It never freezes, even in the snow.'],
        ['Forum Posts', 'Every so often a new post goes up at the fountain and every survivor\'s position is announced: they are revealed for 3s.'],
        ['Houses & Benches', 'Houses have side doors for looping; benches block movement but not sight.'],
      ],
      decals: [[24, 11.3, 'THE FORUMS', '#ffbf00', 16, 0.5], [16, 9.4, 'MIT IS HIRING', '#ffffff', 11, 0.45], [31, 9.4, 'MIT IS HIRING', '#ffffff', 11, 0.45]],
      layout: [
        '################################################',
        '#..............................................#',
        '#..............................................#',
        '#..########.............G............########..#',
        '#..#......#.........x................#......#..#',
        '#..#..G......xx......................#...S..#..#',
        '#..#......#.................................#..#',
        '#..#......#..........................#......#..#',
        '#..###..###...######........######...###..###..#',
        '#..............................................#',
        '#...............n..............n...............#',
        '#..............................................#',
        '#...................~~~~~~~~...................#',
        '#..........#........~~~~~~~~........#..........#',
        '#..........#........~~....~~........#..........#',
        '#....x.....#..x.....~~.ff.~~.....x..#........S.#',
        '#..........#..x.....~~.ff.~~.....x..#.....x....#',
        '#..........#........~~....~~........#..........#',
        '#..........#........~~~~~~~~........#..........#',
        '#...................~~~~~~~~...................#',
        '#..............................................#',
        '#...............n.......K......n...............#',
        '#..............................................#',
        '#..###..###...######........######...###..###..#',
        '#..#......#..........................#......#..#',
        '#..#......#.................................#..#',
        '#..#..S..........................xx..#...G..#..#',
        '#..#......#................x.........#......#..#',
        '#..########.............G............########..#',
        '#..............................................#',
        '#..............................................#',
        '################################################',
      ],
    },
    mit: {
      id: 'mit', name: 'MIT Ruins', vision: 480, dark: 0.62,
      palette: { floor: '#3a3d45', floor2: '#363940', wall: '#16181d', wallTop: '#7a8494', crate: '#5d6470', accent: '#4c97ff' },
      lore: 'Ten thousand feet of glass and steel, the administrative heart of everything. SC erased forty-eight floors in a single moment and four hundred admins with them. This is what is left of floor fifty. The closet is still here.',
      hazards: [
        ['Falling Debris', 'Shadows appear on the floor, then ruined ceiling crashes down. Survivors are crushed for heavy damage; the hacker is stunned.'],
        ['Laser Scar', 'Holes torn by the DESTROY laser run across the floor. They block movement but not sight.'],
        ['Service Elevators', 'Survivors only: press F at an elevator to ride to its pair. The hacker can\'t fit.'],
      ],
      decals: [[24, 17.6, 'MIT', '#4c97ff', 64, 0.1], [24, 13.3, 'FLOOR 50', '#c9d6e8', 13, 0.35], [24, 26.4, 'CLOSET', '#c9d6e8', 12, 0.4]],
      layout: [
        '################################################',
        '#..............................................#',
        '#..............................................#',
        '#..O....................S...................O..#',
        '#..........G.......#........#.......G..........#',
        '#..................#........#..................#',
        '#......##......##..#........#..##......##......#',
        '#......##......##..#........#..##......##......#',
        '#..................#........#..................#',
        '#...x......................................x...#',
        '#..........xxxx..................xxxx..........#',
        '#...................x......x...................#',
        '#..............................................#',
        '#..............................................#',
        '#......##........h............h........##......#',
        '#...S..##...h............h.............##...S..#',
        '#.....................h............h...........#',
        '#..............................................#',
        '#..............................................#',
        '#....................x.........................#',
        '#..........xxxx...........x......xxxx..........#',
        '#..............................................#',
        '#...x..............#.......................x...#',
        '#..................#...........................#',
        '#......##......##..#...........##......##......#',
        '#......##......##...###...###..##......##......#',
        '#...................#.......#..................#',
        '#..........G........#.......#.......G..........#',
        '#..O................#...K...#...............O..#',
        '#...................#.......#..................#',
        '#...................#########..................#',
        '################################################',
      ],
    },
    cave: {
      id: 'cave', name: 'The Mountain Cave', vision: 330, dark: 0.86,
      palette: { floor: '#2a2420', floor2: '#27211d', wall: '#0e0b09', wallTop: '#3e342c', crate: '#4a4038', accent: '#b3122a' },
      lore: 'The metal door was forced open long ago. Arrows painted on the walls point to the back of the cave, where the block waited for two hundred years. The bones of guardians and seekers lie where they fell. Warnings cover every surface.',
      hazards: [
        ['Darkness', 'Vision is very short. Torches never stay lit here.'],
        ['Bones of the Fallen', 'Stepping on bones cracks them: the survivor is revealed to the hacker for 2.5s.'],
        ['Whispers', 'Sometimes THE END whispers from the empty pedestal and the darkness closes in on everyone for 6s.'],
      ],
      decals: [[38.5, 12.2, "DON'T GO", '#b3122a', 15, 0.55], [30, 14.0, 'NOT WORTH IT', '#b3122a', 13, 0.5], [15, 8.0, 'EVIL', '#b3122a', 22, 0.55],
        [6.5, 12.6, "DON'T GO", '#b3122a', 12, 0.55], [34, 16.5, '◄', '#d9c9a8', 22, 0.35], [26, 16.5, '◄', '#d9c9a8', 22, 0.35], [20, 16.5, '◄', '#d9c9a8', 22, 0.35], [13, 16.4, '◄', '#d9c9a8', 22, 0.35]],
      layout: [
        '################################################',
        '################################################',
        '######################....................######',
        '############....................##....S...######',
        '############...................G##........######',
        '############............x............b....######',
        '############...#######....................######',
        '########....................................####',
        '########...............###.b..##########....####',
        '########..b.........x..###.........#####....####',
        '########.........##....###.........#####....####',
        '########....##...##....###.........#..........##',
        '##..........##.....b...###.........#.......G..##',
        '##....b.......................................##',
        '##.............x..................b...x.......##',
        '##..D..K...G...........b......................##',
        '##..D.........................b...........S...##',
        '##............................................##',
        '##....b.....##...##.........................b.##',
        '##..........##...##....###....#....#..........##',
        '########...............###....#....#..........##',
        '########...............###....#....#####....####',
        '########..x.....b......###....#....#####....####',
        '########...............###..b.#....#####....####',
        '########....................................####',
        '#############..........................b.#######',
        '#############.........##.........##......#######',
        '#############.....b.G.##.........##..S...#######',
        '#############.......................x....#######',
        '#############............................#######',
        '################################################',
        '################################################',
      ],
    },
  };

  G.LORE = {
    rules: [
      ['Survivors win', 'if at least one of them is alive when SC\'s round clock runs out.'],
      ['The hacker wins', 'by deleting all three survivors before the reset.'],
      ['Code Terminals', 'Compiling a terminal cuts 20 seconds off the clock. Team up and they compile faster.'],
      ['Heartbeat', 'Survivors hear a heartbeat when a hacker is near. THE CREAKER makes no sound at all.'],
      ['Windups', 'Every strong ability glows on the ground before it fires. Read it, dodge it, punish it.'],
    ],
    controlsSurvivor: [
      ['WASD', 'Move'], ['Shift', 'Sprint (uses stamina)'], ['Mouse', 'Aim'], ['Q / E', 'Abilities'],
      ['Hold F', 'Compile a Code Terminal'], ['F', 'Ride a service elevator (MIT)'], ['Tab', 'Spectate next ally (when deleted)'], ['Esc', 'Pause'],
    ],
    controlsKiller: [
      ['WASD', 'Move'], ['Shift', 'Sprint (uses stamina)'], ['Mouse', 'Aim'], ['Left Click', 'Basic attack'],
      ['Q / E / R', 'Abilities'], ['Esc', 'Pause'],
    ],
    teamwork: [
      ['The Old Crew', 'Scratchy teaches at a terminal while NANO plants the Rally Banner beside him. Together they compile fastest.'],
      ['Stun Chain', 'NANO parries (1.1s), then GRIFFPATCH lands Showstopper (2s), then Scratchy charms (2.2s). Over five seconds of escape.'],
      ['Who\'s Real?', 'GRIFFPATCH clones split the hacker while the real team keeps compiling.'],
      ['Against SC', 'Never stand in a long lane. When the block glows, move sideways.'],
      ['Against BURGERS', 'Every stun makes him Adapt. Save your stuns for his Dive.'],
      ['Against THE CREAKER', 'No heartbeat. Avoid vines, and check behind you.'],
    ],
    betweenRounds: [
      'BURGERS is cooking tonight. It smells like a cook-off is coming: him, THE REVENGEST and Scratchy.',
      'It\'s Friday. NANO and THE REVENGEST are playing Sonic 3 on the Genesis, rotating controllers. The survivors watch from bean bag chairs.',
      'PROTOCOL2 and THE CREAKER are signing quietly in the corner. It might be the only real friendship in the realm.',
      'Scratchy is teaching a lesson nobody asked for.',
      'GRIFFPATCH regens quietly and pretends everything is fine.',
      'The hackers check the rotation they negotiated themselves, without SC\'s input. Even in hell, people organize.',
      'SC resets everything. The world stays the same. He could end all of this. He chooses, every time, not to.',
      'It\'s Sunday. Sometimes there is Sonic 3 on Sundays too.',
    ],
  };
})();
