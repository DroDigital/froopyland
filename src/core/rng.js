// Deterministic pseudo-random utilities. Everything in world generation flows from these.

/** FNV-1a string hash -> uint32 */
export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // final avalanche
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** mulberry32: small fast seeded PRNG returning [0,1) */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer coordinate hash -> uint32 (stateless, for grid cells). */
export function ihash(x, y, seed) {
  let h = (seed ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
export const hash01 = (x, y, seed) => ihash(x, y, seed) / 4294967296;

export class RNG {
  constructor(seed) {
    this.f = mulberry32(seed >>> 0);
  }
  next() { return this.f(); }
  range(a, b) { return a + (b - a) * this.f(); }
  int(a, b) { return a + Math.floor(this.f() * (b - a + 1)); }
  chance(p) { return this.f() < p; }
  pick(arr) { return arr[Math.floor(this.f() * arr.length)]; }
  sign() { return this.f() < 0.5 ? -1 : 1; }
  /** pick from [{w, ...}] or with weight function */
  weighted(items, wf = (i) => i.w) {
    let total = 0;
    for (const it of items) total += Math.max(0, wf(it));
    let r = this.f() * total;
    for (const it of items) {
      r -= Math.max(0, wf(it));
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.f() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

const SEED_A = ['wobbly', 'gloopy', 'velvet', 'humming', 'sideways', 'blinking', 'sticky', 'quiet', 'fizzy', 'woolly', 'crooked', 'shiny', 'drowsy', 'giggling', 'hollow', 'tangled'];
const SEED_B = ['lantern', 'meadow', 'teacup', 'moon', 'pocket', 'pudding', 'spoon', 'garden', 'kettle', 'button', 'marble', 'puddle', 'ribbon', 'thimble', 'pebble', 'whistle'];

/** A friendly random seed string (non-deterministic: uses Math.random). */
export function randomSeedString() {
  const a = SEED_A[Math.floor(Math.random() * SEED_A.length)];
  const b = SEED_B[Math.floor(Math.random() * SEED_B.length)];
  return `${a}-${b}-${Math.floor(Math.random() * 900 + 100)}`;
}

export function normalizeSeed(s) {
  const t = String(s ?? '').trim().slice(0, 48);
  return t.length ? t : randomSeedString();
}
