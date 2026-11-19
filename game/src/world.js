// SOLMAR CITY: a sun-soaked coastal grid city, generated from a seed.
// 9 roads each way (spacing 46 m), 8x8 blocks, beach + marina on the south edge,
// docks on the east edge. Exports colliders, road helpers and landmark positions.
import * as THREE from 'three';
import { makeRng, pick, range, int } from './rng.js';

export const STEP = 46, ROAD_W = 12, HALF = 190;
export const ROADS = [-184, -138, -92, -46, 0, 46, 92, 138, 184];
export const BLOCKS = [-161, -115, -69, -23, 23, 69, 115, 161];

const FACADES = [0xf2d8a7, 0xf7b6a0, 0xa8d8ea, 0xf5f0e6, 0xffd9a0, 0xc9b8e8, 0xbfe3c0, 0xe8a0a0, 0x9fc6e8, 0xf2e2c4];

function windowTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 256);
  g.fillStyle = 'rgba(0,0,0,0.08)';
  for (let i = 0; i < 40; i++) g.fillRect(Math.random() * 128, Math.random() * 256, 20, 8);
  for (let y = 12; y < 250; y += 22) {
    for (let x = 10; x < 120; x += 22) {
      const lit = Math.random() < 0.28;
      g.fillStyle = lit ? '#ffd98a' : '#2a3550';
      g.fillRect(x, y, 13, 15);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildWorld(scene, seed = 1) {
  const rng = makeRng(seed);
  const colliders = []; // {x, z, hx, hz}
  const buildings = [];
  const group = new THREE.Group();
  scene.add(group);
  // scratch objects reused by the instanced meshes below
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();

  // --- sky, sun, fog (golden hour) ---
  scene.background = new THREE.Color(0xff9e5e);
  scene.fog = new THREE.Fog(0xff9e5e, 160, 520);
  const hemi = new THREE.HemisphereLight(0xffd9b0, 0x3a2a55, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb36b, 1.6);
  sun.position.set(-120, 90, -160);
  scene.add(sun);

  // --- ground, roads, sidewalks, beach, sea ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
    new THREE.MeshLambertMaterial({ color: 0x77705f }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.05, 60);
  group.add(ground);

  const roadMat = new THREE.MeshLambertMaterial({ color: 0x2e2e38 });
  const walkMat = new THREE.MeshLambertMaterial({ color: 0x9a938a });
  const dashList = [];
  for (const r of ROADS) {
    for (const [w, l, x, z] of [[ROAD_W, 400, r, 0], [400, ROAD_W, 0, r]]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(w, l), roadMat);
      road.rotation.x = -Math.PI / 2; road.position.set(x, 0, z); group.add(road);
    }
    // centre dashes along both directions (one InstancedMesh for all of them)
    const dashSpots = [];
    for (let d = -180; d < 190; d += 12) {
      dashSpots.push([r, d, 0]); dashSpots.push([d, r, 1]);
    }
    // (built once below, after the road loop)
    dashList.push(...dashSpots);
  }
  {
    const dashGeo = new THREE.PlaneGeometry(0.5, 4);
    const dashMat = new THREE.MeshLambertMaterial({ color: 0xd8c86a });
    const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashList.length);
    dashList.forEach(([x, z, rot], i) => {
      p.set(x, 0.02, z); s.set(1, 1, 1); q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, rot ? Math.PI / 2 : 0));
      m4.compose(p, q, s); dashes.setMatrixAt(i, m4);
    });
    q.identity();
    dashes.instanceMatrix.needsUpdate = true;
    group.add(dashes);
  }
  // sidewalks: one slab per block (block is 34 m wide, slab 40 m)
  for (const bx of BLOCKS) for (const bz of BLOCKS) {
    const sw = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), walkMat);
    sw.rotation.x = -Math.PI / 2; sw.position.set(bx, 0.01, bz); group.add(sw);
  }
  // beach + sea (south, z > 196)
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(460, 90),
    new THREE.MeshLambertMaterial({ color: 0xe8d49a }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.02, 235); group.add(sand);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 300),
    new THREE.MeshLambertMaterial({ color: 0x1e6f9e }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, 0.0, 420); group.add(sea);
  // pier
  const pier = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 70),
    new THREE.MeshLambertMaterial({ color: 0x7a5230 }));
  pier.position.set(92, 0.5, 300); group.add(pier);
  colliders.push({ x: 92, z: 300, hx: 5, hz: 35 });

  // --- buildings (one InstancedMesh, tinted per instance) ---
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const boxMat = new THREE.MeshLambertMaterial({ map: windowTexture() });
  const spots = [];
  for (const bx of BLOCKS) for (const bz of BLOCKS) {
    if (bx === 23 && bz === -23) continue; // Solmar Tower's block — the tower stands alone
    const distC = Math.hypot(bx, bz);
    const tall = distC < 70;
    const n = tall ? int(rng, 1, 2) : int(rng, 1, 4);
    for (let i = 0; i < n; i++) {
      const w = range(rng, 10, 16), d = range(rng, 10, 16);
      const ox = n === 1 ? 0 : (i % 2 === 0 ? -8 : 8);
      const oz = n === 1 ? 0 : (i < 2 ? -8 : 8);
      const h = tall ? range(rng, 30, 62) : range(rng, 8, 26);
      spots.push({ x: bx + ox, z: bz + oz, w, d, h, color: pick(rng, FACADES) });
    }
  }
  const inst = new THREE.InstancedMesh(boxGeo, boxMat, spots.length);
  const col = new THREE.Color();
  spots.forEach((b, i) => {
    p.set(b.x, b.h / 2, b.z); s.set(b.w, b.h, b.d);
    m4.compose(p, q, s); inst.setMatrixAt(i, m4);
    inst.setColorAt(i, col.setHex(b.color));
    colliders.push({ x: b.x, z: b.z, hx: b.w / 2 + 0.4, hz: b.d / 2 + 0.4 });
    buildings.push(b);
  });
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  group.add(inst);

  // Solmar Tower — the centre landmark, taller + lit crown (block 23,-23)
  const tower = new THREE.Mesh(new THREE.BoxGeometry(20, 86, 20),
    new THREE.MeshLambertMaterial({ color: 0x3a4a6b, emissive: 0x223355 }));
  tower.position.set(23, 43, -23); group.add(tower);
  const crown = new THREE.Mesh(new THREE.BoxGeometry(22, 3, 22),
    new THREE.MeshLambertMaterial({ color: 0xffd166, emissive: 0xaa7711 }));
  crown.position.set(23, 87, -23); group.add(crown);
  colliders.push({ x: 23, z: -23, hx: 10.4, hz: 10.4 });

  // --- palms along sidewalks (instanced trunks + crowns) ---
  const palmSpots = [];
  for (const bx of BLOCKS) for (const bz of BLOCKS) {
    if (rng() < 0.7) palmSpots.push({ x: bx + 18, z: bz + range(rng, -12, 12) });
    if (rng() < 0.5) palmSpots.push({ x: bx + range(rng, -12, 12), z: bz + 18 });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 6, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a42 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const crownGeo = new THREE.ConeGeometry(2.6, 3.2, 7);
  const crownMat = new THREE.MeshLambertMaterial({ color: 0x2e8b57 });
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, palmSpots.length);
  palmSpots.forEach((pt, i) => {
    p.set(pt.x, 3, pt.z); s.set(1, 1, 1);
    m4.compose(p, q, s); trunks.setMatrixAt(i, m4);
    p.set(pt.x, 7.2, pt.z); m4.compose(p, q, s); crowns.setMatrixAt(i, m4);
    colliders.push({ x: pt.x, z: pt.z, hx: 0.5, hz: 0.5 });
  });
  trunks.instanceMatrix.needsUpdate = true; crowns.instanceMatrix.needsUpdate = true;
  group.add(trunks); group.add(crowns);

  // --- street lamps (instanced poles + glowing heads) ---
  const lampSpots = [];
  for (const r of ROADS) for (let d = -170; d < 190; d += 46) {
    lampSpots.push({ x: r + 6.5, z: d });
  }
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6.5, 6);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x222226 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampSpots.length);
  const headGeo = new THREE.SphereGeometry(0.5, 8, 6);
  const headMat = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffc84d });
  const heads = new THREE.InstancedMesh(headGeo, headMat, lampSpots.length);
  lampSpots.forEach((pt, i) => {
    p.set(pt.x, 3.25, pt.z); s.set(1, 1, 1); m4.compose(p, q, s); poles.setMatrixAt(i, m4);
    p.set(pt.x, 6.6, pt.z); m4.compose(p, q, s); heads.setMatrixAt(i, m4);
  });
  poles.instanceMatrix.needsUpdate = true; heads.instanceMatrix.needsUpdate = true;
  group.add(poles); group.add(heads);

  // --- landmarks ---
  const landmarks = {
    garage: { x: -161, z: 161, name: "Rosa's Garage" },
    docks: { x: 184, z: -69, name: 'Harbor Docks' },
    marina: { x: 92, z: 232, name: 'Solmar Marina' },
    hospital: { x: -161, z: -161, name: 'Solmar General' },
    policeHQ: { x: 115, z: -23, name: 'Solmar PD HQ' },
    tower: { x: 23, z: -23, name: 'Solmar Tower' },
    beach: { x: -46, z: 235, name: 'Palma Beach' },
  };
  // garage building marker: pink awning box
  const awn = new THREE.Mesh(new THREE.BoxGeometry(24, 1, 10),
    new THREE.MeshLambertMaterial({ color: 0xff5a7a }));
  awn.position.set(-161, 7, 161); group.add(awn);

  return { group, colliders, buildings, landmarks, rng };
}

// --- collision + road helpers ---
export function collideCircle(x, z, r, colliders) {
  // Pushes a circle out of AABB colliders; returns corrected {x, z, hit}
  let hit = false;
  for (const c of colliders) {
    const cx = Math.max(c.x - c.hx, Math.min(x, c.x + c.hx));
    const cz = Math.max(c.z - c.hz, Math.min(z, c.z + c.hz));
    const dx = x - cx, dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r; z = cz + (dz / d) * r;
      } else {
        // centre inside box: push out along smallest penetration axis
        const px = c.hx + r - Math.abs(x - c.x), pz = c.hz + r - Math.abs(z - c.z);
        if (px < pz) x = c.x + Math.sign(x - c.x || 1) * (c.hx + r);
        else z = c.z + Math.sign(z - c.z || 1) * (c.hz + r);
      }
    }
  }
  return { x, z, hit };
}
export function pointInCollider(x, z, colliders) {
  for (const c of colliders) {
    if (Math.abs(x - c.x) < c.hx && Math.abs(z - c.z) < c.hz) return true;
  }
  return false;
}
export function nearestRoadCoord(v) {
  let best = ROADS[0], bd = Infinity;
  for (const r of ROADS) { const d = Math.abs(v - r); if (d < bd) { bd = d; best = r; } }
  return best;
}
export function randomRoadPoint(rng) {
  const vertical = rng() < 0.5;
  const road = pick(rng, ROADS);
  const along = range(rng, -180, 180);
  return vertical ? { x: road, z: along } : { x: along, z: road };
}
export function randomSidewalkPoint(rng) {
  const bx = pick(rng, BLOCKS), bz = pick(rng, BLOCKS);
  const side = int(rng, 0, 3);
  const t = range(rng, -15, 15);
  if (side === 0) return { x: bx + t, z: bz + 18 };
  if (side === 1) return { x: bx + t, z: bz - 18 };
  if (side === 2) return { x: bx + 18, z: bz + t };
  return { x: bx - 18, z: bz + t };
}
