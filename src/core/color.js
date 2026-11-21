import { clamp } from './math.js';

export function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
export function rgbToHex([r, g, b]) {
  const h = (v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}
export function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}
function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}
export function hslToRgb(h, s, l) {
  h = ((h % 1) + 1) % 1;
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
}
/** Transform an authored colour through a world palette. */
export function applyPalette(rgb, pal) {
  if (!pal) return rgb.slice();
  let [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  h += pal.hue || 0;
  s = clamp(s * (pal.sat ?? 1), 0, 1);
  l = clamp(l * (pal.light ?? 1), 0, 1);
  let out = hslToRgb(h, s, l);
  if (pal.tint) out = [out[0] * pal.tint[0], out[1] * pal.tint[1], out[2] * pal.tint[2]];
  return out.map((v) => clamp(v, 0, 1));
}
export function mixRgb(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
export function scaleRgb(a, k) {
  return [a[0] * k, a[1] * k, a[2] * k];
}
