// EMBERLINE — weapon.js
// The player's arsenal: three hitscan guns with magazines, reloads, ADS
// zoom — and the part the prototype never had: RECOIL. Every shot kicks
// the camera pitch up (and yaw a touch sideways) through a spring that
// recovers over ~200 ms, and opens the crosshair bloom, so spraying while
// sprinting sprays wide and standing still pays. Grenades are real
// projectiles with gravity, a fuse and an area blast.

import * as THREE from 'three';
import { WEAPONS, GRENADE } from './config.js';

export class Arsenal {
  constructor(scene, camera, sound) {
    this.sound = sound;
    this.owned = { carbine: true, smg: false, longbow: false };
    this.state = {};
    for (const id of Object.keys(WEAPONS)) {
      this.state[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
    }
    this.current = 'carbine';
    this.grenades = 1;
    this.lastShotAt = -99;
    this.reloadUntil = -1;
    this.grenadeCooldownUntil = -1;
    // Recoil state: pitch/yaw offsets added on top of the player's look.
    this.recoilPitch = 0; this.recoilYaw = 0;
    this.recoilVel = 0;
    this.bloom = 0;            // extra spread (radians) from firing/moving
    this.ads = false;          // aiming down sights

    // Viewmodel: a low-poly gun built from boxes, parented to the camera.
    this.view = new THREE.Group();
    this.view.scale.setScalar(0.72);
    this.buildViewmodel();
    camera.add(this.view);
    scene.add(camera);
    this.muzzleFlash = null;
  }

  buildViewmodel() {
    const dark = new THREE.MeshLambertMaterial({ color: 0x2e3438 });
    const accent = new THREE.MeshLambertMaterial({ color: 0xff7a2f });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.52), dark);
    body.position.set(0.16, -0.16, -0.45);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.34), dark);
    barrel.position.set(0.16, -0.12, -0.82);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.09), dark);
    grip.position.set(0.16, -0.28, -0.3); grip.rotation.x = 0.35;
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, 0.03), accent);
    sight.position.set(0.16, -0.06, -0.5);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.08), accent);
    mag.position.set(0.16, -0.27, -0.48); mag.rotation.x = -0.15;
    this.view.add(body, barrel, grip, sight, mag);
    this.flashMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0 }),
    );
    this.flashMesh.position.set(0.16, -0.12, -1.0);
    this.view.add(this.flashMesh);
  }

  get def() { return WEAPONS[this.current]; }
  get st() { return this.state[this.current]; }
  reloading(now) { return now < this.reloadUntil; }

  resetRound() {
    // Keep bought weapons and their ammo across rounds; grenades persist too.
    this.reloadUntil = -1;
    this.bloom = 0; this.recoilPitch = 0; this.recoilYaw = 0; this.recoilVel = 0;
  }
  resetMatch() {
    this.owned = { carbine: true, smg: false, longbow: false };
    for (const id of Object.keys(WEAPONS)) this.state[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
    this.current = 'carbine';
    this.grenades = 1;
    this.resetRound();
  }

  buy(id, money) {
    if (id === 'grenade') {
      if (this.grenades >= GRENADE.max || money < GRENADE.price) return false;
      this.grenades++; return true;
    }
    const w = WEAPONS[id];
    if (!w || this.owned[id] || money < w.price) return false;
    this.owned[id] = true;
    this.state[id] = { mag: w.mag, reserve: w.reserve };
    return true;
  }
  costOf(id) { return id === 'grenade' ? GRENADE.price : WEAPONS[id].price; }
  canBuy(id, money) {
    if (id === 'grenade') return this.grenades < GRENADE.max && money >= GRENADE.price;
    return WEAPONS[id] && !this.owned[id] && money >= WEAPONS[id].price;
  }

  switchTo(id) {
    if (!this.owned[id] || id === this.current) return false;
    this.current = id;
    this.reloadUntil = -1;
    this.bloom = Math.min(this.bloom, 0.01);
    return true;
  }
  switchBySlot(slot) {
    for (const id of Object.keys(WEAPONS)) if (WEAPONS[id].slot === slot) return this.switchTo(id);
    return false;
  }

  startReload(now) {
    if (this.reloading(now) || this.st.mag >= this.def.mag || this.st.reserve <= 0) return false;
    this.reloadUntil = now + this.def.reloadSeconds;
    this.sound.reload();
    return true;
  }
  finishReloadIfDue(now) {
    if (this.reloadUntil > 0 && now >= this.reloadUntil) {
      const take = Math.min(this.def.mag - this.st.mag, this.st.reserve);
      this.st.mag += take; this.st.reserve -= take;
      this.reloadUntil = -1;
      return true;
    }
    return false;
  }

  /**
   * Try to fire. Returns null when the trigger produces nothing (cooldown,
   * reload, empty), or a shot descriptor {dir jitter seed, def} — the caller
   * (main) performs the actual raycast so bots/world stay decoupled.
   */
  tryFire(now, { triggerHeld, triggerPressed }) {
    const def = this.def;
    if (this.reloading(now)) return null;
    const interval = 60 / def.rpm;
    if (now - this.lastShotAt < interval) return null;
    if (!def.auto && !triggerPressed) return null;
    if (!triggerHeld && !triggerPressed) return null;
    if (this.st.mag <= 0) {
      if (triggerPressed) { this.sound.dry(); this.lastShotAt = now; this.startReload(now); }
      return null;
    }
    this.st.mag--;
    this.lastShotAt = now;
    // Recoil: an impulse to the pitch spring + a fixed kick, scaled by ADS.
    const adsScale = this.ads ? 0.7 : 1;
    this.recoilVel += def.recoilKick * 9 * adsScale;
    this.recoilPitch += def.recoilKick * 0.55 * adsScale;
    this.recoilYaw += (Math.random() - 0.5) * 2 * def.recoilYaw;
    this.bloom = Math.min(0.075, this.bloom + def.bloomPerShot);
    this.sound.shot(def.id);
    this.flashMesh.material.opacity = 0.9;
    return { def };
  }

  /** Current total spread in radians for a shot right now. */
  spread(player) {
    const def = this.def;
    let s = def.spread + this.bloom;
    s *= 1 + player.speedFactor() * 1.6;        // moving opens the cone
    if (player.sprinting) s *= 2.2;             // sprinting is spray-and-pray
    if (player.crouching) s *= 0.45;            // crouch to steady
    if (this.ads) s *= 0.55;
    return s;
  }

  canThrowGrenade(now) { return this.grenades > 0 && now >= this.grenadeCooldownUntil; }
  throwGrenade(now, origin, dir) {
    if (!this.canThrowGrenade(now)) return null;
    this.grenades--;
    this.grenadeCooldownUntil = now + GRENADE.cooldownSeconds;
    this.sound.throwWhoosh();
    return new Grenade(origin, dir);
  }

  /** Per-fixed-step upkeep: recoil spring, bloom decay, flash fade, viewmodel sway. */
  step(dt, player, t) {
    // Spring back toward zero pitch; slight overshoot damping.
    const stiffness = 90, damping = 14;
    const acc = -stiffness * this.recoilPitch - damping * this.recoilVel;
    this.recoilVel += acc * dt;
    this.recoilPitch += this.recoilVel * dt;
    this.recoilYaw *= Math.exp(-9 * dt);
    this.bloom *= Math.exp(-6.5 * dt);
    if (this.flashMesh.material.opacity > 0) this.flashMesh.material.opacity = Math.max(0, this.flashMesh.material.opacity - dt * 9);
    // Weapon sway: lags the player's motion, bobs while walking.
    const bob = player.moving ? Math.sin(t * 9) * 0.008 : 0;
    const targetY = -0.0 + bob + (this.ads ? 0.055 : 0);
    const targetX = this.ads ? -0.16 : 0;
    this.view.position.x += (targetX - this.view.position.x) * Math.min(1, dt * 11);
    this.view.position.y += (targetY - this.view.position.y) * Math.min(1, dt * 11);
    this.view.rotation.z = -this.recoilYaw * 2.2;
    this.view.rotation.x = this.recoilPitch * 1.4;
  }
}

export class Grenade {
  constructor(origin, dir) {
    this.pos = origin.clone();
    this.vel = dir.clone().multiplyScalar(GRENADE.throwSpeed);
    this.vel.y += 2.2;
    this.fuse = GRENADE.fuseSeconds;
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 10, 8),
      new THREE.MeshLambertMaterial({ color: 0x39424a }),
    );
    this.mesh.position.copy(this.pos);
    this.dead = false;
  }
  /** Returns 'explode' on the step the fuse ends. */
  step(dt, world) {
    this.vel.y -= 18 * dt;
    this.pos.addScaledVector(this.vel, dt);
    if (this.pos.y < 0.11) { this.pos.y = 0.11; this.vel.y *= -0.35; this.vel.x *= 0.7; this.vel.z *= 0.7; }
    [this.pos.x, this.pos.z] = world.collide(this.pos.x, this.pos.z, 0.12);
    this.mesh.position.copy(this.pos);
    this.fuse -= dt;
    if (this.fuse <= 0) { this.dead = true; return 'explode'; }
    return null;
  }
}
