[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/Kamrul112M/emberline/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/Kamrul112M/emberline/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

# EMBERLINE — Hold the Beacon

An original round-based tactical FPS for the browser, built with three.js.
A MakeFun **best-game-01** ("Make the best game") entry.

The Wardens hold the Beacon Pad in a dusk relay yard. You cross the yard
alone: buy your kit, fight through three patrolling Wardens, and either
eliminate them all or plant the Ember Charge on the pad and defend it for
25 seconds — a Warden needs 5 uninterrupted seconds to defuse it. First
to 3 rounds wins the match.

## Play

```sh
node serve.ts            # then open http://localhost:8080
```

No build step, no network: everything the game loads lives under `game/`
(three.js 0.187 is vendored under `game/vendor/three/`).

| Input | Action |
|---|---|
| W A S D / mouse | move / aim (pointer lock) |
| Click / right-click | shoot / aim down sights |
| 1 · 2 · 3 | Carbine · Rook-9 SMG · Longbow .50 |
| R / G / E | reload / throw grenade / plant the charge (hold, on the pad) |
| Shift / C | sprint / crouch (crouching steadies aim) |

## Design notes

- **Fixed-step simulation** — the world advances in exact 1/60 s slices
  from an accumulator; rendering is decoupled, so play is identical at
  any display refresh rate.
- **Recoil & bloom** — every shot kicks the camera through a damped
  spring and opens the spread cone; movement, sprinting and crouching all
  feed the same spread model, so stopping to aim pays.
- **Bot patrol graph** — the Wardens walk a hand-linked 13-node waypoint
  graph, hear gunfire, react with a delay, strafe in fights, fall back
  when hurt, and rush the pad to defuse once the charge is planted.
- **Economy** — $800 start, $300 per elimination, $1,000 per round win;
  an SMG, a scoped Longbow and grenades are bought between rounds.
- **Sound** — every effect is synthesised live with WebAudio; there are
  no audio files.
- **Modular source** — `game/src/`: `config.js` (all tuning), `input.js`,
  `audio.js`, `world.js` (map + colliders + ray tests), `player.js`,
  `weapon.js` (arsenal, recoil, grenades), `bots.js`, `hud.js` (HUD +
  minimap), `main.js` (match state machine).

## Hand in (MakeFun)

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts   # copies game/ + screenshots/, writes out/dossier.json
```

Screenshots are staged, real renders of the game itself via
`game/index.html?shot=start|play|plant|end` (see `shots.json`).

Licence: MIT (see `LICENSE`). three.js is MIT-licensed, vendored with its
own licence file under `game/vendor/three/`.
