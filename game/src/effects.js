// Visual effects: pooled tracers, muzzle flashes, impact sparks, explosions,
// skid smoke and floating damage numbers. All pooled — no per-frame allocation.
import * as THREE from 'three';

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    this.particles = [];
    this.floaters = [];
    const geo = new THREE.BoxGeometry(0.06, 0.06, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe27a });
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.visible = false; scene.add(m);
      this.tracers.push({ mesh: m, t: 0, life: 0, from: new THREE.Vector3(), to: new THREE.Vector3() });
    }
    const pGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
    const colors = [0xffcc33, 0xff6622, 0xffffff, 0x88aaff];
    for (let i = 0; i < 120; i++) {
      const m = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({ color: colors[i % 4] }));
      m.visible = false; scene.add(m);
      this.particles.push({ mesh: m, t: 0, life: 0, vel: new THREE.Vector3(), grav: 0 });
    }
  }
  tracer(from, to) {
    const tr = this.tracers.find((t) => !t.mesh.visible) || this.tracers[0];
    tr.from.copy(from); tr.to.copy(to);
    tr.mesh.visible = true; tr.t = 0; tr.life = 0.09;
    const mid = from.clone().add(to).multiplyScalar(0.5);
    tr.mesh.position.copy(mid);
    tr.mesh.lookAt(to);
    tr.mesh.scale.set(1, 1, from.distanceTo(to));
  }
  burst(pos, n = 10, color = 0xffcc33, speed = 6, grav = 9) {
    let made = 0;
    for (const p of this.particles) {
      if (made >= n) break;
      if (p.mesh.visible) continue;
      p.mesh.visible = true; p.t = 0; p.life = 0.5 + Math.random() * 0.4;
      p.mesh.position.copy(pos);
      p.mesh.material.color.setHex(color);
      p.vel.set((Math.random() - 0.5) * speed, Math.random() * speed * 0.8, (Math.random() - 0.5) * speed);
      p.grav = grav;
      made++;
    }
  }
  explosion(pos) {
    this.burst(pos, 26, 0xff7722, 11, 8);
    this.burst(pos, 14, 0xffcc33, 7, 4);
    this.burst(pos, 10, 0x666666, 4, -2);
  }
  floater(pos, text, color = '#ffd166') {
    // DOM-based floating text (cheap, readable)
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = `position:absolute;color:${color};font-weight:bold;font-size:18px;text-shadow:0 2px 4px #000;pointer-events:none;`;
    document.getElementById('hud')?.appendChild(el);
    this.floaters.push({ el, t: 0, life: 1.1, pos: pos.clone() });
  }
  update(dt, camera) {
    for (const tr of this.tracers) {
      if (!tr.mesh.visible) continue;
      tr.t += dt;
      if (tr.t >= tr.life) tr.mesh.visible = false;
      else tr.mesh.material.opacity = 1 - tr.t / tr.life;
    }
    for (const p of this.particles) {
      if (!p.mesh.visible) continue;
      p.t += dt;
      if (p.t >= p.life) { p.mesh.visible = false; continue; }
      p.vel.y -= p.grav * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.mesh.position.y < 0.08) { p.mesh.position.y = 0.08; p.vel.y *= -0.3; p.vel.x *= 0.7; p.vel.z *= 0.7; }
      p.mesh.scale.setScalar(Math.max(0.1, 1 - p.t / p.life));
    }
    const w = window.innerWidth, h = window.innerHeight;
    for (const f of [...this.floaters]) {
      f.t += dt;
      if (f.t >= f.life) { f.el.remove(); this.floaters.splice(this.floaters.indexOf(f), 1); continue; }
      const v = f.pos.clone(); v.y += f.t * 2;
      v.project(camera);
      f.el.style.left = `${((v.x * 0.5 + 0.5) * w) | 0}px`;
      f.el.style.top = `${((-v.y * 0.5 + 0.5) * h - 20) | 0}px`;
      f.el.style.opacity = String(1 - f.t / f.life);
    }
  }
}
