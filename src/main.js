import * as THREE from 'three';
import { DEFAULT_SETTINGS, GEN_KEYS, QUALITY, PRESETS, sanitizeSettings, applyPreset } from './config/settings.js';
import { normalizeSeed, randomSeedString } from './core/rng.js';
import { clamp, TAU } from './core/math.js';
import { createWorldMaterial, shared } from './render/materials.js';
import { CHUNK } from './render/chunks.js';
import { BIOMES } from './world/biomes.js';
import { BEHAVIORS } from './creatures/species.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { WorldRuntime } from './worldRuntime.js';
import { loadSave, writeSave, serializeState } from './save.js';
import { UI } from './ui/ui.js';
import { ICONS } from './ui/map.js';

THREE.ColorManagement.enabled = false;

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 3000);
    this.materials = { world: createWorldMaterial() };
    this.audio = new AudioEngine();
    this.input = new Input(this.canvas);
    this.saveData = loadSave() || { worlds: {} };
    this.settings = sanitizeSettings({ ...DEFAULT_SETTINGS, ...(this.saveData.settings || {}) });
    this.pending = { ...this.settings };
    this.player = new Player(this);
    this.scene.add(this.player.model.root);
    this.time = 0;
    this.hour = this.settings.timeOfDay;
    this.panel = null;
    this.started = false;
    this.lastDevice = 'keyboard';
    this.timers = { discover: 0, log: 0, hud: 0, mini: 0, save: 15, fog: 0, stats: 0 };
    this.showStats = false;
    this.frames = 0;
    this.fps = 60;
    this.shake = 0;
    this.nearWall = 0;
    this.curBiome = 0;
    this.ui = new UI(this);
    this.minimapCtx = document.getElementById('minimap').getContext('2d');

    this.canvas.addEventListener('mousedown', () => {
      this.audio.init();
      if (this.started && !this.panel) this.input.requestLock();
    });
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('beforeunload', () => this.save());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.save(); });
    this.input.onPad = (on, id) => this.ui.toast(on ? `🎮 Controller connected: ${id.split('(')[0].trim()}` : '🎮 Controller disconnected');
    window.__froopy = this; // debug / test hook
  }

  randomSeed() { return randomSeedString(); }

  boot() {
    this.createWorld(this.settings);
    const has = !!this.saveData.worlds?.[this.settings.seed]?.state?.player;
    this.ui.showStart(this.settings.seed, has);
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  resize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  // ---------- world lifecycle ----------
  createWorld(settings, { skipSave = false } = {}) {
    if (this.world) {
      if (!skipSave) this.save();
      this.world.dispose();
    }
    const saved = this.saveData.worlds?.[settings.seed]?.state || null;
    this.world = new WorldRuntime(this, settings, saved);
    const w = this.world, st = w.state;
    this.applyQuality();
    let p = st.player;
    if (p && Math.hypot(p.x, p.z) > w.cfg.radius - 10) p = null;
    const sx = p ? p.x : w.spawn.x, sz = p ? p.z : w.spawn.z;
    w.chunks.preload(sx, sz, 2);
    const gy = w.chunks.heightAt(sx, sz);
    this.player.place(sx, Math.max(gy, p ? p.y : gy) + 0.1, sz, p ? p.yaw : Math.atan2(-(w.spawn.x - sx), -(w.spawn.z - sz)) || 0);
    if (p) { this.player.pitch = p.pitch ?? -0.2; this.player.view = p.view === 'first' ? 'first' : 'third'; }
    this.hour = st.hour ?? settings.timeOfDay;
    w.env.setWeatherMode(settings.weather);
    w.env.onThunder = () => this.audio.thunder();
    w.restoreHatchlings();
    w.map.reveal(sx, sz, 120);
    this.curBiome = w.terrain.evaluate(sx, sz).dom;
    st.biomes.add(this.curBiome);
    this.camera.fov = this.settings.fov;
    this.camera.updateProjectionMatrix();
  }

  applyQuality() {
    const q = QUALITY[this.settings.quality];
    const w = this.world;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    if (this.renderer.shadowMap.enabled !== q.shadows) {
      this.renderer.shadowMap.enabled = q.shadows;
      this.materials.world.needsUpdate = true;
    }
    if (w) {
      w.chunks.viewRadius = q.viewRadius;
      w.chunks.setShadows(q.shadows);
      w.creatures.radius = q.creatureRadius;
      w.env.setShadows(q.shadows, q.shadowSize);
      w.env.setViewDistance(q.viewRadius * CHUNK - 24);
    }
  }

  enterFromStart(seedInput, preset, cont) {
    this.audio.init();
    const go = () => {
      this.started = true;
      this.ui.hideStart();
      this.ui.setLoading('');
      this.input.requestLock();
      const w = this.world;
      this.ui.toast(`Welcome to <b>${w.cfg.name}</b>`, true, 5000);
      setTimeout(() => this.ui.toast(`Press <span class="keycap">${this.lastDevice === 'gamepad' ? '↓' : 'H'}</span>for controls · follow the pulsing <span class="pink">?</span> on the compass`), 1400);
    };
    if (cont) return go();
    let s = { ...this.settings, seed: normalizeSeed(seedInput) };
    if (preset) s = applyPreset(s, preset);
    s = sanitizeSettings(s);
    const needRegen = GEN_KEYS.some((k) => s[k] !== this.settings[k]);
    this.settings = s;
    this.pending = { ...s };
    if (needRegen) {
      this.ui.setLoading('Folding a new pocket world…');
      setTimeout(() => { this.createWorld(s); go(); }, 30);
    } else {
      this.world.env.setWeatherMode(s.weather);
      this.hour = s.timeOfDay;
      go();
    }
  }

  changeSetting(k, v) {
    this.pending[k] = v;
    if (GEN_KEYS.includes(k)) return;
    this.settings = sanitizeSettings({ ...this.settings, [k]: v });
    this.pending[k] = this.settings[k];
    if (k === 'timeOfDay') this.hour = this.settings.timeOfDay;
    if (k === 'weather') this.world.env.setWeatherMode(this.settings.weather);
    if (k === 'volume') this.audio.setVolume(this.settings.volume);
    if (k === 'quality') this.applyQuality();
    if (k === 'fov') { this.camera.fov = this.settings.fov; this.camera.updateProjectionMatrix(); }
  }

  applyPresetToPending(key) {
    this.pending = applyPreset(this.pending, key);
    this.regenerate(`${PRESETS[key].label} preset applied`);
  }

  regenerate(note) {
    const s = sanitizeSettings({ ...this.pending, seed: normalizeSeed(this.pending.seed) });
    this.settings = s;
    this.pending = { ...s };
    this.createWorld(s);
    this.audio.setVolume(s.volume);
    this.save();
    this.ui.syncCreator();
    this.ui.toast(`${note ? note + ' — ' : ''}Generated <b>${this.world.cfg.name}</b> from seed “${s.seed}”`, true);
  }

  resetWorld() {
    if (this.saveData.worlds) delete this.saveData.worlds[this.settings.seed];
    this.createWorld(this.settings, { skipSave: true });
    this.save();
    this.ui.syncCreator();
    this.ui.toast('World progress reset. Everything is new again.', true);
  }

  save(manual = false) {
    if (!this.world || !this.started) return false;
    const w = this.world, st = w.state, P = this.player;
    st.player = { x: P.pos.x, y: P.pos.y, z: P.pos.z, yaw: P.yaw, pitch: P.pitch, view: P.view };
    st.hour = this.hour;
    const worlds = { ...(this.saveData.worlds || {}) };
    worlds[w.cfg.seed] = { state: serializeState(st), savedAt: Date.now(), name: w.cfg.name };
    const keys = Object.keys(worlds).sort((a, b) => worlds[b].savedAt - worlds[a].savedAt);
    for (const k of keys.slice(12)) delete worlds[k];
    this.saveData = { settings: this.settings, worlds };
    const ok = writeSave(this.saveData);
    this.lastSaveAt = Date.now();
    if (manual) this.ui.toast(ok ? 'Saved ✓' : 'Could not save (storage full or blocked)');
    return ok;
  }

  teleport(x, z, yaw) {
    const w = this.world;
    w.chunks.preload(x, z, 2);
    const h = w.chunks.heightAt(x, z);
    this.player.place(x, Math.max(h, 0) + 0.5, z, yaw);
    this.player.pitch = -0.2;
    this.player.camPos.set(x - Math.sin(yaw) * -6, h + 4, z - Math.cos(yaw) * -6);
    w.map.reveal(x, z, 120);
  }

  setWaypoint(p) {
    const st = this.world.state;
    if (!p) return;
    if (st.waypoint && Math.hypot(st.waypoint.x - p.x, st.waypoint.z - p.z) < 45) { st.waypoint = null; this.ui.toast('Waypoint cleared'); return; }
    st.waypoint = { x: Math.round(p.x), z: Math.round(p.z) };
    this.ui.toast('Waypoint set — follow ◆ on the compass');
  }

  togglePanel(name) {
    if (this.panel === name) return this.closePanel();
    this.panel = name;
    this.ui.showPanel(name);
    this.input.releaseLock();
  }

  closePanel() {
    this.panel = null;
    this.ui.showPanel(null);
  }

  // ---------- gameplay ----------
  heading() { const d = this.player.camDir; return (Math.atan2(d.x, -d.z) + TAU) % TAU; }

  collect(item) {
    const w = this.world, st = w.state;
    w.chunks.removeItem(item);
    if (item.kind === 'fruit') {
      st.fruit++;
      if (!item.transient) st.picked.add(item.id);
      this.audio.pickup();
      this.ui.toast(`Picked a glowfruit ● (${st.fruit}) — feed it to a resident`);
    } else {
      st.motes.add(item.id);
      this.audio.chime();
      const n = st.motes.size;
      this.ui.toast(`Memory mote ✧ ${n}/${w.totals.motes}`);
      if (n % 3 === 0 && n / 3 <= w.memories.length) {
        this.ui.toast(`<b>Memory fragment recovered</b><br>“${w.memories[n / 3 - 1]}”`, true, 8000);
      }
    }
  }

  feed(c) {
    const st = this.world.state;
    st.fruit--;
    st.fed++;
    c.friendT = 150;
    c.needs.hunger = 0;
    c.mode = 'following';
    this.audio.chirp(c.sp.pitch, 2);
    this.audio.chirp(c.sp.pitch * 1.5, 2);
    const known = st.observed.get(c.sp.id);
    if (known && !known.has('following')) known.add('following');
    this.ui.toast(`${known ? c.sp.name : 'The resident'} gobbles the fruit and adores you ♥ It will follow you for a while.`);
  }

  observe(c) {
    const st = this.world.state, sp = c.sp;
    let set = st.observed.get(sp.id);
    if (!set) {
      set = new Set([c.mode]);
      st.observed.set(sp.id, set);
      this.audio.discover();
      this.ui.toast(`New species observed: <b>${sp.name}</b><br><span class="small">Currently ${BEHAVIORS[c.mode].toLowerCase()}. Keep watching to log more behaviours.</span>`, true);
      this.save();
    } else if (!set.has(c.mode)) {
      set.add(c.mode);
      this.audio.pickup();
      this.ui.toast(`Behaviour logged: ${sp.name} — ${BEHAVIORS[c.mode]}`);
    } else {
      this.ui.toast(`${sp.name}: ${BEHAVIORS[c.mode]} (already logged — ${set.size}/${Object.keys(BEHAVIORS).length})`);
    }
    this.audio.chirp(sp.pitch, 5);
  }

  discover(lm) {
    const st = this.world.state;
    st.discovered.add(lm.id);
    st.rumored.delete(lm.id);
    this.audio.discover();
    this.ui.toast(`${ICONS[lm.type]} Discovered: <b>${lm.name}</b><br><span class="small">${lm.lore}</span>`, true, 6500);
    this.save();
  }

  interactTarget() {
    const w = this.world, P = this.player.pos, st = w.state;
    const item = w.chunks.nearestItem(P.x, P.y + 0.6, P.z, 2.8);
    if (item && item.kind === 'fruit') return { label: 'Pick glowfruit', run: () => this.collect(item) };
    if (st.fruit > 0) {
      const c = w.creatures.nearest(P.x, P.z, 3.6);
      if (c && c.friendT <= 0) return { label: `Feed ${st.observed.has(c.sp.id) ? c.sp.name : 'the resident'} a glowfruit`, run: () => this.feed(c) };
    }
    const inst = w.landmarks.nearestInteract(P);
    if (inst) return { label: inst.interact.label, run: () => { const msg = inst.interact.fn(w); if (msg) this.ui.toast(msg, true, 5500); if (!st.discovered.has(inst.lm.id)) this.discover(inst.lm); } };
    return null;
  }

  periodic(dt) {
    const w = this.world, st = w.state, P = this.player.pos, T = this.timers;
    if (T.discover <= 0) {
      T.discover = 0.25;
      for (const lm of w.landmarkList) {
        if (st.discovered.has(lm.id)) continue;
        const r = w.landmarks.active.get(lm.id)?.discoverR ?? 30;
        if (Math.hypot(lm.x - P.x, lm.z - P.z) < r && Math.abs(lm.y - P.y) < 40) this.discover(lm);
      }
      // motes are collected by touch
      const item = w.chunks.nearestItem(P.x, P.y + 0.8, P.z, 1.9);
      if (item && item.kind === 'mote') this.collect(item);
      // biome entry
      const ev = w.terrain.evaluate(P.x, P.z);
      if (ev.dom !== this.curBiome && ev.w[ev.dom] > 0.62) {
        this.curBiome = ev.dom;
        const b = BIOMES[ev.dom];
        if (!st.biomes.has(ev.dom)) {
          st.biomes.add(ev.dom);
          this.ui.toast(`New region: <b>${b.name}</b><br><span class="small">${b.blurb}</span>`, true, 6000);
          this.audio.chord(b.chord, 1.5);
        } else this.ui.toast(`Entering ${b.name}`);
      }
    }
    if (T.fog <= 0) { T.fog = 0.5; w.map.reveal(P.x, P.z, 100); }
    if (T.log <= 0) {
      // behaviours witnessed while watching known species are logged automatically
      T.log = 0.6;
      const cam = this.camera.position, dir = this.player.camDir;
      for (const c of w.creatures.list) {
        const set = st.observed.get(c.sp.id);
        if (!set || set.has(c.mode) || !c.group.visible) continue;
        const dx = c.pos.x - cam.x, dy = c.pos.y - cam.y, dz = c.pos.z - cam.z;
        const d = Math.hypot(dx, dy, dz);
        if (d > 32 || (dx * dir.x + dy * dir.y + dz * dir.z) / d < 0.8) continue;
        set.add(c.mode);
        this.ui.toast(`Behaviour logged: ${c.sp.name} — ${BEHAVIORS[c.mode]} (${set.size}/${Object.keys(BEHAVIORS).length})`);
        break;
      }
    }
    if (T.save <= 0) { T.save = 15; this.save(); }
  }

  compassMarks() {
    const w = this.world, st = w.state, P = this.player.pos;
    const marks = [];
    const bearing = (x, z) => (Math.atan2(x - P.x, -(z - P.z)) + TAU) % TAU;
    const fmt = (d) => (d > 999 ? `${(d / 1000).toFixed(1)}k` : `${Math.round(d)}m`);
    let sig = null, sd = 1e9, rumorFirst = false;
    for (const lm of w.landmarkList) {
      const d = Math.hypot(lm.x - P.x, lm.z - P.z);
      if (st.discovered.has(lm.id)) {
        if (d < 900 && d > 8) marks.push({ icon: ICONS[lm.type], cls: 'lm', b: bearing(lm.x, lm.z), dist: fmt(d), d });
      } else {
        const rum = st.rumored.has(lm.id);
        if ((rum && !rumorFirst) || (rum === rumorFirst && d < sd)) { sig = lm; sd = d; rumorFirst = rumorFirst || rum; }
      }
    }
    marks.sort((a, b) => a.d - b.d);
    marks.length = Math.min(marks.length, 10);
    if (sig) marks.push({ icon: '?', cls: 'sig', b: bearing(sig.x, sig.z), dist: fmt(sd) });
    if (st.waypoint) marks.push({ icon: '◆', cls: 'wp', b: bearing(st.waypoint.x, st.waypoint.z), dist: fmt(Math.hypot(st.waypoint.x - P.x, st.waypoint.z - P.z)) });
    return marks;
  }

  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    try { this.update(dt); } catch (e) { console.error(e); this.ui.toast(`Error: ${e.message}`); }
    requestAnimationFrame((t) => this.frame(t));
  }

  update(dt) {
    const w = this.world, st = w.state, P = this.player;
    const inp = this.input.poll();
    this.lastDevice = inp.device;
    this.time += dt;
    shared.uTime.value = this.time;
    for (const k in this.timers) this.timers[k] -= dt;
    if (inp.stats) this.showStats = !this.showStats;
    if (inp.mute) this.ui.toast(this.audio.toggleMute() ? 'Sound muted (N)' : 'Sound on');

    if (this.started) {
      if (inp.close && this.panel) this.closePanel();
      else if (inp.help) this.togglePanel('help');
      else if (inp.journal) this.togglePanel('journal');
      else if (inp.map) this.togglePanel('map');
      else if (inp.creator) this.togglePanel('creator');
      if (this.panel === 'creator') {
        const keys = Object.keys(PRESETS);
        if (inp.padLeft || inp.padRight) {
          this.presetIdx = ((this.presetIdx ?? -1) + (inp.padRight ? 1 : -1) + keys.length) % keys.length;
          this.applyPresetToPending(keys[this.presetIdx]);
        }
        if (inp.padX) { this.changeSetting('seed', this.randomSeed()); this.regenerate(); }
        if (inp.padA) this.regenerate();
      }
      if (this.panel === 'journal' && (inp.padLeft || inp.padRight)) this.ui.cycleJournal(inp.padRight ? 1 : -1);
    } else if (inp.padA || inp.interact) {
      this.enterFromStart(null, null, !!this.saveData.worlds?.[this.settings.seed]?.state?.player);
    }
    const allow = this.started && !this.panel;

    // time of day (night can be made to linger by world rules)
    if (!this.settings.timeFrozen) {
      const isNight = this.hour < 6 || this.hour > 19;
      const rate = 24 / (this.settings.dayLengthMin * 60) / (isNight ? w.cfg.effects.nightMul : 1);
      this.hour = (this.hour + dt * rate) % 24;
    }
    if (this.panel === 'creator' && this.timers.hud <= 0) this.ui.syncCreator(false);

    // player & camera
    P.update(dt, inp, w, allow);
    if (this.started) {
      P.updateCamera(dt, this.camera, w);
      if (this.shake > 0) { this.shake -= dt; this.camera.position.y += (Math.random() - 0.5) * this.shake; }
    } else {
      const a = this.time * 0.06;
      this.camera.position.set(P.pos.x + Math.cos(a) * 26, P.pos.y + 11, P.pos.z + Math.sin(a) * 26);
      this.camera.lookAt(P.pos.x, P.pos.y + 3, P.pos.z);
      this.camera.getWorldDirection(P.camDir);
    }

    if (allow) {
      if (inp.toggleView) { P.view = P.view === 'first' ? 'third' : 'first'; this.ui.toast(P.view === 'first' ? 'First-person view' : 'Third-person view'); }
      if (inp.whistle) {
        this.audio.whistle();
        const heard = w.creatures.whistle(P.pos.x, P.pos.z, 38 * w.cfg.effects.whistleMul);
        heard.slice(0, 3).forEach((c, i) => setTimeout(() => this.audio.chirp(c.sp.pitch, 8), 250 + i * 180));
        this.ui.toast(heard.length ? `You whistle. ${heard.length} resident${heard.length > 1 ? 's' : ''} react${heard.length > 1 ? '' : 's'}.` : 'You whistle. Nobody is close enough to hear.');
      }
      if (inp.observe) {
        const c = w.creatures.pick(this.camera.position, P.camDir, 45, 0.24);
        if (c) this.observe(c); else this.ui.toast('Aim the crosshair at a resident to observe it.');
      }
      const target = this.interactTarget();
      this.ui.setPrompt(target?.label);
      if (inp.interact && target) target.run();
      this.periodic(dt);
      st.distance += P.speedH * dt;
      st.playTime += dt;
    } else this.ui.setPrompt(null);

    // world simulation
    w.chunks.update(P.pos.x, P.pos.z, this.started ? 5 : 8);
    w.chunks.animateItems(this.time, P.pos.x, P.pos.z);
    w.creatures.update(dt, {
      t: this.time, hour: this.hour, night: w.env.night, raining: w.env.raining, effects: w.cfg.effects,
      player: { pos: P.pos, sprinting: P.sprinting, inWater: P.inWater },
      onBump: (c) => {
        const dx = P.pos.x - c.pos.x, dz = P.pos.z - c.pos.z, l = Math.hypot(dx, dz) || 1;
        P.bump.set((dx / l) * 9, 6, (dz / l) * 9);
        this.audio.honk();
        this.ui.toast(`${st.observed.has(c.sp.id) ? c.sp.name : 'A grumpy resident'} bonks you!`);
        const set = st.observed.get(c.sp.id); if (set && !set.has('charging')) set.add('charging');
      },
      onChirp: (c, d) => this.audio.chirp(c.sp.pitch, d),
    });
    w.landmarks.update(dt, w);
    w.env.update(dt, this.hour, P.pos, this.camera, this.curBiome, this.time);
    const wm = w.chunks.waterMat.uniforms;
    wm.uTime.value = this.time;
    wm.uSky.value.copy(w.env.skyMat.uniforms.uHorizon.value);
    wm.uDay.value = w.env.dayFactor;
    wm.uCam.value.copy(this.camera.position);
    wm.uHue.value = w.cfg.palette.hue || 0;
    wm.uSat.value = Math.min(1.3, w.cfg.palette.sat ?? 1);
    wm.uLake.value.setRGB(0.18, 0.42, 0.62).lerp(w.env.skyMat.uniforms.uTop.value, 0.3);
    wm.uFlowMul.value = w.cfg.effects.riverMul;
    if (!w.map.done) w.map.step(3);
    this.audio.ambience(BIOMES[this.curBiome].chord, w.env.night, w.env.state.wind, w.env.state.precip);

    // HUD
    if (this.started) {
      this.ui.updateCompass(this.heading(), this.compassMarks());
      if (this.timers.hud <= 0) { this.timers.hud = 0.2; this.ui.updateHUD(w, this.hour, this.curBiome); }
      if (this.timers.mini <= 0) { this.timers.mini = 0.05; w.map.drawMini(this.minimapCtx, P.pos.x, P.pos.z, this.heading(), w.creatures.list); }
      const look = allow ? w.creatures.pick(this.camera.position, P.camDir, 32, 0.12) : null;
      this.ui.infoCard(look, w);
      this.ui.crosshair(look ? 'target' : '');
      this.nearWall = Math.max(0, this.nearWall - dt);
      this.ui.wallWarning(Math.hypot(P.pos.x, P.pos.z) > w.cfg.radius - 30);
      if (this.panel === 'map') this.ui.drawMap(w, P.pos.x, P.pos.z, this.heading());
    }

    this.renderer.render(this.scene, this.camera);

    this.frames++;
    if (this.timers.stats <= 0) {
      this.fps = this.frames / (0.5 - this.timers.stats);
      this.frames = 0;
      this.timers.stats = 0.5;
      if (this.showStats) {
        const cs = w.chunks.stats(), ri = this.renderer.info.render;
        this.ui.stats(true, `FPS ${this.fps.toFixed(0)}\nchunks ${cs.chunks} (+${cs.pending} queued, ${cs.buildMs.toFixed(1)} ms/chunk)\nterrain+flora tris ${(cs.tris / 1000).toFixed(0)}k\ndraw calls ${ri.calls} · tris drawn ${(ri.triangles / 1000).toFixed(0)}k\ncreatures ${w.creatures.list.length}/${w.creatures.cap}\nlandmarks active ${w.landmarks.active.size}/${w.landmarkList.length}\npos ${P.pos.x.toFixed(0)}, ${P.pos.y.toFixed(1)}, ${P.pos.z.toFixed(0)}\nquality ${this.settings.quality}`);
      } else this.ui.stats(false);
    }
  }
}

const game = new Game();
game.boot();
