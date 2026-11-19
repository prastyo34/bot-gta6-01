// Actors: the player on foot, pedestrians, police (foot + car), gang enemies and
// pickups. All humanoids are low-poly box figures with swinging limbs.
import * as THREE from 'three';
import { makeRng, pick, range, int } from './rng.js';
import { collideCircle, randomSidewalkPoint, randomRoadPoint, ROADS } from './world.js';
import { Car } from './vehicles.js';

export function makeHumanoid(shirt, pants, skin = 0xc98e6a) {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.34), mat(shirt));
  body.position.y = 1.18; g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.38), mat(skin));
  head.position.y = 1.78; g.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.4), mat(0x201510));
  hair.position.y = 2.0; g.add(hair);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.8, 0.26), mat(pants));
  legL.position.set(-0.16, 0.4, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.16; g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.2), mat(shirt));
  armL.position.set(-0.42, 1.2, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.42; g.add(armR);
  return { group: g, legL, legR, armL, armR, body, head };
}

function animateWalk(parts, phase, amp = 0.55) {
  const s = Math.sin(phase);
  parts.legL.rotation.x = s * amp; parts.legR.rotation.x = -s * amp;
  parts.armL.rotation.x = -s * amp * 0.8; parts.armR.rotation.x = s * amp * 0.8;
}

export const WEAPONS = {
  pistol: { name: 'PISTOL', mag: 12, damage: 34, range: 70, rate: 0.28, spread: 0.012, auto: false, color: 0x222222 },
  smg: { name: 'SMG', mag: 30, damage: 18, range: 55, rate: 0.09, spread: 0.03, auto: true, color: 0x333a44 },
};

export class Player {
  constructor(scene, x, z) {
    const h = makeHumanoid(0xff5a7a, 0x2a2a44, 0xc98e6a);
    this.parts = h; this.mesh = h.group;
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.x = x; this.z = z; this.heading = 0;
    this.vy = 0; this.onGround = true;
    this.health = 100; this.armor = 0;
    this.money = 120;
    this.walkPhase = 0;
    this.weapons = {
      pistol: { mag: 12, reserve: 48 },
      smg: { mag: 0, reserve: 0 },
    };
    this.owned = new Set(['pistol']);
    this.weapon = 'pistol';
    this.shootCooldown = 0;
    this.inCar = null;
    this.speed2d = 0;
  }
  takeDamage(n) {
    if (this.armor > 0) { const a = Math.min(this.armor, n); this.armor -= a; n -= a; }
    this.health = Math.max(0, this.health - n);
  }
  heal(n) { this.health = Math.min(100, this.health + n); }
  // On-foot movement. camYaw is the camera yaw; movement is camera-relative.
  update(dt, input, camYaw, colliders) {
    if (this.inCar) return;
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);
    const ax = input.axis();
    const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
    const speed = sprint ? 9.5 : 5.2;
    let mx = 0, mz = 0;
    if (ax.x !== 0 || ax.z !== 0) {
      const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
      // camera looks along -Z rotated by camYaw; forward = (−sin, −cos)
      mx = (-sin * -ax.z) + (cos * ax.x);
      mz = (-cos * -ax.z) + (-sin * ax.x);
      const len = Math.hypot(mx, mz); mx /= len; mz /= len;
      this.heading = Math.atan2(mx, mz);
      this.mesh.rotation.y = this.heading;
    }
    const nx = this.x + mx * speed * dt;
    const nz = this.z + mz * speed * dt;
    const c = collideCircle(nx, nz, 0.55, colliders);
    this.x = c.x; this.z = c.z;
    this.speed2d = Math.hypot(mx, mz) * speed;
    // jump
    if (input.hit('Space') && this.onGround) { this.vy = 7.5; this.onGround = false; }
    if (!this.onGround) {
      this.vy -= 22 * dt;
      let y = this.mesh.position.y + this.vy * dt;
      if (y <= 0) { y = 0; this.vy = 0; this.onGround = true; }
      this.mesh.position.y = y;
    }
    this.mesh.position.x = this.x; this.mesh.position.z = this.z;
    if (this.speed2d > 0.5) {
      this.walkPhase += dt * this.speed2d * 1.6;
      animateWalk(this.parts, this.walkPhase, sprint ? 0.7 : 0.5);
    } else {
      this.parts.legL.rotation.x *= 0.8; this.parts.legR.rotation.x *= 0.8;
      this.parts.armL.rotation.x *= 0.8; this.parts.armR.rotation.x *= 0.8;
    }
  }
}

// ---------------- Pedestrians ----------------
const PED_SHIRTS = [0x3a86ff, 0xffbe0b, 0x8338ec, 0x06d6a0, 0xef476f, 0xf3722c, 0x90be6d, 0xf9c74f];
export class Pedestrians {
  constructor(scene, seed = 11) {
    this.rng = makeRng(seed);
    this.scene = scene;
    this.list = [];
  }
  spawn(n) {
    for (let i = 0; i < n; i++) this.addPed();
  }
  addPed(x, z) {
    const p = randomSidewalkPoint(this.rng);
    const h = makeHumanoid(pick(this.rng, PED_SHIRTS), pick(this.rng, [0x222233, 0x3a2a1a, 0x445566]));
    h.group.position.set(x ?? p.x, 0, z ?? p.z);
    this.scene.add(h.group);
    const ped = {
      parts: h, mesh: h.group, x: x ?? p.x, z: z ?? p.z,
      heading: this.rng() * Math.PI * 2, speed: range(this.rng, 1.2, 2.2),
      target: null, state: 'walk', fleeT: 0, phase: this.rng() * 6, dead: false, deadT: 0,
    };
    h.group.userData.actor = { kind: 'ped', ref: ped };
    ped.target = this._nextTarget(ped);
    this.list.push(ped);
    return ped;
  }
  _nextTarget(ped) {
    // walk to a nearby sidewalk point
    const p = randomSidewalkPoint(this.rng);
    return p;
  }
  scare(x, z, radius = 26) {
    for (const ped of this.list) {
      if (ped.dead) continue;
      const d = Math.hypot(ped.x - x, ped.z - z);
      if (d < radius) { ped.state = 'flee'; ped.fleeT = 4 + this.rng() * 3; }
    }
  }
  update(dt, colliders, danger) {
    for (const ped of this.list) {
      if (ped.dead) {
        ped.deadT += dt;
        ped.mesh.rotation.x = Math.min(Math.PI / 2, ped.mesh.rotation.x + dt * 4);
        continue;
      }
      let speed = ped.speed;
      if (ped.state === 'flee') {
        speed = 5.5; ped.fleeT -= dt;
        if (ped.fleeT <= 0) ped.state = 'walk';
        const dx = ped.x - danger.x, dz = ped.z - danger.z;
        const d = Math.hypot(dx, dz) || 1;
        ped.heading = Math.atan2(dx / d, dz / d);
      } else if (ped.target) {
        const dx = ped.target.x - ped.x, dz = ped.target.z - ped.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.5) ped.target = this._nextTarget(ped);
        else ped.heading = Math.atan2(dx / d, dz / d);
      }
      const nx = ped.x + Math.sin(ped.heading) * speed * dt;
      const nz = ped.z + Math.cos(ped.heading) * speed * dt;
      const c = collideCircle(nx, nz, 0.45, colliders);
      ped.x = c.x; ped.z = c.z;
      ped.mesh.position.set(ped.x, 0, ped.z);
      ped.mesh.rotation.y = ped.heading;
      ped.phase += dt * speed * 2.2;
      animateWalk(ped.parts, ped.phase, 0.5);
    }
  }
  // returns peds hit by a car circle
  hitByCar(x, z, r) {
    const hit = [];
    for (const ped of this.list) {
      if (ped.dead) continue;
      if (Math.hypot(ped.x - x, ped.z - z) < r + 0.5) { ped.dead = true; hit.push(ped); }
    }
    return hit;
  }
  countAlive() { return this.list.filter((p) => !p.dead).length; }
}

// ---------------- Police / wanted ----------------
export class Police {
  constructor(scene, colliders, seed = 23) {
    this.rng = makeRng(seed);
    this.scene = scene; this.colliders = colliders;
    this.heat = 0; // 0..100
    this.stars = 0;
    this.lastCrimeT = -999;
    this.footCops = [];
    this.copCars = [];
    this.sirenOn = false;
  }
  addHeat(n, t) { this.heat = Math.min(100, this.heat + n); this.lastCrimeT = t; this._syncStars(); }
  _syncStars() {
    this.stars = this.heat < 10 ? 0 : this.heat < 30 ? 1 : this.heat < 55 ? 2 : this.heat < 80 ? 3 : this.heat < 95 ? 4 : 5;
  }
  setHeat(n) { this.heat = Math.max(0, Math.min(100, n)); this._syncStars(); }
  _spawnFootCop(x, z) {
    const h = makeHumanoid(0x1a2a5e, 0x141a30, 0x8a5a3a);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x0d1440 }));
    cap.position.y = 2.02; h.group.add(cap);
    h.group.position.set(x, 0, z);
    this.scene.add(h.group);
    const cop = { parts: h, mesh: h.group, x, z, heading: 0, speed: 6.5, phase: 0 };
    h.group.userData.actor = { kind: 'cop', ref: cop };
    this.footCops.push(cop);
    return cop;
  }
  _spawnCopCar(x, z) {
    const car = new Car(this.scene, 'police', x, z, 0, 0x1a1a2e);
    car.driver = 'police'; car.siren = true;
    this.copCars.push(car);
    return car;
  }
  _despawn(cop) {
    this.scene.remove(cop.mesh);
    const i = this.footCops.indexOf(cop); if (i >= 0) this.footCops.splice(i, 1);
  }
  _despawnCar(car) {
    this.scene.remove(car.mesh);
    const i = this.copCars.indexOf(car); if (i >= 0) this.copCars.splice(i, 1);
  }
  update(dt, t, player, allCars, onBusted) {
    // decay: no crime for 15 s and no cop close -> heat falls
    const anyCopNear = this.footCops.some((c) => Math.hypot(c.x - player.x, c.z - player.z) < 40)
      || this.copCars.some((c) => Math.hypot(c.x - player.x, c.z - player.z) < 45);
    if (t - this.lastCrimeT > 15 && !anyCopNear && this.heat > 0) {
      this.heat = Math.max(0, this.heat - dt * 2.2);
      this._syncStars();
    }
    // desired force by stars
    const wantFoot = this.stars >= 1 ? Math.min(2 + this.stars, 8) : 0;
    const wantCars = this.stars >= 2 ? Math.min(this.stars - 1, 4) : 0;
    // spawn foot cops near the player (off-screen-ish, on roads) — try a few
    // candidate points so the response is snappy
    if (this.footCops.length < wantFoot && this.rng() < dt * 2.0) {
      for (let tries = 0; tries < 3; tries++) {
        const p = randomRoadPoint(this.rng);
        const d = Math.hypot(p.x - player.x, p.z - player.z);
        if (d > 18 && d < 70) { this._spawnFootCop(p.x, p.z); break; }
      }
    }
    if (this.copCars.length < wantCars && this.rng() < dt * 1.2) {
      for (let tries = 0; tries < 3; tries++) {
        const p = randomRoadPoint(this.rng);
        const d = Math.hypot(p.x - player.x, p.z - player.z);
        if (d > 25 && d < 90) { this._spawnCopCar(p.x, p.z); break; }
      }
    }
    // foot cops chase
    for (const cop of [...this.footCops]) {
      const dx = player.x - cop.x, dz = player.z - cop.z;
      const d = Math.hypot(dx, dz);
      if (this.stars === 0 || d > 90) { this._despawn(cop); continue; }
      cop.heading = Math.atan2(dx / d, dz / d);
      const sp = player.inCar ? 7.5 : 6.5;
      const nx = cop.x + Math.sin(cop.heading) * sp * dt;
      const nz = cop.z + Math.cos(cop.heading) * sp * dt;
      const c = collideCircle(nx, nz, 0.45, this.colliders);
      cop.x = c.x; cop.z = c.z;
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = cop.heading;
      cop.phase += dt * sp * 2.4;
      animateWalk(cop.parts, cop.phase, 0.65);
      // bust: cop touches player on foot while player is slow
      if (!player.inCar && d < 1.7 && player.speed2d < 3) onBusted?.();
    }
    // police cars pursue
    for (const car of [...this.copCars]) {
      if (this.stars === 0) { this._despawnCar(car); continue; }
      const dx = player.x - car.x, dz = player.z - car.z;
      const d = Math.hypot(dx, dz);
      if (d > 140) { this._despawnCar(car); continue; }
      const wantHeading = Math.atan2(dx, dz);
      let dh = wantHeading - car.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, dh * 1.4));
      car.drive(dt, 1, steer, this.colliders, allCars);
      // ram damage to the player's car / player
      if (d < 3.2) {
        if (player.inCar) { player.inCar.health -= 12 * dt; }
        else if (Math.abs(car.speed) > 4) { player.takeDamage(25 * dt); }
      }
      // if player is on foot and cop car is close + slow, a foot cop hops out
      if (!player.inCar && d < 9 && Math.abs(car.speed) < 2 && this.footCops.length < 8 && this.rng() < dt * 0.5) {
        this._spawnFootCop(car.x + 2, car.z + 2);
      }
    }
    this.sirenOn = this.stars >= 2;
  }
  clear() {
    for (const c of [...this.footCops]) this._despawn(c);
    for (const c of [...this.copCars]) this._despawnCar(c);
    this.setHeat(0);
  }
}

// ---------------- Gang enemies ----------------
export class Gang {
  constructor(scene, colliders, seed = 31) {
    this.rng = makeRng(seed);
    this.scene = scene; this.colliders = colliders;
    this.members = [];
  }
  spawnSquad(x, z, n, label = 'HARBOR RAT') {
    const out = [];
    for (let i = 0; i < n; i++) {
      const h = makeHumanoid(0x222222, 0x333333, 0xa06a4a);
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.1, 0.42),
        new THREE.MeshLambertMaterial({ color: 0xcc0000 }));
      band.position.y = 1.98; h.group.add(band);
      const px = x + range(this.rng, -6, 6), pz = z + range(this.rng, -6, 6);
      h.group.position.set(px, 0, pz);
      this.scene.add(h.group);
      // health bar: two tiny billboards
      const bg = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.12),
        new THREE.MeshBasicMaterial({ color: 0x330000, transparent: true, opacity: 0.8, depthWrite: false }));
      bg.position.y = 2.35; h.group.add(bg);
      const fg = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.12),
        new THREE.MeshBasicMaterial({ color: 0x33ff66, transparent: true, opacity: 0.95, depthWrite: false }));
      fg.position.set(0, 2.35, 0.01); h.group.add(fg);
      const m = {
        parts: h, mesh: h.group, x: px, z: pz, hp: 100, maxHp: 100,
        heading: 0, shootT: range(this.rng, 0.5, 2), phase: 0, dead: false, label, fg, bg,
      };
      h.group.userData.actor = { kind: 'gang', ref: m };
      this.members.push(m); out.push(m);
    }
    return out;
  }
  update(dt, player, onShootPlayer) {
    for (const m of this.members) {
      if (m.dead) continue;
      const dx = player.x - m.x, dz = player.z - m.z;
      const d = Math.hypot(dx, dz);
      if (d > 90) continue;
      m.heading = Math.atan2(dx / d, dz / d);
      // close distance if too far, strafe if close
      let mx = 0, mz = 0;
      if (d > 26) { mx = Math.sin(m.heading); mz = Math.cos(m.heading); }
      else if (d < 8) { mx = -Math.sin(m.heading); mz = -Math.cos(m.heading); }
      const nx = m.x + mx * 3.2 * dt, nz = m.z + mz * 3.2 * dt;
      const c = collideCircle(nx, nz, 0.45, this.colliders);
      m.x = c.x; m.z = c.z;
      m.mesh.position.set(m.x, 0, m.z);
      m.mesh.rotation.y = m.heading;
      m.phase += dt * 5;
      animateWalk(m.parts, m.phase, 0.5);
      // shoot
      m.shootT -= dt;
      if (m.shootT <= 0 && d < 45) {
        m.shootT = range(this.rng, 0.9, 1.8);
        const hitChance = d < 15 ? 0.35 : d < 30 ? 0.22 : 0.12;
        onShootPlayer?.(m, hitChance);
      }
      // health bar faces camera via game.js (billboard) — scale fg by hp
      const f = Math.max(0, m.hp / m.maxHp);
      m.fg.scale.x = f;
      m.fg.position.x = -(1 - f) * 0.55;
    }
  }
  alive() { return this.members.filter((m) => !m.dead); }
  clear() {
    for (const m of this.members) this.scene.remove(m.mesh);
    this.members = [];
  }
}

// ---------------- Pickups ----------------
export class Pickups {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
  }
  add(kind, x, z, amount = 1) {
    const color = kind === 'cash' ? 0x2ecc71 : kind === 'health' ? 0xff5a7a : 0xffd166;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7),
      new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.4 }));
    mesh.position.set(x, 1, z);
    this.scene.add(mesh);
    const p = { kind, mesh, x, z, amount, t: 0 };
    this.list.push(p);
    return p;
  }
  update(dt, player, onCollect) {
    for (const p of [...this.list]) {
      p.t += dt;
      p.mesh.rotation.y += dt * 2;
      p.mesh.position.y = 1 + Math.sin(p.t * 3) * 0.2;
      if (!player.inCar && Math.hypot(player.x - p.x, player.z - p.z) < 1.4) {
        onCollect?.(p);
        this.scene.remove(p.mesh);
        this.list.splice(this.list.indexOf(p), 1);
      }
    }
  }
  clear() {
    for (const p of this.list) this.scene.remove(p.mesh);
    this.list = [];
  }
}
