import * as THREE from 'three';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

/** Build a transform matrix from simple params. */
export function mat({ x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy, sz } = {}) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  _s.set(sx, sy ?? sx, sz ?? sx);
  _p.set(x, y, z);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

/**
 * A Proto is a small merged mesh in local space with per-vertex colour, sway (flex) and glow.
 * Protos are authored once per species variant and stamped many times into chunk meshes.
 */
export class Proto {
  constructor() {
    this.pos = []; this.nor = []; this.col = []; this.flex = []; this.glow = []; this.idx = [];
    this.vcount = 0;
    this.height = 0;
  }
  /**
   * @param {THREE.BufferGeometry} geo
   * @param {THREE.Matrix4} m
   * @param {number[]|((x:number,y:number,z:number,lx:number,ly:number,lz:number)=>number[])} color
   * @param {{flex?:number, glow?:number|Function}} opts
   */
  add(geo, m, color, opts = {}) {
    const p = geo.attributes.position, n = geo.attributes.normal;
    _nm.getNormalMatrix(m);
    const base = this.vcount;
    const flex = opts.flex ?? 0;
    const glow = opts.glow ?? 0;
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i);
      const lx = _v.x, ly = _v.y, lz = _v.z;
      _v.applyMatrix4(m);
      _n.fromBufferAttribute(n, i).applyMatrix3(_nm).normalize();
      this.pos.push(_v.x, _v.y, _v.z);
      this.nor.push(_n.x, _n.y, _n.z);
      const c = typeof color === 'function' ? color(_v.x, _v.y, _v.z, lx, ly, lz) : color;
      this.col.push(c[0], c[1], c[2]);
      this.flex.push(flex);
      this.glow.push(typeof glow === 'function' ? glow(_v.x, _v.y, _v.z, lx, ly, lz) : glow);
      if (_v.y > this.height) this.height = _v.y;
    }
    if (geo.index) {
      const ix = geo.index.array;
      for (let i = 0; i < ix.length; i++) this.idx.push(ix[i] + base);
    } else {
      for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    }
    this.vcount += p.count;
    return this;
  }
  /** Freeze into typed arrays. Sway weight grows with height so bases stay planted. */
  finalize() {
    const H = Math.max(0.01, this.height);
    const sway = new Float32Array(this.vcount);
    for (let i = 0; i < this.vcount; i++) {
      const t = Math.max(0, this.pos[i * 3 + 1] / H);
      sway[i] = this.flex[i] * t * t;
    }
    this.P = new Float32Array(this.pos);
    this.N = new Float32Array(this.nor);
    this.C = new Float32Array(this.col);
    this.S = sway;
    this.G = new Float32Array(this.glow);
    this.I = new Uint32Array(this.idx);
    this.pos = this.nor = this.col = this.flex = this.glow = this.idx = null;
    return this;
  }
  /** Single standalone geometry (for creatures / landmarks). */
  toGeometry() {
    if (!this.P) this.finalize();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.C, 3));
    g.setAttribute('aSway', new THREE.BufferAttribute(this.S, 1));
    g.setAttribute('aGlow', new THREE.BufferAttribute(this.G, 1));
    g.setIndex(new THREE.BufferAttribute(this.I.length > 65535 ? this.I : new Uint16Array(this.I), 1));
    g.computeBoundingSphere();
    return g;
  }
}

/** Accumulates many stamped protos into one big geometry (one draw call per chunk). */
export class StampBuilder {
  constructor() {
    this.items = [];
    this.v = 0;
    this.i = 0;
  }
  stamp(proto, x, y, z, rotY, scale, tint = null, tilt = 0) {
    this.items.push({ proto, x, y, z, rotY, scale, tint, tilt });
    this.v += proto.vcount;
    this.i += proto.I.length;
  }
  build() {
    if (!this.items.length) return null;
    const P = new Float32Array(this.v * 3), N = new Float32Array(this.v * 3), C = new Float32Array(this.v * 3);
    const S = new Float32Array(this.v), G = new Float32Array(this.v);
    const I = new Uint32Array(this.i);
    let vo = 0, io = 0;
    for (const it of this.items) {
      const pr = it.proto;
      const c = Math.cos(it.rotY), s = Math.sin(it.rotY), k = it.scale;
      const ct = Math.cos(it.tilt), st = Math.sin(it.tilt);
      const tr = it.tint ? it.tint[0] : 1, tg = it.tint ? it.tint[1] : 1, tb = it.tint ? it.tint[2] : 1;
      for (let j = 0; j < pr.vcount; j++) {
        let px = pr.P[j * 3], py = pr.P[j * 3 + 1], pz = pr.P[j * 3 + 2];
        let nx = pr.N[j * 3], ny = pr.N[j * 3 + 1], nz = pr.N[j * 3 + 2];
        if (it.tilt) { // tilt around local x axis
          const py2 = py * ct - pz * st, pz2 = py * st + pz * ct; py = py2; pz = pz2;
          const ny2 = ny * ct - nz * st, nz2 = ny * st + nz * ct; ny = ny2; nz = nz2;
        }
        const o = (vo + j) * 3;
        P[o] = (px * c + pz * s) * k + it.x;
        P[o + 1] = py * k + it.y;
        P[o + 2] = (-px * s + pz * c) * k + it.z;
        N[o] = nx * c + nz * s;
        N[o + 1] = ny;
        N[o + 2] = -nx * s + nz * c;
        C[o] = pr.C[j * 3] * tr;
        C[o + 1] = pr.C[j * 3 + 1] * tg;
        C[o + 2] = pr.C[j * 3 + 2] * tb;
        S[vo + j] = pr.S[j] * k;
        G[vo + j] = pr.G[j];
      }
      for (let j = 0; j < pr.I.length; j++) I[io + j] = pr.I[j] + vo;
      vo += pr.vcount;
      io += pr.I.length;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('color', new THREE.BufferAttribute(C, 3));
    g.setAttribute('aSway', new THREE.BufferAttribute(S, 1));
    g.setAttribute('aGlow', new THREE.BufferAttribute(G, 1));
    g.setIndex(new THREE.BufferAttribute(I, 1));
    g.computeBoundingSphere();
    return g;
  }
}

// Shared low-poly primitive library.
export const GEO = {
  sphere: new THREE.SphereGeometry(1, 10, 7),
  sphereHi: new THREE.SphereGeometry(1, 16, 12),
  sphereLo: new THREE.SphereGeometry(1, 7, 5),
  dome: new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2),
  ico: new THREE.IcosahedronGeometry(1, 0),
  oct: new THREE.OctahedronGeometry(1, 0),
  dodeca: new THREE.DodecahedronGeometry(1, 0),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 7, 1).translate(0, 0.5, 0), // base at y=0
  cylTaper: new THREE.CylinderGeometry(0.6, 1, 1, 7, 1).translate(0, 0.5, 0),
  cone: new THREE.ConeGeometry(1, 1, 7, 1).translate(0, 0.5, 0),
  cone3: new THREE.ConeGeometry(1, 1, 3, 1).translate(0, 0.5, 0),
  disc: new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2),
  ring: new THREE.RingGeometry(0.02, 1, 24, 5),
  torus: new THREE.TorusGeometry(1, 0.12, 6, 20),
  halfTorus: new THREE.TorusGeometry(1, 0.15, 6, 14, Math.PI),
};
