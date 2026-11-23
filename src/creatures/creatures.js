import * as THREE from 'three';
import { RNG, ihash } from '../core/rng.js';
import { clamp, lerp, damp, dampAngle, angleDiff, TAU } from '../core/math.js';
import { mixRgb, scaleRgb } from '../core/color.js';
import { Proto, GEO, mat } from '../render/builder.js';
import { BIOMES } from '../world/biomes.js';
import { CHUNK } from '../render/chunks.js';

// ---------- procedural bodies ----------

function addEyes(p, sp, cx, cy, cz, spread = 0.18, r = 1) {
  const n = sp.eyes, es = sp.eyeSize * r;
  const iris = sp.humanEyes ? mixRgb(sp.colors.accent, [0.3, 0.5, 0.9], 0.4) : [0.05, 0.04, 0.08];
  for (let i = 0; i < n; i++) {
    const off = n === 1 ? 0 : (i / (n - 1) - 0.5) * spread * n * 0.9;
    const yo = n > 2 ? -Math.abs(off) * 0.4 + es * 0.4 : 0;
    const x = cx + off, y = cy + yo, z = cz;
    p.add(GEO.sphere, mat({ x, y, z, sx: es, sy: es * (sp.humanEyes ? 0.8 : 1), sz: es * 0.8 }), [0.98, 0.97, 0.94]);
    if (sp.humanEyes) {
      p.add(GEO.sphereLo, mat({ x, y, z: z + es * 0.6, sx: es * 0.55, sz: es * 0.3 }), iris, { glow: 0.2 });
      p.add(GEO.sphereLo, mat({ x, y, z: z + es * 0.78, sx: es * 0.28, sz: es * 0.2 }), [0.02, 0.02, 0.02]);
      p.add(GEO.dome, mat({ x, y: y + es * 0.05, z, sx: es * 1.08, sy: es * 0.75, sz: es * 0.95, rx: -0.4 }), sp.colors.body);
    } else {
      p.add(GEO.sphereLo, mat({ x, y: y + es * 0.1, z: z + es * 0.62, sx: es * 0.45, sz: es * 0.3 }), iris);
      p.add(GEO.sphereLo, mat({ x: x + es * 0.15, y: y + es * 0.3, z: z + es * 0.72, sx: es * 0.12 }), [1, 1, 1], { glow: 0.5 });
    }
  }
}

function addFace(p, sp, cx, cy, cz, r = 1) {
  if (sp.smile) {
    p.add(GEO.halfTorus, mat({ x: cx, y: cy, z: cz, rz: Math.PI, sx: 0.16 * r, sy: 0.1 * r, sz: 0.12 * r }), [0.2, 0.05, 0.1]);
  } else {
    p.add(GEO.sphereLo, mat({ x: cx, y: cy, z: cz, sx: 0.08 * r, sy: 0.04 * r, sz: 0.04 * r }), [0.2, 0.05, 0.1]);
  }
  if (sp.antenna) {
    p.add(GEO.cyl, mat({ x: cx, y: cy + 0.25 * r, z: cz - 0.2 * r, rx: -0.3, sx: 0.02, sy: 0.45 * r, sz: 0.02 }), sp.colors.body);
    p.add(GEO.sphereLo, mat({ x: cx, y: cy + 0.68 * r, z: cz - 0.07 * r, sx: 0.07 * r }), sp.colors.accent, { glow: 1 });
  }
}

const bodyColor = (sp) => (x, y, z, lx, ly, lz) => {
  const c = sp.colors;
  if (lz > 0.25 && ly < 0.2) return c.belly;
  if (sp.pattern === 1 && Math.sin(lx * 9.1) * Math.sin(ly * 7.3) * Math.sin(lz * 8.7) > 0.25) return c.accent;
  if (sp.pattern === 2 && Math.sin(ly * 11 + lx * 2) > 0.55) return c.accent;
  return c.body;
};
const bodyGlow = (sp) => (x, y, z, lx, ly, lz) => (sp.glow && sp.pattern && Math.sin(lx * 9.1) * Math.sin(ly * 7.3) * Math.sin(lz * 8.7) > 0.25 ? sp.glow : 0);

function addSpikes(p, sp, cy, len, rad) {
  if (!sp.spikes) return;
  for (let i = 0; i < 4; i++) {
    const z = (0.3 - i * 0.22) * len;
    p.add(GEO.cone, mat({ y: cy + rad * Math.cos(z / len), z, rx: -0.3, sx: 0.07, sy: 0.22, sz: 0.07 }), sp.colors.accent, { glow: sp.glow * 0.5 });
  }
}

export function buildTemplate(sp) {
  const c = sp.colors;
  const t = { legs: [], tentacles: [], segments: null };
  const body = new Proto(), head = new Proto(), eyes = new Proto();
  switch (sp.archetype) {
    case 'blob': {
      body.add(GEO.sphere, mat({ y: 0.5, sx: 0.6, sy: 0.5, sz: 0.65 }), bodyColor(sp), { glow: bodyGlow(sp) });
      addSpikes(body, sp, 0.5, 1, 0.5);
      addEyes(eyes, sp, 0, 0.12, 0.42, 0.18);
      addFace(head, sp, 0, -0.08, 0.5);
      t.headPivot = [0, 0.6, 0.08];
      t.height = 1.1;
      break;
    }
    case 'quad': {
      body.add(GEO.sphere, mat({ y: 0.85, sx: 0.4, sy: 0.38, sz: 0.72 }), bodyColor(sp), { glow: bodyGlow(sp) });
      body.add(GEO.cone, mat({ y: 0.95, z: -0.6, rx: -2.1, sx: 0.09, sy: 0.6, sz: 0.09 }), c.accent);
      addSpikes(body, sp, 0.85, 1.2, 0.38);
      head.add(GEO.sphere, mat({ sx: 0.32, sy: 0.3, sz: 0.34 }), c.body);
      head.add(GEO.sphere, mat({ y: -0.08, z: 0.26, sx: 0.17, sy: 0.13, sz: 0.16 }), c.belly);
      head.add(GEO.cone, mat({ x: 0.2, y: 0.22, z: -0.05, rz: -0.4, sx: 0.07, sy: 0.3, sz: 0.07 }), c.accent);
      head.add(GEO.cone, mat({ x: -0.2, y: 0.22, z: -0.05, rz: 0.4, sx: 0.07, sy: 0.3, sz: 0.07 }), c.accent);
      addEyes(eyes, sp, 0, 0.07, 0.24, 0.12, 0.8);
      addFace(head, sp, 0, -0.12, 0.38, 0.6);
      t.headPivot = [0, 1.12, 0.66];
      for (const [x, z] of [[0.24, 0.42], [-0.24, 0.42], [0.24, -0.42], [-0.24, -0.42]]) {
        const leg = new Proto();
        leg.add(GEO.cyl, mat({ y: -0.78, sx: 0.08, sy: 0.78, sz: 0.08 }), scaleRgb(c.body, 0.8));
        leg.add(GEO.sphereLo, mat({ y: -0.76, z: 0.04, sx: 0.11, sy: 0.07, sz: 0.14 }), c.accent);
        t.legs.push({ proto: leg, pivot: [x, 0.8, z], phase: (x > 0) === (z > 0) ? 0 : Math.PI });
      }
      t.height = 1.4;
      break;
    }
    case 'strider': {
      body.add(GEO.sphere, mat({ y: 1.95, sx: 0.45, sy: 0.38, sz: 0.48 }), bodyColor(sp), { glow: bodyGlow(sp) });
      addSpikes(body, sp, 1.95, 1, 0.38);
      addEyes(eyes, sp, 0, 0.06, 0.36, 0.16, 0.9);
      addFace(head, sp, 0, -0.14, 0.42, 0.7);
      t.headPivot = [0, 1.95, 0.05];
      const n = sp.legs;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + 0.4;
        const leg = new Proto();
        const splay = 0.28;
        leg.add(GEO.cyl, mat({ y: -1.85, sx: 0.045, sy: 1.9, sz: 0.045 }), scaleRgb(c.accent, 0.85));
        leg.add(GEO.sphereLo, mat({ y: -1.85, sx: 0.1, sy: 0.05, sz: 0.1 }), c.body);
        t.legs.push({ proto: leg, pivot: [Math.sin(a) * 0.2, 1.85, Math.cos(a) * 0.2], phase: i % 2 ? Math.PI : 0, splayX: Math.cos(a) * splay, splayZ: -Math.sin(a) * splay });
      }
      t.height = 2.4;
      break;
    }
    case 'floater': {
      body.add(GEO.dome, mat({ sx: 0.75, sy: 0.75, sz: 0.75 }), (x, y, z, lx, ly) => (ly < 0.3 ? c.accent : c.body), { glow: (x, y, z, lx, ly) => (ly < 0.3 ? 0.6 : 0.15) + sp.glow * 0.3 });
      body.add(GEO.disc, mat({ rx: Math.PI, sx: 0.74, sz: 0.74 }), scaleRgb(c.accent, 0.7), { glow: 0.4 });
      addEyes(eyes, sp, 0, 0.0, 0.52, 0.16);
      addFace(head, sp, 0, -0.14, 0.62, 0.6);
      t.headPivot = [0, 0.32, 0.0];
      const n = sp.tentacles;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const tp = new Proto();
        const len = 1.1 + (i % 3) * 0.35;
        tp.add(GEO.cone, mat({ rx: Math.PI, sx: 0.06, sy: len, sz: 0.06 }), c.accent, { glow: 0.5 });
        t.tentacles.push({ proto: tp, pivot: [Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5], phase: i * 1.3 });
      }
      t.height = 1;
      break;
    }
    case 'worm': {
      head.add(GEO.sphere, mat({ sx: 0.4, sy: 0.36, sz: 0.42 }), bodyColor(sp), { glow: bodyGlow(sp) });
      addEyes(eyes, sp, 0, 0.12, 0.3, 0.14, 0.9);
      addFace(head, sp, 0, -0.08, 0.4, 0.7);
      t.headPivot = [0, 0.38, 0];
      const a = new Proto(), b = new Proto();
      a.add(GEO.sphere, mat({}), bodyColor(sp), { glow: bodyGlow(sp) });
      b.add(GEO.sphere, mat({}), c.accent, { glow: sp.glow * 0.5 });
      if (sp.spikes) { a.add(GEO.cone, mat({ y: 0.8, sx: 0.18, sy: 0.5, sz: 0.18 }), c.accent); }
      t.segments = [a.toGeometry(), b.toGeometry()];
      t.height = 0.8;
      break;
    }
  }
  t.body = body.vcount ? body.toGeometry() : null;
  t.head = head.toGeometry();
  t.eyes = eyes.toGeometry();
  for (const l of t.legs) l.geo = l.proto.toGeometry();
  for (const l of t.tentacles) l.geo = l.proto.toGeometry();
  return t;
}

// ---------- individual creature ----------

let NEXT_ID = 1;

export class Creature {
  constructor(sp, tpl, material, x, z, home, rng) {
    this.id = NEXT_ID++;
    this.sp = sp;
    this.home = home; // chunk key or null
    this.homeX = x; this.homeZ = z;
    this.group = new THREE.Group();
    const s = sp.size;
    this.root = new THREE.Group();
    this.root.scale.setScalar(s);
    this.group.add(this.root);
    const mk = (g) => { const m = new THREE.Mesh(g, material); m.castShadow = true; return m; };
    if (tpl.body) { this.body = mk(tpl.body); this.root.add(this.body); }
    this.head = new THREE.Group();
    this.head.position.fromArray(tpl.headPivot);
    this.head.add(mk(tpl.head));
    this.eyes = mk(tpl.eyes);
    this.head.add(this.eyes);
    this.root.add(this.head);
    this.legs = tpl.legs.map((l) => {
      const m = mk(l.geo);
      m.position.fromArray(l.pivot);
      m.userData = l;
      if (l.splayX) { m.rotation.z = l.splayX; }
      this.root.add(m);
      return m;
    });
    this.tentacles = tpl.tentacles.map((l) => {
      const m = mk(l.geo);
      m.position.fromArray(l.pivot);
      m.userData = l;
      this.root.add(m);
      return m;
    });
    this.segments = [];
    if (tpl.segments) {
      for (let i = 0; i < sp.segments; i++) {
        const m = mk(tpl.segments[i % 2]);
        const r = (0.34 - i * (0.2 / sp.segments)) * s;
        m.scale.setScalar(r);
        this.segments.push({ mesh: m, r, x: x, z: z - (i + 1) * 0.5 * s, y: 0 });
        this.group.add(m);
      }
    }
    this.height = tpl.height * s;
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = rng.range(0, TAU);
    this.speed = 0;
    this.mode = 'wandering';
    this.target = null;
    this.decideT = rng.range(0, 1.5);
    this.modeT = 0;
    this.phase = rng.range(0, TAU);
    this.needs = { hunger: rng.range(0.1, 0.6), thirst: rng.range(0.1, 0.6), energy: rng.range(0.5, 1) };
    this.friendT = 0;
    this.cooldown = 0;
    this.blinkT = rng.range(1, 5);
    this.rng = rng;
    this.lookYaw = 0;
    this.chirpT = rng.range(4, 20);
    this.visible = true;
    this.hop = 0;
  }

  dispose(parent) {
    parent.remove(this.group);
    for (const s of this.segments) parent.remove(s.mesh);
  }
}

// ---------- manager / AI ----------

export class CreatureManager {
  constructor(world) {
    this.world = world;
    this.cfg = world.cfg;
    this.group = new THREE.Group();
    this.group.name = 'creatures';
    this.material = world.materials.world;
    this.templates = new Map();
    this.list = [];
    this.spawned = new Set();
    this.radius = 5;
    this.cap = Math.round(25 + 45 * this.cfg.population);
    this.scanT = 0;
    this.logT = 0;
    this.bySpecies = new Map(world.species.map((s) => [s.id, s]));
    this.speciesByBiome = BIOMES.map((b, i) => world.species.filter((s) => s.biome === i));
  }

  template(sp) {
    let t = this.templates.get(sp.id);
    if (!t) { t = buildTemplate(sp); this.templates.set(sp.id, t); }
    return t;
  }

  spawn(sp, x, z, home, rng, opts = {}) {
    const c = new Creature(sp, this.template(sp), this.material, x, z, home, rng);
    c.pos.y = this.world.chunks.heightAt(x, z);
    if (opts.friend) c.friendT = opts.friend;
    if (opts.unique) c.unique = true;
    this.group.add(c.group);
    for (const s of c.segments) this.group.add(s.mesh);
    this.list.push(c);
    return c;
  }

  spawnChunk(chunk) {
    const seed = this.cfg.seedInt;
    const rng = new RNG(ihash(chunk.cx, chunk.cz, seed ^ 0xc4ea));
    const ccx = chunk.x0 + CHUNK / 2, ccz = chunk.z0 + CHUNK / 2;
    const dom = chunk.dom[Math.floor(chunk.dom.length / 2)];
    const expected = 0.22 * this.cfg.population * BIOMES[dom].creatureDensity;
    const groups = Math.floor(expected + rng.next());
    for (let g = 0; g < groups; g++) {
      const options = this.speciesByBiome[dom];
      const sp = options[rng.int(0, options.length - 1)];
      const n = rng.int(1, sp.herd);
      const gx = ccx + rng.range(-16, 16), gz = ccz + rng.range(-16, 16);
      for (let i = 0; i < n; i++) {
        if (this.list.length >= this.cap) return;
        const x = gx + rng.range(-5, 5), z = gz + rng.range(-5, 5);
        const h = this.world.chunks.heightAt(x, z);
        if (h < 0.3 && !sp.swims) continue;
        if (Math.hypot(x, z) > this.cfg.radius * 0.85) continue;
        this.spawn(sp, x, z, chunk.key, new RNG(rng.int(1, 1e9)));
      }
    }
  }

  /** Stream creatures with the chunks near the player. */
  stream(px, pz) {
    const chunks = this.world.chunks;
    const fx = px / CHUNK - 0.5, fz = pz / CHUNK - 0.5;
    for (const c of chunks.chunks.values()) {
      const d = Math.hypot(c.cx - fx, c.cz - fz);
      if (d <= this.radius && !this.spawned.has(c.key)) {
        this.spawned.add(c.key);
        this.spawnChunk(c);
      }
    }
    for (const key of this.spawned) {
      const c = chunks.chunks.get(key);
      const far = !c || Math.hypot(c.cx - fx, c.cz - fz) > this.radius + 1.5;
      if (far) {
        this.spawned.delete(key);
        for (let i = this.list.length - 1; i >= 0; i--) {
          const cr = this.list[i];
          if (cr.home === key && !(cr.friendT > 0) && !cr.unique) {
            cr.dispose(this.group);
            this.list.splice(i, 1);
          }
        }
      }
    }
  }

  findWater(c) {
    const T = this.world.chunks;
    let best = null, bd = 1e9;
    for (const r of [8, 18, 32, 50]) {
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * TAU + r;
        const x = c.pos.x + Math.cos(a) * r, z = c.pos.z + Math.sin(a) * r;
        if (T.heightAt(x, z) < -0.2) {
          const d = r;
          if (d < bd) { bd = d; best = { x, z }; }
        }
      }
      if (best) return best;
    }
    return null;
  }

  decide(c, ctx) {
    const sp = c.sp, P = ctx.player.pos;
    const dx = P.x - c.pos.x, dz = P.z - c.pos.z;
    const d = Math.hypot(dx, dz);
    const fx = ctx.effects.fearMul;
    const sprintK = ctx.player.sprinting ? 1.7 : 1;
    const fearR = (sp.temper === 'shy' ? 13 : sp.temper === 'calm' ? 4.5 : sp.temper === 'playful' ? 5 : 7) * fx * sprintK;
    const rng = c.rng;
    const isNight = ctx.night > 0.5;
    const dusk = (ctx.hour > 5.2 && ctx.hour < 7.2) || (ctx.hour > 17.8 && ctx.hour < 20);
    const set = (mode, target = null, time = rng.range(2, 5)) => { c.mode = mode; c.target = target; c.modeT = time; };
    c.decideT = rng.range(0.6, 1.4);

    if (c.friendT > 0) return set('following', null, 2);
    if (sp.temper === 'grumpy' && d < 13 && c.cooldown <= 0 && !ctx.player.inWater) return set('charging', null, 4);
    if (sp.temper !== 'curious' && sp.temper !== 'grumpy' && d < fearR) {
      const a = Math.atan2(-dx, -dz) + rng.range(-0.6, 0.6);
      return set('fleeing', { x: c.pos.x + Math.sin(a) * 25, z: c.pos.z + Math.cos(a) * 25 }, rng.range(2.5, 4));
    }
    if (c.mode === 'sleeping' && c.needs.energy < 0.95 && c.modeT > 0) return;
    const active = sp.activity === 'diurnal' ? !isNight : sp.activity === 'nocturnal' ? isNight : (dusk || !isNight);
    if ((!active && c.needs.energy < 0.8) || c.needs.energy < 0.12) return set('sleeping', null, rng.range(10, 25));
    if (ctx.raining && rng.chance(0.5)) {
      const mates = this.herdCenter(c);
      return set('sheltering', mates || { x: c.pos.x, z: c.pos.z }, rng.range(4, 8));
    }
    if (c.needs.thirst > 0.62) {
      const w = this.findWater(c);
      if (w) return set('drinking', w, 12);
    }
    if (c.needs.hunger > 0.55) {
      if (sp.diet === 'basker' && !isNight) return set('basking', null, rng.range(5, 9));
      const f = this.world.chunks.findFood(c.pos.x, c.pos.z, sp.diet === 'crystal' ? 'crystal' : 'plant', 40);
      if (f) return set('grazing', { x: f.x + rng.range(-0.8, 0.8), z: f.z + rng.range(-0.8, 0.8) }, 12);
    }
    const curiousChance = sp.temper === 'curious' ? 0.85 : sp.temper === 'playful' ? 0.4 : sp.temper === 'calm' ? 0.15 : 0;
    if (d < 22 && rng.chance(Math.min(1, curiousChance + ctx.effects.curiousBonus))) return set('curious', null, rng.range(3, 6));
    if (sp.sings && dusk && rng.chance(0.4)) return set('singing', null, rng.range(3, 6));
    if (sp.temper === 'playful' && rng.chance(0.3)) {
      const other = this.nearestOther(c, 20);
      if (other) { c.chase = other; return set('playing', null, rng.range(3, 6)); }
    }
    if (sp.herd > 1) {
      const hc = this.herdCenter(c);
      if (hc && Math.hypot(hc.x - c.pos.x, hc.z - c.pos.z) > 9) return set('herding', hc, 5);
    }
    if (c.mode === 'wandering' && c.target && c.modeT > 0) return;
    const a = rng.range(0, TAU), r = rng.range(4, 16);
    let tx = c.homeX + Math.cos(a) * r * 1.5, tz = c.homeZ + Math.sin(a) * r * 1.5;
    if (Math.hypot(tx - c.pos.x, tz - c.pos.z) > 30) { tx = c.pos.x + Math.cos(a) * r; tz = c.pos.z + Math.sin(a) * r; }
    set('wandering', { x: tx, z: tz }, rng.range(4, 9));
  }

  herdCenter(c) {
    let x = 0, z = 0, n = 0;
    for (const o of this.list) {
      if (o === c || o.sp !== c.sp) continue;
      if (Math.abs(o.pos.x - c.pos.x) > 40 || Math.abs(o.pos.z - c.pos.z) > 40) continue;
      x += o.pos.x; z += o.pos.z; n++;
    }
    return n ? { x: x / n, z: z / n } : null;
  }

  nearestOther(c, maxD) {
    let best = null, bd = maxD;
    for (const o of this.list) {
      if (o === c) continue;
      const d = Math.hypot(o.pos.x - c.pos.x, o.pos.z - c.pos.z);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  /** The player whistled: everyone in earshot reacts according to temperament. */
  whistle(px, pz, radius) {
    const out = [];
    for (const c of this.list) {
      const d = Math.hypot(c.pos.x - px, c.pos.z - pz);
      if (d > radius) continue;
      const sp = c.sp;
      if (c.friendT > 0) continue;
      if (c.mode === 'sleeping' && Math.random() < 0.5) continue;
      if (sp.temper === 'shy') {
        const a = Math.atan2(c.pos.x - px, c.pos.z - pz);
        c.mode = 'fleeing'; c.target = { x: c.pos.x + Math.sin(a) * 30, z: c.pos.z + Math.cos(a) * 30 }; c.modeT = 4;
      } else if (sp.temper === 'grumpy') {
        c.mode = 'charging'; c.modeT = 4; c.cooldown = 0;
      } else {
        c.mode = 'curious'; c.modeT = 6; c.target = null;
      }
      c.decideT = c.modeT;
      out.push(c);
    }
    return out;
  }

  update(dt, ctx) {
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = 0.5; this.stream(ctx.player.pos.x, ctx.player.pos.z); }
    const nm = ctx.effects.needMul;
    const P = ctx.player.pos;
    for (const c of this.list) {
      const dP = Math.hypot(P.x - c.pos.x, P.z - c.pos.z);
      // far creatures tick slowly and are hidden
      const far = dP > 150;
      c.group.visible = !far;
      for (const s of c.segments) s.mesh.visible = !far;
      if (far) { c.skip = (c.skip || 0) + dt; if (c.skip < 0.5) continue; }
      const step = far ? c.skip : dt;
      c.skip = 0;
      this.tick(c, step, ctx, dP, nm);
    }
    // keep followers from vanishing: re-home them near the player
    for (const c of this.list) if (c.friendT > 0) { c.homeX = P.x; c.homeZ = P.z; }
  }

  tick(c, dt, ctx, dP, nm) {
    const sp = c.sp, n = c.needs;
    n.hunger = clamp(n.hunger + dt * 0.011 * nm, 0, 1);
    n.thirst = clamp(n.thirst + dt * 0.013 * nm, 0, 1);
    n.energy = clamp(n.energy + (c.mode === 'sleeping' ? dt * 0.05 : -dt * 0.006 * nm), 0, 1);
    c.friendT = Math.max(0, c.friendT - dt);
    c.cooldown -= dt;
    c.modeT -= dt;
    c.decideT -= dt;
    if (c.decideT <= 0 || (c.modeT <= 0 && c.mode !== 'wandering')) this.decide(c, ctx);

    const P = ctx.player.pos;
    let tx = null, tz = null, spd = 0;
    const walk = sp.speed, run = sp.runSpeed;
    switch (c.mode) {
      case 'wandering': case 'herding':
        if (c.target) { tx = c.target.x; tz = c.target.z; spd = walk; }
        if (c.target && Math.hypot(tx - c.pos.x, tz - c.pos.z) < 1.5) { c.target = null; spd = 0; }
        break;
      case 'fleeing':
        tx = c.target.x; tz = c.target.z; spd = run;
        break;
      case 'grazing': case 'drinking': {
        const d = Math.hypot(c.target.x - c.pos.x, c.target.z - c.pos.z);
        const at = c.mode === 'drinking' ? this.world.chunks.heightAt(c.pos.x, c.pos.z) < 0.6 : d < 1.6;
        if (!at) { tx = c.target.x; tz = c.target.z; spd = walk * 1.2; }
        else {
          if (c.mode === 'drinking') n.thirst = Math.max(0, n.thirst - dt * 0.2);
          else n.hunger = Math.max(0, n.hunger - dt * 0.15);
          if ((c.mode === 'drinking' ? n.thirst : n.hunger) < 0.05) c.modeT = 0;
          c.busy = true;
        }
        break;
      }
      case 'basking':
        n.hunger = Math.max(0, n.hunger - dt * 0.08);
        break;
      case 'curious': {
        const d = dP;
        if (d > 4.5) { tx = P.x; tz = P.z; spd = walk * 1.3; }
        break;
      }
      case 'following': {
        if (dP > 3.5) { tx = P.x; tz = P.z; spd = Math.min(run, Math.max(walk, dP * 0.9)); }
        break;
      }
      case 'charging': {
        tx = P.x; tz = P.z; spd = run * 1.1;
        if (dP < 1.4 * sp.size + 0.6) {
          ctx.onBump?.(c);
          c.cooldown = 10;
          c.mode = 'wandering'; c.modeT = 0; c.decideT = 3; c.target = null;
        }
        break;
      }
      case 'playing': {
        const o = c.chase;
        if (o && this.list.includes(o)) { tx = o.pos.x; tz = o.pos.z; spd = run * 0.8; if (Math.hypot(tx - c.pos.x, tz - c.pos.z) < 1.5) { o.mode = 'playing'; o.chase = c; o.modeT = 3; c.mode = 'fleeing'; c.target = { x: c.pos.x + (c.pos.x - tx) * 8, z: c.pos.z + (c.pos.z - tz) * 8 }; c.modeT = 2; } }
        break;
      }
      case 'sheltering':
        if (c.target && Math.hypot(c.target.x - c.pos.x, c.target.z - c.pos.z) > 2.5) { tx = c.target.x; tz = c.target.z; spd = walk; }
        break;
      default: break;
    }
    if (c.mode !== 'grazing' && c.mode !== 'drinking') c.busy = false;

    // steering
    if (tx !== null) {
      const want = Math.atan2(tx - c.pos.x, tz - c.pos.z);
      c.heading = dampAngle(c.heading, want, 5, dt);
    }
    c.speed = damp(c.speed, spd, 4, dt);
    const R = this.cfg.radius * 0.86;
    let nx = c.pos.x + Math.sin(c.heading) * c.speed * dt;
    let nz = c.pos.z + Math.cos(c.heading) * c.speed * dt;
    const hNext = this.world.chunks.heightAt(nx, nz);
    const blocked = (!sp.swims && !sp.hover && hNext < -0.25 && c.mode !== 'following') || Math.hypot(nx, nz) > R;
    if (blocked) {
      c.heading += Math.PI * 0.6 + c.rng.range(0, 0.8);
      nx = c.pos.x; nz = c.pos.z;
      if (c.mode === 'wandering') c.target = null;
      if (Math.hypot(nx, nz) > R) c.heading = Math.atan2(-nx, -nz);
    }
    c.pos.x = nx; c.pos.z = nz;
    const ground = this.world.chunks.heightAt(nx, nz);
    let baseY = ground;
    if (sp.hover) baseY = Math.max(ground, 0) + sp.hover * (c.mode === 'sleeping' ? 0.35 : 1);
    else if (ground < 0) baseY = sp.swims ? Math.max(ground, -0.5 * c.height) : ground;
    c.pos.y = damp(c.pos.y, baseY, 10, dt);

    this.animate(c, dt, ctx, dP);
  }

  animate(c, dt, ctx, dP) {
    const sp = c.sp;
    const moving = c.speed > 0.2;
    c.phase += dt * (2 + c.speed * 2.6);
    const t = ctx.t;
    let yOff = 0, squash = 1, tilt = 0;
    const sleeping = c.mode === 'sleeping';
    if (sp.archetype === 'blob') {
      if (moving) { yOff = Math.abs(Math.sin(c.phase)) * 0.45 * sp.size; squash = 1 + Math.sin(c.phase * 2) * 0.12; }
      else squash = 1 + Math.sin(t * 2 + c.id) * 0.04;
    } else if (sp.archetype === 'floater') {
      yOff = Math.sin(t * 1.3 + c.id) * 0.3;
      for (const m of c.tentacles) { m.rotation.x = Math.sin(t * 2 + m.userData.phase) * 0.35 + c.speed * 0.08; m.rotation.z = Math.cos(t * 1.7 + m.userData.phase) * 0.25; }
    } else {
      const amp = moving ? Math.min(0.7, c.speed * 0.16) : 0;
      for (const m of c.legs) {
        m.rotation.x = Math.sin(c.phase + m.userData.phase) * amp;
        if (m.userData.splayX) m.rotation.z = m.userData.splayX;
      }
      yOff = moving ? Math.abs(Math.sin(c.phase)) * 0.06 : 0;
    }
    if (c.busy) tilt = 0.35; // head down to eat/drink
    if (c.mode === 'singing') yOff += Math.abs(Math.sin(t * 8)) * 0.1;
    if (sleeping) { squash = 0.8; yOff = -0.05; }
    if (c.mode === 'playing' || c.mode === 'curious') yOff += Math.abs(Math.sin(t * 6 + c.id)) * 0.08;
    c.group.position.set(c.pos.x, c.pos.y + yOff, c.pos.z);
    c.group.rotation.y = c.heading;
    c.root.scale.set(sp.size / Math.sqrt(squash), sp.size * squash, sp.size / Math.sqrt(squash));
    c.root.rotation.x = damp(c.root.rotation.x, tilt * 0.4, 6, dt);
    // uncanny: heads track the player
    const P = ctx.player.pos;
    let look = 0;
    if (!sleeping && dP < 18) {
      look = clamp(angleDiff(c.heading, Math.atan2(P.x - c.pos.x, P.z - c.pos.z)), -1.3, 1.3);
    }
    c.lookYaw = damp(c.lookYaw, look, 5, dt);
    c.head.rotation.y = c.lookYaw;
    c.head.rotation.x = damp(c.head.rotation.x, c.busy ? 0.5 : 0, 5, dt);
    // blinking
    c.blinkT -= dt;
    let eyeY = 1;
    if (sleeping) eyeY = 0.08;
    else if (c.blinkT < 0) { eyeY = 0.1; if (c.blinkT < -0.12) c.blinkT = c.rng.range(1.5, 6); }
    c.eyes.scale.y = damp(c.eyes.scale.y, eyeY, 30, dt);
    // worm body follows the head like a chain
    if (c.segments.length) {
      let px = c.pos.x - Math.sin(c.heading) * 0.2 * sp.size, pz = c.pos.z - Math.cos(c.heading) * 0.2 * sp.size;
      const wig = moving ? Math.sin(c.phase * 1.3) * 0.15 : 0;
      c.group.rotation.y += wig;
      const spacing = 0.42 * sp.size;
      for (let i = 0; i < c.segments.length; i++) {
        const s = c.segments[i];
        let dx = s.x - px, dz = s.z - pz;
        const l = Math.hypot(dx, dz) || 1;
        s.x = px + (dx / l) * spacing; s.z = pz + (dz / l) * spacing;
        const gy = this.world.chunks.heightAt(s.x, s.z);
        s.y = damp(s.y, Math.max(gy, sp.swims ? -0.2 : gy) + s.r * 0.9 + (moving ? Math.sin(c.phase - i * 0.8) * 0.06 : 0), 12, dt);
        s.mesh.position.set(s.x, s.y, s.z);
        px = s.x; pz = s.z;
      }
    }
    // occasional chirps nearby
    c.chirpT -= dt;
    if (c.chirpT < 0) {
      c.chirpT = c.rng.range(6, 22) / (c.mode === 'singing' ? 6 : 1);
      if (dP < 30 && !sleeping) ctx.onChirp?.(c, dP);
    }
  }

  /** Creature nearest to the camera's line of sight (for observing / info card). */
  pick(camPos, camDir, maxD = 40, maxAngle = 0.16) {
    let best = null, bs = maxAngle;
    const v = new THREE.Vector3();
    for (const c of this.list) {
      if (!c.group.visible) continue;
      v.set(c.pos.x, c.pos.y + c.height * 0.5, c.pos.z).sub(camPos);
      const d = v.length();
      if (d > maxD || d < 0.5) continue;
      const ang = Math.acos(clamp(v.dot(camDir) / d, -1, 1));
      const score = ang - Math.min(0.08, 0.6 / d);
      if (score < bs) { bs = score; best = c; }
    }
    return best;
  }

  nearest(x, z, maxD) {
    let best = null, bd = maxD;
    for (const c of this.list) {
      const d = Math.hypot(c.pos.x - x, c.pos.z - z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  disposeAll() {
    for (const c of this.list) c.dispose(this.group);
    this.list = [];
    for (const t of this.templates.values()) {
      t.body?.dispose(); t.head.dispose(); t.eyes.dispose();
      t.legs.forEach((l) => l.geo.dispose()); t.tentacles.forEach((l) => l.geo.dispose());
      t.segments?.forEach((g) => g.dispose());
    }
    this.templates.clear();
  }
}
