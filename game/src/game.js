// SOLMAR: Streets of Gold — core game. Third-person open world: on-foot + driving,
// traffic, pedestrians, wanted/police, six story missions, taxi fares, sun coins,
// combat, HUD/minimap, save/load. Deterministic world (seed 1) so screenshots match.
import * as THREE from 'three';
import { buildWorld, collideCircle, randomRoadPoint, ROADS } from './world.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { HUD } from './hud.js';
import { Effects } from './effects.js';
import { Player, Pedestrians, Police, Gang, Pickups, WEAPONS } from './actors.js';
import { Traffic, spawnParkedCars, CAR_TYPES, Car } from './vehicles.js';
import { STORY, TAXI_FARES, SUN_COINS } from './missions.js';
import { makeRng, pick } from './rng.js';

const SAVE_KEY = 'solmar-save-v1';
const $ = (id) => document.getElementById(id);

export class Game {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.domElement.classList.add('game');
    $('app').prepend(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
    this.input = new Input(this.renderer.domElement);
    this.audio = new AudioSys();
    this.hud = new HUD();
    this.fx = new Effects(this.scene);
    this.raycaster = new THREE.Raycaster();
    this.clock = new THREE.Clock();
    this.state = 'title'; // title | playing | paused | busted
    this.time = 0; // game seconds since session start
    this.dayMinutes = 18 * 60 + 24; // 18:24 sunset
    this.camYaw = Math.PI; this.camPitch = 0.32;
    this.camPos = new THREE.Vector3(0, 8, 20);
    this.dialogQueue = [];
    this.shotMode = null;
    this.missionIndex = 0;
    this.stepIndex = 0;
    this.step = null; // live step state
    this.coinsGot = new Set();
    this.taxiFare = null;
    this.goldCar = null;
    this.bustedOnce = false;
    this.rayTargets = [];
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  init() {
    const w = buildWorld(this.scene, 1);
    this.world = w;
    this.colliders = w.colliders;
    this.rng = makeRng(99);
    this.player = new Player(this.scene, w.landmarks.garage.x + 6, w.landmarks.garage.z + 4);
    this.traffic = new Traffic(this.scene, this.colliders, 7);
    this.traffic.spawn(14);
    this.parked = spawnParkedCars(this.scene, makeRng(5), 12);
    this.peds = new Pedestrians(this.scene, 11);
    this.peds.spawn(24);
    this.police = new Police(this.scene, this.colliders, 23);
    this.gang = new Gang(this.scene, this.colliders, 31);
    this.pickups = new Pickups(this.scene);
    this._spawnGoldCar();
    // sun coins
    for (const [x, z] of SUN_COINS) this.pickups.add('cash', x, z, 50);
    // a few health/ammo pickups around town
    this.pickups.add('health', w.landmarks.hospital.x + 8, w.landmarks.hospital.z, 40);
    this.pickups.add('ammo', w.landmarks.docks.x - 6, w.landmarks.docks.z + 4, 60);
    this.pickups.add('health', w.landmarks.beach.x, w.landmarks.beach.z - 4, 40);
    this.rayTargets = [w.group];
    this._bindScreens();
    this._loadSavePreview();
  }

  _spawnGoldCar() {
    const m = this.world.landmarks.marina;
    this.goldCar = new Car(this.scene, 'gold', m.x - 6, m.z - 8, Math.PI / 2, 0xffd166);
    this.parked.push(this.goldCar);
  }

  // --- screens / menus ---
  _bindScreens() {
    $('btnNew').onclick = () => { this.audio.ensure(); this.audio.startMusic(); this.startGame(false); };
    $('btnContinue').onclick = () => { this.audio.ensure(); this.audio.startMusic(); this.startGame(true); };
    $('btnHow').onclick = () => {
      const b = $('controlsBox');
      b.style.display = b.style.display === 'none' ? 'block' : 'none';
    };
    $('btnResume').onclick = () => this.resume();
    $('btnSave').onclick = () => { this.save(); this.hud.toast('GAME SAVED', 'Progress stored in this browser.'); };
    $('btnQuit').onclick = () => { this.save(); this.toTitle(); };
    $('bustedBtn').onclick = () => this.respawn();
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.state === 'playing') this.pause();
      else if (e.code === 'Escape' && this.state === 'paused') this.resume();
    });
  }
  _loadSavePreview() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (s) $('btnContinue').style.display = 'inline-block';
    } catch { /* no save */ }
  }
  toTitle() {
    this.state = 'title';
    this.hud.hide();
    $('pause').style.display = 'none';
    $('busted').style.display = 'none';
    $('title').style.display = 'flex';
    document.exitPointerLock?.();
  }
  startGame(continueSave) {
    $('title').style.display = 'none';
    this.hud.show();
    this.state = 'playing';
    if (continueSave) this.load();
    else {
      this.missionIndex = 0; this.coinsGot = new Set();
      this.player.money = 120; this.player.health = 100; this.player.armor = 0;
    }
    this._startMission(this.missionIndex, true);
    this.hud.feed('Welcome to Solmar City. Rosa is waiting at the garage.');
  }
  pause() {
    this.state = 'paused';
    document.exitPointerLock?.();
    $('pauseStats').textContent =
      `Cash $${this.player.money.toLocaleString()} · Health ${Math.round(this.player.health)} · ` +
      `${this.missionIndex < STORY.length ? `Mission ${this.missionIndex + 1}/6: ${STORY[this.missionIndex].title}` : 'Story complete — King of Solmar'} · ` +
      `Sun Coins ${this.coinsGot.size}/12 · Wanted ${'★'.repeat(this.police.stars)}${'☆'.repeat(5 - this.police.stars)}`;
    $('pause').style.display = 'flex';
    this.audio.setEngine(0, false);
  }
  resume() {
    $('pause').style.display = 'none';
    this.state = 'playing';
    this.audio.ensure();
  }

  // --- save / load ---
  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        money: this.player.money, health: this.player.health, armor: this.player.armor,
        missionIndex: this.missionIndex, x: this.player.x, z: this.player.z,
        coins: [...this.coinsGot], weapons: [...this.player.owned],
        smgReserve: this.player.weapons.smg.reserve,
      }));
    } catch { /* storage unavailable */ }
  }
  load() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!s) return;
      this.player.money = s.money ?? 120;
      this.player.health = s.health ?? 100;
      this.player.armor = s.armor ?? 0;
      this.missionIndex = Math.min(s.missionIndex ?? 0, STORY.length - 1);
      this.coinsGot = new Set(s.coins ?? []);
      if (s.x !== undefined) { this.player.x = s.x; this.player.z = s.z; }
      for (const wname of (s.weapons ?? ['pistol'])) this.player.owned.add(wname);
      if (s.smgReserve) this.player.weapons.smg.reserve = s.smgReserve;
      // remove collected coins from the world
      for (const p of [...this.pickups.list]) {
        if (p.kind === 'cash' && p.amount === 50 && this.coinsGot.has(`${p.x},${p.z}`)) {
          this.scene.remove(p.mesh); this.pickups.list.splice(this.pickups.list.indexOf(p), 1);
        }
      }
    } catch { /* corrupt save */ }
  }

  // --- missions ---
  _startMission(i, showBrief) {
    if (i >= STORY.length) {
      this.hud.setObjective('KING OF SOLMAR', 'Story complete. Free roam — collect Sun Coins, drive, cause trouble.');
      this.hud.setStats({ health: this.player.health, armor: this.player.armor, money: this.player.money, missionIndex: STORY.length, missionTotal: STORY.length });
      return;
    }
    this.missionIndex = i;
    const m = STORY[i];
    this.stepIndex = 0;
    this._startStep(m);
    if (showBrief) this._say(m.giver, m.brief);
    this.hud.toast(`MISSION ${i + 1}: ${m.title}`, m.giver);
  }
  _startStep(m) {
    const def = m.steps[this.stepIndex];
    this.step = { def, t: 0, kills: 0, fares: 0, holdT: 0, phase: 'start', timer: def.timer ?? null, squad: [] };
    if (def.kind === 'kill') {
      const d = this.world.landmarks.docks;
      this.step.squad = this.gang.spawnSquad(d.x, d.z, def.count);
      this.hud.feed('Harbor Rats spotted at the docks. Take them out.');
    }
    if (def.kind === 'escape') {
      this.police.addHeat(def.stars === 4 ? 85 : 60, this.time);
      this.hud.feed(`Wanted level ${def.stars} stars — the whole PD is coming.`);
    }
    if (def.kind === 'taxi') {
      this._nextFare();
      // park a taxi near the player for the job
      const t = this.parked.find((c) => c.type === 'taxi');
      if (!t) {
        const nc = new Car(this.scene, 'taxi', this.player.x + 8, this.player.z + 4, 0, 0xffc93c);
        this.parked.push(nc);
      }
    }
    if (def.kind === 'stealGold') {
      this.hud.feed('The gold sedan is parked at the Marina. Take it.');
    }
    this._refreshObjective();
  }
  _refreshObjective() {
    if (this.missionIndex >= STORY.length) return;
    const m = STORY[this.missionIndex];
    const def = m.steps[this.stepIndex];
    let text = def.text;
    if (def.kind === 'kill') text = `Clear out the Harbor Rats at the docks (${this.step.kills}/${def.count})`;
    if (def.kind === 'taxi') text = `Complete ${def.count} taxi fares (${this.step.fares}/${def.count})`;
    if (def.kind === 'escape' && this.step.phase === 'hide') text = `Stay out of sight — free for ${Math.ceil(this.step.hold - this.step.holdT)}s more`;
    if (this.step.timer !== null && this.step.timer !== undefined) text += ` — ${Math.ceil(this.step.timer)}s left`;
    this.hud.setObjective(`MISSION ${this.missionIndex + 1}: ${m.title}`, text);
  }
  _completeStep() {
    const m = STORY[this.missionIndex];
    this.audio.missionDone();
    this.stepIndex++;
    if (this.stepIndex >= m.steps.length) {
      this.player.money += m.reward;
      this.hud.toast('MISSION COMPLETE', `+ $${m.reward.toLocaleString()} — ${m.title}`);
      this.hud.feed(`Mission complete: ${m.title} (+$${m.reward}).`);
      this.audio.cash();
      this.save();
      this.missionIndex++;
      this._startMission(this.missionIndex, true);
    } else {
      this.hud.toast('OBJECTIVE DONE', 'Next objective marked on the map.');
      this._startStep(m);
    }
    this._refreshObjective();
  }
  _failMission(reason) {
    this.hud.toast('MISSION FAILED', reason);
    this.audio.fail();
    this.hud.feed(`Mission failed: ${reason}. Try again.`);
    const m = STORY[this.missionIndex];
    this.stepIndex = 0;
    this.gang.clear();
    this._startStep(m);
  }
  _nextFare() {
    const fare = pick(this.rng, TAXI_FARES);
    const from = this.world.landmarks[fare.from];
    const to = this.world.landmarks[fare.to];
    const ped = this.peds.addPed(from.x + 3, from.z + 3);
    ped.state = 'wait'; ped.target = null;
    this.taxiFare = { ...fare, fromPos: { x: from.x, z: from.z }, toPos: { x: to.x, z: to.z }, ped, phase: 'pickup' };
  }
  _say(who, line) {
    this.dialogQueue.push({ who, line });
  }
  _updateMission(dt) {
    if (this.missionIndex >= STORY.length || !this.step) return;
    const s = this.step, def = s.def;
    s.t += dt;
    if (s.timer !== null && s.timer !== undefined) {
      s.timer -= dt;
      if (s.timer <= 0) { this._failMission('Out of time.'); return; }
      this._refreshObjective();
    }
    const p = this.player;
    const distTo = (t) => Math.hypot(p.x - t.x, p.z - t.z);
    switch (def.kind) {
      case 'stealCar':
        if (p.inCar) this._completeStep();
        break;
      case 'goto': {
        const t = this.world.landmarks[def.target];
        if (distTo(t) < def.radius) this._completeStep();
        break;
      }
      case 'kill':
        if (s.kills >= def.count) this._completeStep();
        break;
      case 'escape':
        if (s.phase === 'start') {
          if (this.police.stars >= def.stars) { s.phase = 'hide'; this.hud.feed('Now lose them — stay out of sight!'); }
        } else if (s.phase === 'hide') {
          if (this.police.stars === 0) {
            s.holdT += dt;
            if (s.holdT >= def.hold) this._completeStep();
          } else s.holdT = 0;
        }
        this._refreshObjective();
        break;
      case 'taxi': {
        const f = this.taxiFare;
        if (!f) break;
        if (f.phase === 'pickup' && p.inCar && distTo(f.fromPos) < 6) {
          // passenger boards
          this.scene.remove(f.ped.mesh);
          this.peds.list.splice(this.peds.list.indexOf(f.ped), 1);
          f.phase = 'dropoff';
          this.hud.feed(`Passenger aboard — take them to ${this.world.landmarks[f.to].name}.`);
          this.audio.pickup();
        } else if (f.phase === 'dropoff' && p.inCar && distTo(f.toPos) < 8) {
          this.player.money += f.tip;
          s.fares++;
          this.hud.toast('FARE COMPLETE', `+ $${f.tip} tip`);
          this.audio.cash();
          if (s.fares >= def.count) { this.taxiFare = null; this._completeStep(); }
          else this._nextFare();
        }
        break;
      }
      case 'stealGold':
        if (p.inCar === this.goldCar) {
          this.police.addHeat(40, this.time);
          this.hud.feed('The gold sedan is yours — and the PD knows it!');
          this._completeStep();
        }
        break;
    }
  }

  // --- combat ---
  _shoot() {
    const p = this.player;
    if (p.inCar || p.shootCooldown > 0) return;
    const w = WEAPONS[p.weapon];
    const st = p.weapons[p.weapon];
    if (st.mag <= 0) { this.audio.fail(); this.hud.feed('Out of ammo — press R to reload.'); p.shootCooldown = 0.3; return; }
    st.mag--;
    p.shootCooldown = w.rate;
    this.audio.shoot(p.weapon);
    // The shot travels horizontally at torso height from the muzzle, in the
    // direction the player is facing on screen (camYaw): the camera itself
    // can be shoved sideways by a building, so its own forward is not the aim.
    // The muzzle sits ahead of the player along the AIM direction, not the
    // body's facing — otherwise a sideways aim is offset by the muzzle and
    // every shot passes beside the target.
    const aim = new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
    const muzzle = new THREE.Vector3(p.x, 1.5, p.z).addScaledVector(aim, 0.6);
    const dir = new THREE.Vector3(
      aim.x + (Math.random() - 0.5) * w.spread * 2,
      0,
      aim.z + (Math.random() - 0.5) * w.spread * 2,
    ).normalize();
    this.raycaster.set(muzzle, dir);
    this.raycaster.far = w.range;
    const targets = [this.world.group, ...this.gang.members.filter((m) => !m.dead).map((m) => m.mesh),
      ...this.peds.list.filter((pd) => !pd.dead).map((pd) => pd.mesh),
      ...this.parked.map((c) => c.mesh), ...this.traffic.cars.map((c) => c.mesh),
      ...this.police.copCars.map((c) => c.mesh)];
    const hits = this.raycaster.intersectObjects(targets, true);
    let end = muzzle.clone().addScaledVector(dir, w.range);
    if (hits.length > 0) {
      const h = hits[0];
      end = h.point.clone();
      this.fx.burst(end, 6, 0xffcc33, 4, 6);
      const actor = this._actorOf(h.object);
      if (actor?.kind === 'gang') this._damageGang(actor.ref, w.damage * (1 - h.distance / w.range * 0.4), end);
      else if (actor?.kind === 'ped') {
        actor.ref.dead = true;
        this.police.addHeat(15, this.time);
        this.peds.scare(p.x, p.z, 30);
        this.hud.feed('You hit a pedestrian! The city saw that.');
      } else if (actor?.kind === 'car') {
        actor.ref.health -= w.damage;
        if (actor.ref.health <= 0) this._blowCar(actor.ref);
      } else if (actor?.kind === 'cop') {
        this.police.addHeat(20, this.time);
        this.hud.feed('You shot at the police!');
      }
    }
    this.fx.tracer(muzzle, end);
    this.fx.burst(muzzle, 3, 0xffe27a, 2, 0);
    this.hud.setWeapon(WEAPONS[p.weapon].name, st.mag, st.reserve);
    // witnesses: shooting in public adds heat
    this.police.addHeat(4, this.time);
    this.peds.scare(p.x, p.z, 22);
  }
  _actorOf(obj) {
    let o = obj;
    while (o) {
      if (o.userData?.actor) return o.userData.actor;
      o = o.parent;
    }
    return null;
  }
  _damageGang(m, dmg, point) {
    m.hp -= dmg;
    this.audio.hit();
    this.fx.burst(point, 5, 0xff4444, 3, 5);
    this.fx.floater(new THREE.Vector3(m.x, 2.4, m.z), `-${Math.round(dmg)}`, '#ff8888');
    if (m.hp <= 0 && !m.dead) {
      m.dead = true;
      m.mesh.rotation.x = Math.PI / 2;
      m.mesh.position.y = 0.4;
      this.fx.burst(new THREE.Vector3(m.x, 1, m.z), 12, 0xff4444, 5, 7);
      if (this.step?.def.kind === 'kill') {
        this.step.kills++;
        this._refreshObjective();
      }
      this.player.money += 25;
      this.pickups.add('cash', m.x + 1, m.z, 25);
      this.hud.feed('Harbor Rat down. +$25.');
    }
  }
  _blowCar(car) {
    this.fx.explosion(new THREE.Vector3(car.x, 1, car.z));
    this.audio.crash();
    this.scene.remove(car.mesh);
    const i = this.parked.indexOf(car); if (i >= 0) this.parked.splice(i, 1);
    const j = this.traffic.cars.indexOf(car); if (j >= 0) this.traffic.cars.splice(j, 1);
    if (this.player.inCar === car) { this.player.inCar = null; this.player.takeDamage(30); }
  }

  // --- interaction (E) ---
  _nearestCar(maxD = 4) {
    let best = null, bd = maxD;
    for (const c of [...this.parked, ...this.traffic.cars]) {
      if (c.driver === 'traffic' && Math.abs(c.speed) > 1) continue;
      const d = Math.hypot(c.x - this.player.x, c.z - this.player.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  _interact() {
    const p = this.player;
    if (p.inCar) {
      // exit car
      const car = p.inCar;
      p.inCar = null;
      p.mesh.visible = true;
      const f = car.forward();
      p.x = car.x - f.x * 2.5; p.z = car.z - f.z * 2.5;
      p.mesh.position.set(p.x, 0, p.z);
      this.audio.setEngine(0, false);
      return;
    }
    const car = this._nearestCar();
    if (car) {
      const wasParked = this.parked.includes(car);
      p.inCar = car;
      p.mesh.visible = false;
      car.driver = 'player';
      this.audio.engineStart();
      if (wasParked && this.police.stars < 5) {
        // stealing in view of a cop or a ped = heat
        const seen = this.police.footCops.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 30)
          || this.peds.list.some((pd) => !pd.dead && Math.hypot(pd.x - p.x, pd.z - p.z) < 18);
        if (seen) { this.police.addHeat(10, this.time); this.hud.feed('Someone saw you steal that car!'); }
      }
      if (car.type === 'police') { this.police.addHeat(15, this.time); this.hud.feed('You stole a police cruiser!'); }
    }
  }

  // --- busted / wasted ---
  _busted() {
    if (this.state !== 'playing') return;
    this.state = 'busted';
    const lost = Math.floor(this.player.money * 0.1);
    this.player.money -= lost;
    $('bustedTitle').textContent = 'BUSTED';
    $('bustedText').textContent = `The Solmar PD caught you. You lost $${lost.toLocaleString()} in fines.`;
    $('busted').style.display = 'flex';
    document.exitPointerLock?.();
    this.audio.setSiren(false);
    this.audio.setEngine(0, false);
  }
  _wasted() {
    if (this.state !== 'playing') return;
    this.state = 'busted';
    const lost = Math.floor(this.player.money * 0.15);
    this.player.money -= lost;
    $('bustedTitle').textContent = 'WASTED';
    $('bustedText').textContent = `You got taken out. The hospital patched you up — minus $${lost.toLocaleString()}.`;
    $('busted').style.display = 'flex';
    document.exitPointerLock?.();
    this.audio.setSiren(false);
    this.audio.setEngine(0, false);
  }
  respawn() {
    $('busted').style.display = 'none';
    const wasted = $('bustedTitle').textContent === 'WASTED';
    const spot = wasted ? this.world.landmarks.hospital : this.world.landmarks.policeHQ;
    if (this.player.inCar) { this.player.inCar.driver = null; this.player.inCar = null; }
    this.player.mesh.visible = true;
    this.player.x = spot.x + 4; this.player.z = spot.z + 4;
    this.player.health = 100; this.player.armor = 0;
    this.player.mesh.position.set(this.player.x, 0, this.player.z);
    this.police.clear();
    this.gang.clear();
    // restart current mission step cleanly
    if (this.missionIndex < STORY.length) { this.stepIndex = 0; this._startStep(STORY[this.missionIndex]); }
    this.state = 'playing';
    this.save();
  }

  // --- per-frame update ---
  update(dt) {
    this.time += dt;
    this.dayMinutes = (18 * 60 + 24 + this.time / 2) % (24 * 60);
    const p = this.player;
    const input = this.input;

    // camera orbit (mouse right = look right)
    this.camYaw -= input.mouseDX * 0.0032;
    this.camPitch = Math.max(-0.05, Math.min(0.85, this.camPitch + input.mouseDY * 0.0022));

    // dialog: E advances, sim frozen
    if (this.hud.dialogOpen) {
      if (input.hit('KeyE') || input.mouseClicked) {
        this.hud.closeDialog();
        if (this.dialogQueue.length > 0) {
          const d = this.dialogQueue.shift();
          this.hud.dialog(d.who, d.line);
        }
      }
      input.endFrame();
      this._renderOnly();
      return;
    }
    if (this.dialogQueue.length > 0) {
      const d = this.dialogQueue.shift();
      this.hud.dialog(d.who, d.line);
      input.endFrame();
      this._renderOnly();
      return;
    }

    // weapon switching / reload / mute
    if (this.autoInput) this.autoInput(input, this);
    if (input.hit('Digit1') && p.owned.has('pistol')) { p.weapon = 'pistol'; this.hud.setWeapon('PISTOL', p.weapons.pistol.mag, p.weapons.pistol.reserve); }
    if (input.hit('Digit2') && p.owned.has('smg')) { p.weapon = 'smg'; this.hud.setWeapon('SMG', p.weapons.smg.mag, p.weapons.smg.reserve); }
    if (input.hit('KeyR') && !p.inCar) {
      const st = p.weapons[p.weapon];
      const need = WEAPONS[p.weapon].mag - st.mag;
      const take = Math.min(need, st.reserve);
      if (take > 0) { st.mag += take; st.reserve -= take; this.audio.pickup(); this.hud.setWeapon(WEAPONS[p.weapon].name, st.mag, st.reserve); }
    }
    if (input.hit('KeyM')) { this.audio.setMuted(!this.audio.muted); this.hud.feed(this.audio.muted ? 'Sound muted.' : 'Sound on.'); }
    if (input.hit('KeyE')) this._interact();

    // shooting
    const w = WEAPONS[p.weapon];
    if (!p.inCar && (input.mouseClicked || (w.auto && input.mouseDown))) this._shoot();

    // movement / driving
    if (p.inCar) {
      const car = p.inCar;
      const ax = input.axis();
      const throttle = -ax.z; // W = forward
      const steer = -ax.x; // D = right (see vehicles.js heading convention)
      const handbrake = input.down('Space');
      const hitWall = car.drive(dt, handbrake ? 0 : throttle, handbrake ? 0 : steer, this.colliders, [...this.parked, ...this.traffic.cars, ...this.police.copCars]);
      if (handbrake) car.speed *= Math.max(0, 1 - dt * 3);
      if (hitWall && Math.abs(car.speed) > 12) {
        this.audio.crash();
        car.health -= 6;
        this.fx.burst(new THREE.Vector3(car.x, 1, car.z), 8, 0xffcc33, 4, 5);
        this.police.addHeat(2, this.time);
      }
      if (car.health <= 0) this._blowCar(car);
      // run over peds
      const runOver = this.peds.hitByCar(car.x, car.z, car.def.len / 2);
      if (runOver.length > 0) {
        this.police.addHeat(12 * runOver.length, this.time);
        this.hud.feed('You ran someone over! Wanted level rising.');
        this.audio.crash();
      }
      p.x = car.x; p.z = car.z;
      this.audio.setEngine(Math.abs(car.speed) / car.def.top, true);
    } else {
      p.update(dt, input, this.camYaw, this.colliders);
      this.audio.setEngine(0, false);
    }

    // world sim
    this.traffic.update(dt, { x: p.x, z: p.z }, [...this.parked, ...this.traffic.cars, ...this.police.copCars]);
    this.peds.update(dt, this.colliders, { x: p.x, z: p.z });
    this.police.update(dt, this.time, p, [...this.parked, ...this.traffic.cars, ...this.police.copCars], () => this._busted());
    this.gang.update(dt, p, (m, chance) => {
      if (Math.random() < chance) {
        p.takeDamage(8 + Math.random() * 8);
        this.hud.vignette(0.7);
        this.fx.tracer(new THREE.Vector3(m.x, 1.5, m.z), new THREE.Vector3(p.x, 1.4, p.z));
        this.audio.shoot('smg');
      }
    });
    this.pickups.update(dt, p, (pk) => {
      if (pk.kind === 'cash') {
        p.money += pk.amount;
        if (pk.amount === 50 && SUN_COINS.some(([x, z]) => x === pk.x && z === pk.z)) {
          this.coinsGot.add(`${pk.x},${pk.z}`);
          this.hud.feed(`Sun Coin found! ${this.coinsGot.size}/12 (+$50)`);
        } else this.hud.feed(`+$${pk.amount}`);
        this.audio.cash();
      } else if (pk.kind === 'health') { p.heal(pk.amount); this.hud.feed(`Health +${pk.amount}`); this.audio.pickup(); }
      else if (pk.kind === 'ammo') {
        p.owned.add('smg');
        p.weapons.smg.reserve += pk.amount;
        if (p.weapons.smg.mag === 0) p.weapons.smg.mag = 30;
        this.hud.feed(`SMG acquired! Press 2 to switch. +${pk.amount} ammo.`);
        this.audio.pickup();
      }
    });
    this.fx.update(dt, this.camera);
    this._updateMission(dt);
    this.audio.setSiren(this.police.stars >= 2 && this.state === 'playing');

    // death
    if (p.health <= 0) { this._wasted(); }

    // --- HUD ---
    this.hud.setStats({ health: p.health, armor: p.armor, money: p.money, missionIndex: this.missionIndex, missionTotal: STORY.length });
    this.hud.setWanted(this.police.stars);
    this.hud.setClock(this.dayMinutes);
    this.hud.tickToast(dt);
    this.hud.vignette(Math.max(0, 1 - p.health / 35) * 0.5);
    if (p.inCar) {
      const car = p.inCar;
      this.hud.setSpeed(Math.abs(car.speed) * 3.6, `${CAR_TYPES[car.type].top ? car.type.toUpperCase() : ''} · ${Math.round(car.health)}%`);
      this.hud.setWeapon('—', 0, 0);
      this.hud.crosshair(false);
      this.hud.prompt('<b>E</b> — Exit car');
    } else {
      this.hud.setSpeed(p.speed2d * 3.6, 'ON FOOT');
      const st = p.weapons[p.weapon];
      this.hud.setWeapon(WEAPONS[p.weapon].name, st.mag, st.reserve);
      this.hud.crosshair(true);
      const car = this._nearestCar();
      this.hud.prompt(car ? `<b>E</b> — ${car.type === 'police' ? 'Steal police cruiser' : car.type === 'gold' ? 'Steal the gold sedan' : `Steal the ${car.type}`}` : null);
    }
    // minimap
    const tgt = this._mapTarget();
    this.hud.drawMinimap(this.world, p, {
      target: tgt,
      fare: this.taxiFare?.phase === 'pickup' ? this.taxiFare.fromPos : null,
      coins: SUN_COINS.filter(([x, z]) => !this.coinsGot.has(`${x},${z}`)).map(([x, z]) => ({ x, z })),
      cars: [...this.parked, ...this.traffic.cars],
      cops: [...this.police.footCops, ...this.police.copCars],
      gang: this.gang.alive(),
    });

    // --- camera ---
    const target = p.inCar
      ? new THREE.Vector3(p.inCar.x, 2.2, p.inCar.z)
      : new THREE.Vector3(p.x, 2.0, p.z);
    const baseDist = p.inCar ? 9.5 : 5.5;
    const height = p.inCar ? 2.0 + this.camPitch * 6 : 1.4 + this.camPitch * 2.5;
    // driving: gently auto-follow the car's heading when the player isn't steering the camera
    if (p.inCar && Math.abs(input.mouseDX) < 0.5) {
      let want = p.inCar.heading + Math.PI;
      let dh = want - this.camYaw;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      this.camYaw += dh * Math.min(1, dt * 1.2);
    }
    // keep the camera out of buildings: pull it closer to the player until it
    // is clear, so the viewing angle stays true instead of sliding sideways
    let desired = null;
    for (const f of [1, 0.65, 0.4]) {
      const d = baseDist * f;
      const cx = target.x + Math.sin(this.camYaw) * d;
      const cz = target.z + Math.cos(this.camYaw) * d;
      const cc = collideCircle(cx, cz, 1.2, this.colliders);
      if (!cc.hit || f === 0.4) { desired = new THREE.Vector3(cc.x, target.y + height, cc.z); break; }
    }
    this.camPos.lerp(desired, Math.min(1, dt * 6));
    this.camera.position.copy(this.camPos);
    // on foot, look just past the player at torso height: the crosshair ray
    // then meets a person standing ~10 m ahead instead of passing over them
    if (!p.inCar) {
      const look = target.clone();
      look.x += -Math.sin(this.camYaw) * 8;
      look.z += -Math.cos(this.camYaw) * 8;
      look.y = target.y - 0.1;
      this.camera.lookAt(look);
    } else {
      this.camera.lookAt(target);
    }

    input.endFrame();
    this.renderer.render(this.scene, this.camera);
  }
  _mapTarget() {
    if (this.missionIndex >= STORY.length) return null;
    const def = this.step?.def;
    if (!def) return null;
    if (def.kind === 'goto') return this.world.landmarks[def.target];
    if (def.kind === 'kill') return this.world.landmarks.docks;
    if (def.kind === 'taxi' && this.taxiFare) {
      return this.taxiFare.phase === 'pickup' ? this.taxiFare.fromPos : this.taxiFare.toPos;
    }
    if (def.kind === 'stealGold') return this.world.landmarks.marina;
    if (def.kind === 'stealCar') {
      const c = this._nearestCar(999);
      return c ? { x: c.x, z: c.z } : null;
    }
    return null;
  }
  _renderOnly() {
    this.renderer.render(this.scene, this.camera);
  }
  loop() {
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.state === 'playing') this.update(dt);
    else if (this.state === 'title') {
      // slow cinematic orbit over the city behind the title screen
      this.time += dt;
      const a = this.time * 0.05;
      this.camera.position.set(Math.sin(a) * 150, 55, Math.cos(a) * 150 - 20);
      this.camera.lookAt(0, 10, 0);
      this.renderer.render(this.scene, this.camera);
    } else this._renderOnly();
    requestAnimationFrame(() => this.loop());
  }
}

// Small indirection so game.js keeps one static import graph (avoids a cycle
// with vehicles.js importing world helpers only).