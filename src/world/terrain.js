import { createNoise2D, fbm, ridged } from '../core/noise.js';
import { mulberry32, hash01 } from '../core/rng.js';
import { clamp, lerp, smoothstep } from '../core/math.js';
import { applyPalette, hslToRgb } from '../core/color.js';
import { BIOMES, BIOME_INDEX, NB } from './biomes.js';

export const WATER_LEVEL = 0;
const GLITCH = BIOME_INDEX.glitch;
const FLESH = BIOME_INDEX.flesh;
const CRYSTAL = BIOME_INDEX.crystal;
const DESERT = BIOME_INDEX.desert;
const MEADOW = BIOME_INDEX.meadow;
const TUNDRA = BIOME_INDEX.tundra;
const SWAMP = BIOME_INDEX.swamp;
const MUSHROOM = BIOME_INDEX.mushroom;

/**
 * Deterministic analytic terrain: everything (height, biome, rivers, colour) is a pure
 * function of (seed, settings, x, z). Chunks, creatures, the map and the player all query it.
 */
export class Terrain {
  constructor(cfg) {
    this.cfg = cfg;
    this.seed = cfg.seedInt;
    this.R = cfg.radius;
    this.v = cfg.variety;
    const r = mulberry32(cfg.seedInt ^ 0x7e11a1);
    const N = () => createNoise2D(r);
    this.n = { base: N(), detail: N(), mount: N(), ridge: N(), river: N(), warpA: N(), warpB: N(), bio: N(), patch: N(), vein: N(), dune: N(), bwA: N(), bwB: N() };
    // higher variety -> smaller biome cells -> more variety per walk
    this.cell = clamp(340 - this.v * 85, 170, 330);
    this.blend = 16;
    this.riverWidth = 0.034;
    this.cells = new Map();
    this.res = { h: 0, dom: 0, w: new Float32Array(NB), river: 0, rs: 9, valley: 0 };
    this.colors = BIOMES.map((b) => ({
      ground: applyPalette(b.ground, cfg.palette),
      ground2: applyPalette(b.ground2, cfg.palette),
      rock: applyPalette(b.rock, cfg.palette),
      accent: applyPalette(b.accent, cfg.palette),
    }));
    this.beach = applyPalette([0.96, 0.86, 0.78], cfg.palette);
    this.peak = applyPalette([1.0, 0.93, 0.98], cfg.palette);
    this._ds = new Float32Array(9);
    this._bs = new Int8Array(9);
    this.flat = null;
  }

  /** True when (x,z) is on a landmark's plateau (keeps flora and spawns clear). */
  nearLandmark(x, z, pad = 2) {
    if (!this.flat) return false;
    const arr = this.flat.get((Math.floor(x / 128) + 512) * 1024 + (Math.floor(z / 128) + 512));
    if (!arr) return false;
    for (const f of arr) if (Math.hypot(x - f.x, z - f.z) < f.r + pad) return true;
    return false;
  }

  /** Landmarks get a level plateau so they sit naturally on the land. */
  setFlatten(list) {
    this.flat = new Map();
    const G = 128;
    for (const f of list) {
      const R = f.r + 12;
      for (let i = Math.floor((f.x - R) / G); i <= Math.floor((f.x + R) / G); i++) {
        for (let j = Math.floor((f.z - R) / G); j <= Math.floor((f.z + R) / G); j++) {
          const k = (i + 512) * 1024 + (j + 512);
          if (!this.flat.has(k)) this.flat.set(k, []);
          this.flat.get(k).push(f);
        }
      }
    }
  }

  /** Voronoi cell: jittered feature point + assigned biome. */
  cellInfo(ci, cj) {
    const key = (ci + 32768) * 65536 + (cj + 32768);
    let c = this.cells.get(key);
    if (c) return c;
    const s = this.seed;
    const fx = (ci + 0.15 + 0.7 * hash01(ci, cj, s ^ 0x1111)) * this.cell;
    const fz = (cj + 0.15 + 0.7 * hash01(ci, cj, s ^ 0x2222)) * this.cell;
    const dr = Math.hypot(fx, fz);
    let biome = MEADOW;
    if (dr > this.cell * 0.75) {
      const d = dr / this.R;
      const w = this.cfg.weirdness;
      const t = this.n.bio(fx / 1700, fz / 1700);
      const m = this.n.bio(fx / 1300 + 50, fz / 1300 - 50);
      const wt = new Float32Array(NB);
      wt[MEADOW] = 1;
      wt[MUSHROOM] = 1 + Math.max(0, m);
      wt[CRYSTAL] = 0.5 + 0.7 * w;
      wt[FLESH] = 1.5 * w * smoothstep(0.12, 0.45, d);
      wt[DESERT] = (1 + 2 * Math.max(0, t)) * (t < -0.2 ? 0.15 : 1) * (m > 0.35 ? 0.3 : 1);
      wt[TUNDRA] = (1 + 2 * Math.max(0, -t)) * (t > 0.2 ? 0.15 : 1);
      wt[SWAMP] = 0.8 * (1 + 2 * Math.max(0, m));
      wt[GLITCH] = 1.3 * w * smoothstep(0.3, 0.7, d);
      let tot = 0;
      for (let i = 0; i < NB; i++) tot += wt[i];
      let pick = hash01(ci, cj, s ^ 0x3333) * tot;
      for (let i = 0; i < NB; i++) {
        pick -= wt[i];
        if (pick <= 0) { biome = i; break; }
      }
    }
    c = { fx, fz, biome };
    this.cells.set(key, c);
    return c;
  }

  /** Soft biome weights at a point (sum to 1). Returns dominant biome index. */
  weights(x, z, out) {
    const n = this.n;
    const wx = x + n.bwA(x / 190, z / 190) * 50;
    const wz = z + n.bwB(x / 190, z / 190) * 50;
    const cs = this.cell;
    const ci0 = Math.floor(wx / cs), cj0 = Math.floor(wz / cs);
    const ds = this._ds, bs = this._bs;
    let dmin = 1e9, k = 0;
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const c = this.cellInfo(ci0 + di, cj0 + dj);
        const dx = wx - c.fx, dz = wz - c.fz;
        const d = Math.sqrt(dx * dx + dz * dz);
        ds[k] = d; bs[k] = c.biome; k++;
        if (d < dmin) dmin = d;
      }
    }
    out.fill(0);
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      const w = Math.exp(-(ds[i] - dmin) / this.blend);
      out[bs[i]] += w;
      sum += w;
    }
    let dom = 0, best = -1;
    for (let i = 0; i < NB; i++) {
      out[i] /= sum;
      if (out[i] > best) { best = out[i]; dom = i; }
    }
    return dom;
  }

  biomeHeight(b, x, z) {
    const n = this.n, v = this.v;
    switch (b) {
      case MEADOW: return 2.5 + fbm(n.detail, x / 170, z / 170, 3) * 6 * v;
      case MUSHROOM: return 4 + fbm(n.detail, x / 120, z / 120, 3) * 9 * v;
      case CRYSTAL: return 3 + ridged(n.ridge, x / 115, z / 115, 3) * 30 * v;
      case FLESH: {
        const b1 = 1 - Math.abs(n.vein(x / 80, z / 80));
        return 5 + b1 * b1 * b1 * 20 * v + fbm(n.detail, x / 60, z / 60, 2) * 2.5;
      }
      case DESERT: {
        const d = 0.5 + 0.5 * Math.sin(x * 0.055 + z * 0.022 + n.dune(x / 230, z / 230) * 5);
        return 2.2 + d * d * 5.5 * v + fbm(n.detail, x / 300, z / 300, 2) * 5 * v;
      }
      case TUNDRA: {
        const t = 6 + fbm(n.detail, x / 210, z / 210, 3) * 18 * v;
        const step = 4, k = t / step, f = k - Math.floor(k);
        return (Math.floor(k) + smoothstep(0.3, 0.7, f)) * step;
      }
      case SWAMP: return 0.25 + fbm(n.detail, x / 55, z / 55, 2) * 1.9 * Math.max(0.7, v);
      case GLITCH: return 5 + fbm(n.detail, x / 150, z / 150, 3) * 15 * v;
      default: return 2;
    }
  }

  riverValue(x, z) {
    const n = this.n;
    const wx = x + n.warpA(x / 300 + 7, z / 300) * 80;
    const wz = z + n.warpB(x / 300, z / 300 + 7) * 80;
    return fbm(n.river, wx / 700, wz / 700, 3);
  }

  /** Full evaluation. Returns a shared result object (copy what you need). */
  evaluate(x, z, res = this.res) {
    const w = res.w;
    const dom = this.weights(x, z, w);
    const n = this.n, v = this.v;
    const base = fbm(n.base, x / 420, z / 420, 4) * 9 * v;
    const mm = smoothstep(0.15, 0.65, fbm(n.mount, x / 1100 + 3.1, z / 1100 - 1.7, 2));
    let ridge = 0;
    if (mm > 0) {
      const rr = 1 - Math.abs(fbm(n.ridge, x / 260, z / 260, 4));
      ridge = rr * rr * rr * 70 * mm * v * (1 - w[SWAMP] * 0.8);
    }
    let hb = 0;
    for (let b = 0; b < NB; b++) if (w[b] > 0.002) hb += w[b] * this.biomeHeight(b, x, z);
    let h = 3 + base + hb + ridge;
    const wg = w[GLITCH];
    if (wg > 0.05) {
      const q = Math.round(h / 3.5) * 3.5;
      h = lerp(h, q, smoothstep(0.35, 0.85, wg));
    }
    // rainbow rivers: carve along a noise isoline, with a wide valley and a deep channel
    const r = this.riverValue(x, z);
    const rw = this.riverWidth;
    const ar = Math.abs(r);
    const dc = Math.sqrt(x * x + z * z) / this.R;
    const rimFade = 1 - smoothstep(0.8, 0.9, dc);
    const valley = (1 - smoothstep(rw * 1.2, rw * 6, ar)) * rimFade;
    const bank = (1 - smoothstep(rw * 0.45, rw * 1.15, ar)) * rimFade;
    if (valley > 0) {
      const vv = valley * valley * (3 - 2 * valley);
      h = lerp(h, Math.min(h, 1.3 + base * 0.12), vv);
    }
    if (bank > 0) h = lerp(h, -2.6, bank);
    // the pocket's rim: land curls upward toward the containment wall
    if (dc > 0.86) {
      const t = smoothstep(0.86, 1.02, dc);
      h += t * t * 60 + t * fbm(n.detail, x / 40, z / 40, 2) * 6;
    }
    if (this.flat) {
      const arr = this.flat.get((Math.floor(x / 128) + 512) * 1024 + (Math.floor(z / 128) + 512));
      if (arr) {
        for (const f of arr) {
          const d = Math.hypot(x - f.x, z - f.z);
          if (d < f.r + 12) {
            const t = smoothstep(f.r + 12, f.r, d);
            h = lerp(h, f.y, t);
          }
        }
      }
    }
    res.h = h;
    res.dom = dom;
    res.river = bank;
    res.valley = valley;
    res.rs = clamp(r / rw, -4, 4);
    return res;
  }

  height(x, z) {
    return this.evaluate(x, z).h;
  }

  /** Direction rivers flow at a point (perpendicular to the river-field gradient). */
  flow(x, z, out = [0, 0]) {
    const e = 2;
    const gx = this.riverValue(x + e, z) - this.riverValue(x - e, z);
    const gz = this.riverValue(x, z + e) - this.riverValue(x, z - e);
    const l = Math.hypot(gx, gz) || 1;
    out[0] = gz / l;
    out[1] = -gx / l;
    return out;
  }

  /**
   * Ground colour + glow for a vertex. `res` must be the evaluate() result at (x,z).
   * slope: 0 flat .. 1 vertical.
   */
  color(x, z, res, slope, out) {
    const n = this.n, w = res.w, h = res.h;
    let r = 0, g = 0, b = 0, glow = 0;
    const patch = smoothstep(-0.35, 0.55, n.patch(x / 38, z / 38));
    for (let i = 0; i < NB; i++) {
      const wi = w[i];
      if (wi < 0.002) continue;
      const c = this.colors[i];
      let cr = lerp(c.ground[0], c.ground2[0], patch);
      let cg = lerp(c.ground[1], c.ground2[1], patch);
      let cb = lerp(c.ground[2], c.ground2[2], patch);
      let gl = 0;
      if (i === FLESH) {
        const vein = Math.abs(n.vein(x / 22, z / 22));
        if (vein < 0.06) { const t = 1 - vein / 0.06; cr = lerp(cr, c.accent[0], t); cg = lerp(cg, c.accent[1], t); cb = lerp(cb, c.accent[2], t); }
      } else if (i === GLITCH) {
        const chk = (Math.floor(x / 6) + Math.floor(z / 6)) & 1;
        if (chk) { cr = c.ground[0]; cg = c.ground[1]; cb = c.ground[2]; } else { cr = c.ground2[0]; cg = c.ground2[1]; cb = c.ground2[2]; }
        const gx = Math.abs((x / 12) - Math.round(x / 12)), gz = Math.abs((z / 12) - Math.round(z / 12));
        if (gx < 0.09 || gz < 0.09) { cr = c.accent[0]; cg = c.accent[1]; cb = c.accent[2]; gl = 0.9; }
      } else if (i === CRYSTAL) {
        if (hash01(Math.round(x * 0.5), Math.round(z * 0.5), this.seed) > 0.93) { cr = c.accent[0]; cg = c.accent[1]; cb = c.accent[2]; gl = 0.6; }
      } else if (i === DESERT) {
        const band = 0.5 + 0.5 * Math.sin(h * 2.2);
        cr = lerp(cr, c.ground2[0], band * 0.5); cg = lerp(cg, c.ground2[1], band * 0.5); cb = lerp(cb, c.ground2[2], band * 0.5);
      } else if (i === MEADOW || i === SWAMP) {
        if (hash01(Math.round(x * 0.5), Math.round(z * 0.5), this.seed ^ 77) > 0.965) { cr = lerp(cr, c.accent[0], 0.55); cg = lerp(cg, c.accent[1], 0.55); cb = lerp(cb, c.accent[2], 0.55); gl = i === SWAMP ? 0.5 : 0; }
      }
      // rock on steep slopes
      const rock = smoothstep(0.32, 0.6, slope);
      cr = lerp(cr, c.rock[0], rock); cg = lerp(cg, c.rock[1], rock); cb = lerp(cb, c.rock[2], rock);
      r += cr * wi; g += cg * wi; b += cb * wi; glow += gl * wi;
    }
    // frosting on high peaks
    const pk = smoothstep(38, 52, h) * (1 - smoothstep(0.5, 0.8, slope));
    if (pk > 0) { r = lerp(r, this.peak[0], pk); g = lerp(g, this.peak[1], pk); b = lerp(b, this.peak[2], pk); }
    // river banks: rainbow pebbles
    if (res.valley > 0.2 && h < 1.6 && h > -0.4) {
      const t = smoothstep(1.6, 0.4, h) * 0.6;
      const pebble = hslToRgb(hash01(Math.round(x), Math.round(z), this.seed ^ 99), 0.6, 0.72);
      const useP = hash01(Math.round(x * 1.3), Math.round(z * 1.3), this.seed ^ 5) > 0.6;
      const c = useP ? pebble : this.beach;
      r = lerp(r, c[0], t); g = lerp(g, c[1], t); b = lerp(b, c[2], t);
    }
    if (h < 0) {
      const t = smoothstep(0, -2.5, h);
      r *= 1 - 0.45 * t; g *= 1 - 0.3 * t; b *= 1 - 0.1 * t;
    }
    out[0] = r; out[1] = g; out[2] = b; out[3] = glow;
    return out;
  }

  /** Find a dry, gentle spot near (x,z). Deterministic spiral search. */
  findLand(x, z, maxR = 400) {
    for (let rad = 0; rad <= maxR; rad += 6) {
      const steps = Math.max(1, Math.floor(rad / 5));
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2 + rad * 0.37;
        const px = x + Math.cos(a) * rad, pz = z + Math.sin(a) * rad;
        const res = this.evaluate(px, pz);
        if (res.h > 0.8 && res.valley < 0.5) {
          const h0 = res.h;
          const s = Math.abs(this.height(px + 2, pz) - h0) + Math.abs(this.height(px, pz + 2) - h0);
          if (s < 1.6) return { x: px, z: pz, h: h0 };
        }
      }
    }
    return { x, z, h: this.height(x, z) };
  }
}
