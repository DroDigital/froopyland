import { RNG, hashString } from '../core/rng.js';
import { applyPalette, hslToRgb, rgbToHsl, mixRgb, scaleRgb } from '../core/color.js';
import { BIOMES } from '../world/biomes.js';
import { Proto, GEO, mat } from './builder.js';

// Procedural plant archetypes. Each seed produces different species parameters per biome,
// and each species has a few authored variants so no two patches look identical.

const jitterHue = (rgb, rng, amt) => {
  const [h, s, l] = rgbToHsl(...rgb);
  return hslToRgb(h + rng.range(-amt, amt), Math.min(1, s * rng.range(0.85, 1.15)), Math.min(0.95, l * rng.range(0.85, 1.12)));
};

const ARCH = {
  lollipop(rng, c) {
    const p = new Proto();
    const h = rng.range(2.4, 4.6), tr = rng.range(0.09, 0.16);
    const stick = mixRgb([1, 1, 1], c.accent, 0.15);
    p.add(GEO.cyl, mat({ sx: tr, sy: h, sz: tr }), stick, { flex: 0.15 });
    const style = rng.int(0, 2);
    const c1 = c.accent, c2 = jitterHue(c.ground2, rng, 0.2), c3 = jitterHue(c.accent, rng, 0.35);
    const r = rng.range(0.9, 1.6);
    if (style === 0) {
      // spiral candy disc (both faces)
      const twist = rng.range(2.5, 5);
      const spiral = (x, y, z, lx, ly) => {
        const a = Math.atan2(ly, lx), d = Math.hypot(lx, ly);
        return Math.sin(a + d * twist * 3.1) > 0 ? c1 : c2;
      };
      p.add(GEO.ring, mat({ y: h + r * 0.9, sx: r, sy: r, sz: r }), spiral, { flex: 0.3 });
      p.add(GEO.ring, mat({ y: h + r * 0.9, ry: Math.PI, sx: r, sy: r, sz: r }), spiral, { flex: 0.3 });
      p.add(GEO.torus, mat({ y: h + r * 0.9, sx: r, sy: r, sz: r * 1.6 }), c3, { flex: 0.3 });
    } else if (style === 1) {
      const stripes = rng.int(3, 7);
      p.add(GEO.sphere, mat({ y: h + r * 0.8, sx: r, sy: r * 0.95, sz: r }), (x, y, z, lx, ly, lz) => (Math.sin(Math.atan2(lz, lx) * stripes + ly * 3) > 0 ? c1 : c3), { flex: 0.35 });
    } else {
      let y = h;
      for (let i = 0; i < 3; i++) {
        const rr = r * (1 - i * 0.25);
        p.add(GEO.sphere, mat({ y: y + rr * 0.8, sx: rr, sy: rr * 0.8, sz: rr }), i % 2 ? c1 : c2, { flex: 0.35 });
        y += rr * 1.2;
      }
    }
    return { p, collider: tr + 0.25, big: true, food: null };
  },
  flower(rng, c) {
    const p = new Proto();
    const n = rng.int(1, 3);
    for (let i = 0; i < n; i++) {
      const h = rng.range(0.4, 1.1), ox = rng.range(-0.3, 0.3), oz = rng.range(-0.3, 0.3);
      p.add(GEO.cyl, mat({ x: ox, z: oz, sx: 0.035, sy: h, sz: 0.035 }), scaleRgb(c.ground, 0.75), { flex: 0.6 });
      const pc = jitterHue(c.accent, rng, 0.25), r = rng.range(0.16, 0.3);
      p.add(GEO.cone, mat({ x: ox, y: h + 0.1, z: oz, rx: Math.PI, sx: r, sy: 0.14, sz: r }), pc, { flex: 0.6 });
      p.add(GEO.sphereLo, mat({ x: ox, y: h + 0.02, z: oz, sx: r * 0.35 }), [1, 0.95, 0.6], { flex: 0.6, glow: 0.5 });
    }
    return { p, food: 'plant' };
  },
  grass(rng, c) {
    const p = new Proto();
    const n = rng.int(3, 6);
    const base = jitterHue(mixRgb(c.ground, c.ground2, rng.next()), rng, 0.05);
    for (let i = 0; i < n; i++) {
      const h = rng.range(0.35, 0.9), a = rng.range(0, Math.PI * 2);
      p.add(GEO.cone3, mat({ x: Math.cos(a) * 0.15, z: Math.sin(a) * 0.15, rx: rng.range(-0.35, 0.35), rz: rng.range(-0.35, 0.35), sx: 0.07, sy: h, sz: 0.07 }),
        (x, y, z, lx, ly) => mixRgb(scaleRgb(base, 0.75), mixRgb(base, [1, 1, 1], 0.25), ly), { flex: 0.5 });
    }
    return { p, food: 'plant', small: true };
  },
  fruitbush(rng, c) {
    const p = new Proto();
    const r = rng.range(0.6, 1.0);
    const leaf = scaleRgb(jitterHue(c.ground, rng, 0.08), 0.8);
    p.add(GEO.sphere, mat({ y: r * 0.7, sx: r, sy: r * 0.75, sz: r }), leaf, { flex: 0.1 });
    p.add(GEO.sphere, mat({ x: r * 0.5, y: r * 0.5, sx: r * 0.6 }), scaleRgb(leaf, 1.1), { flex: 0.1 });
    const fc = jitterHue([1, 0.45, 0.65], rng, 0.1);
    for (let i = 0; i < 5; i++) {
      const a = rng.range(0, Math.PI * 2), y = rng.range(0.3, 1.1) * r;
      p.add(GEO.sphereLo, mat({ x: Math.cos(a) * r * 0.95, y, z: Math.sin(a) * r * 0.95, sx: 0.09 }), fc, { glow: 0.5 });
    }
    return { p, food: 'plant', fruit: true };
  },
  puff(rng, c) {
    const p = new Proto();
    const h = rng.range(1.8, 3.8);
    p.add(GEO.cylTaper, mat({ sx: 0.16, sy: h, sz: 0.16 }), scaleRgb(c.rock, 0.9), { flex: 0.1 });
    const n = rng.int(3, 6), pc = mixRgb([1, 1, 1], c.accent, rng.range(0, 0.35));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, rr = rng.range(0.6, 1.1);
      p.add(GEO.sphere, mat({ x: Math.cos(a) * 0.7, y: h + rng.range(-0.2, 0.6), z: Math.sin(a) * 0.7, sx: rr }), pc, { flex: 0.25 });
    }
    p.add(GEO.sphere, mat({ y: h + 0.9, sx: 1.0 }), pc, { flex: 0.3 });
    return { p, collider: 0.4, big: true, food: null };
  },
  rock(rng, c) {
    const p = new Proto();
    const stack = rng.chance(0.3) ? rng.int(2, 4) : 1;
    let y = 0;
    for (let i = 0; i < stack; i++) {
      const s = rng.range(0.35, 0.9) * (stack > 1 ? 0.8 - i * 0.12 : 1.3);
      p.add(GEO.dodeca, mat({ y: y + s * 0.5, ry: rng.range(0, 3), sx: s * rng.range(0.9, 1.4), sy: s * 0.7, sz: s }), jitterHue(c.rock, rng, 0.05));
      y += s * 1.05;
    }
    return { p, collider: stack > 1 ? 0.6 : null, food: null };
  },
  mushroom(rng, c) {
    const p = new Proto();
    const h = rng.range(1.2, 3.4), sr = rng.range(0.18, 0.35), cr = rng.range(0.9, 1.9), cs = rng.range(0.45, 0.8);
    const cap = jitterHue(c.accent, rng, 0.3), gill = scaleRgb(cap, 0.55), stem = mixRgb([0.95, 0.92, 0.85], c.ground2, 0.2);
    p.add(GEO.cylTaper, mat({ sx: sr, sy: h, sz: sr }), stem, { flex: 0.12 });
    p.add(GEO.dome, mat({ y: h, sx: cr, sy: cr * cs, sz: cr }), cap, { flex: 0.12, glow: 0.12 });
    p.add(GEO.disc, mat({ y: h + 0.02, rx: Math.PI, sx: cr * 0.98, sz: cr * 0.98 }), gill, { flex: 0.12, glow: 0.4 });
    const spots = rng.int(3, 8), spot = mixRgb([1, 1, 1], c.accent, 0.2);
    for (let i = 0; i < spots; i++) {
      const a = rng.range(0, Math.PI * 2), t = rng.range(0.2, 0.75);
      const ang = t * Math.PI / 2;
      p.add(GEO.sphereLo, mat({ x: Math.cos(a) * Math.sin(ang) * cr, y: h + Math.cos(ang) * cr * cs, z: Math.sin(a) * Math.sin(ang) * cr, sx: cr * 0.12, sy: cr * 0.06, sz: cr * 0.12 }), spot, { flex: 0.12, glow: 0.8 });
    }
    return { p, collider: sr + 0.2, big: true, platform: { y: h + cr * cs, r: cr * 0.85, bounce: 1 }, food: 'plant' };
  },
  bulb(rng, c) {
    const p = new Proto();
    const n = rng.int(2, 4), bc = jitterHue(c.accent, rng, 0.2);
    for (let i = 0; i < n; i++) {
      const h = rng.range(0.6, 1.8), a = rng.range(0, Math.PI * 2), lean = rng.range(0.1, 0.4);
      const ox = Math.cos(a) * lean * h * 0.5, oz = Math.sin(a) * lean * h * 0.5;
      p.add(GEO.cyl, mat({ rx: Math.sin(a) * lean, rz: -Math.cos(a) * lean, sx: 0.04, sy: h, sz: 0.04 }), scaleRgb(c.ground2, 0.7), { flex: 0.6 });
      p.add(GEO.sphere, mat({ x: ox, y: h * 0.97, z: oz, sx: rng.range(0.14, 0.28) }), bc, { flex: 0.6, glow: 1.0 });
    }
    return { p, food: 'plant' };
  },
  crystal(rng, c) {
    const p = new Proto();
    const n = rng.int(3, 7), cc = jitterHue(c.accent, rng, 0.25), cc2 = jitterHue(c.ground2, rng, 0.2);
    let maxH = 0;
    for (let i = 0; i < n; i++) {
      const h = rng.range(0.6, 2.6) * (i === 0 ? 1.4 : 1), a = rng.range(0, Math.PI * 2), lean = i === 0 ? 0 : rng.range(0.2, 0.6);
      maxH = Math.max(maxH, h);
      p.add(GEO.oct, mat({ x: Math.cos(a) * 0.25 * lean * 2, y: h * 0.4, z: Math.sin(a) * 0.25 * lean * 2, rx: Math.sin(a) * lean, rz: -Math.cos(a) * lean, ry: rng.range(0, 3), sx: h * 0.16, sy: h * 0.6, sz: h * 0.16 }),
        (x, y, z, lx, ly) => mixRgb(cc2, cc, (ly + 1) / 2), { glow: (x, y, z, lx, ly) => 0.25 + 0.5 * Math.max(0, ly) });
    }
    return { p, collider: maxH > 2.5 ? 0.6 : null, food: 'crystal' };
  },
  eyestalk(rng, c) {
    const p = new Proto();
    const n = rng.int(1, 3);
    const iris = jitterHue([0.3, 0.8, 0.5], rng, 0.5);
    for (let i = 0; i < n; i++) {
      const h = rng.range(0.8, 2.2), segs = 4, a = rng.range(0, Math.PI * 2), bend = rng.range(0.1, 0.35);
      let x = rng.range(-0.3, 0.3), z = rng.range(-0.3, 0.3), y = 0;
      for (let s = 0; s < segs; s++) {
        const l = h / segs, tilt = bend * s;
        p.add(GEO.cyl, mat({ x, y, z, rx: Math.sin(a) * tilt, rz: -Math.cos(a) * tilt, sx: 0.07 * (1 - s * 0.12), sy: l * 1.05, sz: 0.07 * (1 - s * 0.12) }), mixRgb(c.ground, c.accent, s / segs * 0.6), { flex: 0.5 });
        x += Math.cos(a) * Math.sin(tilt) * l; z += Math.sin(a) * Math.sin(tilt) * l; y += Math.cos(tilt) * l;
      }
      const er = rng.range(0.16, 0.3), look = rng.range(0, Math.PI * 2), lup = rng.range(-0.3, 0.4);
      p.add(GEO.sphere, mat({ x, y, z, sx: er }), [0.97, 0.95, 0.92], { flex: 0.5 });
      const lx = Math.cos(look) * Math.cos(lup), ly = Math.sin(lup), lz = Math.sin(look) * Math.cos(lup);
      p.add(GEO.sphereLo, mat({ x: x + lx * er * 0.75, y: y + ly * er * 0.75, z: z + lz * er * 0.75, sx: er * 0.5 }), iris, { flex: 0.5, glow: 0.3 });
      p.add(GEO.sphereLo, mat({ x: x + lx * er * 0.98, y: y + ly * er * 0.98, z: z + lz * er * 0.98, sx: er * 0.25 }), [0.03, 0.02, 0.04], { flex: 0.5 });
    }
    return { p, food: null };
  },
  tooth(rng, c) {
    const p = new Proto();
    const n = rng.int(1, 4), ivory = mixRgb([0.98, 0.95, 0.86], c.ground2, 0.1);
    let maxH = 0;
    for (let i = 0; i < n; i++) {
      const h = rng.range(0.8, 3.2), r = rng.range(0.25, 0.5), a = rng.range(0, 6.28), d = i ? rng.range(0.4, 1.1) : 0;
      maxH = Math.max(maxH, h);
      p.add(GEO.cylTaper, mat({ x: Math.cos(a) * d, z: Math.sin(a) * d, rx: rng.range(-0.15, 0.15), sx: r, sy: h, sz: r }), ivory);
      p.add(GEO.sphere, mat({ x: Math.cos(a) * d, y: h, z: Math.sin(a) * d, sx: r * 0.62, sy: r * 0.45, sz: r * 0.62 }), ivory);
    }
    return { p, collider: maxH > 2 ? 0.5 : null, food: null };
  },
  tentacle(rng, c) {
    const p = new Proto();
    const n = rng.int(1, 3), tc = jitterHue(c.accent, rng, 0.15), tc2 = jitterHue(c.ground2, rng, 0.1);
    for (let i = 0; i < n; i++) {
      const segs = 7, l = rng.range(0.35, 0.6), a = rng.range(0, 6.28), curl = rng.range(0.15, 0.35);
      let x = rng.range(-0.3, 0.3), z = rng.range(-0.3, 0.3), y = 0;
      for (let s = 0; s < segs; s++) {
        const tilt = curl * s, r = 0.16 * (1 - s / segs) + 0.03;
        p.add(GEO.cylTaper, mat({ x, y, z, rx: Math.sin(a) * tilt, rz: -Math.cos(a) * tilt, sx: r, sy: l * 1.08, sz: r }), s % 2 ? tc : tc2, { flex: 0.9, glow: s === segs - 1 ? 0.5 : 0 });
        x += Math.cos(a) * Math.sin(tilt) * l; z += Math.sin(a) * Math.sin(tilt) * l; y += Math.cos(tilt) * l;
      }
    }
    return { p, food: null };
  },
  cactus(rng, c) {
    const p = new Proto();
    const segs = rng.int(6, 11), twist = rng.range(0.25, 0.6), w = rng.range(0.35, 0.6);
    const cc = jitterHue([0.35, 0.75, 0.5], rng, 0.2), cc2 = jitterHue(c.accent, rng, 0.2);
    for (let s = 0; s < segs; s++) {
      const k = 1 - s / segs * 0.5;
      p.add(GEO.box, mat({ y: s * 0.42 + 0.21, ry: s * twist, sx: w * k, sy: 0.46, sz: w * k }), s % 3 === 0 ? cc2 : cc);
    }
    if (rng.chance(0.6)) p.add(GEO.sphere, mat({ y: segs * 0.42 + 0.1, sx: 0.22 }), [1, 0.5, 0.75], { glow: 0.6 });
    return { p, collider: w * 0.7, big: true, food: 'plant' };
  },
  droopy(rng, c) {
    const p = new Proto();
    const h = rng.range(2.8, 4.8), cr = rng.range(1.6, 2.6);
    const leaf = jitterHue(c.accent, rng, 0.2), trunk = scaleRgb(c.rock, 0.8);
    p.add(GEO.cylTaper, mat({ sx: 0.22, sy: h, sz: 0.22, rz: rng.range(-0.12, 0.12) }), trunk, { flex: 0.08 });
    p.add(GEO.dome, mat({ y: h - 0.2, sx: cr, sy: cr * 0.5, sz: cr }), scaleRgb(leaf, 0.85), { flex: 0.2 });
    const strands = rng.int(7, 12);
    for (let i = 0; i < strands; i++) {
      const a = (i / strands) * 6.28 + rng.range(-0.2, 0.2), l = rng.range(1.2, h * 0.7);
      p.add(GEO.cyl, mat({ x: Math.cos(a) * cr * 0.85, y: h - 0.2 - l, z: Math.sin(a) * cr * 0.85, sx: 0.05, sy: l, sz: 0.05 }), leaf, { flex: 0.7, glow: 0.2 });
    }
    return { p, collider: 0.4, big: true, water: true, food: null };
  },
  cubetree(rng, c) {
    const p = new Proto();
    const h = rng.range(2.5, 5);
    p.add(GEO.box, mat({ y: h / 2, sx: 0.18, sy: h, sz: 0.18 }), [0.08, 0.08, 0.1]);
    const n = rng.int(4, 9), cc = c.accent, cc2 = c.ground2;
    for (let i = 0; i < n; i++) {
      const s = rng.range(0.35, 1.0);
      p.add(GEO.box, mat({ x: rng.range(-1.2, 1.2), y: h + rng.range(-0.5, 1.6), z: rng.range(-1.2, 1.2), rx: rng.range(0, 3), ry: rng.range(0, 3), rz: rng.range(0, 3), sx: s }), i % 3 === 0 ? cc : cc2, { glow: i % 3 === 0 ? 0.8 : 0.05, flex: 0.1 });
    }
    return { p, collider: 0.35, big: true, food: 'crystal' };
  },
  floatrock(rng, c) {
    const p = new Proto();
    const s = rng.range(2, 5);
    p.add(GEO.dodeca, mat({ sx: s, sy: s * 0.45, sz: s * 0.9, ry: rng.range(0, 3) }), c.rock);
    p.add(GEO.cone, mat({ y: -s * 0.3, rx: Math.PI, sx: s * 0.7, sy: s * 1.4, sz: s * 0.6 }), scaleRgb(c.rock, 0.75));
    p.add(GEO.dome, mat({ y: s * 0.3, sx: s * 0.9, sy: s * 0.2, sz: s * 0.8 }), c.ground);
    return { p, food: null };
  },
};

/** Build per-biome species tables for this world. */
export function buildFlora(cfg, terrain) {
  const table = BIOMES.map((b, bi) => {
    const c = terrain.colors[bi];
    const species = [];
    for (const [arch, w] of Object.entries(b.flora)) {
      const rng = new RNG(cfg.seedInt ^ hashString(b.id + ':' + arch));
      // seed-dependent palette twist for this species
      const sc = {
        ground: c.ground, ground2: c.ground2, rock: c.rock,
        accent: applyPalette(jitterHue(BIOMES[bi].accent, rng, 0.12 + cfg.weirdness * 0.25), cfg.palette),
      };
      const variants = [];
      let info = null;
      for (let v = 0; v < 3; v++) {
        const out = ARCH[arch](rng, sc);
        out.p.finalize();
        variants.push(out.p);
        info = info || out;
      }
      species.push({
        arch, w: w * rng.range(0.7, 1.3), variants,
        collider: info.collider || null, platform: info.platform || null,
        big: !!info.big, small: !!info.small, water: !!info.water, food: info.food, fruit: !!info.fruit,
      });
    }
    return species;
  });
  // world-wide surreal feature
  const rng = new RNG(cfg.seedInt ^ 0xf10a7);
  const floatrocks = [0, 1, 2].map(() => ARCH.floatrock(rng, terrain.colors[rng.int(0, BIOMES.length - 1)]).p.finalize());
  return { table, floatrocks };
}
