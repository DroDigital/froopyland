// End-to-end smoke test: boots the built app in headless Chromium, plays it with keyboard and a
// simulated gamepad, checks world generation, interaction, settings, save/restore and errors.
import { createRequire } from 'node:module';
let chromium;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch {
  console.error('Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const OUT = process.env.SMOKE_OUT || 'smoke-output';
mkdirSync(OUT, { recursive: true });
const PORT = 4179;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((r) => { server.stdout.on('data', (d) => { if (String(d).includes(String(PORT))) r(); }); setTimeout(r, 6000); });

const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok, info }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
// fake gamepad support (toggled from tests)
await page.addInitScript(() => {
  window.__pad = null;
  navigator.getGamepads = () => [window.__pad];
});
const G = (fn, arg) => page.evaluate(fn, arg);
const sleep = (ms) => page.waitForTimeout(ms);
// software rendering is slow; wait until chunk streaming has settled before timing-sensitive checks
const settle = () => page.waitForFunction(() => window.__froopy.world.chunks.pending === 0, null, { timeout: 60000 }).catch(() => {});
// advance until a given amount of *simulated* time has passed
const simWait = async (sec) => { const t0 = await G(() => window.__froopy.time); await page.waitForFunction(([a, b]) => window.__froopy.time - a > b, [t0, sec], { timeout: 60000 }).catch(() => {}); };

try {
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => window.__froopy && window.__froopy.world, null, { timeout: 30000 });
  await sleep(2500);
  await page.screenshot({ path: `${OUT}/01-start.png` });
  check('start screen visible', await page.isVisible('#start'));

  await page.fill('#startSeed', 'smoke-test-seed');
  await page.click('#btnStart');
  await page.waitForFunction(() => window.__froopy.started, null, { timeout: 30000 });
  await sleep(3000);
  const info = await G(() => { const g = window.__froopy; return { seed: g.world.cfg.seed, name: g.world.cfg.name, chunks: g.world.chunks.chunks.size, creatures: g.world.creatures.list.length, lms: g.world.landmarkList.length, pos: g.player.pos.toArray() }; });
  check('world generated from typed seed', info.seed === 'smoke-test-seed', JSON.stringify(info));
  check('chunks streamed', info.chunks > 20, `${info.chunks} chunks`);
  check('seed shown in HUD', (await page.textContent('#seedChip')).includes('smoke-test-seed'));
  await page.screenshot({ path: `${OUT}/02-ingame.png` });

  // keyboard movement
  const p0 = await G(() => window.__froopy.player.pos.toArray());
  await settle();
  await page.keyboard.down('KeyW'); await simWait(1.5); await page.keyboard.up('KeyW');
  const p1 = await G(() => window.__froopy.player.pos.toArray());
  const moved = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
  check('W moves the player', moved > 4, `${moved.toFixed(2)} m`);
  // sprint + jump
  await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyD'); await sleep(800);
  await page.keyboard.press('Space'); await sleep(150);
  const air = await G(() => !window.__froopy.player.onGround || window.__froopy.player.swimming);
  await page.keyboard.up('KeyD'); await page.keyboard.up('ShiftLeft');
  check('Space jumps', air);
  await sleep(1200);
  // mouse look via drag
  const yaw0 = await G(() => window.__froopy.player.yaw);
  await page.mouse.move(640, 400); await page.mouse.down(); await page.mouse.move(840, 420, { steps: 8 }); await page.mouse.up();
  await sleep(100);
  const yaw1 = await G(() => window.__froopy.player.yaw);
  check('mouse drag rotates camera', Math.abs(yaw1 - yaw0) > 0.1, `${(yaw1 - yaw0).toFixed(2)} rad`);
  // view toggle
  await page.keyboard.press('KeyV'); await sleep(300);
  check('V toggles first person', await G(() => window.__froopy.player.view === 'first'));
  await page.screenshot({ path: `${OUT}/03-firstperson.png` });
  await page.keyboard.press('KeyV'); await sleep(200);

  // observe a creature: put one in front of the camera
  const obs = await G(() => {
    const g = window.__froopy, w = g.world;
    const c = w.creatures.list[0];
    if (!c) return 'no creatures';
    const P = g.player.pos, fx = -Math.sin(g.player.yaw), fz = -Math.cos(g.player.yaw);
    const x = P.x + fx * 10, z = P.z + fz * 10;
    c.pos.set(x, w.chunks.heightAt(x, z), z);
    c.group.position.copy(c.pos);
    c.mode = 'curious'; c.modeT = 5; c.decideT = 5;
    window.__obs = c;
    return c.sp.id;
  });
  for (let i = 0; i < 3; i++) {
    await G(() => { const g = window.__froopy, c = window.__obs, cam = g.camera.position; const dx = c.pos.x - cam.x, dz = c.pos.z - cam.z; g.player.pitch = Math.atan2(c.pos.y + c.height * 0.5 - cam.y, Math.hypot(dx, dz)); });
    await sleep(120);
  }
  await page.keyboard.press('KeyQ'); await sleep(300);
  check('Q observes a creature', await G((id) => window.__froopy.world.state.observed.has(id), obs), obs);

  // whistle
  await page.keyboard.press('KeyR'); await sleep(200);
  check('R whistle shows feedback', (await page.textContent('#toasts')).includes('whistle'));

  // fruit + feed
  const fed = await G(() => {
    const g = window.__froopy, w = g.world, P = g.player.pos;
    w.chunks.addItem({ id: 'test-fruit', kind: 'fruit', x: P.x + 0.5, y: P.y + 0.4, z: P.z, transient: true });
    return true;
  });
  await sleep(100);
  const prompt1 = await page.textContent('#prompt');
  await page.keyboard.press('KeyE'); await sleep(200);
  check('E picks fruit', await G(() => window.__froopy.world.state.fruit >= 1), prompt1);
  await G(() => { const g = window.__froopy, c = g.world.creatures.list[0], P = g.player.pos; c.pos.set(P.x + 1.5, P.y, P.z); c.friendT = 0; });
  await sleep(100);
  await page.keyboard.press('KeyE'); await sleep(200);
  check('E feeds a creature (befriends)', await G(() => window.__froopy.world.state.fed >= 1));

  // landmark discovery + interaction via teleport to the welcome terminal
  const term = await G(() => { const w = window.__froopy.world; const l = w.landmarkList.find((x) => x.welcome) || w.landmarkList[0]; window.__froopy.teleport(l.x + 2, l.z + 2, 0); return l.id; });
  await settle(); await simWait(0.6);
  check('walking near a landmark discovers it', await G((id) => window.__froopy.world.state.discovered.has(id), term));
  const rules0 = await G(() => window.__froopy.world.state.rules.size);
  await page.keyboard.press('KeyE'); await sleep(300);
  const rules1 = await G(() => window.__froopy.world.state.rules.size);
  check('terminal interaction decodes a rule', rules1 > rules0, `${rules0} -> ${rules1}`);
  await page.screenshot({ path: `${OUT}/04-terminal.png` });

  // portal teleport
  const portal = await G(() => { const w = window.__froopy.world; const l = w.landmarkList.find((x) => x.type === 'portal'); window.__froopy.teleport(l.x + 1, l.z + 1, 0); return { id: l.id, link: l.link, x: l.x, z: l.z }; });
  await settle(); await simWait(0.3);
  console.log('  prompt at portal:', await page.textContent('#prompt'), await page.isVisible('#prompt'));
  await page.keyboard.press('KeyE'); await sleep(800);
  const after = await G(() => window.__froopy.player.pos.toArray());
  check('portal folds you across the world', Math.hypot(after[0] - portal.x, after[2] - portal.z) > 50, JSON.stringify(after.map((v) => Math.round(v))));

  // every landmark type builds and its interaction runs
  const lmRes = await G(async () => {
    const g = window.__froopy, w = g.world, out = {};
    const seen = new Set();
    for (const l of w.landmarkList) {
      if (seen.has(l.type)) continue;
      seen.add(l.type);
      g.teleport(l.x + 1.5, l.z + 1.5, 0);
      const inst = w.landmarks.active.get(l.id);
      if (!inst) { out[l.type] = 'not built'; continue; }
      try {
        inst.update?.(0.016, w);
        if (inst.interact && l.type !== 'portal') {
          let msg = '';
          for (let i = 0; i < (l.type === 'egg' ? 3 : 1); i++) msg = inst.interact.fn(w);
          out[l.type] = 'ok: ' + String(msg).slice(0, 50);
        } else out[l.type] = 'ok';
      } catch (e) { out[l.type] = 'ERROR ' + e.message; }
    }
    return out;
  });
  const lmErr = Object.entries(lmRes).filter(([, v]) => !v.startsWith('ok'));
  check(`all ${Object.keys(lmRes).length} landmark types build & interact`, lmErr.length === 0, lmErr.length ? JSON.stringify(lmErr) : Object.keys(lmRes).join(','));
  check('egg hatches into a following hatchling', await G(() => window.__froopy.world.hatchlings.length > 0 && window.__froopy.world.hatchlings[0].friendT > 0));

  // bounce: drop onto a mushroom platform / giant mushroom
  const bounce = await G(() => {
    const g = window.__froopy, w = g.world;
    const l = w.landmarkList.find((x) => x.type === 'giantshroom' || x.type === 'floaters');
    if (!l) return 'none';
    g.teleport(l.x, l.z, 0);
    const inst = w.landmarks.active.get(l.id);
    const p = inst.platforms[0];
    g.player.pos.set(p.x, p.y + 3, p.z); g.player.vel.set(0, -10, 0);
    return l.type;
  });
  await simWait(0.35);
  check('bouncy platforms launch the player', await G(() => window.__froopy.player.vel.y > 5 || window.__froopy.player.pos.y > 8), bounce);
  await settle();

  // creature AI: simulate 3 in-world minutes and collect behaviours
  const modes = await G(() => {
    const g = window.__froopy, w = g.world, P = g.player.pos, seen = {};
    const ctx = { t: 0, hour: 12, night: 0, raining: false, effects: w.cfg.effects, player: { pos: P, sprinting: false, inWater: false } };
    for (let i = 0; i < 1800; i++) {
      ctx.t += 0.1;
      if (i === 900) { ctx.night = 1; ctx.hour = 23; }
      if (i === 1300) ctx.raining = true;
      w.creatures.update(0.1, ctx);
      for (const c of w.creatures.list) seen[c.mode] = (seen[c.mode] || 0) + 1;
    }
    return seen;
  });
  check('creatures show varied needs-driven behaviour', Object.keys(modes).length >= 6, JSON.stringify(modes));

  // panels
  for (const [key, id] of [['KeyM', 'panelMap'], ['KeyJ', 'panelJournal'], ['KeyH', 'panelHelp'], ['KeyP', 'panelCreator']]) {
    await page.keyboard.press(key); await sleep(300);
    const vis = await page.isVisible(`#${id}`);
    await page.screenshot({ path: `${OUT}/05-${id}.png` });
    await page.keyboard.press('Escape'); await sleep(200);
    check(`${key} opens ${id}`, vis);
  }

  // gamepad: move with left stick, jump with A
  await G(() => {
    const mk = (pressed) => ({ pressed, value: pressed ? 1 : 0 });
    window.__pad = { id: 'Test Pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', axes: [0, -1, 0.6, 0], buttons: Array.from({ length: 17 }, () => mk(false)) };
  });
  console.log('  panel before pad:', await G(() => [window.__froopy.panel, window.__froopy.input.getPad()?.id, document.activeElement?.id]));
  await settle();
  const gp0 = await G(() => [window.__froopy.player.pos.toArray(), window.__froopy.player.yaw]);
  await simWait(1.2);
  const gp1 = await G(() => [window.__froopy.player.pos.toArray(), window.__froopy.player.yaw]);
  check('gamepad left stick moves', Math.hypot(gp1[0][0] - gp0[0][0], gp1[0][2] - gp0[0][2]) > 2, JSON.stringify([gp0[0], gp1[0]].map((p) => p.map((v) => +v.toFixed(1)))));
  check('gamepad right stick looks', Math.abs(gp1[1] - gp0[1]) > 0.3);
  await G(() => { window.__pad.axes = [0, 0, 0, 0]; window.__pad.buttons[0] = { pressed: true, value: 1 }; });
  await sleep(120);
  const padJump = await G(() => window.__froopy.player.vel.y > 0 || window.__froopy.player.swimming);
  await G(() => { window.__pad.buttons[0] = { pressed: false, value: 0 }; window.__pad.buttons[8] = { pressed: true, value: 1 }; });
  await sleep(150);
  check('gamepad A jumps', padJump);
  check('gamepad View opens map', await page.isVisible('#panelMap'));
  await G(() => { window.__pad.buttons[8] = { pressed: false, value: 0 }; window.__pad.buttons[1] = { pressed: true, value: 1 }; });
  await sleep(150);
  check('gamepad B closes panel', !(await page.isVisible('#panelMap')));
  await G(() => { window.__pad = null; });

  // creator: live time-of-day + regenerate with a new seed + preset
  await page.keyboard.press('KeyP'); await sleep(200);
  await page.$eval('#cs_timeOfDay', (el) => { el.value = '22'; el.dispatchEvent(new Event('input')); });
  await sleep(1000);
  check('time slider changes time of day', await G(() => Math.abs(window.__froopy.hour - 22) < 0.5));
  await page.screenshot({ path: `${OUT}/06-night.png` });
  const h1 = await G(() => window.__froopy.world.terrain.height(100, 100));
  await page.fill('#cs_seed', 'second-world');
  await page.click('#cs_regen'); await sleep(1500);
  const h2 = await G(() => window.__froopy.world.terrain.height(100, 100));
  check('regenerate with new seed changes the world', h1 !== h2 && (await page.textContent('#seedChip')).includes('second-world'));
  await page.click('#cs_presets button:nth-child(3)'); await sleep(1500);
  const ch = await G(() => ({ p: window.__froopy.settings.palette, t: window.__froopy.settings.temperament, cap: window.__froopy.world.creatures.cap }));
  check('chaotic preset changes generation settings', ch.p === 'neon' && ch.t === 1, JSON.stringify(ch));
  await page.keyboard.press('Escape'); await sleep(2500);
  await page.screenshot({ path: `${OUT}/07-chaotic.png` });

  // save & restore
  const before = await G(() => { const g = window.__froopy; g.save(); return { seed: g.settings.seed, pos: g.player.pos.toArray(), obs: g.world.state.observed.size }; });
  await page.reload();
  await page.waitForFunction(() => window.__froopy && window.__froopy.world, null, { timeout: 30000 });
  await sleep(800);
  check('continue button offered after reload', await page.isVisible('#btnContinue'));
  await page.click('#btnContinue');
  await sleep(1500);
  const restored = await G(() => { const g = window.__froopy; return { seed: g.settings.seed, pos: g.player.pos.toArray() }; });
  const dpos = Math.hypot(restored.pos[0] - before.pos[0], restored.pos[2] - before.pos[2]);
  check('save restores seed and position', restored.seed === before.seed && dpos < 3, `${restored.seed} Δ${dpos.toFixed(2)}m`);
  const back = await G(() => { const g = window.__froopy; g.pending = { ...g.pending, seed: 'smoke-test-seed' }; g.regenerate(); return g.world.state.observed.size + g.world.state.discovered.size; });
  check('switching back to first seed restores its discoveries', back >= 2, `${back}`);

  // performance sample (software GL — real GPUs are far faster)
  await sleep(2000);
  const perf = await G(() => ({ fps: window.__froopy.fps, calls: window.__froopy.renderer.info.render.calls, tris: window.__froopy.renderer.info.render.triangles }));
  console.log('perf (SwiftShader, not representative):', JSON.stringify(perf));
  await page.screenshot({ path: `${OUT}/08-final.png` });
} catch (e) {
  check('smoke run completed', false, String(e));
}
check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
server.kill();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
