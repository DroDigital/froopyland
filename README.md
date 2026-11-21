# Froopyland — a procedurally generated pocket world

An explorable 3D browser world inspired by the *idea* of a strange, artificial pocket dimension: a small enclosed world with its own terrain, residents and internal rules. Every world is generated from a seed: the same seed rebuilds the same landscape, creatures, landmarks and rules.

All assets are original and generated in code: geometry, colours, textures, sky, music and sound effects. Nothing is downloaded at runtime.

## Start it (macOS, Apple Silicon)

You need Node.js 18 or newer (`node -v`). If you don't have it, install it from nodejs.org or with `brew install node`.

```bash
cd froopyland
npm install
npm start
```

`npm start` opens **http://127.0.0.1:5173** in your browser. Chrome, Safari, Arc and Firefox all work. Click **Enter world**, then click inside the world to capture the mouse.

**Offline:** after `npm install` has run once, no network connection is needed. Everything (Three.js, code, assets) is local.

Optimised build (slightly faster loading):

```bash
npm run build
npm run preview
```

This serves the built app at **http://127.0.0.1:4173**.

## Controls

| Keyboard & mouse | Action |
| --- | --- |
| W A S D / arrow keys | Move |
| Mouse | Look (click the world to capture the mouse, Esc to release; dragging also works) |
| Mouse wheel | Camera distance |
| Shift | Run |
| Space | Jump · press again in the air to double-jump · hold while falling to glide |
| E | Interact: pick fruit, feed residents, use landmarks |
| Q or right-click | Observe the resident under the crosshair |
| R | Whistle (residents react according to their temperament) |
| V | Toggle first-person / third-person |
| M | Map (click to set a waypoint, wheel to zoom, drag to pan) |
| J | Journal |
| P or Tab | Creator controls |
| H | Help |
| N / F3 | Mute / performance stats |

| Gamepad (standard mapping: Xbox, PlayStation, 8BitDo…) | Action |
| --- | --- |
| Left stick / right stick | Move / look (R3 toggles the view) |
| A | Jump / glide |
| X | Interact |
| Y | Observe |
| LB | Whistle |
| RB or L3 | Run |
| LT / RT | Zoom out / in |
| View/Back · Menu/Start | Map · Creator controls |
| D-pad ↑ / ↓ | Journal / Help |
| B | Close panel |
| In creator controls | D-pad ←/→ cycles presets · X makes a new random world · A regenerates |

All controls are also listed in the in-app Help panel (H).

## Things to do

- **Discover places.** The compass shows a pulsing **?** that points towards the nearest undiscovered signal. There are 12 kinds of landmark, and each one does something:
  - portals fold you across the world to their twin gate
  - monoliths and spiral spires reveal the map and decode rules
  - eggs hatch into a companion that follows you
  - fountains make you fast and floaty
  - the floating isles and the spire can be climbed
  - watcher statues turn their heads when you aren't looking
  - an eye pond shows you visions of distant places
- **Observe residents.** Press Q on a creature to log its species. Then keep watching to record its behaviours: eating, drinking, sleeping, fleeing, herding, singing, sheltering, playing, basking and more. Each creature has hunger, thirst and energy needs, a daily rhythm, a diet and a temperament, so it reacts to you, the weather, the time of day and other residents.
- **Collect memory motes ✧.** Look for their light beams. Every 3 motes restore a fragment of the builder's log.
- **Pick glowfruit ●** from bushes (or shake the hanging tree) and feed residents to befriend them.
- **Decode the world rules** at terminals and monoliths. Each seed has 2–4 laws that change real gameplay: low gravity, rivers that run fast, nights that linger, springy ground in one biome, shy or friendly residents, and so on.
- Mushroom caps bounce you, so chain the bounces to climb the giant ones. Rainbow rivers carry you along. The edge of the world is a containment wall.

The Journal tracks places, species and behaviours, motes, memories, rules, biomes visited, % of the map explored, and overall completion.

## Creator controls (P)

- **Seed**: type any text, or roll a random one, then press *Regenerate world*. The seed is shown in the HUD; click it to copy.
- **Presets**: *Peaceful*, *Mysterious* and *Chaotic* regenerate the world immediately with a matching set of values.
- **Generation settings** (marked •, applied on regenerate):
  - world size (radius 500–2600 m)
  - terrain variety (relief, mountains, biome frequency)
  - creature population
  - weirdness (uncanny biomes, floating rocks, extra eyes, number of rules, landmark density)
  - resident temperament (calm and shy through to playful and grumpy, plus creature speed)
  - colour palette
- **Live settings**: weather, time of day, day length, freezing time, graphics quality, field of view, sensitivity, invert-Y and volume.

## Save & restore

Progress is saved automatically every 15 s, and also when you discover something or close the tab. It is kept in the browser's localStorage, **one save per seed**. It includes:
- position and view
- time of day
- discoveries, observed species and behaviours
- motes, fruit and world-state changes (hatched eggs, awakened landmarks, decoded rules, picked fruit)
- explored map and waypoint

Switching back to an earlier seed restores that world's progress. *Continue* on the start screen resumes where you left off. *Reset this world's progress* is in the creator panel.

## Performance

- The world streams in 48 m chunks around you, built within a per-frame time budget. Far chunks unload.
- Small plants exist only near you. Creatures exist only within a few chunks and are capped per population setting. Landmarks are built only when their chunk loads.
- Graphics quality (creator panel):
  - **Low**: no shadows, 1× resolution, shorter view
  - **Medium** (default): suits a MacBook Air or Pro
  - **High**: longer view, larger shadow map, full Retina resolution
- Press F3 to see FPS, chunks, draw calls and triangles.

## How it works

```
src/
  core/        seeded RNG, simplex noise + fBm/ridged, colour & math helpers
  config/      settings, presets, palettes, quality tiers, world rules (worldConfig)
  world/       analytic terrain (Voronoi biomes, rivers, rim), biome table, landmark placement, names & lore
  render/      chunk streaming, procedural flora, landmarks, sky/weather/clouds, shaders, character
  creatures/   species generator (per seed, per biome), procedural bodies, needs-driven AI
  ui/          HUD, compass, minimap/map with fog of war, journal, creator controls
  player.js    third/first-person controller (jump, double-jump, glide, swim, bounce, currents)
  input.js     keyboard, mouse, pointer lock, gamepad
  audio.js     WebAudio synth (biome ambience, chimes, chirps, thunder)
  save.js      localStorage persistence
```

- **Terrain** is a pure function of seed and settings. A domain-warped Voronoi field assigns 8 biomes, each with its own height shape (dunes, terraces, crystal ridges, fleshy mounds, stepped glitch-blocks, bog pools) and soft blending at the borders. Ridged mountains are added on top.
  - **Rainbow rivers** are carved along a noise isoline. The water shader colours them by their position across the channel, so they appear as flowing rainbow bands.
  - Landmarks get levelled plateaus.
- **Flora**: 16 plant archetypes. Each seed produces different species parameters per biome, and each species has several variants. They are stamped into one merged mesh per chunk with GPU wind sway and night glow.
- **Creatures**: 5 body archetypes (blob, quad, strider, floater, worm) with seeded colours, eye counts, patterns, size, diet, activity cycle, herd size and temperament. Their heads track you.
- **Determinism**: `npm test` checks that the same seed produces identical terrain, landmarks and species. It also checks that settings measurably change generation.

## Checks

```bash
npm test        # unit tests: determinism, biome diversity, rivers, presets, settings effects
npm run smoke   # end-to-end: builds, then plays the app in headless Chromium (needs: npm i -D playwright)
```

The smoke test plays the game in headless Chromium. It drives:
- keyboard movement, jump, mouse look and the first-person toggle
- observing, whistling, picking fruit and feeding
- landmark discovery, terminals and portals
- all 12 landmark types, egg hatching and bouncing
- creature AI behaviours over time
- every panel
- a simulated gamepad (move, look, jump, map, close)
- the creator panel (time of day, new seed, chaotic preset)
- save/restore across a reload

It also fails on any page error.
