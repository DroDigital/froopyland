import { FOG_RES } from '../save.js';
import { BIOMES } from '../world/biomes.js';
import { hslToRgb } from '../core/color.js';
import { clamp } from '../core/math.js';

export const ICONS = {
  watchers: '☺', monolith: '▮', portal: '◎', floaters: '☁', giantshroom: '♠', eyepond: '◉', fountain: '✺', ribcage: '☠',
  egg: '◒', terminal: '⌨', upsidetree: '¥', spiral: '❂',
};

/** Pre-rendered world map image + fog of war + markers, shared by minimap and full map. */
export class WorldMap {
  constructor(world) {
    this.world = world;
    this.R = world.cfg.radius;
    this.size = 256;
    this.base = document.createElement('canvas');
    this.base.width = this.base.height = this.size;
    this.bctx = this.base.getContext('2d');
    this.img = this.bctx.createImageData(this.size, this.size);
    this.row = 0;
    this.prevRow = new Float32Array(this.size);
    this.fog = document.createElement('canvas');
    this.fog.width = this.fog.height = FOG_RES;
    this.fctx = this.fog.getContext('2d');
    this.fogDirty = true;
    this.done = false;
  }

  /** Progressive generation so world start never stalls. */
  step(budgetMs = 4) {
    if (this.done) return true;
    const T = this.world.terrain, S = this.size, R = this.R;
    const t0 = performance.now();
    const d = this.img.data;
    while (this.row < S && performance.now() - t0 < budgetMs) {
      const j = this.row;
      let left = 0;
      for (let i = 0; i < S; i++) {
        const x = ((i + 0.5) / S) * 2 * R - R, z = ((j + 0.5) / S) * 2 * R - R;
        const o = (j * S + i) * 4;
        if (Math.hypot(x, z) > R) { d[o] = 10; d[o + 1] = 8; d[o + 2] = 24; d[o + 3] = 255; this.prevRow[i] = 0; continue; }
        const e = T.evaluate(x, z);
        let c;
        if (e.h < 0) {
          c = e.river > 0.2 ? hslToRgb((e.rs * 0.4 + 0.5 + 1) % 1, 0.7, 0.62) : [0.3, 0.55, 0.8];
        } else {
          const bc = T.colors[e.dom].ground;
          const shade = clamp(1 + (e.h - (this.prevRow[i] || e.h)) * 0.08 + (e.h - left) * 0.08, 0.6, 1.35);
          const hk = clamp(0.85 + e.h / 120, 0.8, 1.25);
          c = [bc[0] * shade * hk, bc[1] * shade * hk, bc[2] * shade * hk];
        }
        left = e.h;
        this.prevRow[i] = e.h;
        d[o] = clamp(c[0], 0, 1) * 255; d[o + 1] = clamp(c[1], 0, 1) * 255; d[o + 2] = clamp(c[2], 0, 1) * 255; d[o + 3] = 255;
      }
      this.row++;
    }
    this.bctx.putImageData(this.img, 0, 0);
    if (this.row >= S) this.done = true;
    return this.done;
  }

  get progress() { return this.row / this.size; }

  toMap(x, z, size = this.size) { return [((x + this.R) / (2 * this.R)) * size, ((z + this.R) / (2 * this.R)) * size]; }

  /** Mark fog-of-war cells as seen within radius r (metres). */
  reveal(x, z, r) {
    const st = this.world.state.visited;
    const cell = (2 * this.R) / FOG_RES;
    const ci = Math.floor((x + this.R) / cell), cj = Math.floor((z + this.R) / cell);
    const cr = Math.ceil(r / cell);
    let changed = false;
    for (let j = cj - cr; j <= cj + cr; j++) {
      if (j < 0 || j >= FOG_RES) continue;
      for (let i = ci - cr; i <= ci + cr; i++) {
        if (i < 0 || i >= FOG_RES) continue;
        if ((i - ci) ** 2 + (j - cj) ** 2 > cr * cr) continue;
        const b = j * FOG_RES + i;
        if (!(st[b >> 3] & (1 << (b & 7)))) { st[b >> 3] |= 1 << (b & 7); changed = true; }
      }
    }
    if (changed) this.fogDirty = true;
    return changed;
  }

  explored() {
    const st = this.world.state.visited;
    let seen = 0, total = 0;
    const cell = (2 * this.R) / FOG_RES;
    for (let j = 0; j < FOG_RES; j++) for (let i = 0; i < FOG_RES; i++) {
      const x = (i + 0.5) * cell - this.R, z = (j + 0.5) * cell - this.R;
      if (Math.hypot(x, z) > this.R * 0.9) continue;
      total++;
      const b = j * FOG_RES + i;
      if (st[b >> 3] & (1 << (b & 7))) seen++;
    }
    return total ? seen / total : 0;
  }

  redrawFog() {
    if (!this.fogDirty) return;
    this.fogDirty = false;
    const st = this.world.state.visited;
    const img = this.fctx.createImageData(FOG_RES, FOG_RES);
    for (let b = 0; b < FOG_RES * FOG_RES; b++) {
      const seen = st[b >> 3] & (1 << (b & 7));
      img.data[b * 4] = 18; img.data[b * 4 + 1] = 12; img.data[b * 4 + 2] = 36;
      img.data[b * 4 + 3] = seen ? 0 : 225;
    }
    this.fctx.putImageData(img, 0, 0);
  }

  markers() {
    const w = this.world, st = w.state;
    const out = [];
    for (const l of w.landmarkList) {
      if (st.discovered.has(l.id)) out.push({ x: l.x, z: l.z, icon: ICONS[l.type], color: '#ffe066', name: l.name, kind: 'found' });
      else if (st.rumored.has(l.id)) out.push({ x: l.x, z: l.z, icon: '?', color: '#ff8ad8', name: 'Rumoured place', kind: 'rumor' });
    }
    if (st.waypoint) out.push({ x: st.waypoint.x, z: st.waypoint.z, icon: '◆', color: '#7fffd4', name: 'Waypoint', kind: 'waypoint' });
    return out;
  }

  /** Circular rotating minimap. */
  drawMini(ctx, px, pz, heading, creatures) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const viewR = 260; // metres from centre to edge
    const scale = (W / 2) / viewR; // px per metre
    this.redrawFog();
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#0a0818'; ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-heading);
    const mpp = (2 * this.R) / this.size; // metres per map px
    const k = mpp * scale;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.base, -(px + this.R) * scale, -(pz + this.R) * scale, this.size * k, this.size * k);
    const fk = ((2 * this.R) / FOG_RES) * scale;
    ctx.drawImage(this.fog, -(px + this.R) * scale, -(pz + this.R) * scale, FOG_RES * fk, FOG_RES * fk);
    // creatures nearby
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const c of creatures) {
      const dx = (c.pos.x - px) * scale, dz = (c.pos.z - pz) * scale;
      if (dx * dx + dz * dz > (W / 2) ** 2) continue;
      ctx.fillStyle = c.friendT > 0 ? '#ff8ad8' : this.world.state.observed.has(c.sp.id) ? '#ffffff' : 'rgba(255,255,255,0.45)';
      ctx.beginPath(); ctx.arc(dx, dz, 2.2, 0, Math.PI * 2); ctx.fill();
    }
    // markers (kept upright)
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const m of this.markers()) {
      let dx = (m.x - px) * scale, dz = (m.z - pz) * scale;
      const d = Math.hypot(dx, dz), lim = W / 2 - 12;
      if (d > lim) { dx *= lim / d; dz *= lim / d; }
      ctx.save(); ctx.translate(dx, dz); ctx.rotate(heading);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = m.color; ctx.fillText(m.icon, 0, 1);
      ctx.restore();
    }
    ctx.restore();
    // player arrow (always pointing up)
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.fillStyle = '#7fffd4'; ctx.strokeStyle = '#0a0818'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // north indicator
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-heading);
    ctx.fillStyle = '#ff8ad8'; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('N', 0, -(W / 2 - 12));
    ctx.restore();
  }

  /** Full-screen map with fog, markers, player and creatures. */
  drawFull(ctx, px, pz, heading, zoom = 1, cx = 0, cz = 0) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    this.redrawFog();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0a0818'; ctx.fillRect(0, 0, W, H);
    const S = Math.min(W, H) * zoom;
    const ox = W / 2 - S / 2 - (cx / (2 * this.R)) * S, oy = H / 2 - S / 2 - (cz / (2 * this.R)) * S;
    this.view = { ox, oy, S };
    ctx.imageSmoothingEnabled = true;
    ctx.save();
    ctx.beginPath(); ctx.arc(ox + S / 2, oy + S / 2, S / 2, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(this.base, ox, oy, S, S);
    ctx.drawImage(this.fog, ox, oy, S, S);
    ctx.restore();
    ctx.strokeStyle = 'rgba(110,255,216,0.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(ox + S / 2, oy + S / 2, S / 2, 0, Math.PI * 2); ctx.stroke();
    const tm = (x, z) => [ox + ((x + this.R) / (2 * this.R)) * S, oy + ((z + this.R) / (2 * this.R)) * S];
    ctx.font = 'bold 16px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const m of this.markers()) {
      const [x, y] = tm(m.x, m.z);
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = m.color; ctx.fillText(m.icon, x, y + 1);
      if (zoom > 1.6 && m.kind === 'found') { ctx.font = '12px system-ui'; ctx.fillStyle = '#fff'; ctx.fillText(m.name, x, y + 18); ctx.font = 'bold 16px system-ui, sans-serif'; }
    }
    const [x, y] = tm(px, pz);
    ctx.save(); ctx.translate(x, y); ctx.rotate(heading);
    ctx.fillStyle = '#7fffd4'; ctx.strokeStyle = '#0a0818'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  /** Convert full-map canvas pixel -> world coordinates. */
  fromFull(mx, my) {
    const v = this.view;
    if (!v) return null;
    const x = ((mx - v.ox) / v.S) * 2 * this.R - this.R, z = ((my - v.oy) / v.S) * 2 * this.R - this.R;
    return Math.hypot(x, z) < this.R ? { x, z } : null;
  }
}

export function biomeLegend() {
  return BIOMES.map((b) => b.name);
}
