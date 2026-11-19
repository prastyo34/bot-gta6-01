// Cars: build, drive, steal, and traffic. A car is a low-poly box body + cabin +
// wheels, with simple arcade physics (accel, steering, drift) and AABB/circle
// collisions against buildings and other cars.
import * as THREE from 'three';
import { makeRng, pick, range } from './rng.js';
import { collideCircle, ROADS, randomRoadPoint } from './world.js';
export const CAR_TYPES = {
  sedan:  { len: 4.4, wid: 1.9, accel: 11, top: 30, grip: 8, color: 0xdadada },
  sport:  { len: 4.2, wid: 1.9, accel: 16, top: 42, grip: 10, color: 0xff2e63 },
  taxi:   { len: 4.4, wid: 1.9, accel: 11, top: 30, grip: 8, color: 0xffc93c },
  truck:  { len: 6.0, wid: 2.2, accel: 8, top: 24, grip: 7, color: 0x4a7a5c },
  van:    { len: 5.0, wid: 2.0, accel: 9, top: 26, grip: 7, color: 0x7a86a0 },
  police: { len: 4.4, wid: 1.9, accel: 15, top: 38, grip: 10, color: 0x1a1a2e },
  gold:   { len: 4.3, wid: 1.9, accel: 17, top: 44, grip: 11, color: 0xffd166 },
};
const PAINTS = [0xc0392b, 0x2980b9, 0x27ae60, 0xe67e22, 0x8e44ad, 0xf1c40f, 0xecf0f1, 0x34495e, 0x16a085, 0xd35400];

export function makeCarMesh(type, colorHex) {
  const t = CAR_TYPES[type];
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: colorHex ?? t.color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(t.wid, 0.65, t.len), paint);
  body.position.y = 0.55; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(t.wid * 0.82, 0.55, t.len * 0.45),
    new THREE.MeshLambertMaterial({ color: 0x1a2530 }));
  cabin.position.set(0, 1.1, -t.len * 0.05); g.add(cabin);
  if (type === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.4),
      new THREE.MeshLambertMaterial({ color: 0xffe27a, emissive: 0xaa8800 }));
    sign.position.set(0, 1.5, -0.1); g.add(sign);
  }
  if (type === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.4),
      new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xcc0000 }));
    bar.position.set(0, 1.45, -0.1); g.add(bar);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(t.wid + 0.02, 0.2, t.len * 0.9),
      new THREE.MeshLambertMaterial({ color: 0xffffff }));
    stripe.position.y = 0.62; g.add(stripe);
  }
  if (type === 'gold') {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(t.wid + 0.02, 0.14, t.len * 0.9),
      new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0x886600 }));
    stripe.position.y = 0.6; g.add(stripe);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  wheelGeo.rotateZ(Math.PI / 2); // axle along X once baked; spin = rotation.x
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheels = [];
  for (const [wx, wz] of [[-t.wid / 2, t.len * 0.32], [t.wid / 2, t.len * 0.32], [-t.wid / 2, -t.len * 0.32], [t.wid / 2, -t.len * 0.32]]) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, 0.36, wz);
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    pivot.add(w);
    g.add(pivot);
    wheels.push({ spin: w, steer: pivot });
  }
  // headlights
  const lightMat = new THREE.MeshLambertMaterial({ color: 0xfff6c8, emissive: 0xaa9933 });
  for (const sx of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), lightMat);
    h.position.set(sx * t.wid * 0.7, 0.6, -t.len / 2 - 0.02); g.add(h);
  }
  g.traverse((o) => { o.castShadow = false; });
  return { group: g, wheels };
}

export class Car {
  constructor(scene, type, x, z, heading, colorHex) {
    this.type = type; this.def = CAR_TYPES[type];
    const { group, wheels } = makeCarMesh(type, colorHex);
    this.mesh = group; this.wheels = wheels;
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    this.x = x; this.z = z; this.heading = heading;
    this.speed = 0; this.steer = 0;
    this.driver = null; // 'player' | 'traffic' | 'police' | 'ped' | null (parked)
    this.occupied = false;
    this.health = 100;
    this.siren = false;
    this.mesh.userData.actor = { kind: 'car', ref: this };
    scene.add(this.mesh);
  }
  forward() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }
  // Arcade drive step. throttle -1..1, steer -1..1. Returns collision flag.
  drive(dt, throttle, steer, colliders, others) {
    const def = this.def;
    const target = throttle * def.top;
    const rate = throttle !== 0 ? def.accel : 14;
    this.speed += Math.sign(target - this.speed) * Math.min(Math.abs(target - this.speed), rate * dt);
    if (Math.abs(this.speed) < 0.05 && throttle === 0) this.speed = 0;
    this.steer += (steer - this.steer) * Math.min(1, dt * 8);
    const turn = this.steer * (this.speed / def.top) * 1.9 * dt * Math.sign(this.speed || 1);
    this.heading += turn;
    const f = this.forward();
    let nx = this.x + f.x * this.speed * dt;
    let nz = this.z + f.z * this.speed * dt;
    const r = def.len / 2;
    const c = collideCircle(nx, nz, r, colliders);
    let hitWall = false;
    if (c.hit) { hitWall = true; this.speed *= 0.4; nx = c.x; nz = c.z; }
    // soft collision with other cars (circles)
    for (const o of others) {
      if (o === this) continue;
      const dx = nx - o.x, dz = nz - o.z;
      const d = Math.hypot(dx, dz), min = (this.def.len + o.def.len) / 2 - 0.6;
      if (d < min && d > 0.01) {
        const push = (min - d) / 2;
        nx += (dx / d) * push; nz += (dz / d) * push;
        this.speed *= 0.7; o.speed *= 0.7; hitWall = true;
      }
    }
    // keep inside the map (sea is a wall at z > 285, north/west/east edges too)
    nx = Math.max(-196, Math.min(196, nx));
    nz = Math.max(-196, Math.min(282, nz));
    this.x = nx; this.z = nz;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    // wheel spin + front-wheel steer
    const spin = (this.speed * dt) / 0.36;
    this.wheels.forEach((w, i) => {
      w.spin.rotation.x += spin;
      if (i < 2) w.steer.rotation.y = this.steer * 0.35;
    });
    // slight body roll
    this.mesh.rotation.z = -this.steer * Math.min(1, Math.abs(this.speed) / 20) * 0.06;
    return hitWall;
  }
}

// --- traffic: cars that loop the road grid, turning at intersections ---
export class Traffic {
  constructor(scene, colliders, seed = 7) {
    this.rng = makeRng(seed);
    this.cars = [];
    this.colliders = colliders;
    this.scene = scene;
  }
  spawn(n) {
    const types = ['sedan', 'sedan', 'taxi', 'van', 'truck', 'sedan', 'sport'];
    for (let i = 0; i < n; i++) {
      const p = randomRoadPoint(this.rng);
      // a road point has one coordinate exactly on a road: that axis is the road's
      const onVerticalRoad = ROADS.some((r) => Math.abs(p.x - r) < 0.01) && !ROADS.some((r) => Math.abs(p.z - r) < 0.01);
      const type = pick(this.rng, types);
      const car = new Car(this.scene, type, p.x, p.z,
        onVerticalRoad ? (this.rng() < 0.5 ? 0 : Math.PI) : (this.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2),
        pick(this.rng, PAINTS));
      car.driver = 'traffic';
      car.speed = range(this.rng, 6, 11);
      this.cars.push(car);
    }
  }
  update(dt, playerPos, allCars) {
    for (const car of this.cars) {
      // car ahead on same road? slow down
      let target = range(this.rng, 0, 0); // keep base speed
      let speedTarget = 9;
      for (const o of allCars) {
        if (o === car) continue;
        const dx = o.x - car.x, dz = o.z - car.z;
        const f = car.forward();
        const ahead = dx * f.x + dz * f.z;
        const side = Math.abs(dx * f.z - dz * f.x);
        if (ahead > 0 && ahead < 12 && side < 3) { speedTarget = 0; break; }
      }
      // player in the way? brake + horn occasionally
      if (playerPos) {
        const dx = playerPos.x - car.x, dz = playerPos.z - car.z;
        const f = car.forward();
        const ahead = dx * f.x + dz * f.z;
        const side = Math.abs(dx * f.z - dz * f.x);
        if (ahead > 0 && ahead < 10 && side < 2.5) speedTarget = 0;
      }
      const desired = speedTarget === 0 ? 0 : 8 + Math.sin(car.x * 0.01 + car.z * 0.013) * 1.5;
      car.speed += Math.sign(desired - car.speed) * Math.min(Math.abs(desired - car.speed), 8 * dt);
      // maybe turn at an intersection
      const onRoadX = ROADS.some((r) => Math.abs(car.x - r) < 1.2);
      const onRoadZ = ROADS.some((r) => Math.abs(car.z - r) < 1.2);
      if (onRoadX && onRoadZ && this.rng() < dt * 0.25) {
        car.heading = (Math.PI / 2) * Math.floor(this.rng() * 4);
      }
      const f = car.forward();
      let nx = car.x + f.x * car.speed * dt;
      let nz = car.z + f.z * car.speed * dt;
      // stay on roads: if drifting off the grid, turn around at the edge
      if (nx > 192 || nx < -192 || nz > 192 || nz < -192) {
        car.heading += Math.PI; nx = car.x; nz = car.z;
      }
      car.x = nx; car.z = nz;
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      car.wheels.forEach((w) => { w.spin.rotation.x += (car.speed * dt) / 0.36; });
      void target;
    }
  }
}

// Parked cars the player can steal, placed along road edges.
export function spawnParkedCars(scene, rng, n = 12) {
  const cars = [];
  const types = ['sedan', 'sport', 'taxi', 'van', 'sedan', 'truck'];
  for (let i = 0; i < n; i++) {
    const road = pick(rng, ROADS);
    const along = range(rng, -170, 170);
    const side = rng() < 0.5 ? -1 : 1;
    const vertical = rng() < 0.5;
    // park just inside the road edge (road half-width 6, car half-width ~1):
    // clear of the buildings, whose nearest face is ~7 m from the road centre
    const x = vertical ? road + side * 4.2 : along;
    const z = vertical ? along : road + side * 4.2;
    // face ALONG the road (vertical road -> north/south, horizontal -> east/west)
    const heading = vertical ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2);
    const car = new Car(scene, pick(rng, types), x, z, heading, pick(rng, PAINTS));
    cars.push(car);
  }
  return cars;
}
