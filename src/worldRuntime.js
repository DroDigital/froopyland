import * as THREE from 'three';
import { createWorldConfig } from './config/worldConfig.js';
import { Terrain } from './world/terrain.js';
import { generateLandmarks } from './world/landmarksGen.js';
import { memoryFragments } from './world/names.js';
import { BIOMES } from './world/biomes.js';
import { generateSpecies, hatchlingSpecies } from './creatures/species.js';
import { CreatureManager } from './creatures/creatures.js';
import { buildFlora } from './render/flora.js';
import { ChunkManager, countMotes, CHUNK } from './render/chunks.js';
import { LandmarkManager } from './render/landmarks.js';
import { Environment } from './render/environment.js';
import { WorldMap } from './ui/map.js';
import { RNG } from './core/rng.js';
import { deserializeState } from './save.js';

/** Everything belonging to one generated world (one seed + generation settings). */
export class WorldRuntime {
  constructor(game, settings, savedState) {
    this.game = game;
    this.scene = game.scene;
    this.materials = game.materials;
    this.audio = game.audio;
    const t0 = performance.now();
    this.cfg = createWorldConfig(settings);
    this.terrain = new Terrain(this.cfg);
    this.state = deserializeState(savedState);
    this.flora = buildFlora(this.cfg, this.terrain);
    this.species = generateSpecies(this.cfg);
    this.spawn = this.terrain.findLand(0, 0);
    this.landmarkList = generateLandmarks(this.cfg, this.terrain, this.spawn);
    this.landmarks = new LandmarkManager(this);
    this.chunks = new ChunkManager(this);
    this.creatures = new CreatureManager(this);
    this.env = new Environment(this.scene, this.cfg);
    this.map = new WorldMap(this);
    this.scene.add(this.chunks.group, this.landmarks.group, this.creatures.group);
    this.memories = memoryFragments(this.cfg.seedInt, this.species.map((s) => s.name), BIOMES.map((b) => b.name));
    const special = this.landmarkList.filter((l) => ['floaters', 'spiral', 'watchers'].includes(l.type)).length;
    this.totals = {
      landmarks: this.landmarkList.length,
      species: this.species.length,
      motes: countMotes(this.cfg.seedInt, this.cfg.radius) + special,
      rules: this.cfg.rules.length,
      biomes: new Set(this.landmarkList.map((l) => l.biome)).size,
    };
    this.genMs = performance.now() - t0;
    this.hatchlings = [];
  }

  // ---- hooks from chunk streaming ----
  onChunkLoaded(chunk) { this.landmarks.onChunkLoaded(chunk, this); }
  onChunkUnloaded(chunk) { this.landmarks.onChunkUnloaded(chunk); }

  get player() { return this.game.player; }
  get camera() { return this.game.camera; }
  get camDir() { return this.game.player.camDir; }
  get t() { return this.game.time; }

  // ---- gameplay services used by landmarks / game ----
  toast(msg, big = false) { this.game.ui.toast(msg, big); }

  revealMap(x, z, r) { this.map.reveal(x, z, r); }

  revealRule() {
    const r = this.cfg.rules.find((x) => !this.state.rules.has(x.id));
    if (!r) return null;
    this.state.rules.add(r.id);
    this.landmarks.redrawTerminals();
    this.audio.discover();
    return r.text;
  }

  rumorNearest(n) {
    const P = this.player.pos;
    const cand = this.landmarkList
      .filter((l) => !this.state.discovered.has(l.id) && !this.state.rumored.has(l.id))
      .sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))
      .slice(0, n);
    cand.forEach((l) => this.state.rumored.add(l.id));
    return cand.length;
  }

  teleportToPortal(dest) {
    const a = (dest.yaw || 0);
    const x = dest.x + Math.sin(a) * 6, z = dest.z + Math.cos(a) * 6;
    this.game.teleport(x, z, a + Math.PI);
  }

  boost(kind, sec) { this.player.boosts[kind] = sec; }

  spawnFruit(x, z) {
    const h = this.chunks.heightAt(x, z);
    const id = `tf${Math.random().toString(36).slice(2, 8)}`; // transient, not saved as picked
    this.chunks.addItem({ id, kind: 'fruit', x, y: Math.max(h, 0) + 0.4, z, transient: true });
  }

  spawnLandmarkMote(lm, ox, oy, oz) {
    const id = `lm_${lm.id}`;
    if (this.state.motes.has(id)) return;
    const chunk = this.chunks.get(Math.floor(lm.x / CHUNK), Math.floor(lm.z / CHUNK));
    this.chunks.addItem({ id, kind: 'mote', x: lm.x + ox, y: lm.y + oy, z: lm.z + oz }, chunk);
  }

  hatch(lm) {
    const sp = hatchlingSpecies(this.cfg, lm.id);
    if (!this.species.find((s) => s.id === sp.id)) this.species.push(sp);
    this.creatures.bySpecies.set(sp.id, sp);
    const c = this.creatures.spawn(sp, lm.x + 2, lm.z + 2, null, new RNG(7), { friend: 1e9, unique: true });
    this.hatchlings.push(c);
    this.audio.discover();
  }

  /** Re-spawn hatchlings from saved eggs next to the player. */
  restoreHatchlings() {
    for (const [id, v] of Object.entries(this.state.eggs)) {
      if (v !== 'hatched') continue;
      const sp = hatchlingSpecies(this.cfg, id);
      if (!this.species.find((s) => s.id === sp.id)) this.species.push(sp);
      this.creatures.bySpecies.set(sp.id, sp);
      const P = this.player.pos;
      this.hatchlings.push(this.creatures.spawn(sp, P.x + 2, P.z + 1.5, null, new RNG(9), { friend: 1e9, unique: true }));
    }
  }

  memoryCount() { return Math.min(this.memories.length, Math.floor(this.state.motes.size / 3)); }

  dispose() {
    this.chunks.disposeAll();
    this.landmarks.disposeAll();
    this.creatures.disposeAll();
    this.env.dispose();
    this.scene.remove(this.chunks.group, this.landmarks.group, this.creatures.group);
    this.flora.table.forEach(() => {});
  }
}
