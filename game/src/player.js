// EMBERLINE — player.js
// First-person body: velocity with ground accel/friction, crouch and
// sprint, circle-vs-box collision through the world's collider list.
// The camera itself lives in main.js; this class owns position + health.

import { PLAYER } from './config.js';

export class Player {
  constructor(world) {
    this.world = world;
    this.pos = { x: 0, z: 17 };
    this.vx = 0; this.vz = 0;
    this.health = PLAYER.health;
    this.crouching = false;
    this.sprinting = false;
    this.moving = false;
    this.eye = PLAYER.eyeStanding;
    this.alive = true;
    this.lastHurtAt = -99;
  }

  reset(spawn) {
    this.pos.x = spawn.x; this.pos.z = spawn.z;
    this.vx = 0; this.vz = 0;
    this.health = PLAYER.health;
    this.crouching = false; this.sprinting = false; this.moving = false;
    this.eye = PLAYER.eyeStanding;
    this.alive = true;
  }

  hurt(amount, now) {
    if (!this.alive) return;
    this.health = Math.max(0, this.health - amount);
    this.lastHurtAt = now;
    if (this.health <= 0) this.alive = false;
  }

  /**
   * Advance one fixed step.
   * wish: {x,z} local move axis; yaw: facing; dt: fixed step seconds.
   */
  step(wish, yaw, dt, { sprintHeld, crouchHeld }) {
    this.crouching = crouchHeld;
    const speedCap = this.crouching ? PLAYER.crouchSpeed
      : (sprintHeld && wish.z > 0.1) ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    this.sprinting = speedCap === PLAYER.sprintSpeed && (Math.abs(wish.x) + Math.abs(wish.z)) > 0.1;

    // Rotate the local wish into world space. Forward (-Z at yaw 0) is wish +z.
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    const wx = (wish.x * cos - wish.z * sin);
    const wz = (-wish.x * sin - wish.z * cos);
    // Note: forward wish (z=+1) must map to facing dir (-sin, -cos).
    // wx/wz above already encode that: at yaw 0, wish z=1 -> (0,-1). Good.

    this.vx += wx * PLAYER.accel * dt;
    this.vz += wz * PLAYER.accel * dt;

    const damp = Math.exp(-PLAYER.friction * dt);
    if (Math.abs(wish.x) + Math.abs(wish.z) < 0.01) { this.vx *= damp; this.vz *= damp; }

    const sp = Math.hypot(this.vx, this.vz);
    if (sp > speedCap) { this.vx = this.vx / sp * speedCap; this.vz = this.vz / sp * speedCap; }

    let nx = this.pos.x + this.vx * dt;
    let nz = this.pos.z + this.vz * dt;
    [nx, nz] = this.world.collide(nx, nz, PLAYER.radius);
    this.pos.x = nx; this.pos.z = nz;

    this.moving = Math.hypot(this.vx, this.vz) > 0.6;
    const targetEye = this.crouching ? PLAYER.eyeCrouching : PLAYER.eyeStanding;
    this.eye += (targetEye - this.eye) * Math.min(1, dt * 10);
  }

  /** Speed factor 0..1 for spread/bloom calculations. */
  speedFactor() {
    const sp = Math.hypot(this.vx, this.vz);
    return Math.min(1, sp / PLAYER.sprintSpeed);
  }
}
