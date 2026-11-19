// All sound is synthesised with WebAudio — no audio files, no network.
// Engine hum, gunshots, sirens, pickups, mission jingles and a light bass loop.
export class AudioSys {
  constructor() {
    this.ctx = null; this.master = null; this.muted = false;
    this.engineOsc = null; this.engineGain = null;
    this.sirenNodes = null; this.musicTimer = null; this.musicStep = 0;
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    } catch { this.ctx = null; }
  }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }
  _noiseBuf(dur = 0.3) {
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    return buf;
  }
  _tone(freq, dur, type = 'sine', vol = 0.2, slideTo = null, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  _noise(dur, vol, freq = 1200, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource(); src.buffer = this._noiseBuf(dur);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t0);
  }
  shoot(kind = 'pistol') {
    if (kind === 'smg') { this._noise(0.08, 0.35, 2600); this._tone(190, 0.07, 'square', 0.12, 90); }
    else { this._noise(0.16, 0.5, 1800); this._tone(150, 0.12, 'square', 0.18, 60); }
  }
  hit() { this._tone(880, 0.06, 'square', 0.12); }
  pickup() { this._tone(660, 0.09, 'sine', 0.2); this._tone(990, 0.12, 'sine', 0.2, null, 0.08); }
  cash() { this._tone(523, 0.1, 'sine', 0.22); this._tone(659, 0.1, 'sine', 0.22, null, 0.09); this._tone(784, 0.18, 'sine', 0.24, null, 0.18); }
  missionDone() { [523, 659, 784, 1047].forEach((f, i) => this._tone(f, 0.22, 'triangle', 0.25, null, i * 0.11)); }
  fail() { this._tone(220, 0.3, 'sawtooth', 0.2, 110); }
  horn() { this._tone(370, 0.25, 'square', 0.15, 370); }
  crash() { this._noise(0.25, 0.5, 700); this._tone(90, 0.2, 'sine', 0.3, 45); }
  footstep() { this._noise(0.05, 0.08, 500); }
  engineStart() { this._tone(60, 0.5, 'sawtooth', 0.15, 120); }
  setEngine(rpm01, on) {
    if (!this.ctx) return;
    if (on && !this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0.0;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
      this.engineOsc.connect(f); f.connect(this.engineGain); this.engineGain.connect(this.master);
      this.engineOsc.start();
    }
    if (this.engineOsc) {
      const target = on ? 0.05 + rpm01 * 0.06 : 0;
      this.engineGain.gain.setTargetAtTime(this.muted ? 0 : target, this.ctx.currentTime, 0.1);
      this.engineOsc.frequency.setTargetAtTime(55 + rpm01 * 130, this.ctx.currentTime, 0.08);
    }
  }
  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenNodes) {
      const o = this.ctx.createOscillator(); o.type = 'triangle';
      const g = this.ctx.createGain(); g.gain.value = 0.045;
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.6;
      const lg = this.ctx.createGain(); lg.gain.value = 260;
      lfo.connect(lg); lg.connect(o.frequency); o.frequency.value = 780;
      o.connect(g); g.connect(this.master); o.start(); lfo.start();
      this.sirenNodes = { o, lfo, g };
    } else if (!on && this.sirenNodes) {
      try { this.sirenNodes.o.stop(); this.sirenNodes.lfo.stop(); } catch { /* already stopped */ }
      this.sirenNodes = null;
    }
  }
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    // Simple sunset-drive bass + pluck loop, 8 steps a bar at 112 BPM.
    const bass = [55, 0, 55, 0, 65.4, 0, 49, 0, 55, 0, 55, 0, 73.4, 0, 82.4, 0];
    const pluck = [220, 0, 261.6, 0, 329.6, 0, 261.6, 0, 220, 0, 196, 0, 246.9, 0, 293.7, 0];
    this.musicTimer = setInterval(() => {
      if (this.muted || !this.ctx) return;
      const i = this.musicStep % 16; this.musicStep++;
      if (bass[i]) this._tone(bass[i], 0.32, 'triangle', 0.16);
      if (pluck[i] && this.musicStep % 2 === 0) this._tone(pluck[i], 0.18, 'sine', 0.05);
    }, 268);
  }
  stopAll() { this.setEngine(0, false); this.setSiren(false); }
}
