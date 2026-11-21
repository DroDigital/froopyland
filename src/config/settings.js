import { clamp } from '../core/math.js';

export const PALETTES = {
  froopy: { label: 'Froopy (classic)', hue: 0, sat: 1, light: 1, glow: 1 },
  pastel: { label: 'Pastel Dream', hue: 0.02, sat: 0.55, light: 1.12, glow: 0.8 },
  dusk: { label: 'Bruised Dusk', hue: -0.07, sat: 0.85, light: 0.82, tint: [1.0, 0.84, 1.06], glow: 1.35 },
  neon: { label: 'Neon Fever', hue: 0, sat: 1.5, light: 0.8, glow: 1.9 },
  bleached: { label: 'Bleached (uncanny)', hue: 0, sat: 0.18, light: 1.08, glow: 0.7 },
  inverted: { label: 'Inverted', hue: 0.5, sat: 1.05, light: 1, glow: 1.1 },
};

export const QUALITY = {
  low: { label: 'Low (fastest)', viewRadius: 5, creatureRadius: 4, shadows: false, shadowSize: 1024, pixelRatio: 1 },
  medium: { label: 'Medium', viewRadius: 7, creatureRadius: 5, shadows: true, shadowSize: 2048, pixelRatio: 1.5 },
  high: { label: 'High', viewRadius: 9, creatureRadius: 6, shadows: true, shadowSize: 4096, pixelRatio: 2 },
};

export const WEATHER_TYPES = {
  auto: 'Auto (changes over time)',
  clear: 'Clear',
  cloudy: 'Cloudy',
  rain: 'Rain (snow in cold places)',
  storm: 'Storm',
  mist: 'Mist',
  glitter: 'Glitter storm',
};

export const DEFAULT_SETTINGS = {
  seed: 'froopy-meadow-1',
  worldSize: 1400, // radius of the pocket world in metres
  terrainVariety: 1, // 0.3 .. 2
  creaturePopulation: 1, // 0 .. 2
  palette: 'froopy',
  weirdness: 0.5, // 0 .. 1
  temperament: 0.4, // 0 calm .. 1 wild
  weather: 'auto',
  timeOfDay: 9.5, // hours 0..24
  dayLengthMin: 12, // real minutes per in-world day
  timeFrozen: false,
  quality: 'medium',
  volume: 0.6,
  mouseSensitivity: 1,
  invertY: false,
  fov: 70,
};

/** Settings whose change requires regenerating the world. */
export const GEN_KEYS = ['seed', 'worldSize', 'terrainVariety', 'creaturePopulation', 'palette', 'weirdness', 'temperament'];

export const PRESETS = {
  peaceful: {
    label: 'Peaceful',
    description: 'Gentle hills, pastel colours, calm and friendly residents, clear long days.',
    values: { terrainVariety: 0.65, creaturePopulation: 1.0, palette: 'pastel', weirdness: 0.15, temperament: 0.05, weather: 'clear', timeOfDay: 10, dayLengthMin: 24 },
  },
  mysterious: {
    label: 'Mysterious',
    description: 'Mist, dusk light, glowing flora, shy residents and many strange places.',
    values: { terrainVariety: 1.15, creaturePopulation: 0.7, palette: 'dusk', weirdness: 0.75, temperament: 0.3, weather: 'mist', timeOfDay: 19.2, dayLengthMin: 18 },
  },
  chaotic: {
    label: 'Chaotic',
    description: 'Wild terrain, neon colours, crowds of rowdy residents, glitter storms and a racing sun.',
    values: { terrainVariety: 1.9, creaturePopulation: 1.9, palette: 'neon', weirdness: 1.0, temperament: 1.0, weather: 'glitter', timeOfDay: 14, dayLengthMin: 3 },
  },
};

export function sanitizeSettings(s = {}) {
  const d = DEFAULT_SETTINGS;
  const num = (v, def, a, b) => (Number.isFinite(+v) ? clamp(+v, a, b) : def);
  return {
    seed: String(s.seed ?? d.seed).trim().slice(0, 48) || d.seed,
    worldSize: Math.round(num(s.worldSize, d.worldSize, 500, 2600)),
    terrainVariety: num(s.terrainVariety, d.terrainVariety, 0.3, 2),
    creaturePopulation: num(s.creaturePopulation, d.creaturePopulation, 0, 2),
    palette: PALETTES[s.palette] ? s.palette : d.palette,
    weirdness: num(s.weirdness, d.weirdness, 0, 1),
    temperament: num(s.temperament, d.temperament, 0, 1),
    weather: WEATHER_TYPES[s.weather] ? s.weather : d.weather,
    timeOfDay: num(s.timeOfDay, d.timeOfDay, 0, 24) % 24,
    dayLengthMin: num(s.dayLengthMin, d.dayLengthMin, 1, 60),
    timeFrozen: !!s.timeFrozen,
    quality: QUALITY[s.quality] ? s.quality : d.quality,
    volume: num(s.volume, d.volume, 0, 1),
    mouseSensitivity: num(s.mouseSensitivity, d.mouseSensitivity, 0.2, 3),
    invertY: !!s.invertY,
    fov: num(s.fov, d.fov, 50, 100),
  };
}

export function applyPreset(settings, presetKey) {
  const p = PRESETS[presetKey];
  if (!p) return settings;
  return sanitizeSettings({ ...settings, ...p.values });
}
