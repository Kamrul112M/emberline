// EMBERLINE — config.js
// Every tunable number for the game lives here: match shape, economy,
// weapons, bots and the bomb. Nothing in this file touches the DOM or
// three.js, so the dossier reader (and a human) can see the whole design
// on one page.

export const MATCH = {
  roundsToWin: 3,          // first to 3 round wins takes the match (max 5 rounds)
  roundSeconds: 90,        // live-phase clock
  buySeconds: 12,          // buy phase at the start of every round
  endSeconds: 4,           // pause on the round-end card before the next buy phase
  plantSeconds: 3,         // hold E at the Beacon Pad to plant the Ember Charge
  defuseSeconds: 5,        // a Warden bot channel to defuse (player can interrupt by shooting it)
  bombSeconds: 25,         // detonation countdown once planted
  startMoney: 800,
  killReward: 300,
  plantReward: 300,
  roundWinReward: 1000,
  roundLossBonus: 250,
  maxMoney: 9000,
};

export const PLAYER = {
  health: 100,
  radius: 0.42,            // collision circle in the XZ plane
  eyeStanding: 1.62,
  eyeCrouching: 1.12,
  walkSpeed: 4.6,
  sprintSpeed: 6.9,
  crouchSpeed: 2.4,
  accel: 42,               // ground acceleration, units/s^2
  friction: 11,            // exponential ground damping
};

// Weapons: damage is per pellet that lands; headshot multiplies damage.
// spread is in radians at rest; bloom adds while firing or moving.
// recoilKick is camera pitch (radians) added per shot, recovered by a spring.
export const WEAPONS = {
  carbine: {
    id: 'carbine', name: 'VK-7 Carbine', slot: 1, price: 0,
    damage: 34, headMult: 3.0, rpm: 600, mag: 25, reserve: 100,
    reloadSeconds: 1.9, range: 90, spread: 0.006, bloomPerShot: 0.010,
    recoilKick: 0.016, recoilYaw: 0.004, auto: true, zoom: 1.15,
    tracer: 0xffd9a0,
  },
  smg: {
    id: 'smg', name: 'Rook-9 SMG', slot: 2, price: 800,
    damage: 21, headMult: 2.2, rpm: 900, mag: 32, reserve: 128,
    reloadSeconds: 1.5, range: 60, spread: 0.016, bloomPerShot: 0.008,
    recoilKick: 0.009, recoilYaw: 0.006, auto: true, zoom: 1.05,
    tracer: 0xaee6ff,
  },
  longbow: {
    id: 'longbow', name: 'Longbow .50', slot: 3, price: 2000,
    damage: 95, headMult: 2.0, rpm: 48, mag: 5, reserve: 20,
    reloadSeconds: 2.8, range: 160, spread: 0.0008, bloomPerShot: 0.03,
    recoilKick: 0.075, recoilYaw: 0.002, auto: false, zoom: 2.6,
    tracer: 0xff9d7a,
  },
};

export const GRENADE = {
  price: 300, max: 3, damage: 85, radius: 5.2, fuseSeconds: 1.1,
  throwSpeed: 16, cooldownSeconds: 0.6,
};

export const BOT = {
  count: 3,
  health: 100,
  radius: 0.42,
  walkSpeed: 3.1,
  rushSpeed: 4.4,
  damage: 9,               // per hit on the player
  shotsPerSecond: 2.2,
  reactionSeconds: 0.45,   // delay between seeing the player and first shot
  accuracy: 0.34,          // chance a fired shot actually connects
  waypointPause: 0.7,      // seconds a patrolling bot lingers at a node
  hearingRadius: 18,       // gunfire pulls patrolling bots toward the noise
};

// The fixed simulation step. Rendering runs on requestAnimationFrame, but
// the world only ever advances in exact slices of this size, so the game
// plays identically at 30, 60 or 144 Hz displays.
export const SIM = {
  step: 1 / 60,
  maxFrame: 0.25,          // spiral-of-death guard: never simulate more than this per frame
};

// Palette: a dusk relay yard — warm sand, rusted iron, ember orange vs.
// the Wardens' cold teal. Original art direction, flat-shaded boxes.
export const PALETTE = {
  sky: 0x2b2135,
  fog: 0x3a2a3d,
  ground: 0x8a6a4e,
  groundDark: 0x75573f,
  wall: 0x9c8468,
  wallTrim: 0x6e5843,
  crate: 0xa9743f,
  crateDark: 0x7d5527,
  metal: 0x5c6670,
  metalDark: 0x3f474e,
  ember: 0xff7a2f,
  emberSoft: 0xffb37a,
  beacon: 0xffc46b,
  warden: 0x2f8f86,
  wardenDark: 0x1f655e,
  wardenHead: 0xd8c9a3,
  playerTeam: 0xff7a2f,
};
