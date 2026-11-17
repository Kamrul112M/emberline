// EMBERLINE — bots.js
// The Wardens: three defenders with a real patrol life. Each bot walks a
// hand-linked waypoint graph around the Relay Yard, pauses at nodes, and
// reacts — gunfire noise pulls patrollers toward the fight (hearing),
// line of sight starts an engagement after a reaction delay, and once the
// Ember Charge is planted the whole team rushes the Beacon Pad, where one
// bot channels a defuse that the player must interrupt. Bots strafe while
// fighting, fall back when badly hurt, and their shots are honest
// raycasts: cover blocks them exactly like it blocks the player.

import * as THREE from 'three';
import { BOT, PALETTE } from './config.js';
import { WAYPOINTS } from './world.js';

let botSerial = 0;

export class Bot {
  constructor(scene, world, spawn, sound) {
    this.world = world;
    this.sound = sound;
    this.id = botSerial++;
    this.spawn = spawn;
    // Mesh: teal torso, dark legs, pale head — the head is a separate
    // hitbox zone (top 0.42 of the body) for headshots.
    this.group = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.34), new THREE.MeshLambertMaterial({ color: PALETTE.warden }));
    torso.position.y = 1.06;
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.68, 0.3), new THREE.MeshLambertMaterial({ color: PALETTE.wardenDark }));
    legs.position.y = 0.34;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.34), new THREE.MeshLambertMaterial({ color: PALETTE.wardenHead }));
    head.position.y = 1.66;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.09, 0.1), new THREE.MeshBasicMaterial({ color: 0x66ffe9 }));
    visor.position.set(0, 1.7, -0.15);
    this.group.add(torso, legs, head, visor);
    scene.add(this.group);
    // Health bar: a camera-facing sprite pair above the head.
    this.barBg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x14181c, depthTest: false }));
    this.barBg.scale.set(0.9, 0.11, 1); this.barBg.position.y = 2.05;
    this.barFg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x51e0a5, depthTest: false }));
    this.barFg.scale.set(0.86, 0.07, 1); this.barFg.position.y = 2.05;
    scene.add(this.barBg, this.barFg);
    this.reset();
  }

  reset() {
    this.pos = { x: this.spawn.x, z: this.spawn.z };
    this.health = BOT.health;
    this.alive = true;
    this.state = 'patrol';       // patrol | engage | rush | defuse | fallback
    this.node = nearestNode(this.pos);
    this.targetNode = this.node;
    this.pauseUntil = 0;
    this.seePlayerSince = -1;
    this.lastShotAt = 0;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.strafeFlipAt = 0;
    this.defuseProgress = 0;
    this.group.visible = true;
    this.barBg.visible = this.barFg.visible = true;
    this.syncMesh(0);
  }

  hurt(amount) {
    if (!this.alive) return 'dead-already';
    this.health -= amount;
    if (this.health <= 0) {
      this.alive = false;
      this.group.visible = false;
      this.barBg.visible = this.barFg.visible = false;
      return 'killed';
    }
    return 'hit';
  }

  eyePos() { return { x: this.pos.x, y: 1.58, z: this.pos.z }; }
  /** Hit test for a point along a shot: returns 'head' | 'body' | null for a hit point. */
  zoneAt(point) {
    const dx = point.x - this.pos.x, dz = point.z - this.pos.z;
    if (dx * dx + dz * dz > 0.36 * 0.36 + 0.12) return null;
    if (point.y > 1.46) return 'head';
    if (point.y > 0.05) return 'body';
    return null;
  }

  canSee(playerPos, playerEye, world) {
    const eye = this.eyePos();
    return !world.segmentBlocked(eye.x, eye.y, eye.z, playerPos.x, playerEye, playerPos.z);
  }

  /**
   * One fixed step. ctx carries everything the bot may know:
   * { now, dt, player, playerEye, bomb: {planted, x, z} | null, noise: {x,z,at} | null, onShoot(bot) }
   */
  step(ctx) {
    if (!this.alive) return;
    const { now, dt, player } = ctx;
    const distToPlayer = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    const sees = player.alive && this.canSee(player.pos, player.eye, this.world);

    // --- state selection -------------------------------------------------
    if (ctx.bomb?.planted) {
      if (this.state !== 'defuse' && this.state !== 'engage') this.state = 'rush';
      if (distToPlayer < 7 && sees) this.state = 'engage';
      else if (this.state === 'engage' && !sees) this.state = 'rush';
    } else if (sees && player.alive) {
      if (this.seePlayerSince < 0) this.seePlayerSince = now;
      if (now - this.seePlayerSince >= BOT.reactionSeconds * 0.4) this.state = 'engage';
    } else {
      this.seePlayerSince = -1;
      if (this.state === 'engage') this.state = 'patrol';
      if (ctx.noise && now - ctx.noise.at < 2.5 && this.state === 'patrol') {
        const nd = Math.hypot(ctx.noise.x - this.pos.x, ctx.noise.z - this.pos.z);
        if (nd < BOT.hearingRadius && nd > 3) {
          this.targetNode = nearestNode(ctx.noise);
          this.state = 'investigate';
        }
      }
      if (this.state === 'investigate' && distToNode(this.pos, WAYPOINTS[this.targetNode]) < 0.8) this.state = 'patrol';
      if (this.health < 30 && this.state === 'engage') this.state = 'fallback';
    }

    // --- behaviour -------------------------------------------------------
    let speed = 0;
    let moveTarget = null;
    if (this.state === 'patrol' || this.state === 'investigate') {
      speed = BOT.walkSpeed;
      if (now < this.pauseUntil) speed = 0;
      else {
        moveTarget = WAYPOINTS[this.targetNode];
        if (distToNode(this.pos, moveTarget) < 0.7) {
          if (this.state === 'patrol') {
            this.pauseUntil = now + BOT.waypointPause * (0.5 + Math.random());
            const next = WAYPOINTS[this.targetNode].next;
            this.targetNode = next[Math.floor(Math.random() * next.length)];
          } else this.state = 'patrol';
        }
      }
    } else if (this.state === 'rush') {
      speed = BOT.rushSpeed;
      moveTarget = { x: ctx.bomb.x, z: ctx.bomb.z };
      if (Math.hypot(ctx.bomb.x - this.pos.x, ctx.bomb.z - this.pos.z) < 1.15) {
        this.state = 'defuse';
        this.defuseProgress = 0;
      }
    } else if (this.state === 'defuse') {
      speed = 0;
      // Defuse is channelled in main.js (it owns the bomb); here the bot
      // just stands at the pad, exposed — that is the player's opening.
    } else if (this.state === 'fallback') {
      speed = BOT.rushSpeed;
      moveTarget = this.spawn;
      if (Math.hypot(this.spawn.x - this.pos.x, this.spawn.z - this.pos.z) < 1.2) this.state = 'patrol';
    } else if (this.state === 'engage') {
      // Hold a fighting distance, strafing sideways to be harder to hit.
      if (now >= this.strafeFlipAt) { this.strafeDir *= -1; this.strafeFlipAt = now + 0.8 + Math.random() * 0.9; }
      const away = distToPlayer < 6 ? 1 : distToPlayer > 16 ? -1 : 0; // back off if close, close in if far
      const px = player.pos.x - this.pos.x, pz = player.pos.z - this.pos.z;
      const len = Math.max(0.001, Math.hypot(px, pz));
      const tx = this.pos.x + (-pz / len) * this.strafeDir * 1.6 + (px / len) * away * 1.6;
      const tz = this.pos.z + (px / len) * this.strafeDir * 1.6 + (pz / len) * away * 1.6;
      moveTarget = { x: tx, z: tz };
      speed = BOT.walkSpeed;
      this.tryShoot(ctx, distToPlayer, sees);
    }

    if (moveTarget && speed > 0) {
      const dx = moveTarget.x - this.pos.x, dz = moveTarget.z - this.pos.z;
      const len = Math.hypot(dx, dz);
      if (len > 0.05) {
        let nx = this.pos.x + (dx / len) * speed * dt;
        let nz = this.pos.z + (dz / len) * speed * dt;
        [nx, nz] = this.world.collide(nx, nz, BOT.radius);
        this.pos.x = nx; this.pos.z = nz;
        this.facing = Math.atan2(dx, dz);
      }
    }
    this.syncMesh(now);
  }

  tryShoot(ctx, distToPlayer, sees) {
    const { now, player } = ctx;
    if (!sees || !player.alive) return;
    if (this.seePlayerSince < 0 || now - this.seePlayerSince < BOT.reactionSeconds) return;
    if (now - this.lastShotAt < 1 / BOT.shotsPerSecond) return;
    this.lastShotAt = now;
    this.sound.botShot();
    // Hit chance falls with distance; a crouching player is harder to hit.
    let chance = BOT.accuracy * (distToPlayer < 8 ? 1.15 : distToPlayer > 20 ? 0.55 : 0.85);
    if (player.crouching) chance *= 0.7;
    if (player.sprinting) chance *= 0.8;
    if (Math.random() < chance) ctx.onPlayerHit(BOT.damage);
    ctx.onBotShotFx?.(this);
  }

  syncMesh(now) {
    this.group.position.set(this.pos.x, 0, this.pos.z);
    if (this.facing !== undefined) this.group.rotation.y = this.facing;
    const frac = Math.max(0, this.health / BOT.health);
    this.barFg.scale.x = 0.86 * frac;
    this.barFg.material.color.setHex(frac > 0.5 ? 0x51e0a5 : frac > 0.25 ? 0xffc46b : 0xff5a4e);
    this.barBg.position.set(this.pos.x, 2.05, this.pos.z);
    this.barFg.position.set(this.pos.x - (0.86 * (1 - frac)) / 2, 2.05, this.pos.z);
    void now;
  }
}

function distToNode(pos, node) { return Math.hypot(node.x - pos.x, node.z - pos.z); }
export function nearestNode(pos) {
  let best = 0, bd = Infinity;
  WAYPOINTS.forEach((n, i) => { const d = distToNode(pos, n); if (d < bd) { bd = d; best = i; } });
  return best;
}
