import { RNG, hashString } from '../core/rng.js';
import { applyPalette, hslToRgb, rgbToHsl } from '../core/color.js';
import { BIOMES } from '../world/biomes.js';
import { speciesName } from '../world/names.js';

export const BEHAVIORS = {
  wandering: 'Wandering', grazing: 'Eating', drinking: 'Drinking', sleeping: 'Sleeping', fleeing: 'Fleeing',
  curious: 'Investigating you', herding: 'Rejoining its herd', singing: 'Singing', sheltering: 'Sheltering from weather',
  playing: 'Playing chase', charging: 'Charging at you!', following: 'Following you (friend)', basking: 'Basking in light',
};
export const TEMPERAMENTS = {
  calm: 'Calm', shy: 'Shy', curious: 'Curious', playful: 'Playful', grumpy: 'Grumpy',
};

/** Two procedurally designed species per biome, different for every seed. */
export function generateSpecies(cfg) {
  const t = cfg.temperament;
  const list = [];
  BIOMES.forEach((b, bi) => {
    b.creatures.forEach((arch, k) => {
      const rng = new RNG(cfg.seedInt ^ hashString(`${b.id}#${k}`));
      const [bh] = rgbToHsl(...b.accent);
      const hue = bh + rng.range(-0.25, 0.25) + (k ? 0.5 : 0);
      const body = applyPalette(hslToRgb(hue, rng.range(0.45, 0.8), rng.range(0.5, 0.68)), cfg.palette);
      const belly = applyPalette(hslToRgb(hue + rng.range(-0.1, 0.1), 0.35, 0.85), cfg.palette);
      const accent = applyPalette(hslToRgb(hue + 0.5 + rng.range(-0.15, 0.15), 0.8, 0.6), cfg.palette);
      const temper = rng.weighted([
        { k: 'calm', w: 2 * (1 - t) + 0.3 }, { k: 'shy', w: 1.3 }, { k: 'curious', w: 1.2 },
        { k: 'playful', w: 0.4 + t * 1.4 }, { k: 'grumpy', w: t * t * 2.2 },
      ]).k;
      const diet = arch === 'floater' ? rng.pick(['basker', 'grazer']) : (b.id === 'crystal' || b.id === 'glitch') ? rng.pick(['crystal', 'grazer']) : rng.chance(0.15) ? 'basker' : 'grazer';
      const weird = cfg.weirdness;
      list.push({
        id: `${b.id}-${k}`,
        biome: bi,
        archetype: arch,
        name: speciesName(rng, arch),
        size: rng.range(0.7, 1.35) * (arch === 'strider' ? 1.1 : 1) * (1 + t * rng.range(0, 0.3)),
        colors: { body, belly, accent },
        eyes: rng.chance(0.25 + weird * 0.4) ? rng.int(3, 5) : rng.int(1, 2),
        eyeSize: rng.range(0.12, 0.24),
        humanEyes: rng.chance(weird * 0.5),
        smile: rng.chance(0.25 + weird * 0.35),
        antenna: rng.chance(0.5),
        spikes: rng.chance(0.4),
        pattern: rng.int(0, 2),
        legs: arch === 'strider' ? rng.pick([2, 3, 4]) : arch === 'quad' ? 4 : 0,
        segments: rng.int(5, 9),
        tentacles: rng.int(4, 8),
        hover: arch === 'floater' ? rng.range(2, 4.5) : 0,
        speed: rng.range(1.4, 2.6) * (0.85 + t * 0.5),
        runSpeed: rng.range(5, 8) * (0.85 + t * 0.4),
        temper,
        diet,
        activity: rng.weighted([{ k: 'diurnal', w: 3 }, { k: 'nocturnal', w: 1 + weird }, { k: 'crepuscular', w: 1 }]).k,
        herd: rng.int(1, arch === 'worm' ? 2 : 4),
        swims: arch === 'floater' || rng.chance(0.3),
        sings: rng.chance(0.55),
        pitch: rng.range(300, 1100) / (0.6 + rng.next()),
        glow: rng.chance(0.4 + weird * 0.3) ? rng.range(0.4, 1) : 0,
      });
    });
  });
  return list;
}

/** A special species that hatches from a landmark egg. */
export function hatchlingSpecies(cfg, eggId) {
  const rng = new RNG(cfg.seedInt ^ hashString(eggId));
  const hue = rng.next();
  return {
    id: `hatch-${eggId}`, biome: 0, archetype: 'blob', name: `Hatchling ${speciesName(rng, 'blob').split(' ')[1]}`,
    size: 0.6, colors: { body: hslToRgb(hue, 0.7, 0.7), belly: [1, 1, 1], accent: hslToRgb(hue + 0.5, 0.8, 0.6) },
    eyes: 1, eyeSize: 0.3, humanEyes: false, smile: true, antenna: true, spikes: false, pattern: 1, legs: 0, segments: 0, tentacles: 0,
    hover: 0, speed: 2, runSpeed: 9, temper: 'curious', diet: 'grazer', activity: 'diurnal', herd: 1, swims: true, sings: true,
    pitch: 1200, glow: 0.8, unique: true,
  };
}
