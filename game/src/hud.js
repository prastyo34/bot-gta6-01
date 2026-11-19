// HUD: DOM stats, wanted stars, objective, feed, toasts, dialog box and the
// circular minimap (2D canvas, north-up, roads + markers from the live world).
import { ROADS, BLOCKS } from './world.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'), money: $('money'), health: $('healthfill'), armor: $('armorfill'),
      missionCount: $('missionCount'), stars: $('stars'), clock: $('clock'),
      objTitle: $('objTitle'), objText: $('objText'), speed: $('speedVal'), gear: $('gearVal'),
      weaponName: $('weaponName'), ammo: $('ammoVal'), prompt: $('prompt'),
      crosshair: $('crosshair'), feed: $('feed'), toast: $('toast'),
      vignette: $('vignette'), dialog: $('dialog'), dlgWho: $('dlgWho'), dlgLine: $('dlgLine'),
      minimap: $('minimap'),
    };
    this.mm = this.el.minimap.getContext('2d');
    this.feedCount = 0;
    this.dialogOpen = false;
    this.toastT = 0;
  }
  show() { this.el.hud.classList.add('on'); }
  hide() { this.el.hud.classList.remove('on'); }
  setStats({ health, armor, money, missionIndex, missionTotal }) {
    this.el.health.style.width = `${Math.max(0, health)}%`;
    this.el.armor.style.width = `${Math.max(0, armor)}%`;
    this.el.money.textContent = `$${money.toLocaleString()}`;
    this.el.missionCount.textContent = missionTotal > 0 ? `MISSION ${Math.min(missionIndex + 1, missionTotal)}/${missionTotal}` : 'FREE ROAM';
  }
  setWanted(stars) {
    let s = '';
    for (let i = 0; i < 5; i++) s += `<span class="${i < stars ? '' : 'off'}">★</span>`;
    this.el.stars.innerHTML = s;
  }
  setClock(minutes) {
    const h = Math.floor(minutes / 60) % 24, m = Math.floor(minutes % 60);
    this.el.clock.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} · SOLMAR CITY`;
  }
  setObjective(title, text) {
    this.el.objTitle.textContent = title;
    this.el.objText.textContent = text;
  }
  setSpeed(kmh, label) {
    this.el.speed.textContent = String(Math.round(kmh));
    this.el.gear.textContent = label;
  }
  setWeapon(name, mag, reserve) {
    this.el.weaponName.textContent = name;
    this.el.ammo.textContent = `${mag} / ${reserve === Infinity ? '∞' : reserve}`;
  }
  prompt(html) {
    if (!html) { this.el.prompt.style.display = 'none'; return; }
    this.el.prompt.innerHTML = html;
    this.el.prompt.style.display = 'block';
  }
  feed(msg) {
    const div = document.createElement('div');
    div.textContent = msg;
    this.el.feed.prepend(div);
    while (this.el.feed.children.length > 4) this.el.feed.lastChild.remove();
    this.feedCount++;
  }
  toast(title, sub = '') {
    this.el.toast.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
    this.el.toast.style.display = 'block';
    this.toastT = 2.6;
  }
  tickToast(dt) {
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.el.toast.style.display = 'none';
    }
  }
  vignette(opacity) { this.el.vignette.style.opacity = String(opacity); }
  crosshair(show) { this.el.crosshair.style.display = show ? 'block' : 'none'; }
  dialog(who, line) {
    this.el.dlgWho.textContent = who;
    this.el.dlgLine.textContent = line;
    this.el.dialog.style.display = 'block';
    this.dialogOpen = true;
  }
  closeDialog() { this.el.dialog.style.display = 'none'; this.dialogOpen = false; }

  drawMinimap(world, player, opts = {}) {
    const ctx = this.mm, S = 190, C = S / 2, k = S / 430; // world -215..215 -> 0..190
    const X = (x) => C + x * k, Y = (z) => C + z * k;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath(); ctx.arc(C, C, C - 1, 0, Math.PI * 2); ctx.clip();
    // base
    ctx.fillStyle = '#0d1b2e'; ctx.fillRect(0, 0, S, S);
    // sea + beach (south)
    ctx.fillStyle = '#1e6f9e'; ctx.fillRect(0, Y(196), S, S - Y(196));
    ctx.fillStyle = '#e8d49a'; ctx.fillRect(0, Y(192), S, Y(200) - Y(192));
    // blocks
    ctx.fillStyle = '#2a3550';
    for (const bx of BLOCKS) for (const bz of BLOCKS) {
      ctx.fillRect(X(bx - 17), Y(bz - 17), 34 * k, 34 * k);
    }
    // roads
    ctx.strokeStyle = '#5a6274'; ctx.lineWidth = 12 * k;
    for (const r of ROADS) {
      ctx.beginPath(); ctx.moveTo(X(r), 0); ctx.lineTo(X(r), S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, Y(r)); ctx.lineTo(S, Y(r)); ctx.stroke();
    }
    // mission target (pulsing gold diamond)
    if (opts.target) {
      const pulse = 5 + Math.sin(performance.now() / 180) * 2;
      ctx.fillStyle = '#ffd166';
      ctx.save(); ctx.translate(X(opts.target.x), Y(opts.target.z)); ctx.rotate(Math.PI / 4);
      ctx.fillRect(-pulse / 2, -pulse / 2, pulse, pulse); ctx.restore();
      ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(X(opts.target.x), Y(opts.target.z), 9, 0, Math.PI * 2); ctx.stroke();
    }
    // taxi fare pickup
    if (opts.fare) {
      ctx.fillStyle = '#2ecc71';
      ctx.beginPath(); ctx.arc(X(opts.fare.x), Y(opts.fare.z), 4, 0, Math.PI * 2); ctx.fill();
    }
    // sun coins
    if (opts.coins) {
      ctx.fillStyle = '#ffe27a';
      for (const c of opts.coins) { ctx.beginPath(); ctx.arc(X(c.x), Y(c.z), 2, 0, Math.PI * 2); ctx.fill(); }
    }
    // traffic + parked cars
    ctx.fillStyle = '#c8d2e0';
    for (const c of (opts.cars || [])) { ctx.fillRect(X(c.x) - 1.5, Y(c.z) - 1.5, 3, 3); }
    // cops (flashing)
    const flash = Math.floor(performance.now() / 300) % 2 === 0;
    ctx.fillStyle = flash ? '#ff3333' : '#3388ff';
    for (const c of (opts.cops || [])) { ctx.beginPath(); ctx.arc(X(c.x), Y(c.z), 3.5, 0, Math.PI * 2); ctx.fill(); }
    // gang
    ctx.fillStyle = '#ff5555';
    for (const g of (opts.gang || [])) { ctx.beginPath(); ctx.arc(X(g.x), Y(g.z), 3, 0, Math.PI * 2); ctx.fill(); }
    // player arrow
    ctx.save();
    ctx.translate(X(player.x), Y(player.z));
    ctx.rotate(Math.atan2(Math.sin(player.heading), -Math.cos(player.heading)));
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.restore();
    // ring
    ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(C, C, C - 1, 0, Math.PI * 2); ctx.stroke();
  }
}
