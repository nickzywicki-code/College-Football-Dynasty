// Loads the generated on-field player animation sheet (if present) and returns
// team-tinted, correctly-scaled frames per pose. Falls back to nothing (the
// renderer keeps its procedural sprite) whenever the sheet is empty/not ready.

import {
  PLAYER_SHEET, PLAYER_COLS, PLAYER_ROWS_PER_SKIN, PLAYER_SKINS, PLAYER_CW, PLAYER_CH,
} from './playerSheet';
import type { Pose } from './sprites';

// Column-major frame order inside each skin block — matches the agent's
// PLAYER_FRAMES / the game's Pose enum.
const POSE_ORDER: Pose[] = [
  'run0', 'run1', 'run2', 'run3', 'idle', 'throw',
  'release', 'reach', 'block', 'tackle', 'down', 'celebrate',
];

const active = PLAYER_SHEET.length > 0 && PLAYER_SKINS > 0;

let sheet: HTMLImageElement | null = null;
let ready = false;
if (active && typeof Image !== 'undefined') {
  sheet = new Image();
  sheet.onload = () => { ready = true; };
  sheet.src = PLAYER_SHEET;
}

/** True once a real sheet exists and has decoded. */
export function playersReady(): boolean {
  return ready;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const cache = new Map<string, HTMLCanvasElement>();

/**
 * Team-tinted frame for a pose, scaled so its height matches the procedural
 * sprite footprint (targetH ≈ SPRITE_GRID.h * px). Returns null when no sheet.
 */
export function getPlayerFrame(
  pose: Pose, playerId: number, primary: string, secondary: string, px: number,
): HTMLCanvasElement | null {
  if (!ready || !sheet) return null;
  const fi = POSE_ORDER.indexOf(pose);
  if (fi < 0) return null;
  const skin = ((playerId % PLAYER_SKINS) + PLAYER_SKINS) % PLAYER_SKINS;
  const targetH = Math.round((20 /* SPRITE_GRID.h */ * px) * 1.15);
  const key = `${pose}|${skin}|${primary}|${secondary}|${targetH}`;
  const hit = cache.get(key);
  if (hit) return hit;

  // locate the cell: 4 cols; each skin occupies PLAYER_ROWS_PER_SKIN rows
  const col = fi % PLAYER_COLS;
  const row = skin * PLAYER_ROWS_PER_SKIN + Math.floor(fi / PLAYER_COLS);

  // slice at native size, tint, then scale to the target height
  const cut = document.createElement('canvas');
  cut.width = PLAYER_CW;
  cut.height = PLAYER_CH;
  const cctx = cut.getContext('2d')!;
  cctx.imageSmoothingEnabled = false;
  cctx.drawImage(sheet, col * PLAYER_CW, row * PLAYER_CH, PLAYER_CW, PLAYER_CH, 0, 0, PLAYER_CW, PLAYER_CH);

  const [pr, pg, pb] = hexToRgb(primary);
  const [sr, sg, sb] = hexToRgb(secondary);
  const img = cctx.getImageData(0, 0, cut.width, cut.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    if (sat < 34) {
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const use2 = lum > 0.82;
      const k = Math.min(1, lum * 1.15);
      d[i] = (use2 ? sr : pr) * k;
      d[i + 1] = (use2 ? sg : pg) * k;
      d[i + 2] = (use2 ? sb : pb) * k;
    }
  }
  cctx.putImageData(img, 0, 0);

  const scale = targetH / PLAYER_CH;
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(PLAYER_CW * scale));
  out.height = Math.max(1, Math.round(PLAYER_CH * scale));
  const octx = out.getContext('2d')!;
  octx.imageSmoothingEnabled = false;
  octx.drawImage(cut, 0, 0, out.width, out.height);
  cache.set(key, out);
  return out;
}
