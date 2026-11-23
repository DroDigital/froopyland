import { PRESETS, PALETTES, QUALITY, WEATHER_TYPES, GEN_KEYS } from '../config/settings.js';
import { BIOMES } from '../world/biomes.js';
import { BEHAVIORS, TEMPERAMENTS } from '../creatures/species.js';
import { angleDiff, TAU } from '../core/math.js';
import { rgbToHex } from '../core/color.js';
import { ICONS } from './map.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtHour = (h) => { const hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; };
const ARCH_LABEL = { blob: 'Hopping blob', quad: 'Four-legged trotter', strider: 'Stilt-legged strider', floater: 'Drifting floater', worm: 'Segmented noodle' };
const DIET_LABEL = { grazer: 'Grazes on plants', crystal: 'Nibbles crystals', basker: 'Eats sunlight' };
const ACT_LABEL = { diurnal: 'Active by day', nocturnal: 'Active at night', crepuscular: 'Active at dawn & dusk' };

export class UI {
  constructor(game) {
    this.game = game;
    this.toasts = $('toasts');
    this.journalTab = 'overview';
    this.compassPool = [];
    this.mapZoom = 1; this.mapCX = 0; this.mapCZ = 0;
    this.buildStart();
    this.buildCreator();
    this.buildJournalTabs();
    this.buildMap();
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => game.closePanel()));
    document.querySelectorAll('.panel-wrap').forEach((w) => w.addEventListener('mousedown', (e) => { if (e.target === w) game.closePanel(); }));
    $('seedChip').addEventListener('click', () => {
      navigator.clipboard?.writeText(game.settings.seed).then(() => this.toast('Seed copied to clipboard'), () => {});
    });
    const cs = $('compassStrip');
    for (const [label, b] of [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]]) {
      const el = document.createElement('div');
      el.className = 'cmark' + (label.length === 1 ? ' card' : '') + (label === 'N' ? ' n' : '');
      el.textContent = label;
      el.dataset.b = String((b * Math.PI) / 180);
      cs.appendChild(el);
    }
    for (let d = 15; d < 360; d += 15) {
      if (d % 45 === 0) continue;
      const el = document.createElement('div');
      el.className = 'cmark';
      el.textContent = '·';
      el.dataset.b = String((d * Math.PI) / 180);
      cs.appendChild(el);
    }
    this.cardinals = [...cs.children];
  }

  // ---------- start screen ----------
  buildStart() {
    const g = this.game;
    const wrap = $('startPresets');
    for (const [k, p] of Object.entries(PRESETS)) {
      const b = document.createElement('button');
      b.textContent = p.label;
      b.title = p.description;
      b.addEventListener('click', () => {
        wrap.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        this.startPreset = k;
      });
      wrap.appendChild(b);
    }
    $('startDice').addEventListener('click', () => { $('startSeed').value = g.randomSeed(); });
    $('btnStart').addEventListener('click', () => g.enterFromStart($('startSeed').value, this.startPreset, false));
    $('btnContinue').addEventListener('click', () => g.enterFromStart(null, null, true));
    $('startSeed').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btnStart').click(); });
  }

  showStart(seed, canContinue) {
    $('start').classList.remove('hidden');
    $('hud').classList.add('hidden');
    $('startSeed').value = seed;
    $('btnContinue').classList.toggle('hidden', !canContinue);
    $('btnContinue').textContent = canContinue ? `Continue “${seed}”` : 'Continue';
  }
  hideStart() { $('start').classList.add('hidden'); $('hud').classList.remove('hidden'); }
  setLoading(t) { $('loadingText').textContent = t; }

  // ---------- toasts / prompt ----------
  toast(html, big = false, dur = 4200) {
    const el = document.createElement('div');
    el.className = 'toast' + (big ? ' big' : '');
    el.innerHTML = html;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
    setTimeout(() => el.classList.add('fade'), dur);
    setTimeout(() => el.remove(), dur + 700);
  }

  key(action) {
    const pad = this.game.lastDevice === 'gamepad';
    const map = { interact: pad ? 'X' : 'E', observe: pad ? 'Y' : 'Q', whistle: pad ? 'LB' : 'R' };
    return map[action] || action;
  }

  setPrompt(text, action = 'interact') {
    const el = $('prompt');
    if (!text) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const html = `<kbd>${this.key(action)}</kbd>${esc(text)}`;
    if (el.innerHTML !== html) el.innerHTML = html;
  }

  // ---------- HUD ----------
  updateHUD(w, hour, biome) {
    const st = w.state, T = w.totals;
    $('worldName').textContent = w.cfg.name;
    $('seedChip').textContent = `seed: ${w.cfg.seed}`;
    $('clock').textContent = `☼ ${fmtHour(hour)}`;
    $('weatherLabel').textContent = w.env.weatherLabel;
    $('biomeLabel').textContent = BIOMES[biome]?.name ?? '';
    $('cPlaces').textContent = `${st.discovered.size}/${T.landmarks}`;
    $('cSpecies').textContent = `${[...st.observed.keys()].filter((k) => !k.startsWith('hatch')).length}/${T.species}`;
    $('cMotes').textContent = `${st.motes.size}/${T.motes}`;
    $('cFruit').textContent = String(st.fruit);
    const pad = this.game.lastDevice === 'gamepad';
    $('hints').innerHTML = pad
      ? 'Ⓐ jump/glide · Ⓧ interact · Ⓨ observe · LB whistle<br>View map · ↑ journal · Menu creator · ↓ help'
      : '<b>E</b> interact · <b>Q</b> observe · <b>R</b> whistle · <b>V</b> view<br><b>M</b> map · <b>J</b> journal · <b>P</b> creator · <b>H</b> help';
    const boosts = this.game.player.boosts;
    const b = [];
    if (boosts.rainbow > 0) b.push(`<div class="boost">🌈 Rainbow ${Math.ceil(boosts.rainbow)}s</div>`);
    const friends = w.creatures.list.filter((c) => c.friendT > 0).length;
    if (friends) b.push(`<div class="boost">♥ ${friends} following</div>`);
    const html = b.join('');
    if ($('boosts').innerHTML !== html) $('boosts').innerHTML = html;
  }

  updateCompass(heading, marks) {
    const W = $('compass').clientWidth;
    const place = (el, b) => {
      const rel = angleDiff(heading, b);
      if (Math.abs(rel) > Math.PI / 2) { el.style.display = 'none'; return; }
      el.style.display = '';
      el.style.left = `${(0.5 + rel / Math.PI) * W}px`;
    };
    for (const el of this.cardinals) place(el, +el.dataset.b);
    const cs = $('compassStrip');
    while (this.compassPool.length < marks.length) {
      const el = document.createElement('div');
      cs.appendChild(el);
      this.compassPool.push(el);
    }
    this.compassPool.forEach((el, i) => {
      const m = marks[i];
      if (!m) { el.style.display = 'none'; return; }
      el.className = `cmark ${m.cls}`;
      const html = `${m.icon}<small>${m.dist}</small>`;
      if (el.innerHTML !== html) el.innerHTML = html;
      place(el, m.b);
    });
  }

  infoCard(c, w) {
    const el = $('infoCard');
    if (!c) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const sp = c.sp;
    const known = w.state.observed.get(sp.id);
    let html;
    if (!known) {
      html = `<h4>Unknown resident</h4><div class="muted">Press <span class="keycap">${this.key('observe')}</span>to observe and log this species.</div>`;
    } else {
      const bar = (label, v) => `<div class="small">${label}</div><div class="bar"><i style="width:${Math.round(v * 100)}%"></i></div>`;
      html = `<h4>${esc(sp.name)}</h4>
        <div class="small muted">${ARCH_LABEL[sp.archetype]} · ${TEMPERAMENTS[sp.temper]} · ${DIET_LABEL[sp.diet]}</div>
        <div class="doing">${BEHAVIORS[c.mode] || c.mode}</div>
        ${bar('Hunger', c.needs.hunger)}${bar('Thirst', c.needs.thirst)}${bar('Energy', c.needs.energy)}
        <div class="small muted">Behaviours logged: ${known.size}/${Object.keys(BEHAVIORS).length}${w.state.fruit > 0 && c.friendT <= 0 ? ` · Feed it with <span class="keycap">${this.key('interact')}</span>` : ''}</div>`;
    }
    if (el.dataset.k !== html) { el.innerHTML = html; el.dataset.k = html; }
  }

  stats(on, text) {
    const el = $('stats');
    el.classList.toggle('hidden', !on);
    if (on) el.textContent = text;
  }

  wallWarning(on) { $('wallWarn').classList.toggle('hidden', !on); }
  crosshair(mode) { $('crosshair').className = mode || ''; }

  // ---------- panels ----------
  showPanel(name) {
    for (const p of ['Help', 'Journal', 'Map', 'Creator']) $(`panel${p}`).classList.toggle('hidden', p.toLowerCase() !== name);
    if (name === 'journal') this.renderJournal();
    if (name === 'creator') this.syncCreator();
    if (name === 'map') { this.mapZoom = 1; this.mapCX = 0; this.mapCZ = 0; this.renderLegend(); }
  }

  buildJournalTabs() {
    const tabs = $('journalTabs');
    for (const [k, label] of [['overview', 'Overview'], ['places', 'Places'], ['residents', 'Residents'], ['memories', 'Memories'], ['rules', 'World rules']]) {
      const b = document.createElement('button');
      b.textContent = label;
      b.dataset.tab = k;
      b.addEventListener('click', () => { this.journalTab = k; this.renderJournal(); });
      tabs.appendChild(b);
    }
  }

  cycleJournal(dir) {
    const order = ['overview', 'places', 'residents', 'memories', 'rules'];
    this.journalTab = order[(order.indexOf(this.journalTab) + dir + order.length) % order.length];
    this.renderJournal();
  }

  renderJournal() {
    const w = this.game.world, st = w.state, T = w.totals;
    $('journalTabs').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.tab === this.journalTab));
    const body = $('journalBody');
    const prog = (label, a, b) => `<div class="small">${label} <b>${a}/${b}</b></div><div class="progress"><i style="width:${b ? Math.min(100, (a / b) * 100) : 0}%"></i></div>`;
    const nSpecies = [...st.observed.keys()].filter((k) => !k.startsWith('hatch')).length;
    const behTotal = w.species.filter((s) => !s.unique).length * Object.keys(BEHAVIORS).length;
    const behSeen = [...st.observed.entries()].filter(([k]) => !k.startsWith('hatch')).reduce((a, [, v]) => a + v.size, 0);
    let html = '';
    if (this.journalTab === 'overview') {
      const explored = Math.round(w.map.explored() * 100);
      const total = (st.discovered.size / T.landmarks + nSpecies / T.species + st.motes.size / T.motes + st.rules.size / T.rules) / 4;
      html = `<h3>${esc(w.cfg.name)}</h3><div class="small muted">Seed “${esc(w.cfg.seed)}” · radius ${w.cfg.radius} m · ${PALETTES[w.cfg.paletteKey].label} palette</div>
        <div style="margin-top:12px"></div>
        ${prog('Overall completion', Math.round(total * 100), 100)}
        ${prog('Places discovered', st.discovered.size, T.landmarks)}
        ${prog('Species observed', nSpecies, T.species)}
        ${prog('Behaviours logged', behSeen, behTotal)}
        ${prog('Memory motes', st.motes.size, T.motes)}
        ${prog('World rules decoded', st.rules.size, T.rules)}
        ${prog('Biomes visited', st.biomes.size, BIOMES.length)}
        ${prog('Map explored (%)', explored, 100)}
        <div class="small muted">Residents befriended: ${st.fed} · Distance walked: ${(st.distance / 1000).toFixed(2)} km · Time here: ${Math.floor(st.playTime / 60)} min</div>`;
    } else if (this.journalTab === 'places') {
      const found = w.landmarkList.filter((l) => st.discovered.has(l.id));
      const rumor = w.landmarkList.filter((l) => !st.discovered.has(l.id) && st.rumored.has(l.id));
      html = `<div class="small muted">${found.length} of ${T.landmarks} places discovered. Follow the pulsing <span class="pink">?</span> on the compass.</div><div class="grid2" style="margin-top:10px">`;
      for (const l of found) html += `<div class="entry"><h4>${ICONS[l.type]} ${esc(l.name)}</h4><div class="meta">${BIOMES[l.biome].name}${st.awakened.has(l.id) ? ' · awakened' : ''}</div><div style="margin-top:4px;font-size:13px">${esc(l.lore)}</div></div>`;
      for (const l of rumor) html += `<div class="entry locked"><h4>? Rumoured place</h4><div class="meta">Somewhere in ${BIOMES[l.biome].name} — marked on your map</div></div>`;
      const rest = T.landmarks - found.length - rumor.length;
      if (rest > 0) html += `<div class="entry locked"><h4>??? × ${rest}</h4><div class="meta">Undiscovered places remain.</div></div>`;
      html += '</div>';
    } else if (this.journalTab === 'residents') {
      html = `<div class="small muted">Observe a resident with <span class="keycap">${this.key('observe')}</span>, then keep watching to log what it does.</div><div class="grid2" style="margin-top:10px">`;
      for (const sp of w.species) {
        const seen = st.observed.get(sp.id);
        if (!seen) { if (!sp.unique) html += `<div class="entry locked"><h4>??? </h4><div class="meta">${ARCH_LABEL[sp.archetype]} · lives in ${BIOMES[sp.biome].name}</div></div>`; continue; }
        const tags = Object.entries(BEHAVIORS).map(([k, v]) => `<span class="${seen.has(k) ? '' : 'no'}">${v}</span>`).join('');
        html += `<div class="entry"><h4><span class="swatch" style="background:${rgbToHex(sp.colors.body)}"></span>${esc(sp.name)}</h4>
          <div class="meta">${ARCH_LABEL[sp.archetype]} · ${sp.unique ? 'Your hatchling' : BIOMES[sp.biome].name}<br>${TEMPERAMENTS[sp.temper]} · ${DIET_LABEL[sp.diet]} · ${ACT_LABEL[sp.activity]}${sp.eyes > 2 ? ` · ${sp.eyes} eyes` : ''}${sp.swims ? ' · swims' : ''}</div>
          <div class="tags">${tags}</div></div>`;
      }
      html += '</div>';
    } else if (this.journalTab === 'memories') {
      const n = w.memoryCount();
      html = `<div class="small muted">Every 3 memory motes ✧ restore a fragment of the builder's log. ${st.motes.size}/${T.motes} motes collected.</div><div style="margin-top:10px">`;
      w.memories.forEach((m, i) => {
        html += i < n ? `<div class="entry"><h4>Fragment ${i + 1}</h4><div>${esc(m)}</div></div>` : `<div class="entry locked"><h4>Fragment ${i + 1}</h4><div class="meta">Collect ${(i + 1) * 3 - st.motes.size} more motes.</div></div>`;
      });
      html += '</div>';
    } else if (this.journalTab === 'rules') {
      html = `<div class="small muted">Every pocket world runs on its own rules. Decode them at terminals ⌨ and monoliths ▮.</div><div style="margin-top:10px">`;
      w.cfg.rules.forEach((r, i) => {
        html += st.rules.has(r.id) ? `<div class="entry"><h4>Rule ${i + 1}</h4><div>${esc(r.text)}</div></div>` : `<div class="entry locked"><h4>Rule ${i + 1}: ████████</h4><div class="meta">Undecoded.</div></div>`;
      });
      html += '</div>';
    }
    body.innerHTML = html;
  }

  // ---------- creator ----------
  buildCreator() {
    const g = this.game;
    const body = $('creatorBody');
    const slider = (key, label, min, max, step, fmt, hint, gen) => `
      <div class="setting"><label for="cs_${key}">${label} ${gen ? '<span class="gen-dot" title="Applies when you regenerate">•</span>' : ''}<span id="cv_${key}"></span></label>
      <input type="range" id="cs_${key}" min="${min}" max="${max}" step="${step}" data-key="${key}" data-fmt="${fmt}">
      ${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
    const select = (key, label, opts, gen, hint = '') => `
      <div class="setting"><label for="cs_${key}">${label} ${gen ? '<span class="gen-dot">•</span>' : ''}</label>
      <select id="cs_${key}" data-key="${key}">${Object.entries(opts).map(([k, v]) => `<option value="${k}">${typeof v === 'string' ? v : v.label}</option>`).join('')}</select>${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
    body.innerHTML = `
      <section>
        <h3>World generation</h3>
        <div class="setting"><label>Seed <span class="gen-dot">•</span></label>
          <div class="row"><input type="text" id="cs_seed" maxlength="48" spellcheck="false" style="flex:1"><button id="cs_dice" title="Random seed">🎲</button></div></div>
        <div class="setting"><label>Presets</label><div class="row presets" id="cs_presets"></div><div class="hint" id="cs_presetDesc"></div></div>
        ${slider('worldSize', 'World size (radius)', 500, 2600, 50, 'm', 'Bigger pockets hold more places and biomes.', true)}
        ${slider('terrainVariety', 'Terrain variety', 0.3, 2, 0.05, 'x', 'Relief, mountain height and how often biomes change.', true)}
        ${slider('creaturePopulation', 'Creature population', 0, 2, 0.05, 'x', 'How many residents spawn (capped for frame rate).', true)}
        ${slider('weirdness', 'Weirdness', 0, 1, 0.05, '%', 'Uncanny biomes, floating rocks, extra eyes, number of world rules, landmark density.', true)}
        ${slider('temperament', 'Resident temperament', 0, 1, 0.05, 'wild', 'Calm & shy → playful & grumpy. Also speeds residents up.', true)}
        ${select('palette', 'Colour palette', PALETTES, true)}
        <div class="pending hidden" id="cs_pending">You have changes marked <span class="gen-dot">•</span> — press <b>Regenerate world</b> to apply.</div>
        <div class="row"><button class="primary" id="cs_regen">Regenerate world</button><button id="cs_newseed">New random world</button></div>
      </section>
      <section>
        <h3>Live controls</h3>
        ${select('weather', 'Weather', WEATHER_TYPES, false)}
        ${slider('timeOfDay', 'Time of day', 0, 23.99, 0.05, 'h', '', false)}
        ${slider('dayLengthMin', 'Day length', 1, 60, 1, 'min', 'Real minutes per in-world day.', false)}
        <div class="setting"><label><span style="color:var(--text)"><input type="checkbox" id="cs_timeFrozen" data-key="timeFrozen"> Freeze time</span></label></div>
        ${select('quality', 'Graphics quality', QUALITY, false, 'View distance, shadows and resolution. Medium suits most MacBooks.')}
        ${slider('fov', 'Field of view', 50, 100, 1, '°', '', false)}
        ${slider('mouseSensitivity', 'Mouse / stick sensitivity', 0.2, 3, 0.05, 'x', '', false)}
        <div class="setting"><label><span style="color:var(--text)"><input type="checkbox" id="cs_invertY" data-key="invertY"> Invert vertical look</span></label></div>
        ${slider('volume', 'Volume', 0, 1, 0.05, '%', 'N toggles mute.', false)}
        <h3>Save</h3>
        <div class="row"><button id="cs_save">Save now</button><button id="cs_reset">Reset this world's progress</button></div>
        <div class="hint" id="cs_saveInfo"></div>
      </section>`;
    const pw = $('cs_presets');
    for (const [k, p] of Object.entries(PRESETS)) {
      const b = document.createElement('button');
      b.textContent = p.label;
      b.addEventListener('click', () => g.applyPresetToPending(k));
      b.addEventListener('mouseenter', () => { $('cs_presetDesc').textContent = p.description; });
      pw.appendChild(b);
    }
    body.querySelectorAll('input[type=range], select').forEach((el) => {
      el.addEventListener('input', () => {
        const k = el.dataset.key;
        const v = el.tagName === 'SELECT' ? el.value : parseFloat(el.value);
        g.changeSetting(k, v);
        this.syncCreator();
      });
    });
    for (const k of ['timeFrozen', 'invertY']) $(`cs_${k}`).addEventListener('change', (e) => g.changeSetting(k, e.target.checked));
    $('cs_seed').addEventListener('input', (e) => { g.changeSetting('seed', e.target.value); this.syncCreator(false); });
    $('cs_seed').addEventListener('keydown', (e) => { if (e.key === 'Enter') g.regenerate(); e.stopPropagation(); });
    $('cs_dice').addEventListener('click', () => { g.changeSetting('seed', g.randomSeed()); this.syncCreator(); });
    $('cs_regen').addEventListener('click', () => g.regenerate());
    $('cs_newseed').addEventListener('click', () => { g.changeSetting('seed', g.randomSeed()); g.regenerate(); });
    $('cs_save').addEventListener('click', () => { g.save(true); this.syncCreator(); });
    $('cs_reset').addEventListener('click', () => { if (confirm('Forget all discoveries and progress in this world?')) g.resetWorld(); });
  }

  syncCreator(updateSeedField = true) {
    const g = this.game, s = g.pending;
    const fmt = (v, f) => (f === '%' ? `${Math.round(v * 100)}%` : f === 'h' ? fmtHour(v) : f === 'wild' ? (v < 0.25 ? 'calm' : v < 0.5 ? 'mixed' : v < 0.8 ? 'lively' : 'wild') : f === 'x' ? `${(+v).toFixed(2)}×` : `${Math.round(v)} ${f}`);
    document.querySelectorAll('#creatorBody input[type=range]').forEach((el) => {
      const k = el.dataset.key;
      const v = k === 'timeOfDay' ? g.hour : s[k];
      if (document.activeElement !== el) el.value = v;
      $(`cv_${k}`).textContent = fmt(v, el.dataset.fmt);
    });
    document.querySelectorAll('#creatorBody select').forEach((el) => { el.value = s[el.dataset.key]; });
    $('cs_timeFrozen').checked = s.timeFrozen;
    $('cs_invertY').checked = s.invertY;
    if (updateSeedField) $('cs_seed').value = s.seed;
    const pending = GEN_KEYS.some((k) => s[k] !== g.settings[k]);
    $('cs_pending').classList.toggle('hidden', !pending);
    $('cs_saveInfo').textContent = g.lastSaveAt ? `Last saved ${new Date(g.lastSaveAt).toLocaleTimeString()} (autosaves every 15 s).` : 'Autosaves every 15 s.';
  }

  // ---------- map ----------
  buildMap() {
    const c = $('fullMap');
    let drag = null;
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.mapZoom = Math.min(6, Math.max(1, this.mapZoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2))); }, { passive: false });
    c.addEventListener('mousedown', (e) => { drag = { x: e.clientX, y: e.clientY, cx: this.mapCX, cz: this.mapCZ, moved: false }; });
    window.addEventListener('mousemove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      const R = this.game.world.cfg.radius;
      const k = (2 * R) / (c.clientWidth * this.mapZoom);
      this.mapCX = drag.cx - dx * k; this.mapCZ = drag.cz - dy * k;
    });
    window.addEventListener('mouseup', (e) => {
      if (drag && !drag.moved && e.target === c) {
        const r = c.getBoundingClientRect();
        const p = this.game.world.map.fromFull(((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height);
        this.game.setWaypoint(p);
      }
      drag = null;
    });
  }

  renderLegend() {
    const w = this.game.world;
    const types = [...new Set(w.landmarkList.filter((l) => w.state.discovered.has(l.id)).map((l) => l.type))];
    $('mapLegend').innerHTML = `${types.map((k) => `${ICONS[k]} ${k}`).join(' · ') || 'No places discovered yet'}<br><span class="pink">?</span> next signal / rumoured place · <span style="color:var(--mint)">◆</span> waypoint · explored ${Math.round(w.map.explored() * 100)}%`;
  }

  drawMap(w, px, pz, heading) {
    const c = $('fullMap');
    w.map.drawFull(c.getContext('2d'), px, pz, heading, this.mapZoom, this.mapCX, this.mapCZ);
  }
}

export { fmtHour, TAU };
