// Save / restore via localStorage. One record per seed so every world keeps its own progress.

export const SAVE_KEY = 'froopyland.save.v1';
export const FOG_RES = 128;

export function newWorldState() {
  return {
    player: null,
    hour: null,
    discovered: new Set(),
    rumored: new Set(),
    observed: new Map(),
    motes: new Set(),
    picked: new Set(),
    awakened: new Set(),
    rules: new Set(),
    eggs: {},
    fruit: 0,
    fed: 0,
    biomes: new Set(),
    visited: new Uint8Array((FOG_RES * FOG_RES) / 8),
    waypoint: null,
    distance: 0,
    playTime: 0,
  };
}

const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); };
const unb64 = (s, n) => { const out = new Uint8Array(n); try { const r = atob(s); for (let i = 0; i < Math.min(n, r.length); i++) out[i] = r.charCodeAt(i); } catch { /* corrupt */ } return out; };

export function serializeState(st) {
  return {
    player: st.player, hour: st.hour,
    discovered: [...st.discovered], rumored: [...st.rumored],
    observed: Object.fromEntries([...st.observed].map(([k, v]) => [k, [...v]])),
    motes: [...st.motes], picked: [...st.picked], awakened: [...st.awakened], rules: [...st.rules],
    eggs: st.eggs, fruit: st.fruit, fed: st.fed, biomes: [...st.biomes],
    visited: b64(st.visited), waypoint: st.waypoint, distance: st.distance, playTime: st.playTime,
  };
}

export function deserializeState(o) {
  const st = newWorldState();
  if (!o || typeof o !== 'object') return st;
  st.player = o.player && Number.isFinite(o.player.x) ? o.player : null;
  st.hour = Number.isFinite(o.hour) ? o.hour : null;
  const set = (a) => new Set(Array.isArray(a) ? a : []);
  st.discovered = set(o.discovered); st.rumored = set(o.rumored);
  st.observed = new Map(Object.entries(o.observed || {}).map(([k, v]) => [k, new Set(v)]));
  st.motes = set(o.motes); st.picked = set(o.picked); st.awakened = set(o.awakened); st.rules = set(o.rules);
  st.eggs = o.eggs && typeof o.eggs === 'object' ? o.eggs : {};
  st.fruit = o.fruit | 0; st.fed = o.fed | 0;
  st.biomes = set(o.biomes);
  if (typeof o.visited === 'string') st.visited = unb64(o.visited, st.visited.length);
  st.waypoint = o.waypoint || null;
  st.distance = +o.distance || 0;
  st.playTime = +o.playTime || 0;
  return st;
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || d.version !== 1) return null;
    return d;
  } catch { return null; }
}

export function writeSave(data) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...data, version: 1, savedAt: Date.now() }));
    return true;
  } catch (e) {
    console.warn('save failed', e);
    return false;
  }
}

export function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }
