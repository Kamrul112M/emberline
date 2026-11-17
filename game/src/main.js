// EMBERLINE — main.js
// Owns the match: a fixed-step simulation (60 Hz accumulator, rendering
// decoupled) running a round state machine —
//
//   title → buy → ready → live → planted → roundEnd → buy → … → matchEnd
//
// Win a round by eliminating all three Wardens, or by planting the Ember
// Charge at the Beacon Pad and stopping the Wardens defusing it for 25 s.
// Lose it by dying before the plant, letting the clock run out, or letting
// a Warden finish a 5 s defuse. First to 3 rounds wins the match.
//
// Shooting is honest hitscan: a ray is tested against the world's box
// colliders and each bot's head/body spheres, nearest hit wins, and the
// weapon's live spread (bloom + movement + recoil state) jitters the ray.

import * as THREE from 'three';
import { MATCH, SIM } from './config.js';
import { Input } from './input.js';
import { SoundBank } from './audio.js';
import { World, PLAYER_SPAWN, BOT_SPAWNS, SITE } from './world.js';
import { Player } from './player.js';
import { Arsenal } from './weapon.js';
import { Bot } from './bots.js';
import { Hud } from './hud.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot'); // start | play | plant | end — screenshot staging, see stageShot()

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1, 0.08, 220);

const sound = new SoundBank();
const world = new World(scene);
const player = new Player(world);
const input = new Input(canvas);
const arsenal = new Arsenal(scene, camera, sound);
const hud = new Hud();
const bots = BOT_SPAWNS.map((s) => new Bot(scene, world, s, sound));

const state = {
  phase: 'title',           // title | buy | ready | live | planted | roundEnd | matchEnd
  paused: false,
  now: 0,                   // simulation clock (seconds, fixed-stepped)
  round: 1, scoreUs: 0, scoreThem: 0,
  money: MATCH.startMoney,
  timeLeft: MATCH.roundSeconds, buyLeft: 0, endLeft: 0,
  bombLeft: 0, plantProgress: 0, defuseProgress: 0, defusing: false,
  lastBeepAt: 0,
  noise: null,              // {x, z, at} — last loud noise the bots can hear
  kills: 0,
};
window.__EMBER__ = state;   // staging + debugging handle

// ---------------------------------------------------------------- FX ----
const fx = { tracers: [], flashes: [] };
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.85 });
function spawnTracer(from, to, color) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, tracerMat.clone());
  line.material.color.setHex(color);
  scene.add(line);
  fx.tracers.push({ line, life: 0.07 });
}
function spawnExplosion(at) {
  const light = new THREE.PointLight(0xff8c3a, 400, 30, 1.6);
  light.position.copy(at).y += 1.2;
  scene.add(light);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffb37a, transparent: true, opacity: 0.95 }));
  ball.position.copy(at).y += 0.8;
  scene.add(ball);
  fx.flashes.push({ light, ball, life: 0.55, max: 0.55 });
  sound.explosion();
}
function stepFx(dt) {
  for (let i = fx.tracers.length - 1; i >= 0; i--) {
    const t = fx.tracers[i]; t.life -= dt;
    t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.85;
    if (t.life <= 0) { scene.remove(t.line); t.line.geometry.dispose(); fx.tracers.splice(i, 1); }
  }
  for (let i = fx.flashes.length - 1; i >= 0; i--) {
    const f = fx.flashes[i]; f.life -= dt;
    const k = Math.max(0, f.life / f.max);
    f.ball.scale.setScalar(1 + (1 - k) * 9);
    f.ball.material.opacity = k * 0.9;
    f.light.intensity = 400 * k;
    if (f.life <= 0) { scene.remove(f.light, f.ball); fx.flashes.splice(i, 1); }
  }
}

// ------------------------------------------------------------ shooting ----
const _dir = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _hit = new THREE.Vector3();
function fireShot() {
  camera.getWorldDirection(_dir);
  // Spread: random cone jitter scaled by the weapon's live spread.
  const s = arsenal.spread(player);
  _dir.x += (Math.random() - 0.5) * 2 * s;
  _dir.y += (Math.random() - 0.5) * 2 * s;
  _dir.z += (Math.random() - 0.5) * 2 * s;
  _dir.normalize();
  _origin.copy(camera.position);
  const def = arsenal.def;
  const wallT = world.rayDistance(_origin.x, _origin.y, _origin.z, _dir.x, _dir.y, _dir.z, def.range);

  // Bots: head sphere (r .24 @ y1.66) and body sphere (r .42 @ y0.98).
  let best = null;
  for (const bot of bots) {
    if (!bot.alive) continue;
    for (const zone of ['head', 'body']) {
      const cy = zone === 'head' ? 1.66 : 0.98;
      const r = zone === 'head' ? 0.26 : 0.44;
      const cx = bot.pos.x - _origin.x, cyy = cy - _origin.y, cz = bot.pos.z - _origin.z;
      const t = cx * _dir.x + cyy * _dir.y + cz * _dir.z;
      if (t < 0.3 || t > def.range || t > wallT) continue;
      const px = _origin.x + _dir.x * t, py = _origin.y + _dir.y * t, pz = _origin.z + _dir.z * t;
      const d = Math.hypot(px - bot.pos.x, py - cy, pz - bot.pos.z);
      if (d <= r && (!best || t < best.t)) best = { bot, zone, t };
    }
  }
  const endT = best ? best.t : Math.min(wallT, def.range);
  _hit.copy(_origin).addScaledVector(_dir, endT);
  const muzzle = _origin.clone().addScaledVector(_dir, 0.7); muzzle.y -= 0.14; muzzle.x += 0.1;
  spawnTracer(muzzle, _hit.clone(), def.tracer);
  state.noise = { x: player.pos.x, z: player.pos.z, at: state.now };

  if (best) {
    const dmg = def.damage * (best.zone === 'head' ? def.headMult : 1);
    const result = best.bot.hurt(dmg);
    if (result === 'killed') {
      state.money = Math.min(MATCH.maxMoney, state.money + MATCH.killReward);
      state.kills++;
      hud.flashHitmarker(best.zone === 'head', true);
      sound.kill();
      checkEliminationWin();
    } else {
      hud.flashHitmarker(best.zone === 'head', false);
      if (best.zone === 'head') sound.headshot(); else sound.hit();
      // Shooting a defusing Warden interrupts the channel.
      if (best.bot.state === 'defuse') { best.bot.state = 'rush'; state.defuseProgress = 0; }
    }
  }
}

function damagePlayer(amount) {
  if (state.phase !== 'live' && state.phase !== 'planted') return;
  const wasAlive = player.alive;
  player.hurt(amount, state.now);
  hud.hurtFlash(); sound.hurt();
  if (wasAlive && !player.alive && state.phase === 'live') endRound(false, 'You fell before the charge was planted.');
}

// ------------------------------------------------------------- rounds ----
function startMatch() {
  state.scoreUs = 0; state.scoreThem = 0; state.round = 1; state.kills = 0;
  state.money = MATCH.startMoney;
  arsenal.resetMatch();
  startRound();
}
function startRound() {
  player.reset(PLAYER_SPAWN);
  input.yaw = PLAYER_SPAWN.yaw; input.pitch = 0;
  for (const b of bots) b.reset();
  arsenal.resetRound();
  state.timeLeft = MATCH.roundSeconds;
  state.bombLeft = 0; state.plantProgress = 0; state.defuseProgress = 0; state.defusing = false;
  state.phase = 'buy'; state.buyLeft = MATCH.buySeconds; state.paused = false;
  hud.showBuy(true); hud.renderBuyMenu(state, buyItem);
  hud.showBanner(`ROUND ${state.round}`, 'Buy your kit — the Wardens hold the Beacon Pad', 2.4, state.now);
}
function buyItem(id) {
  const cost = arsenal.costOf(id);
  if (arsenal.buy(id, state.money)) {
    state.money -= cost; sound.buy();
    hud.renderBuyMenu(state, buyItem);
  } else sound.denied();
}
function beginLive() {
  hud.showBuy(false);
  state.phase = 'live';
  input.lock();
}
function endRound(won, reason) {
  if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return;
  if (won) { state.scoreUs++; state.money = Math.min(MATCH.maxMoney, state.money + MATCH.roundWinReward); sound.roundWin(); }
  else { state.scoreThem++; state.money = Math.min(MATCH.maxMoney, state.money + MATCH.roundLossBonus); sound.roundLose(); }
  hud.showBuy(false);
  const matchOver = state.scoreUs >= MATCH.roundsToWin || state.scoreThem >= MATCH.roundsToWin;
  hud.showBanner(won ? 'ROUND WON' : 'ROUND LOST', reason, 3.2, state.now);
  if (matchOver) {
    state.phase = 'matchEnd';
    input.unlock();
    const victory = state.scoreUs > state.scoreThem;
    hud.showEnd(true, victory ? '⚑ RELAY HELD — YOU WIN' : 'THE WARDENS KEEP THE RELAY',
      victory ? 'The Ember Charge lit the beacon. The yard is yours.' : 'The beacon stays dark… this time.',
      `Final score ${state.scoreUs} — ${state.scoreThem} · ${state.kills} eliminations`);
  } else {
    state.phase = 'roundEnd'; state.endLeft = MATCH.endSeconds;
  }
}
function checkEliminationWin() {
  if ((state.phase === 'live' || state.phase === 'planted') && bots.every((b) => !b.alive)) {
    endRound(true, 'All Wardens eliminated.');
  }
}

// --------------------------------------------------------- fixed step ----
function fixedStep(dt) {
  state.now += dt;
  const now = state.now;
  arsenal.finishReloadIfDue(now);
  stepFx(dt);
  world.updateVisuals(now);

  if (state.paused) { input.endStep(); return; }

  switch (state.phase) {
    case 'buy': {
      state.buyLeft -= dt;
      if (input.take('Enter')) { state.phase = 'ready'; hud.showBuy(false); hud.showMessage('Click the yard to take aim', 2.5, now); }
      if (state.buyLeft <= 0 && state.phase === 'buy') { state.phase = 'ready'; hud.showBuy(false); hud.showMessage('Click the yard to take aim', 3, now); }
      break;
    }
    case 'ready': break; // waits for the click that locks the pointer (see click handler)
    case 'roundEnd': {
      state.endLeft -= dt;
      stepBots(dt, false);
      if (state.endLeft <= 0) { state.round++; startRound(); }
      break;
    }
    case 'live': case 'planted': {
      stepCombat(dt);
      break;
    }
    default: break; // title / matchEnd: world idles, bots patrol for the backdrop
  }
  if (state.phase === 'title' || state.phase === 'matchEnd') stepBots(dt, true);
  input.endStep();
}

function stepBots(dt, backdropOnly) {
  const ctx = {
    now: state.now, dt, player, playerEye: player.eye,
    bomb: state.phase === 'planted' ? { planted: true, x: SITE.x, z: SITE.z } : null,
    noise: backdropOnly ? null : state.noise,
    onPlayerHit: (dmg) => damagePlayer(dmg),
    onBotShotFx: (bot) => {
      const from = new THREE.Vector3(bot.pos.x, 1.45, bot.pos.z);
      const to = new THREE.Vector3(player.pos.x, player.eye - 0.15, player.pos.z);
      spawnTracer(from, to, 0x66ffe9);
    },
  };
  for (const bot of bots) bot.step(ctx);
}

function stepCombat(dt) {
  const now = state.now;
  // --- player movement (dead players spectate from where they fell)
  if (player.alive) {
    const wish = input.moveAxis();
    player.step(wish, input.yaw, dt, {
      sprintHeld: input.held('ShiftLeft') || input.held('ShiftRight'),
      crouchHeld: input.held('KeyC') || input.held('ControlLeft'),
    });
  }
  arsenal.ads = player.alive && input.held('MouseRight') && !player.sprinting;
  arsenal.step(dt, player, now);

  // --- weapons
  if (player.alive) {
    for (const slot of [1, 2, 3]) if (input.take(`Digit${slot}`)) arsenal.switchBySlot(slot);
    if (input.take('KeyR')) arsenal.startReload(now);
    const shot = arsenal.tryFire(now, { triggerHeld: input.mouseDown, triggerPressed: input.takeMouse() });
    if (shot) fireShot();
    if (input.take('KeyG') && arsenal.canThrowGrenade(now)) {
      camera.getWorldDirection(_dir);
      const g = arsenal.throwGrenade(now, camera.position.clone(), _dir.clone());
      if (g) { scene.add(g.mesh); grenades.push(g); state.noise = { x: player.pos.x, z: player.pos.z, at: now }; }
    }
  }
  stepGrenades(dt);

  // --- bots
  stepBots(dt, false);

  // --- the plant (live phase only, on the pad, holding E)
  if (state.phase === 'live' && player.alive) {
    const onPad = Math.hypot(player.pos.x - SITE.x, player.pos.z - SITE.z) <= SITE.radius;
    if (onPad && input.held('KeyE')) {
      state.plantProgress += dt / MATCH.plantSeconds;
      if (state.plantProgress >= 1) {
        state.phase = 'planted';
        state.bombLeft = MATCH.bombSeconds;
        state.plantProgress = 0;
        state.money = Math.min(MATCH.maxMoney, state.money + MATCH.plantReward);
        sound.plantDone();
        hud.showBanner('CHARGE PLANTED', 'Hold the pad — the Wardens are coming to defuse it', 2.6, now);
        placeBombMesh();
      }
    } else state.plantProgress = Math.max(0, state.plantProgress - dt * 2);
    state.timeLeft -= dt;
    if (state.timeLeft <= 0) endRound(false, 'Time ran out — the charge was never planted.');
  }

  // --- planted phase: countdown, beeper, defuse channel
  if (state.phase === 'planted') {
    state.bombLeft -= dt;
    const beepEvery = state.bombLeft < 6 ? 0.28 : state.bombLeft < 14 ? 0.6 : 1.1;
    if (now - state.lastBeepAt >= beepEvery) { state.lastBeepAt = now; sound.beep(state.bombLeft < 3); }
    const defuser = bots.find((b) => b.alive && b.state === 'defuse');
    state.defusing = !!defuser;
    if (defuser) {
      state.defuseProgress += dt / MATCH.defuseSeconds;
      if (state.defuseProgress >= 1) {
        sound.defused();
        endRound(false, 'A Warden defused the Ember Charge.');
      }
    } else state.defuseProgress = Math.max(0, state.defuseProgress - dt * 1.5);
    if (state.bombLeft <= 0 && state.phase === 'planted') {
      spawnExplosion(new THREE.Vector3(SITE.x, 0, SITE.z));
      endRound(true, 'The Ember Charge detonated. The beacon burns again.');
    }
  }
}

// ------------------------------------------------------------ grenades ----
const grenades = [];
function stepGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    if (g.step(dt, world) === 'explode') {
      scene.remove(g.mesh);
      spawnExplosion(g.pos.clone());
      // Area damage with cover falloff, both sides.
      const hurt = (pos, eyeY, apply) => {
        const d = Math.hypot(pos.x - g.pos.x, pos.z - g.pos.z);
        if (d > 5.2) return;
        if (world.segmentBlocked(g.pos.x, 0.6, g.pos.z, pos.x, eyeY, pos.z)) return;
        apply(Math.round(85 * (1 - d / 5.8)));
      };
      for (const bot of bots) if (bot.alive) hurt(bot.pos, 1.0, (dmg) => { if (bot.hurt(dmg) === 'killed') { state.money += 300; state.kills++; checkEliminationWin(); } });
      if (player.alive) hurt(player.pos, player.eye, (dmg) => damagePlayer(dmg));
      grenades.splice(i, 1);
    }
  }
}

// -------------------------------------------------------------- bomb mesh ----
let bombMesh = null;
function placeBombMesh() {
  if (bombMesh) return;
  bombMesh = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.3, 0.32), new THREE.MeshLambertMaterial({ color: 0x39424a }));
  box.position.y = 0.15;
  const lightDot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
  lightDot.position.y = 0.36;
  bombMesh.add(box, lightDot);
  bombMesh.position.set(SITE.x + 0.9, 0, SITE.z + 0.6);
  scene.add(bombMesh);
}

// -------------------------------------------------------------- staging ----
// Screenshot modes: deterministic scenes for the kit's shots.json queries.
// The game is fully simulated; staging only arranges the opening state.
function stageShot(mode) {
  input.enabled = false;
  state.money = 2600;
  arsenal.owned.smg = true; arsenal.owned.longbow = true;
  if (mode === 'start') {
    hud.showTitle(true);
    player.pos.x = 0; player.pos.z = 13.5;
    input.yaw = 0; input.pitch = 0.02;
    return;
  }
  hud.showTitle(false);
  state.phase = 'live';
  state.timeLeft = 64;
  state.round = 2; state.scoreUs = 1; state.scoreThem = 1;
  if (mode === 'play') {
    player.pos.x = 4.5; player.pos.z = 5.5;
    input.yaw = 0.5; input.pitch = -0.02;
    bots[0].pos = { x: 1.5, z: -3.5 }; bots[0].health = 62;
    bots[1].pos = { x: 11, z: -1 }; bots[1].health = 100;
    bots[2].pos = { x: -9, z: -5 }; bots[2].health = 34;
    arsenal.current = 'carbine'; arsenal.state.carbine.mag = 17;
  } else if (mode === 'plant') {
    state.phase = 'planted'; state.bombLeft = 17.4;
    placeBombMesh();
    player.pos.x = 3.4; player.pos.z = -9.5;
    input.yaw = -0.35; input.pitch = -0.03;
    bots[0].pos = { x: -2.5, z: -12.5 }; bots[0].state = 'rush';
    bots[1].pos = { x: 6.5, z: -13.5 }; bots[1].state = 'rush';
    bots[2].hurt(999); // one Warden already down
    arsenal.current = 'smg'; arsenal.state.smg.mag = 24;
  } else if (mode === 'end') {
    state.phase = 'matchEnd';
    state.scoreUs = 3; state.scoreThem = 1; state.kills = 7;
    player.pos.x = 0; player.pos.z = -8;
    input.yaw = 0; input.pitch = 0.05;
    hud.showEnd(true, '⚑ RELAY HELD — YOU WIN', 'The Ember Charge lit the beacon. The yard is yours.', 'Final score 3 — 1 · 7 eliminations');
  }
  for (const b of bots) b.syncMesh(0);
}

// ---------------------------------------------------------------- loop ----
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

let last = performance.now();
let accumulator = 0;
function frame(nowMs) {
  requestAnimationFrame(frame);
  let frameDt = (nowMs - last) / 1000;
  last = nowMs;
  if (frameDt > SIM.maxFrame) frameDt = SIM.maxFrame;
  accumulator += frameDt;
  while (accumulator >= SIM.step) { fixedStep(SIM.step); accumulator -= SIM.step; }

  // Camera: player eye + recoil offsets riding on top of the look angles.
  camera.position.set(player.pos.x, player.eye, player.pos.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = input.yaw + arsenal.recoilYaw;
  camera.rotation.x = input.pitch + arsenal.recoilPitch;
  camera.rotation.z = 0;
  const targetFov = arsenal.ads ? 75 / arsenal.def.zoom : 75;
  if (Math.abs(camera.fov - targetFov) > 0.1) { camera.fov += (targetFov - camera.fov) * 0.35; camera.updateProjectionMatrix(); }

  hud.sync(stateView(), state.now);
  hud.drawMinimap(stateView(), world.colliders);
  renderer.render(scene, camera);
}
function stateView() {
  return {
    player, arsenal, bots,
    phase: state.phase, money: state.money, round: state.round,
    scoreUs: state.scoreUs, scoreThem: state.scoreThem,
    timeLeft: state.timeLeft, buyLeft: state.buyLeft, bombLeft: state.bombLeft,
    plantProgress: state.plantProgress, defusing: state.defusing,
    yaw: input.yaw,
  };
}

// -------------------------------------------------------------- events ----
document.getElementById('start-btn').addEventListener('click', () => { sound.ensure(); hud.showTitle(false); startMatch(); });
document.getElementById('restart-btn').addEventListener('click', () => { sound.ensure(); hud.showEnd(false); startMatch(); });
document.getElementById('resume-btn').addEventListener('click', () => { state.paused = false; hud.showPause(false); input.lock(); });
canvas.addEventListener('click', () => {
  sound.ensure();
  if (state.phase === 'ready') beginLive();
  else if ((state.phase === 'live' || state.phase === 'planted') && !input.locked && !state.paused) input.lock();
});
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && (state.phase === 'live' || state.phase === 'planted') && !SHOT) {
    state.paused = true; hud.showPause(true);
  } else if (document.pointerLockElement) { state.paused = false; hud.showPause(false); }
});
addEventListener('keydown', (e) => {
  if (state.phase === 'buy') {
    if (e.code === 'Digit2') buyItem('smg');
    if (e.code === 'Digit3') buyItem('longbow');
    if (e.code === 'KeyG') buyItem('grenade');
  }
  if (e.code === 'KeyM') { /* reserved: mute toggle hook */ }
});

if (SHOT) stageShot(SHOT);
else hud.showTitle(true);
requestAnimationFrame(frame);
