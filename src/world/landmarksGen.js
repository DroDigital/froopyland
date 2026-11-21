import { RNG, hash01, hashString } from '../core/rng.js';
import { BIOMES } from './biomes.js';
import { landmarkText } from './names.js';

export const LANDMARK_TYPES = ['watchers', 'monolith', 'portal', 'floaters', 'giantshroom', 'eyepond', 'fountain', 'ribcage', 'egg', 'terminal', 'upsidetree', 'spiral'];

// how strongly each landmark type prefers a biome (default 1)
const AFFINITY = {
  watchers: { flesh: 3, meadow: 1.5, tundra: 1.2 },
  monolith: { glitch: 3, desert: 1.5, crystal: 1.3 },
  portal: {},
  floaters: { crystal: 3, tundra: 2, glitch: 1.5 },
  giantshroom: { mushroom: 4, swamp: 2, meadow: 0.5, desert: 0.1, tundra: 0.2 },
  eyepond: { flesh: 3, swamp: 2.5, desert: 0.2 },
  fountain: { meadow: 2.5, tundra: 1.2 },
  ribcage: { desert: 3, flesh: 2, tundra: 1 },
  egg: { meadow: 1.4, swamp: 1.4, mushroom: 1.3 },
  terminal: { glitch: 4, crystal: 1 },
  upsidetree: { swamp: 2, meadow: 1.5, mushroom: 1.5 },
  spiral: { crystal: 2.5, desert: 2, glitch: 1.5 },
};
const FLAT = { watchers: 13, monolith: 6, portal: 7, floaters: 6, giantshroom: 10, eyepond: 12, fountain: 7, ribcage: 18, egg: 5, terminal: 5, upsidetree: 7, spiral: 6 };
const WEIRD = { watchers: 1, eyepond: 1, ribcage: 0.6, upsidetree: 0.8, floaters: 0.5, terminal: 0.4 };

/**
 * Landmarks are placed on a jittered grid over the whole finite world. Because the world is finite
 * the full list is known up-front (for the map, compass hints, portal pairing and completion %).
 */
export function generateLandmarks(cfg, terrain, spawn) {
  const w = cfg.weirdness;
  const cell = 240 - w * 40;
  const R = cfg.radius * 0.84;
  const density = 0.32 + 0.3 * w;
  const seed = cfg.seedInt;
  const out = [];
  const m = Math.ceil(R / cell) + 1;
  for (let ci = -m; ci <= m; ci++) {
    for (let cj = -m; cj <= m; cj++) {
      if (hash01(ci, cj, seed ^ 0x1a2b) > density) continue;
      let placed = null;
      for (let attempt = 0; attempt < 5 && !placed; attempt++) {
        const x = (ci + 0.2 + 0.6 * hash01(ci * 7 + attempt, cj, seed ^ 0x77)) * cell;
        const z = (cj + 0.2 + 0.6 * hash01(ci, cj * 7 + attempt, seed ^ 0x78)) * cell;
        if (Math.hypot(x, z) > R) continue;
        if (Math.hypot(x - spawn.x, z - spawn.z) < 90) continue;
        const ev = terrain.evaluate(x, z);
        if (ev.h < 1 || ev.valley > 0.35) continue;
        placed = { x, z, biome: ev.dom };
      }
      if (!placed) continue;
      const rng = new RNG(seed ^ hashString(`lm${ci},${cj}`));
      const bid = BIOMES[placed.biome].id;
      const type = rng.weighted(LANDMARK_TYPES.map((t) => ({ t, w: (AFFINITY[t][bid] ?? 1) * (WEIRD[t] ? 0.3 + w * WEIRD[t] * 1.5 : 1) }))).t;
      out.push({ id: `L${ci}_${cj}`, type, x: placed.x, z: placed.z, biome: placed.biome, rngSeed: rng.int(1, 1e9) });
    }
  }
  // the welcome terminal near spawn
  const sr = new RNG(seed ^ 0x5eed);
  for (let k = 0; k < 12; k++) {
    const a = sr.range(0, Math.PI * 2);
    const x = spawn.x + Math.cos(a) * 34, z = spawn.z + Math.sin(a) * 34;
    const ev = terrain.evaluate(x, z);
    if (ev.h > 0.8 && ev.valley < 0.4) {
      out.push({ id: 'L_welcome', type: 'terminal', x, z, biome: ev.dom, rngSeed: 4242, welcome: true });
      break;
    }
  }
  // guarantees so every world has the full set of mechanics
  const need = { portal: 2, egg: 1, monolith: 1, floaters: 1, spiral: 1 };
  const counts = {};
  for (const l of out) counts[l.type] = (counts[l.type] || 0) + 1;
  const order = new RNG(seed ^ 0x9a).shuffle(out.filter((l) => !l.welcome));
  for (const [t, n] of Object.entries(need)) {
    while ((counts[t] || 0) < n) {
      const victim = order.find((l) => (counts[l.type] || 0) > (need[l.type] || 0) + 1 || (!need[l.type] && (counts[l.type] || 0) > 1));
      if (!victim) break;
      counts[victim.type]--;
      victim.type = t;
      counts[t] = (counts[t] || 0) + 1;
    }
  }
  // portal pairing (each gate knows exactly one other)
  const portals = out.filter((l) => l.type === 'portal').sort((a, b) => a.id.localeCompare(b.id));
  portals.forEach((p, i) => { p.link = portals[(i + 1) % portals.length].id; });
  for (const l of out) {
    const txt = landmarkText(new RNG(l.rngSeed), l.type);
    l.name = l.welcome ? 'Welcome Terminal' : txt.name;
    l.lore = l.welcome ? 'A caretaker screen greets visitors. It knows the rules of this pocket.' : txt.lore;
    // average height of the footprint; the terrain is then levelled to it
    let sum = terrain.height(l.x, l.z), n = 1;
    l.flat = FLAT[l.type] ?? 6;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      sum += terrain.height(l.x + Math.cos(a) * l.flat, l.z + Math.sin(a) * l.flat); n++;
    }
    l.y = Math.max(sum / n, 0.6);
  }
  terrain.setFlatten(out.map((l) => ({ x: l.x, z: l.z, r: l.flat, y: l.y })));
  return out;
}
