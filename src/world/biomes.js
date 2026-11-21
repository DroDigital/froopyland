import { hexToRgb } from '../core/color.js';

// Authored biome table. Colours are run through the world palette at generation time.
// heightMode / flora / creature archetypes give each area its own identity.
const B = (o) => ({
  ...o,
  ground: hexToRgb(o.ground), ground2: hexToRgb(o.ground2), rock: hexToRgb(o.rock), accent: hexToRgb(o.accent),
  fog: hexToRgb(o.fog),
});

export const BIOMES = [
  B({ id: 'meadow', name: 'Gumdrop Meadow', ground: '#7fd65a', ground2: '#c3ea6a', rock: '#9a8fb5', accent: '#ff8ad8', fog: '#cfe8ff',
    weird: 0, cold: 0, flora: { lollipop: 3, flower: 6, grass: 10, fruitbush: 1.4, puff: 0.6, rock: 0.6 }, floraDensity: 1,
    creatures: ['blob', 'quad'], creatureDensity: 1.1, precip: 'rain', chord: [0, 4, 7, 11],
    blurb: 'Rolling candy-green hills with lollipop trees. Suspiciously cheerful.' }),
  B({ id: 'mushroom', name: 'Spore Hollows', ground: '#5a4a7a', ground2: '#3f6b5a', rock: '#6d5f8a', accent: '#7ff7ff', fog: '#b9a6d9',
    weird: 0.3, cold: 0, flora: { mushroom: 5, bulb: 3, grass: 5, fruitbush: 1.0, rock: 0.4 }, floraDensity: 1.1,
    creatures: ['floater', 'blob'], creatureDensity: 1, precip: 'rain', chord: [0, 3, 7, 10],
    blurb: 'Giant springy mushrooms. Jump on the caps — they bounce.' }),
  B({ id: 'crystal', name: 'Prism Barrens', ground: '#a98fd9', ground2: '#d7c7f2', rock: '#7f6bb0', accent: '#7ffff0', fog: '#e3d9ff',
    weird: 0.4, cold: 0.3, flora: { crystal: 5, rock: 2, bulb: 0.6, grass: 1.5 }, floraDensity: 0.7,
    creatures: ['strider', 'floater'], creatureDensity: 0.7, precip: 'rain', chord: [0, 5, 7, 12],
    blurb: 'Spiky lavender ridges and humming crystals that glow at night.' }),
  B({ id: 'flesh', name: 'The Fleshy Knolls', ground: '#e79a9a', ground2: '#f2b8a8', rock: '#c46a7a', accent: '#8a1d3a', fog: '#ffd2cf',
    weird: 1, cold: 0, flora: { eyestalk: 3, tooth: 2.5, tentacle: 3, fruitbush: 1.0, grass: 2 }, floraDensity: 0.9,
    creatures: ['worm', 'blob'], creatureDensity: 0.9, precip: 'rain', chord: [0, 1, 6, 7],
    blurb: 'Warm, soft, faintly breathing ground. The plants watch you.' }),
  B({ id: 'desert', name: 'Glass Dunes', ground: '#f2cf7a', ground2: '#f7e2a6', rock: '#d39a5a', accent: '#6af2ff', fog: '#ffeacc',
    weird: 0.2, cold: -1, flora: { cactus: 3, rock: 1.4, crystal: 0.5, flower: 0.6, grass: 1 }, floraDensity: 0.5,
    creatures: ['strider', 'quad'], creatureDensity: 0.6, precip: 'glitter', chord: [0, 2, 7, 9],
    blurb: 'Ribbed golden dunes and corkscrew cacti under a hard bright sky.' }),
  B({ id: 'tundra', name: 'Cotton Steppes', ground: '#eef3ff', ground2: '#cfe0f5', rock: '#9fb3d1', accent: '#ffb0d8', fog: '#eef4ff',
    weird: 0.1, cold: 1, flora: { puff: 3, grass: 4, crystal: 1, rock: 1 }, floraDensity: 0.7,
    creatures: ['quad', 'floater'], creatureDensity: 0.8, precip: 'snow', chord: [0, 4, 9, 14],
    blurb: 'Terraced plateaus of cold cotton fluff. Snow falls instead of rain.' }),
  B({ id: 'swamp', name: 'Bubblegum Bog', ground: '#4f8a6a', ground2: '#7a5a8a', rock: '#56506a', accent: '#ff5fd2', fog: '#a7c9b5',
    weird: 0.5, cold: 0, flora: { droopy: 3, tentacle: 1.5, bulb: 2.5, mushroom: 1.2, grass: 6, fruitbush: 0.8 }, floraDensity: 1.1,
    creatures: ['worm', 'floater'], creatureDensity: 1, precip: 'rain', chord: [0, 3, 8, 10],
    blurb: 'Pink-scummed pools and drooping trees. Something bubbles below.' }),
  B({ id: 'glitch', name: 'The Unrendered', ground: '#3b3f52', ground2: '#5e6480', rock: '#2a2d3d', accent: '#59ffb2', fog: '#a9b5c9',
    weird: 1, cold: 0.2, flora: { cubetree: 3, crystal: 1.5, grass: 2, rock: 1 }, floraDensity: 0.7,
    creatures: ['strider', 'worm'], creatureDensity: 0.7, precip: 'glitter', chord: [0, 6, 11, 13],
    blurb: 'Where the pocket world was never finished. Stepped ground, floating cubes, gridlines.' }),
];

export const BIOME_INDEX = Object.fromEntries(BIOMES.map((b, i) => [b.id, i]));
export const NB = BIOMES.length;
