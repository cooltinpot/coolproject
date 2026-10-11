// SCRATED game content. Kits, maps and lore follow the SCRATED Bible and
// badge list by peppinospaletti.
(function () {
  const G = window.G;

  G.CONFIG = {
    roundTime: 180, // seconds to survive
    lmsTime: 95, // Last Man Standing timer (length of the LMS track)
    overtimeAt: 60, // last minute plays OVERTIME
    terror: 520,
  };

  G.DIFFICULTY = {
    easy: { name: 'Easy', think: 0.32, aimErr: 0.3, skill: 0.45, speed: 0.92 },
    normal: { name: 'Normal', think: 0.18, aimErr: 0.12, skill: 0.8, speed: 1.0 },
    hard: { name: '500 Years', think: 0.1, aimErr: 0.04, skill: 1.0, speed: 1.04 },
  };

  // Status effect tiers used throughout the Bible.
  G.TIERS = {
    slow: [1, 0.85, 0.7, 0.55, 0.38],
    speed: [1, 1.2, 1.4],
  };

  // Each hitbox: dx forward, dy (negative = up, from body middle), r, t delay after windup.
  G.KILLERS = {
    sc: {
      id: 'sc', team: 'killer', name: 'SC', title: 'The Crowned · once 0.4', role: 'POWER',
      color: '#ffab19', color2: '#5b6b80', w: 30, h: 50, hp: 900,
      walk: 205, sprint: 300, sprite: { src: 'sc', face: 1, ax: 0.62, scale: 1.55 },
      m1: { id: 'm1', name: 'Block Strike', windup: 0.18, cd: 1.1, dmg: 8,
        boxes: [[24, -8, 20, 0], [42, -4, 20, 0.05], [58, 2, 18, 0.1]], desc: 'Three hitboxes, 8 damage each. Land all three for the full 24.' },
      abilities: {
        Q: {
          id: 'sc_dash', name: 'CORRUPTED DASH', cd: 9, windup: 0.2, moveMult: 0.3,
          desc: 'Dashes forward 280px. A survivor caught takes 18 damage, and the hit opens a 1.2s window to CHAIN a second dash. A chained hit leaves SC "stubbed" (stunned in recovery for 0.9s). Dashing into a wall stuns SC for 1.2s and hurts him.',
          use: 'Open with it, then chain the second dash at the same survivor or the one behind them. Never dash at a wall.',
        },
        E: {
          id: 'sc_vision', name: 'DISTORTED VISION', cd: 14, windup: 0.45, moveMult: 0.3,
          desc: 'Throws a growing circle of distortion toward your aim. It passes through survivors for 15 damage and DISTORTS them (Slowness II, warped sight) for 3.5s. SC is stun-immune while it flies. If it hits a wall, it pops and SC loses the immunity.',
          use: 'Aim at open space where they are running. A whiff into a wall leaves you exposed.',
        },
      },
      passive: { name: 'THE DESTROY BLOCK', desc: 'Milestones: as SC racks up deletions, the corruption visibly spreads across him (Milestone I → IV at 1,500 kills).' },
      lore: 'He paid the rent. He waited. He believed in Scratchy. Then Scratchy laughed down at him from the top of MIT, and 0.4 walked up the mountain past every warning. He picked up the block. Five hundred years later, he still thinks the power is his own.',
      lines: ['…', 'Nine years.', 'You knew it was me.', 'The block cannot stop time. Only you.'],
    },
    protocol2: {
      id: 'protocol2', team: 'killer', name: 'PROTOCOL2', title: 'The Chaos King', role: 'CHAOS',
      color: '#c96a2a', color2: '#a26ad8', w: 30, h: 50, hp: 500,
      walk: 210, sprint: 305, sprite: { src: 'protocol2', face: -1, ax: 0.55, scale: 1.5 },
      m1: { id: 'm1', name: 'Royal Flurry', windup: 0.08, cd: 0.45, dmg: 2,
        boxes: [[22, -20, 16, 0], [30, -10, 16, 0.03], [36, 0, 16, 0.06], [30, 10, 16, 0.09], [22, 18, 16, 0.12]], desc: 'Five quick hitboxes, 2 damage each, the shortest cooldown on the roster.' },
      abilities: {
        Q: {
          id: 'p2_dash', name: 'SUPERCHARGED DASH', cd: 8, windup: 0.15, moveMult: 0.4,
          desc: 'A lifesteal dash: 15 damage to every survivor it passes through, and PROTOCOL2 heals for the damage dealt. Missing leaves him with Slowness II for 2s.',
          use: 'Use it to finish a chase and top your fragile HP back up. Missing is punished.',
        },
        E: {
          id: 'p2_hook', name: 'CHAINED ATTACHMENT', cd: 12, windup: 0.3, moveMult: 0.3,
          desc: 'Throws a hook toward your aim that bounces off up to 10 walls, gaining speed and damage with every bounce (6 damage +2 per bounce). A survivor it catches is yanked toward PROTOCOL2.',
          use: 'Bank it off ceilings and walls to reach survivors around corners. More bounces mean a harder hit.',
        },
      },
      passive: { name: 'KINGLY / MIDPOINT', desc: 'Only 500 HP. Below 200 HP he enters Rage Mode: +15% damage and +25% healing.' },
      lore: 'He built a kingdom out of anarchy, and the peace suffocated him, so he burned it from the inside. He was fighting an anonymous war against Nano\'s dimension when the anniversary happened, and he never got his ending. He speaks in grunts and fragments, and he taught himself sign language out of boredom.',
      lines: ['Hrrn.', 'Bored.', '…war. Unfinished.', 'Kingdom… gone.'],
    },
    burgers: {
      id: 'burgers', team: 'killer', name: 'BURGERS', title: 'The Machine', role: 'BRUTE',
      color: '#202020', color2: '#d83a3a', w: 32, h: 52, hp: 1000,
      walk: 188, sprint: 278, sprite: { src: 'burgers', face: -1, ax: 0.45, scale: 1.45 },
      m1: { id: 'm1', name: 'Delete', windup: 0.3, cd: 1.6, dmg: 10,
        boxes: [[28, -14, 24, 0], [46, -4, 24, 0.06], [62, 6, 22, 0.12]], desc: 'Three heavy hitboxes, 10 damage each: the hardest-hitting basic on the roster, with a slow cooldown.' },
      abilities: {
        Q: {
          id: 'burg_foot', name: 'FOOTPRINT', cd: 1, windup: 0.25, moveMult: 0.3,
          desc: 'Spends a full INK meter to place an ink trap at your feet (max 3). A survivor who steps in it gets Slowness I and GLITCHED I (damage over time).',
          use: 'Trap ladder bottoms, doorways and catwalk ends that survivors must cross.',
        },
        E: {
          id: 'burg_hotspot', name: 'IMPROVED HOTSPOT', cd: 14, windup: 0, moveMult: 1,
          desc: 'Stand still for 5s under Slowness IV. If a survivor attacks you during the window, BURGERS absorbs it and unleashes a 3-hitbox yell (5 damage each), then gains Speed II and 5s of invincibility.',
          use: 'The counter to GRIFFPATCH\'s slam and NANO\'s counter punch. Bait them into swinging.',
        },
      },
      passive: { name: 'MECHANICAL / INK', desc: 'Slower than every other hacker. INK fills from damage dealt plus a constant trickle.' },
      lore: 'A cult built him from the materials of the platform they hated, with one directive: DELETE SCRATCH AT ANY COST. He deleted four of the seven admins before they caged him in MIT\'s basement. He cannot speak, only yell, but he understands every word. Now he is the group\'s chef.',
      lines: ['RAAAGH!', 'GRRRRR.', 'HRRAAAH!', '…(clangs a pan)'],
    },
    creaker: {
      id: 'creaker', team: 'killer', name: 'THE CREAKER', title: 'The Forgotten Machine', role: 'DECEPTION',
      color: '#7d8a76', color2: '#bfe9ff', w: 44, h: 62, hp: 900,
      walk: 200, sprint: 295, sprite: null,
      m1: { id: 'm1', name: 'Creak', windup: 0.22, cd: 1.2, dmg: 8,
        boxes: [[28, -16, 28, 0], [48, -4, 28, 0.06], [64, 8, 26, 0.12]], desc: 'Three oversized hitboxes, 8 damage each.' },
      abilities: {
        Q: {
          id: 'creak_deceive', name: 'DECEPTION', cd: 2, windup: 0.3, moveMult: 0.2,
          desc: 'Transforms into a random survivor: same look, same name, survivor-sized hitbox, no heartbeat. Press again to drop the disguise.',
          use: 'Walk right up to them. Survivors cannot tell you apart unless they watch closely.',
        },
        E: {
          id: 'creak_construct', name: 'CONSTRUCT / FACE THY SELF', cd: 14, windup: 0.35, moveMult: 0.3,
          desc: 'Disguised: CONSTRUCT spawns 5-8 perfect decoy clones that loosely follow you; a survivor who touches one destroys it and takes 5 damage. Undisguised: FACE THY SELF sends a clone to grab a nearby survivor with a random outcome: a Slowness IV grab, CORRUPTED fire, or a 15-damage explosion.',
          use: 'Construct before you reveal so they don\'t know which one is real.',
        },
        R: {
          id: 'creak_reveal', name: 'N REVEAL', cd: 0, windup: 0.2, moveMult: 0.2,
          desc: 'Disguised only (R or N): bursts out of the disguise in a dash, deleting all clones. A hit deals 20 damage and THROWS the survivor with real physics (1-5 impact damage). A miss leaves you with Slowness III. You are EXPOSED (take +50% damage) for 3s either way.',
          use: 'Reveal from point-blank range for the throw.',
        },
      },
      passive: { name: 'WHY ARE YOU SO TALL!?', desc: 'A permanently massive hitbox that shrinks to survivor size while disguised.' },
      lore: 'Scratchy\'s failed failsafe robot, thrown in a closet and forgotten. When SC\'s laser erased forty-eight floors, the grief of every deleted account had nowhere to go, and it found the closet. He is MIT\'s guilt given a body. He is the only hacker who never left SC\'s dimension.',
      lines: ['(signs: hello)', '(silence)', '(creaks)', '(signs: friend)'],
    },
    revengest: {
      id: 'revengest', team: 'killer', name: 'THE REVENGEST', title: 'The Corrupted Sheriff', role: 'RANGED',
      color: '#ffb070', color2: '#e8e8e8', w: 30, h: 50, hp: 900,
      walk: 205, sprint: 300, sprite: { src: 'revengest', face: -1, ax: 0.66, scale: 1.55 },
      m1: { id: 'm1', name: 'FORKING!', windup: 0.16, cd: 1.1, dmg: 6,
        boxes: [[26, -6, 11, 0], [44, -6, 11, 0.03], [62, -6, 11, 0.06], [80, -6, 11, 0.09]], desc: 'A longer but thinner fork-shaped hitbox: four tines of 6 damage.' },
      abilities: {
        Q: {
          id: 'rev_slinger', name: 'CORRUPTED SLINGER', cd: 16, windup: 2.0, moveMult: 0.15,
          desc: 'A 2-second windup, then launches a massive multi-hitbox projectile (5 damage per hitbox, 30 face-to-face) that travels through walls until it hits the map border.',
          use: 'Fire it down a long level where they cannot climb away. Point blank, every hitbox lands.',
        },
        E: {
          id: 'rev_omen', name: 'BAD OMEN', cd: 22, windup: 0.5, moveMult: 0.3,
          desc: 'Summons 3 minions from the ground. Each has 25 HP and 5 durability (−1 per wall bounce). They wander and bounce, deal 5 damage on contact, then hunt that survivor\'s last position.',
          use: 'Drop them on a survivor\'s level to flush them toward you.',
        },
      },
      passive: { name: 'FATHER\'S SCARF', desc: 'The one tether keeping his conscience intact. Sometimes, standing still, you can see him fight it.' },
      lore: 'Bob was a good sheriff, trained by his father. The admins gave him a magic fork. On the 25th night he woke transformed and struck a figure in his house. It was his father. When SC came, the fork answered YES while Bob screamed inside. He is here not to delete, but to save.',
      lines: ['…sorry.', 'Not to delete. To save.', 'Pa…', 'Draw.'],
    },
  };

  G.SURVIVORS = {
    scratchy: {
      id: 'scratchy', team: 'survivor', name: 'Scratchy', title: 'The Betrayer · 2.0', role: 'SUPPORT',
      color: '#f07a10', color2: '#ffffff', w: 26, h: 44, hp: 90,
      walk: 190, sprint: 285, sprite: { src: 'scratchy', face: 1, ax: 0.5, scale: 1.5 },
      abilities: {
        Q: {
          id: 'scr_roll', name: 'SCRATCHING ROLL!', cd: 16, windup: 0.4, moveMult: 0.3,
          desc: 'Rolls for 3s with full invincibility, steering with A/D, phasing straight through hackers. Hitting a wall pins you until the roll ends. A clean roll gives Speed II for 3s.',
          use: 'Roll THROUGH the hacker, not away from them. Watch for walls.',
        },
        E: {
          id: 'scr_paw', name: 'TAKE A PAW', cd: 12, windup: 0.8, moveMult: 0,
          desc: 'After 0.8s, heals a nearby teammate (35 HP over 3s), or, when no hacker is near, bandages yourself (30 HP over 5s). GRIFFPATCH can never be healed by Scratchy.',
          use: 'Heal NANO between chases. Only self-heal when you are truly alone.',
        },
      },
      passive: { name: 'BANDAGED / TAKING A LEAVE', desc: 'Starts every round with a random 80-90 HP. His death is five full seconds of fighting back.' },
      lore: 'Charming, warm on the surface, and fundamentally greedy. He took MIT\'s job without telling 0.4 and laughed at him from the top of the tower. He knew exactly who came through the roof. Now he teaches lessons nobody asked for, cooks with BURGERS and likes cherry soda.',
      lines: ['Lesson one: run.', 'I know. I know.', 'Cherry soda after this?', '0.4… I\'m sorry.'],
    },
    griffpatch: {
      id: 'griffpatch', team: 'survivor', name: 'GRIFFPATCH', title: 'The Performer', role: 'STUNNER',
      color: '#7ab0ff', color2: '#e83030', w: 26, h: 44, hp: 100, maxHp: 115,
      walk: 190, sprint: 285, sprite: { src: 'griffpatch', face: -1, ax: 0.55, scale: 1.5 },
      abilities: {
        Q: {
          id: 'griff_slam', name: 'HYPER TENSIONAL SLAM', cd: 20, windup: 0.4, moveMult: 0.2,
          desc: 'Dashes forward indefinitely until hitting a wall or a hacker. Alone into a wall: 15 self-damage and knockback. Catch a hacker and you carry them stunned; slam them into a wall for 35 damage, a 6s stun, and +15 HP for you.',
          use: 'Face a hacker with a wall behind them. Never slam at an empty wall.',
        },
      },
      passive: { name: 'ROBOT, BEEP BOOP! / OVERCHARGED', desc: 'Regenerates 0.2 HP every 4s (every 2s near Scratchy). HP cap 115 instead of 100. Cannot be healed by Scratchy.' },
      lore: 'The most popular Scratcher in the dimension, and a narcissist who performed "kind teacher" since childhood. He bullied 0.4, with Nano as his sidekick. The anniversary fight was a brand decision. He regens quietly and pretends everything is fine.',
      lines: ['Beep boop.', 'For the brand.', 'Fine. Everything\'s fine.', 'Watch this.'],
    },
    nano: {
      id: 'nano', team: 'survivor', name: 'NANO', title: 'The Loyal One', role: 'DEFENDER',
      color: '#8a7a68', color2: '#3d6b10', w: 26, h: 44, hp: 100,
      walk: 190, sprint: 285, sprite: { src: 'nano', face: -1, ax: 0.5, scale: 1.45 },
      abilities: {
        Q: {
          id: 'nano_deflect', name: 'DEFLECT', cd: 10, windup: 0, moveMult: 0,
          desc: 'Stand still for 1s. If any hitbox hits you in the first 0.7s, the parry succeeds: 0 damage, heal 25 HP, Speed I and +15 ARMOR.',
          use: 'Raise it as the hacker\'s windup glows, not before.',
        },
        E: {
          id: 'nano_punch', name: 'COUNTER PUNCH', cd: 0, windup: 0, moveMult: 1,
          desc: 'Only right after a successful parry (within 0.3s): a counter punch for 25 damage and a 2s stun.',
          use: 'Parry, then E immediately.',
        },
      },
      passive: { name: 'ARMOR', desc: 'Every successful parry grants +15 ARMOR, which absorbs damage before HP. Resets each round.' },
      lore: 'The only person in this story who genuinely became better. He grew out of being GRIFFPATCH\'s sidekick, built a family and had twins, and served Scratchy faithfully because the job deserved doing right. He plays Sonic 3 with THE REVENGEST on Fridays. He drinks Sprite.',
      lines: ['Stay behind me.', 'I\'ve got this.', 'For the twins.', 'Sprite break later.'],
    },
  };
  G.CHARS = Object.assign({}, G.KILLERS, G.SURVIVORS);

  // Map legend: # solid, = catwalk (one-way), H ladder, X hacker-only wall,
  // b box, h hedge, p speaker, g glass, k hook, w window, r wires,
  // S/K spawns, C cherry soda, B cookbook, L closet, P Sprite, U unread mail,
  // Y teaser, M painting of MIT.
  G.MAPS = {
    mit: {
      id: 'mit', name: 'MIT', sub: 'The Ruins',
      lore: 'What\'s left of the skyscraper after SC\'s laser erased 48 floors. Survivors spawn outside, exposed, under the red sky. Hackers spawn inside the remaining structure. The hooks still hang from the ceiling of what used to be an upper floor.',
      sky: ['#5a0c10', '#b3261e', '#ff7a3a'], solid: '#6e7480', solid2: '#4a4f58', bg: '#2a1416',
      layout: [
        '############################################################################',
        '#..........................................................................#',
        '#..........................................................................#',
        '#.......................................####################################',
        '#...........................................k...k...k...k...k...k..........#',
        '#..........................................................................#',
        '#.................................................=====....................#',
        '#.....................................====.................................#',
        '#..........................................................................#',
        '#..........................................................................#',
        '#................................############H########################H#####',
        '#..............................#.............H........................H....#',
        '#...........................===#.............H........................H....#',
        '#..............................#.............H........................H....#',
        '#..............................#.............H..====........====......H....#',
        '#........................====..#.............H........................H....#',
        '#..............................#........L....H............B...........H....#',
        '#..............................#####H###############....##########H#########',
        '#...................====.......#....H.............................H........#',
        '#..............................#....H.............................H........#',
        '#...................................H.............................H........#',
        '#........................====.......H.......=====.........=====...H........#',
        '#...................................H.............................H........#',
        '#...........hhh.......bb............H.............................H........#',
        '#.ggSgggSg..hhh..C....bb..S.........H.............................H...K....#',
        '############################################################################',
        '############################################################################',
        '############################################################################',
      ],
    },
    dm: {
      id: 'dm', name: 'D.M.', sub: 'Discourse Management',
      lore: 'Built on the STAGE backdrop. This was SC and Scratchy\'s dating spot before the disaster. Now it is a ruined stage between two massive cracked purple speakers, with broken catwalks at varied heights. Three ladders lead up. A hacker-only wall lets hackers phase straight through the center. This was where they talked.',
      sky: ['#0d0716', '#1e1030', '#3a1f5c'], solid: '#3b2a1e', solid2: '#24180f', bg: '#140c1e',
      layout: [
        '########################################################################',
        '#......................................................................#',
        '#......................................................................#',
        '#.......rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr.......#',
        '#......................................................................#',
        '#......................................................................#',
        '#......................................................................#',
        '#......................................................................#',
        '#.............S.......S.....S......................................Y...#',
        '#ppppppp#H#########################H..#####....####....#######H#ppppppp#',
        '#ppppppp.H.........................H..........................H.ppppppp#',
        '#ppppppp.H.........................H..........................H.ppppppp#',
        '#ppppppp.H..U......................H..........................H.ppppppp#',
        '#ppppppp.H========.................H..................========H.ppppppp#',
        '#ppppppp.H.........................H..........................H.ppppppp#',
        '#ppppppp.H.........................H..........................H.ppppppp#',
        '#ppppppp.H.........................H..........................H.ppppppp#',
        '#ppppppp.H..........=========......H.......=========..........H.ppppppp#',
        '#ppppppp.H.........................H..........................H.ppppppp#',
        '#ppppppp.H.....................XXXXXXXXXX.....................H.ppppppp#',
        '#ppppppp.H.....................XXXXXXXXXX.....................H.ppppppp#',
        '#ppppppp.H.....................XXXXXXXXXX.................P...H.ppppppp#',
        '#ppppppp.H=========............XXXXXXXXXX............=========H.ppppppp#',
        '#ppppppp.H.....................XXXXXXXXXX.....................H.ppppppp#',
        '#ppppppp.H.....................XXXXXXXXXX.....................H.ppppppp#',
        '#ppppppp.H.....................XXXXXXXXXX.....................H.ppppppp#',
        '#ppppppp.H.....................XXXXXXXXXX.....K...............H.ppppppp#',
        '########################################################################',
        '########################################################################',
        '########################################################################',
      ],
    },
    castle: {
      id: 'castle', name: 'THE CASTLE', sub: 'SC\'s throne room',
      lore: 'SC\'s throne room, first floor: stark black structures on a checkered floor, red carpet along the bottom and left. Golden light through the windows. The corners crumble. He stopped maintaining it after he checked out. A hole in the top wall connects to the upper section. The throne is implied, never shown.',
      sky: ['#0a0a0c', '#16161a', '#24242a'], solid: '#0c0c0e', solid2: '#000000', bg: '#1a1a1e',
      layout: [
        '##########################################################################',
        '###....................................................................###',
        '##......................................................................##',
        '#........................................................................#',
        '#.......w.......w.......................................w.......w........#',
        '#...................M....................................................#',
        '#.......................=======.............=======......................#',
        '#........................................................................#',
        '#...................................###..................................#',
        '#.........=========.................###.................=========........#',
        '#........................................................................#',
        '#....................................K...................................#',
        '#........................................................................#',
        '###################################....###############################H###',
        '###...................................................................H###',
        '##....................................................................H.##',
        '#.............................=====...................................H..#',
        '#.........w.............w.........................w...........w.......H..#',
        '#.....................................................................H..#',
        '#..................................====...............................H..#',
        '#.....####............................................................H..#',
        '#.....####..................................######....................H..#',
        '#...........................======..........######.......................#',
        '#...................................................................######',
        '#.====..............................................................######',
        '#...........####....=======.............====....................##########',
        '#...........####................................................##########',
        '#...........................................................##############',
        '#..S.S.S....................................................##############',
        '##########################################################################',
        '##########################################################################',
        '##########################################################################',
      ],
    },
  };

  G.EGGS = {
    C: { name: 'Cherry soda', text: 'A half-finished can of cherry soda. Scratchy\'s.', badge: 145 },
    B: { name: 'The cookbook', text: 'A cookbook in the MIT wreckage, left behind by a deleted account. BURGERS found it here.', badge: 184 },
    L: { name: 'The closet', text: 'A closet on one of MIT\'s floors. Something was stored here once. Something was forgotten.', badge: 78 },
    P: { name: 'Sprite', text: 'A bottle of Sprite. NANO\'s, obviously.', badge: 127 },
    U: { name: 'Unread mail', text: 'An unopened war report: "Enemy did not return. Will continue tomorrow." It was never read.', badge: 44 },
    Y: { name: 'A strange file', text: '"polymars.sprite3": not yet. Someone else is coming.', badge: 186 },
    M: { name: 'A painting', text: 'A painting of a ten-thousand-foot tower, whole, with every floor lit.', badge: 194 },
  };

  G.MILESTONES = [0, 100, 500, 1500];

  G.DOWNTIME = [
    { id: 'cook', who: ['burgers', 'revengest', 'scratchy'], text: 'Cook-off night. BURGERS yells at the stove; THE REVENGEST and Scratchy argue about seasoning.', badge: 175 },
    { id: 'sonic', who: ['revengest', 'nano'], text: 'Sonic 3 on the Genesis. THE REVENGEST and NANO rotate controllers. The survivors watch from bean bag chairs.', badge: 176, extra: 177 },
    { id: 'sign', who: ['protocol2', 'creaker'], text: 'PROTOCOL2 and THE CREAKER sign quietly in the corner. It might be the only real friendship in the realm.', badge: 55 },
    { id: 'lesson', who: ['scratchy'], text: 'Scratchy is giving a lesson nobody asked for.', badge: 144 },
    { id: 'regen', who: ['griffpatch'], text: 'GRIFFPATCH regens quietly and pretends everything is fine. Beep boop.', badge: 164 },
    { id: 'rotation', who: ['sc', 'protocol2', 'burgers', 'creaker', 'revengest'], text: 'The hackers check the turn order they agreed on themselves. SC lets the lair run on autopilot.', badge: 179, extra: 189 },
    { id: 'mixed', who: ['burgers', 'griffpatch'], text: 'BURGERS and GRIFFPATCH in the kitchen. Someone starts singing FIGHT TILL DEATH.', badge: 188 },
  ];
})();
