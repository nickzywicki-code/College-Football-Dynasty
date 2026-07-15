// Renders the hand-drawn helmet headshots: slice a cell from the sheet, then
// team-tint the greyscale uniform (helmet/pads) while leaving skin & hair
// untouched — the same saturation-key trick as the Godot shader, done on a
// canvas. Results are cached per cell + team colors.

import { HEADSHOT_SHEET, HEADSHOT_COLS, HEADSHOT_ROWS } from './headshotSheet';

export const HEADSHOT_COUNT = HEADSHOT_COLS * HEADSHOT_ROWS;

let sheet: HTMLImageElement | null = null;
let ready = false;
const readyCbs = new Set<() => void>();

if (typeof Image !== 'undefined') {
  sheet = new Image();
  sheet.onload = () => {
    ready = true;
    readyCbs.forEach((cb) => cb());
    readyCbs.clear();
  };
  sheet.src = HEADSHOT_SHEET;
}

/** True once the sheet has decoded and cells can be rendered. */
export function headshotsReady(): boolean {
  return ready;
}

/** Register a one-shot callback for when the sheet becomes ready. */
export function onHeadshotsReady(cb: () => void): void {
  if (ready) cb();
  else readyCbs.add(cb);
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const cache = new Map<string, HTMLCanvasElement>();

/**
 * Get a team-tinted headshot cell as an offscreen canvas (native cell size), or
 * null if the sheet hasn't loaded yet. `index` selects the portrait (0..23).
 */
export function getRealHeadshot(index: number, primary: string, secondary: string): HTMLCanvasElement | null {
  if (!ready || !sheet) return null;
  const key = `${index}|${primary}|${secondary}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const cw = sheet.width / HEADSHOT_COLS;
  const ch = sheet.height / HEADSHOT_ROWS;
  const col = index % HEADSHOT_COLS;
  const row = Math.floor(index / HEADSHOT_COLS) % HEADSHOT_ROWS;

  const cv = document.createElement('canvas');
  cv.width = Math.round(cw);
  cv.height = Math.round(ch);
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sheet, Math.round(col * cw), Math.round(row * ch), Math.round(cw), Math.round(ch), 0, 0, cv.width, cv.height);

  const [pr, pg, pb] = hexToRgb(primary);
  const [sr, sg, sb] = hexToRgb(secondary);
  const img = ctx.getImageData(0, 0, cv.width, cv.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = mx - mn; // ~0 for the greyscale uniform
    if (sat < 36) {
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const useSecondary = lum > 0.82; // brightest bits (stripe/highlights)
      const k = Math.min(1, lum * 1.15);
      d[i] = (useSecondary ? sr : pr) * k;
      d[i + 1] = (useSecondary ? sg : pg) * k;
      d[i + 2] = (useSecondary ? sb : pb) * k;
    }
  }
  ctx.putImageData(img, 0, 0);
  cache.set(key, cv);
  return cv;
}
