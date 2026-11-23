// Tiny procedural synth: ambience per biome, chimes, creature chirps, whistles. No audio files.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.volume = 0.6;
    this.muted = false;
    this.curChord = [0, 4, 7, 11];
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(ctx.destination);
    // ambient pad
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.05;
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 700;
    this.padGain.connect(this.padFilter).connect(this.master);
    this.padOsc = [0, 1, 2, 3].map((i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 ? 'triangle' : 'sine';
      o.frequency.value = this.freq(this.curChord[i], 2);
      o.detune.value = (i - 1.5) * 6;
      const g = ctx.createGain();
      g.gain.value = 0.25;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.05 + i * 0.03;
      const lg = ctx.createGain();
      lg.gain.value = 0.2;
      lfo.connect(lg).connect(g.gain);
      lfo.start();
      o.connect(g).connect(this.padGain);
      o.start();
      return o;
    });
    // wind noise
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    const n = ctx.createBufferSource();
    n.buffer = buf; n.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass'; this.windFilter.frequency.value = 500; this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.02;
    n.connect(this.windFilter).connect(this.windGain).connect(this.master);
    n.start();
  }

  freq(semi, oct = 4) { return 110 * Math.pow(2, (semi + (oct - 2) * 12) / 12); }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = this.muted ? 0 : v; }
  toggleMute() { this.muted = !this.muted; this.setVolume(this.volume); return this.muted; }

  /** Per-frame ambience: biome chord, day/night brightness, wind & rain level. */
  ambience(chord, night, wind, rain) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (chord !== this.curChord) {
      this.curChord = chord;
      this.padOsc.forEach((o, i) => o.frequency.setTargetAtTime(this.freq(chord[i % chord.length], 2 + (i > 2 ? 1 : 0)), t, 1.5));
    }
    this.padFilter.frequency.setTargetAtTime(400 + (1 - night) * 900, t, 2);
    this.padGain.gain.setTargetAtTime(0.045 + night * 0.03, t, 2);
    this.windGain.gain.setTargetAtTime(0.008 + wind * 0.05 + rain * 0.05, t, 1);
    this.windFilter.frequency.setTargetAtTime(300 + wind * 700 + rain * 1500, t, 1);
  }

  tone(f, dur = 0.3, type = 'sine', vol = 0.2, delay = 0, slide = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(dur, freq, vol = 0.2, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random());
    s.stop(t + dur);
  }

  chord(semis, dur = 0.8) { semis.forEach((s, i) => this.tone(this.freq(s, 4), dur, 'triangle', 0.12, i * 0.07)); }
  chime() { [0, 4, 7, 12].forEach((s, i) => this.tone(this.freq(s + 7, 4), 0.6, 'sine', 0.14, i * 0.08)); }
  discover() { [0, 7, 12, 16, 19].forEach((s, i) => this.tone(this.freq(s, 4), 1.2, 'triangle', 0.13, i * 0.11)); }
  pickup() { this.tone(880, 0.15, 'square', 0.05); this.tone(1320, 0.2, 'sine', 0.1, 0.06); }
  pop() { this.tone(400, 0.12, 'sine', 0.2, 0, 2.5); }
  jump(k = 1) { this.tone(300 * k, 0.15, 'sine', 0.06, 0, 1.8); }
  boing(s = 1) { this.tone(140, 0.35, 'sine', 0.18 * s + 0.05, 0, 3.5); }
  whistle() { this.tone(1400, 0.18, 'sine', 0.12, 0, 1.3); this.tone(1800, 0.3, 'sine', 0.12, 0.2, 0.75); }
  chirp(pitch, dist = 10) {
    const v = Math.max(0.01, 0.12 * (1 - dist / 35));
    this.tone(pitch, 0.12, 'triangle', v, 0, 1.6);
    this.tone(pitch * 1.25, 0.1, 'triangle', v * 0.8, 0.13, 0.7);
  }
  honk() { this.tone(180, 0.3, 'sawtooth', 0.08, 0, 0.6); }
  crack() { this.noise(0.25, 3000, 0.3); this.tone(220, 0.2, 'square', 0.05); }
  beep() { this.tone(1046, 0.08, 'square', 0.05); this.tone(1568, 0.1, 'square', 0.05, 0.1); }
  whoosh() { this.noise(0.9, 1200, 0.25); this.tone(200, 0.9, 'sine', 0.1, 0, 4); }
  drone() { this.tone(55, 2.2, 'sawtooth', 0.08); this.tone(82.5, 2.2, 'sine', 0.1); }
  thunder() { this.noise(2.5, 300, 0.5, 0.4 + Math.random() * 1.2); }
  splash() { this.noise(0.4, 1800, 0.15); }
}
