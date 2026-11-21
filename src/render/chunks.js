import * as THREE from 'three';
import { RNG, ihash, hash01 } from '../core/rng.js';
import { NB, BIOMES } from '../world/biomes.js';
import { StampBuilder } from './builder.js';
import { createWaterMaterial } from './materials.js';

export const CHUNK = 48;
export const RES = 24;
const STEP = CHUNK / RES;
const W = RES + 3;
const NV = (RES + 1) * (RES + 1);

const ckey = (cx, cz) => (cx + 1000) * 2000 + (cz + 1000);

// shared terrain index buffer (same topology for every chunk)
const TERRAIN_INDEX = (() => {
  const idx = new Uint16Array(RES * RES * 6);
  let k = 0;
  for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) {
    const v00 = j * (RES + 1) + i, v10 = v00 + 1, v01 = v00 + RES + 1, v11 = v01 + 1;
    idx[k++] = v00; idx[k++] = v01; idx[k++] = v10;
    idx[k++] = v01; idx[k++] = v11; idx[k++] = v10;
  }
  return idx;
})();

/** Mote count & positions are pure functions of chunk coords so totals are known up-front. */
export function moteForChunk(seed, cx, cz) {
  if (hash01(cx, cz, seed ^ 0x307e) > 0.035) return null;
  return {
    id: `m${cx}_${cz}`,
    x: cx * CHUNK + 6 + hash01(cx, cz, seed ^ 0x31) * (CHUNK - 12),
    z: cz * CHUNK + 6 + hash01(cx, cz, seed ^ 0x32) * (CHUNK - 12),
  };
}
export function countMotes(seed, radius) {
  let n = 0;
  const m = Math.ceil(radius / CHUNK) + 1;
  for (let cx = -m; cx <= m; cx++) for (let cz = -m; cz <= m; cz++) {
    const mo = moteForChunk(seed, cx, cz);
    if (mo && Math.hypot(mo.x, mo.z) < radius * 0.9) n++;
  }
  return n;
}

export class ChunkManager {
  constructor(world) {
    this.world = world;
    this.terrain = world.terrain;
    this.cfg = world.cfg;
    this.flora = world.flora;
    this.group = new THREE.Group();
    this.group.name = 'chunks';
    this.chunks = new Map();
    this.viewRadius = 7;
    this.detailRadius = 3;
    this.shadows = true;
    this.material = world.materials.world;
    this.waterMat = createWaterMaterial();
    this.itemGeo = {
      mote: new THREE.OctahedronGeometry(0.32, 0),
      halo: new THREE.SphereGeometry(0.7, 12, 8),
      beam: new THREE.CylinderGeometry(0.12, 0.5, 40, 8, 1, true).translate(0, 20, 0),
      fruit: new THREE.SphereGeometry(0.2, 10, 8),
      leaf: new THREE.ConeGeometry(0.08, 0.2, 4),
    };
    this.itemMat = {
      mote: new THREE.MeshBasicMaterial({ color: '#fff6a8' }),
      halo: new THREE.MeshBasicMaterial({ color: '#ffe36e', transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }),
      beam: new THREE.MeshBasicMaterial({ color: '#fff1a0', transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      fruit: new THREE.MeshLambertMaterial({ color: '#ff5fa8', emissive: '#ff3d8b', emissiveIntensity: 0.5 }),
      leaf: new THREE.MeshLambertMaterial({ color: '#57d66a' }),
    };
    this.buildTimeAvg = 0;
    this._out = [0, 0, 0, 0];
    this._tmp = { w: null, h: 0, valley: 0 };
    this._flow = [0, 0];
  }

  get(cx, cz) { return this.chunks.get(ckey(cx, cz)); }

  inWorld(cx, cz) {
    const x = (cx + 0.5) * CHUNK, z = (cz + 0.5) * CHUNK;
    return Math.hypot(x, z) < this.cfg.radius + CHUNK * 0.9;
  }

  /** Stream chunks around the player within a per-frame time budget (ms). */
  update(px, pz, budgetMs = 6) {
    const pcx = Math.floor(px / CHUNK), pcz = Math.floor(pz / CHUNK);
    const R = this.viewRadius;
    const fx = px / CHUNK - 0.5, fz = pz / CHUNK - 0.5;
    // unload
    for (const [k, c] of this.chunks) {
      const d = Math.hypot(c.cx - fx, c.cz - fz);
      if (d > R + 1.6) { this.dispose(c); this.chunks.delete(k); }
      else if (c.small && d > this.detailRadius + 1.2) { this.disposeSmall(c); }
    }
    // collect missing
    const missing = [];
    const smallNeeded = [];
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const cx = pcx + dx, cz = pcz + dz;
      const d = Math.hypot(cx - fx, cz - fz);
      if (d > R + 0.5) continue;
      if (!this.inWorld(cx, cz)) continue;
      const c = this.chunks.get(ckey(cx, cz));
      if (!c) missing.push({ cx, cz, d });
      else if (!c.small && c.smallItems.length && d <= this.detailRadius + 0.5) smallNeeded.push({ c, d });
    }
    missing.sort((a, b) => a.d - b.d);
    smallNeeded.sort((a, b) => a.d - b.d);
    const t0 = performance.now();
    let built = 0;
    for (const m of missing) {
      if (built > 0 && performance.now() - t0 > budgetMs) break;
      const tb = performance.now();
      const c = this.build(m.cx, m.cz);
      this.chunks.set(ckey(m.cx, m.cz), c);
      this.world.onChunkLoaded?.(c);
      this.buildTimeAvg = this.buildTimeAvg * 0.9 + (performance.now() - tb) * 0.1;
      built++;
    }
    for (const s of smallNeeded) {
      if (performance.now() - t0 > budgetMs) break;
      this.buildSmall(s.c);
    }
    this.pending = missing.length - built;
    return built;
  }

  /** Synchronously load everything within r chunks (used for spawning / teleport). */
  preload(px, pz, r = 2) {
    const save = this.viewRadius;
    this.viewRadius = r;
    this.update(px, pz, 1e9);
    this.viewRadius = save;
  }

  build(cx, cz) {
    const T = this.terrain;
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const hb = new Float32Array(W * W);
    const wts = new Float32Array(NV * NB);
    const valley = new Float32Array(NV);
    const dom = new Uint8Array(NV);
    let minH = 1e9, maxH = -1e9;
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
      const r = T.evaluate(x0 + (i - 1) * STEP, z0 + (j - 1) * STEP);
      hb[j * W + i] = r.h;
      if (i >= 1 && i <= RES + 1 && j >= 1 && j <= RES + 1) {
        const v = (j - 1) * (RES + 1) + (i - 1);
        wts.set(r.w, v * NB);
        valley[v] = r.valley;
        dom[v] = r.dom;
        if (r.h < minH) minH = r.h;
        if (r.h > maxH) maxH = r.h;
      }
    }
    const heights = new Float32Array(NV);
    const pos = new Float32Array(NV * 3), nor = new Float32Array(NV * 3), col = new Float32Array(NV * 3);
    const glow = new Float32Array(NV), sway = new Float32Array(NV);
    const slopes = new Float32Array(NV);
    const H = (i, j) => hb[(j + 1) * W + (i + 1)];
    const tmp = this._tmp, out = this._out;
    for (let j = 0; j <= RES; j++) for (let i = 0; i <= RES; i++) {
      const v = j * (RES + 1) + i;
      const h = H(i, j);
      heights[v] = h;
      let nx = H(i - 1, j) - H(i + 1, j), ny = 2 * STEP, nz = H(i, j - 1) - H(i, j + 1);
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      slopes[v] = 1 - ny;
      pos[v * 3] = i * STEP; pos[v * 3 + 1] = h; pos[v * 3 + 2] = j * STEP;
      nor[v * 3] = nx; nor[v * 3 + 1] = ny; nor[v * 3 + 2] = nz;
      tmp.w = wts.subarray(v * NB, v * NB + NB); tmp.h = h; tmp.valley = valley[v];
      T.color(x0 + i * STEP, z0 + j * STEP, tmp, 1 - ny, out);
      col[v * 3] = out[0]; col[v * 3 + 1] = out[1]; col[v * 3 + 2] = out[2];
      glow[v] = out[3];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSway', new THREE.BufferAttribute(sway, 1));
    g.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
    g.setIndex(new THREE.BufferAttribute(TERRAIN_INDEX, 1));
    g.computeBoundingSphere();
    const terrainMesh = new THREE.Mesh(g, this.material);
    terrainMesh.position.set(x0, 0, z0);
    terrainMesh.receiveShadow = true;
    terrainMesh.castShadow = this.shadows;
    terrainMesh.matrixAutoUpdate = false;
    terrainMesh.updateMatrix();

    const chunk = {
      cx, cz, key: ckey(cx, cz), x0, z0, heights, dom, minH, maxH,
      group: new THREE.Group(), terrainMesh, floraMesh: null, smallMesh: null, waterMesh: null,
      colliders: [], platforms: [], food: [], items: [], smallItems: [], small: false,
    };
    chunk.group.add(terrainMesh);

    if (minH < 0.3) chunk.waterMesh = this.buildWater(chunk);
    this.placeFlora(chunk, wts, slopes);
    this.placeItems(chunk);
    this.group.add(chunk.group);
    return chunk;
  }

  buildWater(chunk) {
    const T = this.terrain;
    const WR = RES / 2, WS = CHUNK / WR;
    const nv = (WR + 1) * (WR + 1);
    const pos = new Float32Array(nv * 3), riv = new Float32Array(nv), flow = new Float32Array(nv * 2);
    for (let j = 0; j <= WR; j++) for (let i = 0; i <= WR; i++) {
      const v = j * (WR + 1) + i;
      const x = chunk.x0 + i * WS, z = chunk.z0 + j * WS;
      pos[v * 3] = i * WS; pos[v * 3 + 1] = 0; pos[v * 3 + 2] = j * WS;
      riv[v] = Math.max(-4, Math.min(4, T.riverValue(x, z) / T.riverWidth));
      T.flow(x, z, this._flow);
      flow[v * 2] = this._flow[0]; flow[v * 2 + 1] = this._flow[1];
    }
    const idx = [];
    const hgt = chunk.heights;
    for (let j = 0; j < WR; j++) for (let i = 0; i < WR; i++) {
      let mn = 1e9;
      for (let b = 0; b <= 2; b++) for (let a = 0; a <= 2; a++) mn = Math.min(mn, hgt[(j * 2 + b) * (RES + 1) + i * 2 + a]);
      if (mn > 0.15) continue;
      const v00 = j * (WR + 1) + i, v10 = v00 + 1, v01 = v00 + WR + 1, v11 = v01 + 1;
      idx.push(v00, v01, v10, v01, v11, v10);
    }
    if (!idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aRiver', new THREE.BufferAttribute(riv, 1));
    g.setAttribute('aFlow', new THREE.BufferAttribute(flow, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, this.waterMat);
    m.position.set(chunk.x0, 0, chunk.z0);
    m.renderOrder = 2;
    chunk.group.add(m);
    return m;
  }

  placeFlora(chunk, wts, slopes) {
    const seed = this.cfg.seedInt;
    const rng = new RNG(ihash(chunk.cx, chunk.cz, seed ^ 0xf10));
    const big = new StampBuilder();
    const table = this.flora.table;
    const candidates = 120;
    for (let n = 0; n < candidates; n++) {
      const lx = rng.next() * CHUNK, lz = rng.next() * CHUNK;
      const vi = Math.min(RES, Math.round(lx / STEP)), vj = Math.min(RES, Math.round(lz / STEP));
      const v = vj * (RES + 1) + vi;
      // choose biome by local weights -> natural transitions
      let r = rng.next(), b = chunk.dom[v];
      for (let k = 0; k < NB; k++) { r -= wts[v * NB + k]; if (r <= 0) { b = k; break; } }
      const roll = rng.next(), pickR = rng.next(), varR = rng.next(), sR = rng.next(), rotR = rng.next(), tR = rng.next();
      if (roll > BIOMES[b].floraDensity * 0.85) continue;
      const species = table[b];
      let tot = 0;
      for (const s of species) tot += s.w;
      let pr = pickR * tot, sp = species[0];
      for (const s of species) { pr -= s.w; if (pr <= 0) { sp = s; break; } }
      const x = chunk.x0 + lx, z = chunk.z0 + lz;
      const h = this.heightIn(chunk, lx, lz);
      if (h < (sp.water ? -0.9 : 0.12)) continue;
      if (this.terrain.nearLandmark(x, z, sp.big ? 6 : 1)) continue;
      if (slopes[v] > (sp.big ? 0.3 : 0.5)) continue;
      const scale = (sp.small ? 0.7 : 0.75) + sR * 0.6;
      const proto = sp.variants[Math.floor(varR * sp.variants.length)];
      const tint = [0.9 + tR * 0.2, 0.9 + (1 - tR) * 0.2, 0.95 + tR * 0.1];
      const item = { proto, x: lx, y: h - 0.05, z: lz, rot: rotR * Math.PI * 2, scale, tint };
      if (sp.big) big.stamp(proto, item.x, item.y, item.z, item.rot, scale, tint);
      else chunk.smallItems.push(item);
      if (sp.collider) chunk.colliders.push({ x, z, r: sp.collider * scale, y0: h - 1, y1: h + proto.height * scale });
      if (sp.platform) chunk.platforms.push({ x, z, r: sp.platform.r * scale, y: h + sp.platform.y * scale, bounce: sp.platform.bounce });
      if (sp.food) chunk.food.push({ x, z, y: h, type: sp.food });
      if (sp.fruit && hash01(Math.floor(x * 10), Math.floor(z * 10), seed ^ 0xf2) < 0.55) {
        const id = `f${chunk.cx}_${chunk.cz}_${n}`;
        if (!this.world.state.picked.has(id)) chunk.items.push({ id, kind: 'fruit', x: x + 0.8 * scale, y: h + 0.35, z: z + 0.3 });
      }
    }
    // surreal floating rocks hang over some chunks
    if (rng.next() < this.cfg.weirdness * 0.14) {
      const fr = this.flora.floatrocks[rng.int(0, this.flora.floatrocks.length - 1)];
      const lx = rng.range(8, 40), lz = rng.range(8, 40);
      big.stamp(fr, lx, Math.max(0, this.heightIn(chunk, lx, lz)) + rng.range(16, 42), lz, rng.range(0, 6.28), rng.range(0.8, 1.6));
    }
    const g = big.build();
    if (g) {
      const m = new THREE.Mesh(g, this.material);
      m.position.set(chunk.x0, 0, chunk.z0);
      m.castShadow = this.shadows;
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      chunk.group.add(m);
      chunk.floraMesh = m;
    }
  }

  buildSmall(chunk) {
    const sb = new StampBuilder();
    for (const it of chunk.smallItems) sb.stamp(it.proto, it.x, it.y, it.z, it.rot, it.scale, it.tint);
    const g = sb.build();
    chunk.small = true;
    if (!g) return;
    const m = new THREE.Mesh(g, this.material);
    m.position.set(chunk.x0, 0, chunk.z0);
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    chunk.group.add(m);
    chunk.smallMesh = m;
  }

  disposeSmall(chunk) {
    if (chunk.smallMesh) {
      chunk.group.remove(chunk.smallMesh);
      chunk.smallMesh.geometry.dispose();
      chunk.smallMesh = null;
    }
    chunk.small = false;
  }

  placeItems(chunk) {
    const mo = moteForChunk(this.cfg.seedInt, chunk.cx, chunk.cz);
    if (mo && Math.hypot(mo.x, mo.z) < this.cfg.radius * 0.9 && !this.world.state.motes.has(mo.id)) {
      const h = this.heightIn(chunk, mo.x - chunk.x0, mo.z - chunk.z0);
      chunk.items.push({ id: mo.id, kind: 'mote', x: mo.x, y: Math.max(h, 0) + 1.3, z: mo.z });
    }
    for (const it of chunk.items) this.makeItemMesh(chunk, it);
  }

  makeItemMesh(chunk, it) {
    const g = new THREE.Group();
    if (it.kind === 'mote') {
      g.add(new THREE.Mesh(this.itemGeo.mote, this.itemMat.mote));
      g.add(new THREE.Mesh(this.itemGeo.halo, this.itemMat.halo));
      const beam = new THREE.Mesh(this.itemGeo.beam, this.itemMat.beam);
      beam.renderOrder = 4;
      g.add(beam);
    } else {
      g.add(new THREE.Mesh(this.itemGeo.fruit, this.itemMat.fruit));
      const lf = new THREE.Mesh(this.itemGeo.leaf, this.itemMat.leaf);
      lf.position.y = 0.22;
      g.add(lf);
    }
    g.position.set(it.x, it.y, it.z);
    it.mesh = g;
    it.baseY = it.y;
    chunk.group.add(g);
  }

  /** Add an item at runtime (e.g. fruit shaken from a tree, motes on landmarks). */
  addItem(it, chunk = null) {
    const c = chunk || this.get(Math.floor(it.x / CHUNK), Math.floor(it.z / CHUNK));
    if (!c) return false;
    c.items.push(it);
    this.makeItemMesh(c, it);
    return true;
  }

  removeItem(it) {
    for (const c of this.chunks.values()) {
      const i = c.items.indexOf(it);
      if (i >= 0) {
        c.items.splice(i, 1);
        c.group.remove(it.mesh);
        return;
      }
    }
  }

  animateItems(t, px, pz) {
    for (const c of this.chunks.values()) {
      if (Math.abs(c.x0 + 24 - px) > 120 || Math.abs(c.z0 + 24 - pz) > 120) continue;
      for (const it of c.items) {
        it.mesh.rotation.y = t * 1.5 + it.x;
        it.mesh.position.y = it.baseY + Math.sin(t * 2 + it.z) * 0.15;
      }
    }
  }

  /** Mesh-exact height (matches the rendered triangles) or analytic fallback. */
  heightIn(chunk, lx, lz) {
    const fx = Math.max(0, Math.min(RES - 1e-4, lx / STEP)), fz = Math.max(0, Math.min(RES - 1e-4, lz / STEP));
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const hs = chunk.heights, R1 = RES + 1;
    const h00 = hs[j * R1 + i], h10 = hs[j * R1 + i + 1], h01 = hs[(j + 1) * R1 + i], h11 = hs[(j + 1) * R1 + i + 1];
    if (tx + tz < 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
    return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
  }

  heightAt(x, z) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const c = this.chunks.get(ckey(cx, cz));
    if (c) return this.heightIn(c, x - c.x0, z - c.z0);
    return this.terrain.height(x, z);
  }

  forNear(x, z, fn) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const c = this.chunks.get(ckey(cx + dx, cz + dz));
      if (c) fn(c);
    }
  }

  findFood(x, z, type, maxD = 40) {
    let best = null, bd = maxD;
    this.forNear(x, z, (c) => {
      for (const f of c.food) {
        if (type && f.type !== type) continue;
        const d = Math.hypot(f.x - x, f.z - z);
        if (d < bd) { bd = d; best = f; }
      }
    });
    return best;
  }

  nearestItem(x, y, z, maxD) {
    let best = null, bd = maxD;
    this.forNear(x, z, (c) => {
      for (const it of c.items) {
        const d = Math.hypot(it.x - x, (it.y - y) * 0.6, it.z - z);
        if (d < bd) { bd = d; best = it; }
      }
    });
    return best;
  }

  setShadows(on) {
    this.shadows = on;
    for (const c of this.chunks.values()) {
      c.terrainMesh.castShadow = on;
      if (c.floraMesh) c.floraMesh.castShadow = on;
    }
  }

  dispose(c) {
    this.world.onChunkUnloaded?.(c);
    this.group.remove(c.group);
    c.terrainMesh.geometry.dispose();
    c.floraMesh?.geometry.dispose();
    c.smallMesh?.geometry.dispose();
    c.waterMesh?.geometry.dispose();
  }

  disposeAll() {
    for (const c of this.chunks.values()) this.dispose(c);
    this.chunks.clear();
    this.waterMat.dispose();
    Object.values(this.itemGeo).forEach((g) => g.dispose());
    Object.values(this.itemMat).forEach((m) => m.dispose());
  }

  stats() {
    let tris = 0;
    for (const c of this.chunks.values()) {
      tris += TERRAIN_INDEX.length / 3;
      if (c.floraMesh) tris += c.floraMesh.geometry.index.count / 3;
      if (c.smallMesh) tris += c.smallMesh.geometry.index.count / 3;
    }
    return { chunks: this.chunks.size, tris, pending: this.pending || 0, buildMs: this.buildTimeAvg };
  }
}
