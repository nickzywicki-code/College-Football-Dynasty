// Renders the hand-drawn running-player bodies: slice a cell from the strip,
// then team-tint the greyscale uniform (jersey/pants/helmet) while leaving
// skin, hair and the brown ball untouched — the same saturation-key trick as
// the headshots. Results are cached per cell + team colors.

import { BODY_SHEET, BODY_COLS, BODY_CW, BODY_CH } from './bodySheet';

export const BODY_COUNT = BODY_COLS;

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
  sheet.src = BODY_SHEET;
}

/** True once the strip has decoded and cells can be rendered. */
export function bodiesReady(): boolean {
  return ready;
}

/** Register a one-shot callback for when the strip becomes ready. */
export function onBodiesReady(cb: () => void): void {
  if (ready) cb();
  else readyCbs.add(cb);
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const cache = new Map<string, HTMLCanvasElement>();

/**
 * Get a team-tinted full-body player as an offscreen canvas (native cell size),
 * or null if the strip hasn't loaded yet. `index` selects the skin tone (0..5).
 */
export function getRealBody(index: number, primary: string, secondary: string): HTMLCanvasElement | null {
  if (!ready || !sheet) return null;
  const key = `${index}|${primary}|${secondary}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const col = ((index % BODY_COLS) + BODY_COLS) % BODY_COLS;
  const cv = document.createElement('canvas');
  cv.width = BODY_CW;
  cv.height = BODY_CH;
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sheet, col * BODY_CW, 0, BODY_CW, BODY_CH, 0, 0, BODY_CW, BODY_CH);

  const [pr, pg, pb] = hexToRgb(primary);
  const [sr, sg, sb] = hexToRgb(secondary);
  const img = ctx.getImageData(0, 0, cv.width, cv.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = mx - mn; // ~0 for the greyscale uniform
    if (sat < 34) {
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const useSecondary = lum > 0.82; // brightest bits (stripes/highlights)
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
