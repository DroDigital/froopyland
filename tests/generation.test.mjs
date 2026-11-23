import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorldConfig } from '../src/config/worldConfig.js';
import { DEFAULT_SETTINGS, PRESETS, applyPreset, sanitizeSettings } from '../src/config/settings.js';
import { Terrain } from '../src/world/terrain.js';
import { generateLandmarks } from '../src/world/landmarksGen.js';
import { generateSpecies } from '../src/creatures/species.js';
import { BIOMES } from '../src/world/biomes.js';

const mk = (over = {}) => {
  const s = sanitizeSettings({ ...DEFAULT_SETTINGS, ...over });
  const cfg = createWorldConfig(s);
  return { s, cfg, t: new Terrain(cfg) };
};

test('same seed -> identical terrain', () => {
  const a = mk({ seed: 'abc' }).t, b = mk({ seed: 'abc' }).t;
  for (let i = 0; i < 200; i++) {
    const x = (i * 37.3) % 1200 - 600, z = (i * 91.7) % 1200 - 600;
    assert.equal(a.height(x, z), b.height(x, z));
  }
});

test('different seeds -> different terrain', () => {
  const a = mk({ seed: 'abc' }).t, b = mk({ seed: 'xyz' }).t;
  let diff = 0;
  for (let i = 0; i < 100; i++) if (Math.abs(a.height(i * 11, i * 7) - b.height(i * 11, i * 7)) > 0.01) diff++;
  assert.ok(diff > 80);
});

test('heights are finite and varied, biomes diverse, rivers exist', () => {
  const { t, cfg } = mk({ seed: 'diverse', weirdness: 0.8 });
  const seen = new Set();
  let min = 1e9, max = -1e9, river = 0, n = 0;
  for (let x = -cfg.radius * 0.8; x < cfg.radius * 0.8; x += 23) {
    for (let z = -cfg.radius * 0.8; z < cfg.radius * 0.8; z += 23) {
      const r = t.evaluate(x, z);
      assert.ok(Number.isFinite(r.h));
      seen.add(r.dom);
      min = Math.min(min, r.h); max = Math.max(max, r.h);
      if (r.river > 0.5) river++;
      n++;
    }
  }
  assert.ok(seen.size >= 6, `only ${seen.size} biomes`);
  assert.ok(max - min > 20, 'terrain too flat');
  assert.ok(river / n > 0.005, 'no rivers');
});

test('terrain variety setting changes relief', () => {
  const lo = mk({ seed: 'v', terrainVariety: 0.4 }).t, hi = mk({ seed: 'v', terrainVariety: 1.9 }).t;
  const range = (t) => { let a = 1e9, b = -1e9; for (let i = 0; i < 400; i++) { const h = t.height(i * 3 - 600, i * 1.7 - 300); a = Math.min(a, h); b = Math.max(b, h); } return b - a; };
  assert.ok(range(hi) > range(lo));
});

test('weirdness 0 has no uncanny biomes', () => {
  const { t, cfg } = mk({ seed: 'calm', weirdness: 0 });
  for (let x = -cfg.radius * 0.8; x < cfg.radius * 0.8; x += 40) for (let z = -cfg.radius * 0.8; z < cfg.radius * 0.8; z += 40) {
    const d = BIOMES[t.evaluate(x, z).dom].id;
    assert.ok(d !== 'flesh' && d !== 'glitch');
  }
});

test('landmarks deterministic and include required mechanics', () => {
  const { t, cfg } = mk({ seed: 'lm' });
  const spawn = t.findLand(0, 0);
  const a = generateLandmarks(cfg, t, spawn);
  const b = generateLandmarks(cfg, new Terrain(cfg), spawn);
  assert.deepEqual(a.map((l) => [l.id, l.type, l.x]), b.map((l) => [l.id, l.type, l.x]));
  const types = new Set(a.map((l) => l.type));
  for (const req of ['portal', 'egg', 'monolith', 'terminal']) assert.ok(types.has(req), req);
  const portals = a.filter((l) => l.type === 'portal');
  assert.ok(portals.every((p) => p.link && p.link !== p.id));
  assert.ok(a.some((l) => l.welcome));
});

test('species deterministic, 2 per biome, temperament setting matters', () => {
  const calm = generateSpecies(mk({ seed: 's', temperament: 0 }).cfg);
  const wild = generateSpecies(mk({ seed: 's', temperament: 1 }).cfg);
  assert.equal(calm.length, BIOMES.length * 2);
  assert.ok(!calm.some((s) => s.temper === 'grumpy'));
  const avg = (l) => l.reduce((a, s) => a + s.speed, 0) / l.length;
  assert.ok(avg(wild) > avg(calm));
  assert.deepEqual(generateSpecies(mk({ seed: 's', temperament: 0 }).cfg).map((s) => s.name), calm.map((s) => s.name));
});

test('presets produce valid settings and rules', () => {
  for (const k of Object.keys(PRESETS)) {
    const s = applyPreset(DEFAULT_SETTINGS, k);
    assert.deepEqual(s, sanitizeSettings(s));
    const cfg = createWorldConfig(s);
    assert.ok(cfg.rules.length >= 2);
  }
  assert.equal(sanitizeSettings({ worldSize: 99999 }).worldSize, 2600);
});

test('spawn is on dry land', () => {
  for (const seed of ['a', 'b', 'c', 'd']) {
    const { t } = mk({ seed });
    const s = t.findLand(0, 0);
    assert.ok(s.h > 0.5, `${seed} spawn ${s.h}`);
  }
});
