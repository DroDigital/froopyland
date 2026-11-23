import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { clamp, damp, dampAngle, TAU } from '../core/math.js';
import { applyPalette, hslToRgb, mixRgb, scaleRgb } from '../core/color.js';
import { Proto, GEO, mat } from './builder.js';
import { createPortalMaterial } from './materials.js';
import { CHUNK } from './chunks.js';
import { BIOMES } from '../world/biomes.js';

const ckey = (cx, cz) => (cx + 1000) * 2000 + (cz + 1000);

function meshOf(proto, material, shadow = true) {
  const m = new THREE.Mesh(proto.toGeometry(), material);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

// Each builder returns { group, colliders, platforms, interact?, update?(dt, ctx), discoverR }
const BUILD = {
  watchers(lm, w, rng) {
    const g = new THREE.Group();
    const stone = applyPalette(hslToRgb(rng.next(), 0.15, 0.78), w.cfg.palette);
    const base = new Proto();
    const n = rng.int(5, 8), R = rng.range(7, 10);
    const heads = [];
    const colliders = [];
    const headProto = new Proto();
    headProto.add(GEO.sphereHi, mat({ sx: 0.95, sy: 1.05, sz: 0.9 }), stone);
    headProto.add(GEO.sphere, mat({ x: 0.32, y: 0.2, z: 0.75, sx: 0.16, sy: 0.12, sz: 0.1 }), [0.05, 0.03, 0.06], { glow: 0 });
    headProto.add(GEO.sphere, mat({ x: -0.32, y: 0.2, z: 0.75, sx: 0.16, sy: 0.12, sz: 0.1 }), [0.05, 0.03, 0.06]);
    headProto.add(GEO.halfTorus, mat({ y: -0.22, z: 0.78, rz: Math.PI, sx: 0.42, sy: 0.3, sz: 0.25 }), [0.3, 0.08, 0.12]);
    const headGeo = headProto.toGeometry();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const x = Math.cos(a) * R, z = Math.sin(a) * R;
      base.add(GEO.cyl, mat({ x, z, y: -1, sx: 1.0, sy: 2, sz: 1.0 }), scaleRgb(stone, 0.8));
      base.add(GEO.cylTaper, mat({ x, z, y: 1, sx: 0.75, sy: 3, sz: 0.65 }), stone);
      base.add(GEO.sphere, mat({ x, z, y: 3.9, sx: 0.9, sy: 0.5, sz: 0.8 }), stone);
      const h = new THREE.Mesh(headGeo, w.materials.world);
      h.castShadow = true;
      h.position.set(x, 4.9, z);
      h.rotation.y = rng.range(0, TAU);
      g.add(h);
      heads.push(h);
      colliders.push({ x: lm.x + x, z: lm.z + z, r: 1.1, y0: lm.y - 1, y1: lm.y + 6 });
    }
    base.add(GEO.cyl, mat({ y: -0.5, sx: 1.4, sy: 0.9, sz: 1.4 }), scaleRgb(stone, 0.7));
    base.add(GEO.oct, mat({ y: 1.0, sx: 0.4, sy: 0.6, sz: 0.4 }), w.terrain.colors[lm.biome].accent, { glow: 1 });
    g.add(meshOf(base, w.materials.world));
    let spin = 0;
    return {
      group: g, colliders, platforms: [], discoverR: 30,
      interact: { x: 0, y: 1, z: 0, r: 3.2, label: 'Hum with the choir', fn: (ctx) => {
        spin = 3;
        ctx.audio?.chord([0, 4, 7, 11, 14], 0.9);
        if (!ctx.state.awakened.has(lm.id)) {
          ctx.state.awakened.add(lm.id);
          ctx.spawnLandmarkMote(lm, 0, 2.2, 0);
          return 'The faces sing back. Something glimmers at the centre.';
        }
        return 'The choir hums along, delighted.';
      } },
      onLoad: (ctx) => { if (ctx.state.awakened.has(lm.id)) ctx.spawnLandmarkMote(lm, 0, 2.2, 0); },
      update(dt, ctx) {
        const P = ctx.player.pos;
        spin = Math.max(0, spin - dt);
        for (const h of heads) {
          const hx = lm.x + h.position.x, hz = lm.z + h.position.z;
          const want = Math.atan2(P.x - hx, P.z - hz);
          // they move only when you are not looking
          const toHead = new THREE.Vector3(hx - ctx.camera.position.x, 0, hz - ctx.camera.position.z).normalize();
          const looking = toHead.dot(ctx.camDir) > 0.5;
          if (spin > 0) h.rotation.y += dt * 9;
          else h.rotation.y = dampAngle(h.rotation.y, want, looking ? 0.15 : 10, dt);
        }
      },
    };
  },

  monolith(lm, w, rng) {
    const g = new THREE.Group();
    const p = new Proto();
    const glowC = w.terrain.colors[lm.biome].accent;
    p.add(GEO.box, mat({ y: 5, sx: 2.6, sy: 11, sz: 0.8 }), [0.04, 0.04, 0.06]);
    p.add(GEO.box, mat({ y: 5, z: 0.41, sx: 0.12, sy: 10.6, sz: 0.04 }), glowC, { glow: 1.4 });
    p.add(GEO.box, mat({ y: 5, z: -0.41, sx: 0.12, sy: 10.6, sz: 0.04 }), glowC, { glow: 1.4 });
    p.add(GEO.box, mat({ y: 8, z: 0.42, sx: 2.2, sy: 0.08, sz: 0.04 }), glowC, { glow: 1.4 });
    for (let i = 0; i < 6; i++) p.add(GEO.dodeca, mat({ x: rng.range(-3, 3), z: rng.range(-3, 3), sx: rng.range(0.4, 0.9) }), [0.2, 0.2, 0.25]);
    g.add(meshOf(p, w.materials.world));
    g.rotation.y = rng.range(0, TAU);
    const cubes = new THREE.Group();
    const cp = new Proto();
    cp.add(GEO.box, mat({ sx: 0.5 }), glowC, { glow: 1 });
    const cg = cp.toGeometry();
    for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(cg, w.materials.world); c.userData.i = i; cubes.add(c); }
    g.add(cubes);
    return {
      group: g, discoverR: 32,
      colliders: [{ x: lm.x, z: lm.z, r: 1.7, y0: lm.y - 1, y1: lm.y + 11 }], platforms: [],
      interact: { x: 0, y: 1, z: 0, r: 4, label: 'Touch the monolith', fn: (ctx) => {
        ctx.audio?.drone();
        if (!ctx.state.awakened.has(lm.id)) {
          ctx.state.awakened.add(lm.id);
          ctx.revealMap(lm.x, lm.z, 520);
          const rule = ctx.revealRule();
          return `The map remembers the land around you.${rule ? `<br>World rule decoded: <b>${rule}</b>` : ''}`;
        }
        return 'It hums contentedly. It has nothing more to tell you.';
      } },
      update(dt, ctx) {
        for (const c of cubes.children) {
          const a = ctx.t * 0.6 + c.userData.i * (TAU / 4);
          c.position.set(Math.cos(a) * 3.2, 6 + Math.sin(ctx.t * 1.3 + c.userData.i) * 1.5, Math.sin(a) * 3.2);
          c.rotation.set(ctx.t, ctx.t * 0.7, 0);
        }
      },
    };
  },

  portal(lm, w, rng) {
    const g = new THREE.Group();
    const p = new Proto();
    const col = w.terrain.colors[lm.biome].rock;
    const accent = w.terrain.colors[lm.biome].accent;
    p.add(GEO.cyl, mat({ x: 3.7, sx: 0.55, sy: 7, sz: 0.55 }), col);
    p.add(GEO.cyl, mat({ x: -3.7, sx: 0.55, sy: 7, sz: 0.55 }), col);
    p.add(GEO.halfTorus, mat({ y: 7, sx: 3.7, sy: 3.7, sz: 3.7 }), accent, { glow: 0.7 });
    p.add(GEO.cyl, mat({ y: -0.3, sx: 4.6, sy: 0.5, sz: 1.6 }), scaleRgb(col, 0.8));
    g.add(meshOf(p, w.materials.world));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(3.4, 40), createPortalMaterial(rng.next()));
    disc.position.y = 5.2;
    disc.scale.set(1, 1.45, 1);
    g.add(disc);
    const rot = rng.range(0, TAU);
    g.rotation.y = rot;
    lm.yaw = rot;
    const cx = Math.cos(rot), sx = Math.sin(rot);
    return {
      group: g, discoverR: 28,
      colliders: [
        { x: lm.x + 3.7 * cx, z: lm.z - 3.7 * sx, r: 0.8, y0: lm.y - 1, y1: lm.y + 8 },
        { x: lm.x - 3.7 * cx, z: lm.z + 3.7 * sx, r: 0.8, y0: lm.y - 1, y1: lm.y + 8 },
      ],
      platforms: [],
      interact: { x: 0, y: 1, z: 0, r: 3.6, label: 'Step through the fold', fn: (ctx) => {
        const dest = ctx.landmarkList.find((l) => l.id === lm.link);
        if (!dest || dest === lm) return 'The gate shimmers but leads nowhere.';
        ctx.audio?.whoosh();
        ctx.teleportToPortal(dest);
        return `You are folded across the world to ${dest.name}.`;
      } },
      update() { disc.rotation.z += 0.01; },
    };
  },

  floaters(lm, w, rng) {
    const g = new THREE.Group();
    const c = w.terrain.colors[lm.biome];
    const isles = [];
    const platforms = [];
    const pad = new Proto();
    pad.add(GEO.cyl, mat({ y: -0.4, sx: 2.2, sy: 0.6, sz: 2.2 }), c.rock);
    pad.add(GEO.disc, mat({ y: 0.22, sx: 1.9, sz: 1.9 }), c.accent, { glow: 1.2 });
    g.add(meshOf(pad, w.materials.world));
    platforms.push({ x: lm.x, z: lm.z, r: 2.1, y: lm.y + 0.22, launch: 19, pad: true });
    let a = rng.range(0, TAU);
    const count = 6;
    for (let i = 0; i < count; i++) {
      const s = i === count - 1 ? 3.4 : rng.range(2.4, 3.2);
      const ip = new Proto();
      ip.add(GEO.dodeca, mat({ sx: s, sy: s * 0.4, sz: s * 0.9 }), c.rock);
      ip.add(GEO.cone, mat({ y: -s * 0.25, rx: Math.PI, sx: s * 0.7, sy: s * 1.3, sz: s * 0.6 }), scaleRgb(c.rock, 0.75));
      ip.add(GEO.dome, mat({ y: s * 0.25, sx: s * 0.92, sy: s * 0.14, sz: s * 0.82 }), c.ground);
      for (let k = 0; k < 3; k++) ip.add(GEO.oct, mat({ x: rng.range(-s, s) * 0.5, y: s * 0.35, z: rng.range(-s, s) * 0.4, sx: 0.2, sy: 0.6, sz: 0.2 }), c.accent, { glow: 0.8 });
      const m = meshOf(ip, w.materials.world);
      const r = i === 0 ? 4 : 4 + i * 1.2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y = 7 + i * 1.6;
      m.position.set(x, y, z);
      g.add(m);
      const plat = { x: lm.x + x, z: lm.z + z, r: s * 0.78, y: lm.y + y + s * 0.38, baseY: lm.y + y + s * 0.38, i };
      platforms.push(plat);
      isles.push({ m, y, plat, i });
      a += 1.05;
    }
    const top = isles[isles.length - 1];
    return {
      group: g, colliders: [], platforms, discoverR: 34,
      onLoad: (ctx) => ctx.spawnLandmarkMote(lm, top.m.position.x, top.y + 3.2, top.m.position.z),
      update(dt, ctx) {
        for (const is of isles) {
          const off = Math.sin(ctx.t * 0.5 + is.i) * 0.4;
          is.m.position.y = is.y + off;
          is.plat.y = is.plat.baseY + off;
        }
      },
    };
  },

  giantshroom(lm, w, rng) {
    const g = new THREE.Group();
    const c = w.terrain.colors[lm.biome];
    const cap = applyPalette(hslToRgb(rng.next(), 0.75, 0.6), w.cfg.palette);
    const p = new Proto();
    p.add(GEO.cylTaper, mat({ sx: 1.7, sy: 13, sz: 1.7 }), [0.95, 0.9, 0.82]);
    p.add(GEO.dome, mat({ y: 13, sx: 9, sy: 4, sz: 9 }), cap, { glow: 0.15 });
    p.add(GEO.disc, mat({ y: 13.05, rx: Math.PI, sx: 8.9, sz: 8.9 }), scaleRgb(cap, 0.6), { glow: 0.8 });
    for (let i = 0; i < 14; i++) {
      const a = rng.range(0, TAU), t = rng.range(0.15, 0.8) * Math.PI / 2;
      p.add(GEO.sphereLo, mat({ x: Math.cos(a) * Math.sin(t) * 9, y: 13 + Math.cos(t) * 4, z: Math.sin(a) * Math.sin(t) * 9, sx: 0.9, sy: 0.4, sz: 0.9 }), [1, 1, 0.95], { glow: 0.9 });
    }
    const platforms = [{ x: lm.x, z: lm.z, r: 7.6, y: lm.y + 17, bounce: 1.2 }];
    const colliders = [{ x: lm.x, z: lm.z, r: 1.9, y0: lm.y - 1, y1: lm.y + 13 }];
    // stepping caps spiral up
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7 + rng.range(0, 0.5), r = 6.5 + (i % 2) * 1.5, h = 2.5 + i * 2.6;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const cr = 1.8 - i * 0.15;
      p.add(GEO.cylTaper, mat({ x, z, sx: 0.3, sy: h, sz: 0.3 }), [0.95, 0.9, 0.82]);
      p.add(GEO.dome, mat({ x, z, y: h, sx: cr, sy: cr * 0.5, sz: cr }), mixRgb(cap, c.accent, 0.5), { glow: 0.3 });
      platforms.push({ x: lm.x + x, z: lm.z + z, r: cr * 0.9, y: lm.y + h + cr * 0.5, bounce: 1 });
    }
    g.add(meshOf(p, w.materials.world));
    return { group: g, colliders, platforms, discoverR: 40 };
  },

  eyepond(lm, w, rng) {
    const g = new THREE.Group();
    const c = w.terrain.colors[lm.biome];
    const p = new Proto();
    p.add(GEO.torus, mat({ y: 0.2, rx: Math.PI / 2, sx: 9, sy: 9, sz: 6 }), scaleRgb(c.rock, 0.9));
    p.add(GEO.disc, mat({ y: 0.25, sx: 9, sz: 9 }), [0.08, 0.15, 0.2], { glow: 0.2 });
    p.add(GEO.disc, mat({ y: 0.3, sx: 4.6, sz: 2.6 }), [0.97, 0.95, 0.92]);
    g.add(meshOf(p, w.materials.world, false));
    const iris = new THREE.Group();
    const ip = new Proto();
    const irisC = applyPalette(hslToRgb(rng.next(), 0.75, 0.5), w.cfg.palette);
    ip.add(GEO.disc, mat({ sx: 1.7, sz: 1.7 }), irisC, { glow: 0.6 });
    ip.add(GEO.disc, mat({ y: 0.02, sx: 0.75, sz: 0.75 }), [0.01, 0.01, 0.01]);
    ip.add(GEO.disc, mat({ y: 0.03, x: 0.4, z: -0.4, sx: 0.25, sz: 0.25 }), [1, 1, 1], { glow: 1 });
    iris.add(meshOf(ip, w.materials.world, false));
    iris.position.y = 0.33;
    g.add(iris);
    const lidP = new Proto();
    lidP.add(GEO.disc, mat({ sx: 4.8, sz: 2.8 }), w.terrain.colors[lm.biome].ground);
    const lid = meshOf(lidP, w.materials.world, false);
    lid.position.y = 0.36;
    lid.scale.z = 0.001;
    g.add(lid);
    let blinkT = 2;
    return {
      group: g, colliders: [], platforms: [], discoverR: 28,
      interact: { x: 0, y: 0.5, z: 0, r: 10.5, label: 'Stare back into the eye', fn: (ctx) => {
        blinkT = -0.01;
        const found = ctx.rumorNearest(3);
        ctx.audio?.chord([0, 1, 6], 0.6);
        return found ? `The eye shows you visions of ${found} distant place${found > 1 ? 's' : ''}. They are now marked with ? on your map.` : 'The eye has nothing left to show you.';
      } },
      update(dt, ctx) {
        const P = ctx.player.pos;
        const dx = P.x - lm.x, dz = P.z - lm.z, d = Math.hypot(dx, dz) || 1;
        const k = Math.min(1, d / 15);
        iris.position.x = damp(iris.position.x, (dx / d) * 2.6 * k, 4, dt);
        iris.position.z = damp(iris.position.z, (dz / d) * 1.1 * k, 4, dt);
        blinkT -= dt;
        let close = 0;
        if (blinkT < 0) { close = 1; if (blinkT < -0.25) blinkT = rng.range(2, 7); }
        lid.scale.z = damp(lid.scale.z, close ? 1 : 0.001, 25, dt);
      },
    };
  },

  fountain(lm, w, rng) {
    const g = new THREE.Group();
    const p = new Proto();
    const tiers = [[4.2, 0.8], [2.6, 1.8], [1.3, 3.0]];
    tiers.forEach(([r, h], i) => p.add(GEO.cyl, mat({ y: -0.3, sx: r, sy: h + 0.3, sz: r }), (x, y, z) => hslToRgb((Math.atan2(z, x) / TAU + i * 0.2 + 1) % 1, 0.55, 0.75)));
    p.add(GEO.sphere, mat({ y: 3.6, sx: 0.7 }), [1, 1, 1], { glow: 1.4 });
    g.add(meshOf(p, w.materials.world));
    const N = 220;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    const parts = [];
    for (let i = 0; i < N; i++) {
      const c = hslToRgb(i / N, 0.8, 0.65);
      col.set(c, i * 3);
      parts.push({ a: rng.range(0, TAU), v: rng.range(3, 5), t: rng.range(0, 1.4) });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.35, vertexColors: true, transparent: true, opacity: 0.9 }));
    pts.frustumCulled = false;
    g.add(pts);
    return {
      group: g, discoverR: 30,
      colliders: [{ x: lm.x, z: lm.z, r: 1.4, y0: lm.y - 1, y1: lm.y + 3 }],
      platforms: [{ x: lm.x, z: lm.z, r: 4.2, y: lm.y + 0.8 }, { x: lm.x, z: lm.z, r: 2.6, y: lm.y + 1.8 }],
      interact: { x: 0, y: 1.5, z: 0, r: 5, label: 'Drink the colours', fn: (ctx) => {
        ctx.boost('rainbow', 45);
        ctx.audio?.chord([0, 4, 7, 12, 16], 0.5);
        return 'You taste every colour at once. You feel fast and floaty (45s).';
      } },
      update(dt) {
        for (let i = 0; i < N; i++) {
          const q = parts[i];
          q.t += dt;
          if (q.t > 1.5) { q.t = 0; q.a = rng.range(0, TAU); }
          const r = q.t * 2.6;
          pos[i * 3] = Math.cos(q.a) * r;
          pos[i * 3 + 1] = 3.6 + q.v * q.t - 4.9 * q.t * q.t;
          pos[i * 3 + 2] = Math.sin(q.a) * r;
        }
        geo.attributes.position.needsUpdate = true;
      },
    };
  },

  ribcage(lm, w, rng) {
    const g = new THREE.Group();
    const bone = [0.96, 0.93, 0.84];
    const p = new Proto();
    const ribs = 8;
    for (let i = 0; i < 12; i++) p.add(GEO.sphere, mat({ x: (i - 5.5) * 1.9, y: 0.6 + Math.sin(i * 0.3) * 0.4, sx: 0.9, sy: 0.7, sz: 0.8 }), bone);
    for (let i = 0; i < ribs; i++) {
      const x = (i - (ribs - 1) / 2) * 2.4;
      const r = 5.5 - Math.abs(i - ribs / 2) * 0.45;
      p.add(GEO.halfTorus, mat({ x, y: 0.4, ry: Math.PI / 2, sx: r, sy: r * 1.1, sz: r * 1.2 }), bone);
    }
    p.add(GEO.sphereHi, mat({ x: 13, y: 2.2, sx: 3, sy: 2.4, sz: 2.6 }), bone);
    p.add(GEO.sphere, mat({ x: 14.6, y: 2.8, z: 1.1, sx: 0.8 }), [0.08, 0.05, 0.06]);
    p.add(GEO.sphere, mat({ x: 14.6, y: 2.8, z: -1.1, sx: 0.8 }), [0.08, 0.05, 0.06]);
    p.add(GEO.box, mat({ x: 14.5, y: 0.7, sx: 3, sy: 0.6, sz: 3.2 }), bone);
    g.add(meshOf(p, w.materials.world));
    const rot = rng.range(0, TAU);
    g.rotation.y = rot;
    const sx = Math.cos(rot) * 13, sz = -Math.sin(rot) * 13;
    let notes = 0;
    return {
      group: g, discoverR: 32, platforms: [],
      colliders: [{ x: lm.x + sx, z: lm.z + sz, r: 3, y0: lm.y - 1, y1: lm.y + 4.5 }],
      interact: { x: 0, y: 1.5, z: 0, r: 6, label: 'Pluck a rib', fn: (ctx) => {
        const scale = [0, 2, 4, 7, 9, 12, 14, 16];
        ctx.audio?.chord([scale[notes % 8]], 1.2);
        notes++;
        return notes === 1 ? 'A low, lovely note rings out of the old bones.' : null;
      } },
    };
  },

  egg(lm, w, rng) {
    const g = new THREE.Group();
    const p = new Proto();
    p.add(GEO.torus, mat({ y: 0.4, rx: Math.PI / 2, sx: 2.4, sy: 2.4, sz: 3 }), [0.45, 0.32, 0.22]);
    for (let i = 0; i < 10; i++) p.add(GEO.cyl, mat({ x: rng.range(-2.2, 2.2), z: rng.range(-2.2, 2.2), y: 0.3, rz: Math.PI / 2, ry: rng.range(0, 3), sx: 0.08, sy: rng.range(1.5, 3), sz: 0.08 }), [0.5, 0.36, 0.25]);
    g.add(meshOf(p, w.materials.world));
    const shellC = applyPalette(hslToRgb(rng.next(), 0.4, 0.85), w.cfg.palette);
    const speck = applyPalette(hslToRgb(rng.next(), 0.6, 0.5), w.cfg.palette);
    const ep = new Proto();
    ep.add(GEO.sphereHi, mat({ y: 2.1, sx: 1.6, sy: 2.1, sz: 1.6 }), (x, y, z) => (Math.sin(x * 9) * Math.sin(y * 7) * Math.sin(z * 8) > 0.5 ? speck : shellC), { glow: 0.12 });
    const egg = meshOf(ep, w.materials.world);
    g.add(egg);
    const halves = new THREE.Group();
    const hp = new Proto();
    hp.add(GEO.dome, mat({ rx: Math.PI, sx: 1.6, sy: 1.8, sz: 1.6 }), shellC);
    const hg = hp.toGeometry();
    const h1 = new THREE.Mesh(hg, w.materials.world); h1.position.set(1.4, 0.4, 0); h1.rotation.z = 1.9;
    const h2 = new THREE.Mesh(hg, w.materials.world); h2.position.set(-1.3, 0.4, 0.4); h2.rotation.z = -2.2;
    halves.add(h1, h2);
    halves.visible = false;
    g.add(halves);
    let wob = 0;
    const st = () => w.state.eggs[lm.id] || 0;
    const setHatched = () => { egg.visible = false; halves.visible = true; };
    if (st() === 'hatched') setHatched();
    return {
      group: g, discoverR: 26, platforms: [],
      colliders: [{ x: lm.x, z: lm.z, r: 2, y0: lm.y - 1, y1: lm.y + 4 }],
      interact: { x: 0, y: 1, z: 0, r: 4.2, get label() { return st() === 'hatched' ? 'An empty shell' : `Warm the egg (${st()}/3)`; }, fn: (ctx) => {
        if (st() === 'hatched') return 'Only shell fragments remain. Your hatchling remembers.';
        const n = st() + 1;
        wob = 1 + n;
        ctx.audio?.crack();
        if (n >= 3) {
          w.state.eggs[lm.id] = 'hatched';
          setHatched();
          ctx.hatch(lm);
          return 'CRACK! Something small and delighted tumbles out and decides you are its parent.';
        }
        w.state.eggs[lm.id] = n;
        return n === 1 ? 'The egg wobbles. Something inside taps back.' : 'Cracks spread across the shell...';
      } },
      update(dt, ctx) {
        wob = Math.max(0, wob - dt * 0.8);
        const idle = st() !== 'hatched' ? 0.03 + st() * 0.03 : 0;
        egg.rotation.z = Math.sin(ctx.t * 9) * (wob * 0.08 + idle);
        egg.rotation.x = Math.cos(ctx.t * 7) * (wob * 0.05 + idle * 0.5);
      },
    };
  },

  terminal(lm, w, rng) {
    const g = new THREE.Group();
    const p = new Proto();
    const accent = w.terrain.colors[lm.biome].accent;
    p.add(GEO.cyl, mat({ sx: 0.25, sy: 2.4, sz: 0.25 }), [0.15, 0.15, 0.2]);
    p.add(GEO.cyl, mat({ y: -0.2, sx: 1.2, sy: 0.4, sz: 1.2 }), [0.2, 0.2, 0.26]);
    p.add(GEO.box, mat({ y: 3.6, sx: 3.8, sy: 2.6, sz: 0.3 }), [0.1, 0.1, 0.14]);
    g.add(meshOf(p, w.materials.world));
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 340;
    const tex = new THREE.CanvasTexture(canvas);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 2.32), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    screen.position.set(0, 3.6, 0.16);
    g.add(screen);
    const back = screen.clone();
    back.rotation.y = Math.PI;
    back.position.z = -0.16;
    g.add(back);
    const ringP = new Proto();
    ringP.add(GEO.torus, mat({ sx: 2.6, sy: 2.6, sz: 1 }), accent, { glow: 1.2 });
    const ring = meshOf(ringP, w.materials.world, false);
    ring.position.y = 3.6;
    g.add(ring);
    g.rotation.y = rng.range(0, TAU);
    const draw = () => {
      const c = canvas.getContext('2d');
      c.fillStyle = '#04120e'; c.fillRect(0, 0, 512, 340);
      c.fillStyle = '#59ffb2'; c.font = 'bold 26px ui-monospace, Menlo, monospace';
      c.fillText(`POCKET UNIT: ${w.cfg.name.toUpperCase()}`.slice(0, 32), 18, 40);
      c.font = '20px ui-monospace, Menlo, monospace';
      c.fillStyle = '#9fffd5';
      c.fillText('STATUS: CONTAINED   VISITORS: 1', 18, 74);
      c.fillText(`SEED: ${w.cfg.seed}`.slice(0, 40), 18, 102);
      c.fillStyle = '#59ffb2';
      c.fillText('ACTIVE RULES:', 18, 140);
      c.font = '17px ui-monospace, Menlo, monospace';
      let y = 168;
      w.cfg.rules.forEach((r, i) => {
        const known = w.state.rules.has(r.id);
        const txt = known ? `${i + 1}. ${r.text}` : `${i + 1}. ████████████ [press E]`;
        // wrap
        const words = txt.split(' ');
        let line = '';
        for (const wd of words) {
          if ((line + wd).length > 44) { c.fillText(line, 18, y); y += 22; line = '   '; }
          line += wd + ' ';
        }
        c.fillText(line, 18, y); y += 28;
      });
      c.fillStyle = 'rgba(89,255,178,0.06)';
      for (let yy = 0; yy < 340; yy += 4) c.fillRect(0, yy, 512, 1);
      tex.needsUpdate = true;
    };
    draw();
    return {
      group: g, discoverR: 22, platforms: [],
      colliders: [{ x: lm.x, z: lm.z, r: 0.7, y0: lm.y - 1, y1: lm.y + 5 }],
      interact: { x: 0, y: 1.5, z: 0, r: 4.2, label: 'Read the terminal', fn: (ctx) => {
        ctx.audio?.beep();
        const rule = ctx.revealRule();
        draw();
        ctx.state.awakened.add(lm.id);
        if (rule) return `World rule decoded: <b>${rule}</b>`;
        return 'All rules decoded. The terminal displays a cheerful screensaver of you.';
      } },
      redraw: draw,
      update(dt, ctx) { ring.rotation.x = ctx.t * 0.7; ring.rotation.y = ctx.t * 0.4; },
    };
  },

  upsidetree(lm, w, rng) {
    const g = new THREE.Group();
    const c = w.terrain.colors[lm.biome];
    const p = new Proto();
    const bark = scaleRgb(c.rock, 0.7);
    p.add(GEO.cylTaper, mat({ y: 22, rx: Math.PI, sx: 1.4, sy: 17, sz: 1.4 }), bark);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      p.add(GEO.cone, mat({ x: Math.cos(a) * 1.2, y: 21, z: Math.sin(a) * 1.2, rx: Math.sin(a) * 0.9, rz: -Math.cos(a) * 0.9, sx: 0.45, sy: 6, sz: 0.45 }), bark);
    }
    const leaf = applyPalette(hslToRgb(rng.next(), 0.6, 0.55), w.cfg.palette);
    for (let i = 0; i < 9; i++) {
      const a = rng.range(0, TAU), r = rng.range(0, 3.5);
      p.add(GEO.sphere, mat({ x: Math.cos(a) * r, y: rng.range(2.5, 5.5), z: Math.sin(a) * r, sx: rng.range(1.6, 2.6) }), leaf, { flex: 0.2 });
    }
    for (let i = 0; i < 12; i++) p.add(GEO.sphereLo, mat({ x: rng.range(-3.5, 3.5), y: rng.range(1.6, 2.6), z: rng.range(-3.5, 3.5), sx: 0.25 }), [1, 0.4, 0.65], { glow: 1 });
    const tree = meshOf(p, w.materials.world);
    g.add(tree);
    let cooldown = 0;
    return {
      group: g, discoverR: 32, platforms: [],
      colliders: [{ x: lm.x, z: lm.z, r: 1.6, y0: lm.y + 5, y1: lm.y + 23 }],
      interact: { x: 0, y: 1, z: 0, r: 6, label: 'Shake the hanging tree', fn: (ctx) => {
        if (cooldown > 0) return 'The tree is out of fruit for now.';
        cooldown = 90;
        for (let i = 0; i < 3; i++) {
          const a = rng.range(0, TAU);
          ctx.spawnFruit(lm.x + Math.cos(a) * 3, lm.z + Math.sin(a) * 3);
        }
        ctx.audio?.pop();
        return 'Glowfruit tumbles down — the wrong way, then the right way.';
      } },
      update(dt, ctx) { cooldown -= dt; tree.rotation.y = ctx.t * 0.05; tree.position.y = Math.sin(ctx.t * 0.4) * 0.3; },
    };
  },

  spiral(lm, w, rng) {
    const g = new THREE.Group();
    const c = w.terrain.colors[lm.biome];
    const p = new Proto();
    const segs = 16;
    for (let i = 0; i < segs; i++) {
      const k = 1 - i / segs * 0.55;
      p.add(GEO.box, mat({ y: i * 1.5 + 0.75, ry: i * 0.32, sx: 3 * k, sy: 1.55, sz: 3 * k }), i % 2 ? c.rock : scaleRgb(c.accent, 0.8), { glow: i % 4 === 0 ? 0.6 : 0 });
    }
    const platforms = [];
    const steps = 27;
    for (let i = 0; i < steps; i++) {
      const a = i * 0.56, r = 3.4;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, y = 0.75 + i * 0.88;
      p.add(GEO.cyl, mat({ x, y: y - 0.3, z, sx: 1.25, sy: 0.3, sz: 1.25 }), i % 3 ? c.ground2 : c.accent, { glow: i % 3 ? 0 : 0.5 });
      platforms.push({ x: lm.x + x, z: lm.z + z, r: 1.3, y: lm.y + y });
    }
    const topY = 24.2;
    p.add(GEO.cyl, mat({ y: topY - 0.4, sx: 2.4, sy: 0.4, sz: 2.4 }), c.rock);
    p.add(GEO.sphere, mat({ y: topY + 2.6, sx: 0.8 }), c.accent, { glow: 1.5 });
    platforms.push({ x: lm.x, z: lm.z, r: 2.4, y: lm.y + topY });
    g.add(meshOf(p, w.materials.world));
    return {
      group: g, platforms, discoverR: 34,
      colliders: [{ x: lm.x, z: lm.z, r: 1.6, y0: lm.y - 1, y1: lm.y + topY - 0.5 }],
      onLoad: (ctx) => ctx.spawnLandmarkMote(lm, 1.2, topY + 1.2, 0),
      interact: { x: 0, y: topY + 1, z: 0, r: 3.5, dy: 2.5, label: 'Ring the spire', fn: (ctx) => {
        ctx.audio?.chord([0, 7, 12, 19], 1.5);
        if (!ctx.state.awakened.has(lm.id)) {
          ctx.state.awakened.add(lm.id);
          ctx.revealMap(lm.x, lm.z, 800);
          return 'The spire rings across the pocket. Your map fills in far around you.';
        }
        return 'The spire rings out again. What a view.';
      } },
    };
  },
};

/** Builds landmarks when their chunk streams in, and owns their colliders and interactions. */
export class LandmarkManager {
  constructor(world) {
    this.world = world;
    this.list = world.landmarkList;
    this.group = new THREE.Group();
    this.group.name = 'landmarks';
    this.byChunk = new Map();
    for (const lm of this.list) {
      const k = ckey(Math.floor(lm.x / CHUNK), Math.floor(lm.z / CHUNK));
      if (!this.byChunk.has(k)) this.byChunk.set(k, []);
      this.byChunk.get(k).push(lm);
    }
    this.active = new Map();
  }

  onChunkLoaded(chunk, ctx) {
    const arr = this.byChunk.get(chunk.key);
    if (!arr) return;
    for (const lm of arr) {
      if (this.active.has(lm.id)) continue;
      const rng = new RNG(lm.rngSeed);
      const inst = BUILD[lm.type](lm, this.world, rng);
      inst.lm = lm;
      inst.group.position.set(lm.x, lm.y, lm.z);
      this.group.add(inst.group);
      this.active.set(lm.id, inst);
      inst.onLoad?.(ctx);
    }
  }

  onChunkUnloaded(chunk) {
    const arr = this.byChunk.get(chunk.key);
    if (!arr) return;
    for (const lm of arr) {
      const inst = this.active.get(lm.id);
      if (!inst) continue;
      this.group.remove(inst.group);
      inst.group.traverse((o) => { o.geometry?.dispose(); if (o.material && o.material !== this.world.materials.world) o.material.dispose?.(); });
      this.active.delete(lm.id);
    }
  }

  update(dt, ctx) {
    for (const inst of this.active.values()) {
      const d = Math.hypot(inst.lm.x - ctx.player.pos.x, inst.lm.z - ctx.player.pos.z);
      if (d < 260) inst.update?.(dt, ctx);
    }
  }

  /** Colliders & platforms near a point. */
  near(x, z, r = 40) {
    const out = [];
    for (const inst of this.active.values()) {
      if (Math.abs(inst.lm.x - x) < r && Math.abs(inst.lm.z - z) < r) out.push(inst);
    }
    return out;
  }

  nearestInteract(pos) {
    let best = null, bd = 1e9;
    for (const inst of this.near(pos.x, pos.z, 30)) {
      const it = inst.interact;
      if (!it) continue;
      const d = Math.hypot(inst.lm.x + it.x - pos.x, inst.lm.z + it.z - pos.z);
      const dy = Math.abs(inst.lm.y + it.y - pos.y);
      if (d < it.r && dy < (it.dy ?? 6) && d < bd) { bd = d; best = inst; }
    }
    return best;
  }

  redrawTerminals() {
    for (const inst of this.active.values()) inst.redraw?.();
  }

  disposeAll() {
    for (const inst of this.active.values()) {
      this.group.remove(inst.group);
      inst.group.traverse((o) => { o.geometry?.dispose(); if (o.material && o.material !== this.world.materials.world) o.material.dispose?.(); });
    }
    this.active.clear();
  }
}
