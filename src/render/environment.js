import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { clamp, lerp, smoothstep, damp } from '../core/math.js';
import { applyPalette, hexToRgb } from '../core/color.js';
import { BIOMES } from '../world/biomes.js';
import { createSkyMaterial, createBoundaryMaterial, createPrecipMaterial, shared } from './materials.js';

export const WEATHER = {
  clear: { cover: 0.25, overcast: 0, fog: 1, precip: 0, wind: 0.12, label: 'Clear' },
  cloudy: { cover: 0.8, overcast: 0.35, fog: 0.85, precip: 0, wind: 0.25, label: 'Cloudy' },
  rain: { cover: 0.95, overcast: 0.65, fog: 0.6, precip: 0.7, wind: 0.35, label: 'Rain' },
  storm: { cover: 1, overcast: 0.9, fog: 0.45, precip: 1, wind: 0.75, label: 'Storm', lightning: true },
  mist: { cover: 0.4, overcast: 0.3, fog: 0.22, precip: 0, wind: 0.05, label: 'Mist' },
  glitter: { cover: 0.5, overcast: 0.1, fog: 0.75, precip: 0.9, wind: 0.3, label: 'Glitter storm', kind: 2 },
};

const SKY_KEYS = {
  night: { top: '#070a26', horizon: '#1d1a46', bottom: '#05050f' },
  twilight: { top: '#3b3a8c', horizon: '#ff8e6e', bottom: '#2a2040' },
  day: { top: '#3d8cff', horizon: '#c4ecff', bottom: '#7d86b0' },
};

/** Sky, sun/moon, fog, clouds, precipitation, lightning and the containment wall. */
export class Environment {
  constructor(scene, cfg) {
    this.scene = scene;
    this.cfg = cfg;
    this.group = new THREE.Group();
    scene.add(this.group);
    const pal = cfg.palette;
    const conv = (hex) => new THREE.Color().fromArray(applyPalette(hexToRgb(hex), { ...pal, light: Math.min(1.1, pal.light ?? 1) }));
    this.keys = Object.fromEntries(Object.entries(SKY_KEYS).map(([k, v]) => [k, { top: conv(v.top), horizon: conv(v.horizon), bottom: conv(v.bottom) }]));
    this.biomeFog = BIOMES.map((b) => new THREE.Color().fromArray(applyPalette(b.fog, pal)));

    // sky dome
    this.skyMat = createSkyMaterial();
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(2500, 32, 16), this.skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.group.add(this.sky);

    // lights
    this.hemi = new THREE.HemisphereLight('#cfe6ff', '#6a5a7a', 1.2);
    this.group.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff1d6', 2.2);
    this.sun.shadow.camera.left = -70; this.sun.shadow.camera.right = 70;
    this.sun.shadow.camera.top = 70; this.sun.shadow.camera.bottom = -70;
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 400;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.group.add(this.sun);
    this.group.add(this.sun.target);

    scene.fog = new THREE.Fog('#cfe8ff', 60, 320);

    this.buildClouds();
    this.buildPrecip();
    this.buildBoundary();

    this.state = { ...WEATHER.clear };
    this.weatherKey = 'clear';
    this.autoTimer = 0;
    this.autoRng = new RNG(cfg.seedInt ^ 0xc10d);
    this.flash = 0;
    this.nextLightning = 6;
    this.windDir = new THREE.Vector2(1, 0.3).normalize();
    this.dayFactor = 1;
    this.night = 0;
    this.blinkT = 3;
    this.onThunder = null;
    this.precipKind = 0;
    this.viewDist = 320;
  }

  buildClouds() {
    const rng = new RNG(this.cfg.seedInt ^ 0xc1);
    const R = this.cfg.radius * 1.15;
    this.clouds = [];
    const puffs = [];
    const cubes = [];
    const n = 80;
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2), d = Math.sqrt(rng.next()) * R;
      const cloud = { x: Math.cos(a) * d, z: Math.sin(a) * d, y: rng.range(95, 160), order: rng.next(), cube: rng.chance(this.cfg.weirdness * 0.3), puffs: [] };
      const count = rng.int(4, 9);
      const sc = rng.range(6, 14);
      for (let k = 0; k < count; k++) {
        const p = { ox: rng.range(-1.6, 1.6) * sc, oy: rng.range(-0.3, 0.5) * sc * 0.5, oz: rng.range(-0.8, 0.8) * sc, s: sc * rng.range(0.5, 1.0), rot: rng.range(0, 3) };
        cloud.puffs.push(p);
        (cloud.cube ? cubes : puffs).push({ cloud, p });
      }
      this.clouds.push(cloud);
    }
    this.cloudMat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#555566' });
    this.puffMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), this.cloudMat, puffs.length);
    this.cubeMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), this.cloudMat, Math.max(1, cubes.length));
    this.puffList = puffs;
    this.cubeList = cubes;
    for (const m of [this.puffMesh, this.cubeMesh]) {
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
    }
    if (!cubes.length) this.cubeMesh.count = 0;
    this.cloudOffset = new THREE.Vector2();
  }

  buildPrecip() {
    const N = 7000;
    const pos = new Float32Array(N * 3), rnd = new Float32Array(N);
    const rng = new RNG(5);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = rng.range(0, 60); pos[i * 3 + 1] = rng.range(0, 40); pos[i * 3 + 2] = rng.range(0, 60);
      rnd[i] = rng.next();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
    this.precipMat = createPrecipMaterial();
    this.precip = new THREE.Points(g, this.precipMat);
    this.precip.frustumCulled = false;
    this.precip.renderOrder = 5;
    this.group.add(this.precip);
  }

  buildBoundary() {
    const R = this.cfg.radius;
    this.boundaryMat = createBoundaryMaterial();
    const g = new THREE.CylinderGeometry(R, R, 520, 180, 1, true);
    this.boundary = new THREE.Mesh(g, this.boundaryMat);
    this.boundary.position.y = 200;
    this.boundary.renderOrder = 3;
    this.boundary.frustumCulled = false;
    this.group.add(this.boundary);
  }

  setWeatherMode(mode) {
    this.mode = mode;
    if (mode !== 'auto') this.weatherKey = mode;
    else this.autoTimer = 0;
  }

  setViewDistance(d) { this.viewDist = d; }

  setShadows(on, size) {
    this.sun.castShadow = on;
    if (on && this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
  }

  /**
   * @param {number} dt
   * @param {number} hour 0..24
   * @param {THREE.Vector3} focus player position
   * @param {THREE.Camera} camera
   * @param {number} biome current biome index
   */
  update(dt, hour, focus, camera, biome, t) {
    // --- weather ---
    if (this.mode === 'auto') {
      this.autoTimer -= dt;
      if (this.autoTimer <= 0) {
        const w = this.cfg.weirdness;
        const opts = [
          { k: 'clear', w: 3 }, { k: 'cloudy', w: 2.5 }, { k: 'rain', w: 1.6 }, { k: 'mist', w: 1 + w },
          { k: 'storm', w: 0.6 + this.cfg.temperament * 0.6 }, { k: 'glitter', w: w * 1.5 },
        ];
        this.weatherKey = this.autoRng.weighted(opts).k;
        this.autoTimer = this.autoRng.range(80, 200);
      }
    }
    const target = WEATHER[this.weatherKey] || WEATHER.clear;
    const s = this.state;
    for (const k of ['cover', 'overcast', 'fog', 'precip', 'wind']) s[k] = damp(s[k], target[k], 0.6, dt);
    const bp = BIOMES[biome]?.precip;
    this.precipKind = target.kind ?? (bp === 'snow' ? 1 : bp === 'glitter' ? 2 : 0);
    shared.uWind.value = 0.08 + s.wind * 0.9;

    // --- sun & moon ---
    const sunSign = this.cfg.effects.sunDir;
    const theta = (hour / 24) * Math.PI * 2 - Math.PI / 2;
    const el = Math.sin(theta);
    const sunDir = new THREE.Vector3(Math.cos(theta) * sunSign, el, 0.35).normalize();
    const moonDir = new THREE.Vector3(-Math.cos(theta) * sunSign * 0.8, -el * 0.9 + 0.12, -0.45).normalize();
    const day = smoothstep(-0.12, 0.28, el);
    this.dayFactor = day;
    this.night = 1 - smoothstep(-0.25, 0.05, el);
    this.elevation = el;

    // sky colours
    const K = this.keys;
    const top = new THREE.Color(), hor = new THREE.Color(), bot = new THREE.Color();
    if (el < 0) {
      const u = smoothstep(-0.3, 0.02, el);
      top.lerpColors(K.night.top, K.twilight.top, u); hor.lerpColors(K.night.horizon, K.twilight.horizon, u); bot.lerpColors(K.night.bottom, K.twilight.bottom, u);
    } else {
      const u = smoothstep(0.0, 0.35, el);
      top.lerpColors(K.twilight.top, K.day.top, u); hor.lerpColors(K.twilight.horizon, K.day.horizon, u); bot.lerpColors(K.twilight.bottom, K.day.bottom, u);
    }
    const grey = new THREE.Color().setScalar(0.25 + 0.45 * day);
    top.lerp(grey, s.overcast * 0.7); hor.lerp(grey, s.overcast * 0.6);
    const u = this.skyMat.uniforms;
    u.uTop.value.copy(top); u.uHorizon.value.copy(hor); u.uBottom.value.copy(bot);
    u.uSunDir.value.copy(sunDir); u.uMoonDir.value.copy(moonDir);
    u.uNight.value = this.night;
    u.uTime.value = t;
    u.uOvercast.value = s.overcast;
    u.uSeam.value = 0.05 + this.night * 0.35 + this.cfg.weirdness * 0.1;
    u.uSunColor.value.setRGB(1, 0.75 + 0.2 * day, 0.5 + 0.4 * day);
    // the moon watches the player
    this.blinkT -= dt;
    let blink = 1;
    if (this.blinkT < 0) { blink = Math.abs(Math.sin(this.blinkT * 12)); if (this.blinkT < -0.26) this.blinkT = 3 + Math.random() * 6; }
    u.uBlink.value = blink;
    u.uMoonLook.value.set(clamp(-camera.position.x / this.cfg.radius, -1, 1), clamp(-camera.position.z / this.cfg.radius, -1, 1));
    this.sky.position.copy(camera.position);

    // lightning
    if (target.lightning) {
      this.nextLightning -= dt;
      if (this.nextLightning <= 0) {
        this.flash = 1;
        this.nextLightning = 4 + Math.random() * 9;
        this.onThunder?.();
      }
    }
    this.flash = Math.max(0, this.flash - dt * 4);
    u.uFlash.value = this.flash * 0.6;

    // lights
    const useSun = el > -0.06;
    const ldir = useSun ? sunDir : moonDir;
    this.sun.intensity = (useSun ? 2.4 * smoothstep(-0.06, 0.2, el) : 0.45 * this.night) * (1 - s.overcast * 0.55) + this.flash * 2;
    this.sun.color.setRGB(useSun ? 1 : 0.6, useSun ? 0.78 + 0.2 * day : 0.7, useSun ? 0.6 + 0.35 * day : 1);
    this.hemi.intensity = 0.55 + day * 1.0 - s.overcast * 0.2 + this.flash * 1.5;
    this.hemi.color.copy(top).lerp(new THREE.Color(1, 1, 1), 0.35);
    this.hemi.groundColor.copy(bot).lerp(new THREE.Color('#5a4a6a'), 0.5);
    const tx = Math.round(focus.x / 2) * 2, tz = Math.round(focus.z / 2) * 2;
    this.sun.target.position.set(tx, focus.y, tz);
    this.sun.position.set(tx + ldir.x * 160, focus.y + Math.max(0.15, ldir.y) * 160, tz + ldir.z * 160);
    shared.uGlow.value = (0.12 + this.night * 1.1 + s.overcast * 0.2) * (this.cfg.palette.glow ?? 1) * (this.night > 0.3 ? this.cfg.effects.glowMul : 1);

    // fog
    const fogCol = hor.clone().lerp(this.biomeFog[biome] || hor, 0.3 * day + 0.1).multiplyScalar(0.55 + 0.45 * Math.max(day, 0.2));
    if (this.night > 0.5) fogCol.lerp(new THREE.Color('#0d0d24'), (this.night - 0.5) * 1.4);
    this.scene.fog.color.copy(fogCol);
    const far = this.viewDist * s.fog;
    this.scene.fog.far = damp(this.scene.fog.far, far, 2, dt);
    this.scene.fog.near = this.scene.fog.far * (0.15 + 0.2 * s.fog);
    this.fogColor = fogCol;

    // clouds
    this.cloudOffset.x += this.windDir.x * (2 + s.wind * 10) * dt;
    this.cloudOffset.y += this.windDir.y * (2 + s.wind * 10) * dt;
    const brightness = 0.35 + 0.65 * day;
    const cc = new THREE.Color(1, 1, 1).lerp(new THREE.Color(0.45, 0.45, 0.5), s.overcast).multiplyScalar(brightness);
    this.cloudMat.color.copy(cc);
    this.cloudMat.emissive.copy(hor).multiplyScalar(0.25 + 0.2 * this.night).addScalar(this.flash * 0.5);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const R = this.cfg.radius * 1.2;
    const writeList = (list, mesh) => {
      let i = 0;
      for (const { cloud, p: puff } of list) {
        let cx = cloud.x + this.cloudOffset.x, cz = cloud.z + this.cloudOffset.y;
        // wrap within a square around the world
        cx = ((cx + R) % (2 * R) + 2 * R) % (2 * R) - R;
        cz = ((cz + R) % (2 * R) + 2 * R) % (2 * R) - R;
        const vis = cloud.order < s.cover ? 1 : 0;
        p.set(cx + puff.ox, cloud.y + puff.oy + Math.sin(t * 0.2 + cloud.order * 10) * 2, cz + puff.oz);
        q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, puff.rot + (cloud.cube ? t * 0.05 : 0));
        const ss = puff.s * vis;
        sc.set(ss, ss * (cloud.cube ? 1 : 0.6), ss);
        m.compose(p, q, sc);
        mesh.setMatrixAt(i++, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    };
    writeList(this.puffList, this.puffMesh);
    if (this.cubeList.length) writeList(this.cubeList, this.cubeMesh);

    // precipitation
    const pu = this.precipMat.uniforms;
    pu.uTime.value = t;
    pu.uCam.value.copy(camera.position);
    pu.uKind.value = this.precipKind;
    pu.uAmount.value = s.precip;
    pu.uWind.value.set(this.windDir.x * s.wind * 6, this.windDir.y * s.wind * 6);
    this.precip.visible = s.precip > 0.02;

    // containment wall
    this.boundaryMat.uniforms.uTime.value = t;
    this.boundaryMat.uniforms.uPlayer.value.copy(focus);
  }

  get raining() { return this.state.precip > 0.3; }
  get weatherLabel() { return (WEATHER[this.weatherKey] || WEATHER.clear).label + (this.mode === 'auto' ? ' (auto)' : ''); }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) o.material.dispose();
    });
    this.sun.shadow.map?.dispose();
  }
}
