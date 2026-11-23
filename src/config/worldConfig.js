import { hashString, RNG } from '../core/rng.js';
import { PALETTES } from './settings.js';
import { worldName } from '../world/names.js';
import { BIOMES } from '../world/biomes.js';

// The pocket world's internal rules. A seed picks a few; they change real gameplay.
export const RULES = [
  { id: 'lowgrav', text: 'Gravity is a suggestion here (60% strength).', apply: (r) => { r.gravityMul = 0.6; } },
  { id: 'longnight', text: 'Night lingers twice as long as day.', apply: (r) => { r.nightMul = 2; } },
  { id: 'swiftriver', text: 'The rainbow rivers run three times faster.', apply: (r) => { r.riverMul = 3; } },
  { id: 'hungry', text: 'Residents are always peckish (needs grow 2x faster).', apply: (r) => { r.needMul = 2; } },
  { id: 'echo', text: 'Every whistle echoes twice as far.', apply: (r) => { r.whistleMul = 2; } },
  { id: 'backsun', text: 'The sun rises in the west.', apply: (r) => { r.sunDir = -1; } },
  { id: 'bouncy', text: 'All ground in {biome} is springy.', apply: (r, rng) => { r.bouncyBiome = rng.int(0, BIOMES.length - 1); } },
  { id: 'brightnight', text: 'Plants hoard sunlight and glow fiercely at night.', apply: (r) => { r.glowMul = 2.2; } },
  { id: 'shy', text: 'Residents find visitors deeply suspicious.', apply: (r) => { r.fearMul = 1.8; }, excl: 'friendly' },
  { id: 'friendly', text: 'Residents assume you are a long-lost relative.', apply: (r) => { r.fearMul = 0.3; r.curiousBonus = 0.5; }, excl: 'shy' },
  { id: 'sprint', text: 'Visitors run 30% faster. Nobody knows why.', apply: (r) => { r.speedMul = 1.3; } },
];

export function defaultRuleEffects() {
  return { gravityMul: 1, nightMul: 1, riverMul: 1, needMul: 1, whistleMul: 1, sunDir: 1, bouncyBiome: -1, glowMul: 1, fearMul: 1, curiousBonus: 0, speedMul: 1 };
}

/** Derive the full deterministic generation config from the user's settings. */
export function createWorldConfig(settings) {
  const seedInt = hashString(String(settings.seed));
  const rng = new RNG(seedInt ^ 0xa53c9e1);
  const weirdness = settings.weirdness;

  // pick rules
  const count = Math.min(4, 2 + Math.round(weirdness * 2));
  const pool = rng.shuffle(RULES.slice());
  const rules = [];
  const effects = defaultRuleEffects();
  for (const r of pool) {
    if (rules.length >= count) break;
    if (r.excl && rules.some((x) => x.id === r.excl)) continue;
    const rr = new RNG(seedInt ^ hashString(r.id));
    r.apply(effects, rr);
    let text = r.text;
    if (r.id === 'bouncy') text = text.replace('{biome}', BIOMES[effects.bouncyBiome].name);
    rules.push({ id: r.id, text });
  }

  return {
    seed: String(settings.seed),
    seedInt,
    name: worldName(rng),
    radius: settings.worldSize,
    variety: settings.terrainVariety,
    population: settings.creaturePopulation,
    weirdness,
    temperament: settings.temperament,
    paletteKey: settings.palette,
    palette: PALETTES[settings.palette] || PALETTES.froopy,
    rules,
    effects,
  };
}
