// EMBERLINE — world.js
// Builds the Relay Yard: a walled dusk compound of sand, rusted containers
// and crate stacks, with one objective — the Beacon Pad (Site A) at the far
// end. Every solid is an axis-aligned box; the same box list drives the
// renderer, player/bot collision and bullet occlusion, so what you see is
// exactly what blocks you.
//
// Layout (units are metres, yard is 64 x 44, walls at the edges):
//   Player spawns south (z = +17). The Beacon Pad sits north (z = -14).
//   Two lanes (west container row, east crate field) and a mid watchtower
//   give the Wardens' patrol graph real choices.

import * as THREE from 'three';
import { PALETTE } from './config.js';

export const YARD = { halfX: 32, halfZ: 22 };
export const SITE = { x: 0, z: -14, radius: 3.4 };
export const PLAYER_SPAWN = { x: 0, z: 17, yaw: 0 }; // yaw 0 faces -Z: from the south spawn, straight at the yard and the Beacon Pad
export const BOT_SPAWNS = [
  { x: -10, z: -16 }, { x: 10, z: -16 }, { x: 0, z: -19 },
];

// Patrol graph: bots walk node to node; neighbours are hand-linked so
// routes bend around the container rows instead of cutting through them.
export const WAYPOINTS = [
  { x: 0, z: -14, next: [1, 2, 5] },      // 0 site
  { x: -12, z: -13, next: [0, 3, 6] },    // 1 north-west
  { x: 12, z: -13, next: [0, 4, 7] },     // 2 north-east
  { x: -20, z: -6, next: [1, 6, 8] },     // 3 west high
  { x: 20, z: -6, next: [2, 7, 9] },      // 4 east high
  { x: 0, z: -6, next: [0, 6, 7] },       // 5 mid north (tower base)
  { x: -11, z: 0, next: [1, 3, 5, 10] },  // 6 mid-west lane
  { x: 11, z: 0, next: [2, 4, 5, 11] },   // 7 mid-east lane
  { x: -22, z: 6, next: [3, 10] },        // 8 west low
  { x: 22, z: 6, next: [4, 11] },         // 9 east low
  { x: -9, z: 9, next: [6, 8, 12] },      // 10 south-west approach
  { x: 9, z: 9, next: [7, 9, 12] },       // 11 south-east approach
  { x: 0, z: 13, next: [10, 11] },        // 12 south gate (in front of player spawn)
];

const boxGeoCache = new Map();
function boxMesh(w, h, d, color, x, y, z) {
  const key = `${w}x${h}x${d}`;
  if (!boxGeoCache.has(key)) boxGeoCache.set(key, new THREE.BoxGeometry(w, h, d));
  const mesh = new THREE.Mesh(boxGeoCache.get(key), new THREE.MeshLambertMaterial({ color }));
  mesh.position.set(x, y, z);
  return mesh;
}

export class World {
  constructor(scene) {
    this.colliders = [];   // {minX,maxX,minZ,maxZ, top} — top is the box's height for bullet tests
    this.scene = scene;
    this.build(scene);
  }

  addSolid(scene, w, h, d, color, x, z, yBase = 0) {
    const mesh = boxMesh(w, h, d, color, x, yBase + h / 2, z);
    scene.add(mesh);
    this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, top: yBase + h });
    return mesh;
  }

  build(scene) {
    scene.background = new THREE.Color(PALETTE.sky);
    scene.fog = new THREE.Fog(PALETTE.fog, 34, 95);

    const hemi = new THREE.HemisphereLight(0xffd9b0, 0x2c2033, 1.25);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xff9d5c, 1.65);
    sun.position.set(-24, 30, 12);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x9db8ff, 0.5);
    fill.position.set(20, 18, -14);
    scene.add(fill);
    const emberGlow = new THREE.PointLight(PALETTE.ember, 60, 26, 1.8);
    emberGlow.position.set(SITE.x, 3.2, SITE.z);
    scene.add(emberGlow);
    this.emberGlow = emberGlow;

    // Ground: two-tone sand slabs so distance reads at a glance.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(YARD.halfX * 2 + 30, YARD.halfZ * 2 + 30),
      new THREE.MeshLambertMaterial({ color: PALETTE.groundDark }),
    );
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02;
    scene.add(ground);
    for (let gx = -3; gx <= 3; gx++) for (let gz = -2; gz <= 2; gz++) {
      if ((gx + gz) % 2 !== 0) continue;
      const slab = new THREE.Mesh(new THREE.PlaneGeometry(9.8, 9.8), new THREE.MeshLambertMaterial({ color: PALETTE.ground }));
      slab.rotation.x = -Math.PI / 2;
      slab.position.set(gx * 10, 0, gz * 10);
      scene.add(slab);
    }

    const W = PALETTE.wall, WT = PALETTE.wallTrim, C = PALETTE.crate, CD = PALETTE.crateDark,
      M = PALETTE.metal, MD = PALETTE.metalDark;

    // Perimeter walls (height 3.2) — also colliders.
    this.addSolid(scene, YARD.halfX * 2 + 2, 3.2, 1, W, 0, -YARD.halfZ - 0.5);
    this.addSolid(scene, YARD.halfX * 2 + 2, 3.2, 1, W, 0, YARD.halfZ + 0.5);
    this.addSolid(scene, 1, 3.2, YARD.halfZ * 2, W, -YARD.halfX - 0.5, 0);
    this.addSolid(scene, 1, 3.2, YARD.halfZ * 2, W, YARD.halfX + 0.5, 0);

    // West container row (two stacked rusted boxes with a gap at mid).
    this.addSolid(scene, 10, 2.6, 3, M, -17, -11);
    this.addSolid(scene, 8, 2.6, 3, MD, -16, -11, 2.6);
    this.addSolid(scene, 10, 2.6, 3, MD, -17, 3);
    // East container row, mirrored but offset so the lanes differ.
    this.addSolid(scene, 10, 2.6, 3, MD, 17, -8);
    this.addSolid(scene, 10, 2.6, 3, M, 18, 6);
    this.addSolid(scene, 7, 2.6, 3, M, 17, 6, 2.6);

    // Mid watchtower: four legs (visual) + a solid core block to hide behind.
    this.addSolid(scene, 3.4, 2.2, 3.4, WT, 0, -6);
    const towerTop = boxMesh(5, 0.35, 5, MD, 0, 4.4, -6); scene.add(towerTop);
    const towerRoof = boxMesh(5.6, 0.25, 5.6, M, 0, 6.1, -6); scene.add(towerRoof);
    for (const [lx, lz] of [[-2.2, -8.2], [2.2, -8.2], [-2.2, -3.8], [2.2, -3.8]]) {
      const leg = boxMesh(0.35, 4.4, 0.35, MD, lx, 2.2, lz); scene.add(leg);
    }

    // Crate stacks — low cover (1.1) you can shoot over, tall stacks (2.2) you cannot.
    const crates = [
      [-8, -3, 2.2], [-8, 5, 1.1], [-4, 9, 2.2], [6, -2, 1.1], [7, 3, 2.2],
      [4, 10, 1.1], [-13, 12, 1.1], [13, 13, 2.2], [-5, -12, 1.1], [6, -13, 2.2],
      [0, 4, 1.1], [-14, -2, 2.2], [14, -14, 1.1], [0, -19, 2.2],
    ];
    for (const [x, z, h] of crates) {
      this.addSolid(scene, 2.1, h, 2.1, h > 1.5 ? CD : C, x, z);
      if (h > 1.5) this.addSolid(scene, 1.5, 1.0, 1.5, C, x, z, h);
    }
    // Barrels: squat cylinders read as cover; colliders are their bounding squares.
    const barrelGeo = new THREE.CylinderGeometry(0.55, 0.55, 1.15, 12);
    const barrelMat = new THREE.MeshLambertMaterial({ color: PALETTE.ember });
    for (const [x, z] of [[-3, -8], [3.5, -9], [-19, -16], [21, 1], [-21, 13], [9, 16]]) {
      const b = new THREE.Mesh(barrelGeo, barrelMat);
      b.position.set(x, 0.575, z); scene.add(b);
      this.colliders.push({ minX: x - 0.55, maxX: x + 0.55, minZ: z - 0.55, maxZ: z + 0.55, top: 1.15 });
    }

    // The Beacon Pad: a glowing ring + pylon at Site A.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(SITE.radius - 0.35, SITE.radius, 40),
      new THREE.MeshBasicMaterial({ color: PALETTE.beacon, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2; ring.position.set(SITE.x, 0.03, SITE.z);
    scene.add(ring);
    this.siteRing = ring;
    const pylon = boxMesh(0.7, 3.4, 0.7, MD, SITE.x, 1.7, SITE.z); scene.add(pylon);
    const beaconBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 16, 12),
      new THREE.MeshBasicMaterial({ color: PALETTE.beacon }),
    );
    beaconBall.position.set(SITE.x, 3.8, SITE.z); scene.add(beaconBall);
    this.beaconBall = beaconBall;
    // The pylon is thin cover at the pad's centre.
    this.colliders.push({ minX: SITE.x - 0.35, maxX: SITE.x + 0.35, minZ: SITE.z - 0.35, maxZ: SITE.z + 0.35, top: 3.4 });

    // Spawn marker: ember chevron slab where the player starts.
    const spawnSlab = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ color: PALETTE.ember, transparent: true, opacity: 0.35 }));
    spawnSlab.rotation.x = -Math.PI / 2; spawnSlab.position.set(PLAYER_SPAWN.x, 0.02, PLAYER_SPAWN.z);
    scene.add(spawnSlab);
  }

  /** Push a circle (x,z,r) out of every collider; returns corrected [x,z]. */
  collide(x, z, r) {
    for (const c of this.colliders) {
      const nx = Math.max(c.minX, Math.min(x, c.maxX));
      const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
      const dx = x - nx, dz = z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r; z = nz + (dz / d) * r;
      } else {
        // Centre inside the box: push out along the smallest penetration axis.
        const pl = x - c.minX, pr = c.maxX - x, pt = z - c.minZ, pb = c.maxZ - z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = c.minX - r; else if (m === pr) x = c.maxX + r;
        else if (m === pt) z = c.minZ - r; else z = c.maxZ + r;
      }
    }
    x = Math.max(-YARD.halfX + r, Math.min(YARD.halfX - r, x));
    z = Math.max(-YARD.halfZ + r, Math.min(YARD.halfZ - r, z));
    return [x, z];
  }

  /** Segment vs colliders in 3D: does a shot from (x0,y0,z0) to (x1,y1,z1) hit a box first? */
  segmentBlocked(x0, y0, z0, x1, y1, z1) {
    for (const c of this.colliders) {
      if (segmentHitsBox(x0, y0, z0, x1, y1, z1, c)) return true;
    }
    return false;
  }

  /** Nearest ray hit distance against colliders, or Infinity. Ray: origin + dir * t. */
  rayDistance(ox, oy, oz, dx, dy, dz, maxT) {
    let best = Infinity;
    for (const c of this.colliders) {
      const t = rayHitsBox(ox, oy, oz, dx, dy, dz, c);
      if (t !== null && t < best && t <= maxT) best = t;
    }
    // Ground plane y=0.
    if (dy < -1e-6) {
      const t = -oy / dy;
      if (t > 0 && t < best && t <= maxT) best = t;
    }
    return best;
  }

  updateVisuals(t) {
    const pulse = 0.75 + 0.25 * Math.sin(t * 2.4);
    this.siteRing.material.color.setHex(PALETTE.beacon).multiplyScalar(pulse);
    this.beaconBall.material.color.setHex(PALETTE.beacon).multiplyScalar(0.8 + 0.3 * Math.sin(t * 3.1));
    this.emberGlow.intensity = 50 + 14 * Math.sin(t * 2.4);
  }
}

function segmentHitsBox(x0, y0, z0, x1, y1, z1, c) {
  // Slab test in XZ, then check the crossing height against the box top.
  let tmin = 0, tmax = 1;
  const dx = x1 - x0, dz = z1 - z0;
  if (Math.abs(dx) < 1e-9) { if (x0 < c.minX || x0 > c.maxX) return false; }
  else {
    let t1 = (c.minX - x0) / dx, t2 = (c.maxX - x0) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (Math.abs(dz) < 1e-9) { if (z0 < c.minZ || z0 > c.maxZ) return false; }
  else {
    let t1 = (c.minZ - z0) / dz, t2 = (c.maxZ - z0) / dz;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  const yAt = y0 + (y1 - y0) * tmin;
  return yAt <= c.top + 0.02 && yAt >= -0.02;
}

function rayHitsBox(ox, oy, oz, dx, dy, dz, c) {
  let tmin = 0, tmax = Infinity;
  const axes = [
    [ox, dx, c.minX, c.maxX],
    [oy, dy, 0, c.top],
    [oz, dz, c.minZ, c.maxZ],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return null; }
    else {
      let t1 = (lo - o) / d, t2 = (hi - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}
