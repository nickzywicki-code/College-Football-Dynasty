// Procedural 8-bit team crests. Each team gets a deterministic pixel-art badge
// built from its two colors: a badge shape (seeded per team), a mascot glyph
// keyed off the team name, and the abbreviation drawn in a tiny self-contained
// pixel font (so it stays crisp at any size, independent of web-font loading).
//
// getTeamLogo() renders once to an offscreen canvas and caches by abbr+size.

import type { Team } from '../engine/types';

/** Minimal identity a crest needs — satisfied by both Team and TeamIdentity. */
export type LogoTeam = Pick<Team, 'abbr' | 'colors' | 'name'>;

// --- tiny 3x5 pixel font (uppercase A-Z, 0-9) -------------------------------
// Each glyph is 5 rows of 3 chars; '#' = pixel on.
const FONT: Record<string, string[]> = {
  A: ['###', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['###', '#..', '#..', '#..', '###'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['###', '#..', '#.#', '#.#', '###'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '###'],
  K: ['#.#', '##.', '#..', '##.', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'],
  N: ['#.#', '###', '###', '###', '#.#'],
  O: ['###', '#.#', '#.#', '#.#', '###'],
  P: ['###', '#.#', '###', '#..', '#..'],
  Q: ['###', '#.#', '#.#', '###', '..#'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['###', '#..', '###', '..#', '###'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#.#', '#.#', '###', '###', '#.#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '###', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
};

// --- mascot glyphs (9x8 silhouettes), keyed off the team name ---------------
const GLYPHS: Record<string, string[]> = {
  star: [
    '....#....',
    '....#....',
    '.#######.',
    '..#####..',
    '..#####..',
    '.##.#.##.',
    '.#.....#.',
    '.........',
  ],
  bolt: [
    '....##...',
    '...##....',
    '..##.....',
    '.######..',
    '...##....',
    '..##.....',
    '.##......',
    '##.......',
  ],
  flame: [
    '....#....',
    '...##....',
    '..#.##...',
    '..#..##..',
    '.##...##.',
    '.##.#.##.',
    '..#####..',
    '...###...',
  ],
  bird: [
    '#........',
    '##.....#.',
    '.##...##.',
    '.####.##.',
    '..######.',
    '...####..',
    '....##...',
    '....#....',
  ],
  tree: [
    '....#....',
    '...###...',
    '..#####..',
    '.#######.',
    '..#####..',
    '.#######.',
    '....#....',
    '...###...',
  ],
  mountain: [
    '.........',
    '....#....',
    '...###...',
    '..#.###..',
    '.##..###.',
    '##....###',
    '#######.#',
    '.........',
  ],
  anchor: [
    '...###...',
    '...#.#...',
    '....#....',
    '..#####..',
    '....#....',
    '#...#...#',
    '#..###..#',
    '.#######.',
  ],
  gear: [
    '..#.#.#..',
    '.#######.',
    '..#####..',
    '###.#.###',
    '..#####..',
    '.#######.',
    '..#.#.#..',
    '.........',
  ],
  arrow: [
    '....#....',
    '...###...',
    '..#####..',
    '.##.#.##.',
    '....#....',
    '....#....',
    '....#....',
    '....#....',
  ],
  horns: [
    '##.....##',
    '.##...##.',
    '..#####..',
    '.#######.',
    '.##.#.##.',
    '.#.....#.',
    '.........',
    '.........',
  ],
  spade: [
    '....#....',
    '...###...',
    '..#####..',
    '.#######.',
    '#########',
    '.##.#.##.',
    '....#....',
    '...###...',
  ],
  fist: [
    '.######..',
    '########.',
    '#########',
    '#########',
    '########.',
    '.#######.',
    '.........',
    '.........',
  ],
  note: [
    '....####.',
    '....#..#.',
    '....#..#.',
    '....#....',
    '..###....',
    '.####....',
    '.####....',
    '..##.....',
  ],
  axe: [
    '...####..',
    '..######.',
    '.####.##.',
    '...#.....',
    '...#.....',
    '...#.....',
    '...#.....',
    '...#.....',
  ],
  wave: [
    '.........',
    '.##...##.',
    '####.####',
    '..#####..',
    '.........',
    '.##...##.',
    '####.####',
    '..#####..',
  ],
  shield: [
    '#######',
    '#######',
    '#######',
    '.#####.',
    '.#####.',
    '..###..',
    '...#...',
    '.......',
  ],
};

/** Choose a mascot glyph from the team name, or null for a monogram crest. */
function glyphFor(name: string): string[] | null {
  const n = name.toLowerCase();
  const has = (...keys: string[]) => keys.some((k) => n.includes(k));
  if (has('firebird', 'aviator', 'comet', 'fog')) return GLYPHS.bird;
  if (has('blaze', 'volcano', 'scorpion')) return GLYPHS.flame;
  if (has('evergreen', 'oak')) return GLYPHS.tree;
  if (has('lumberjack')) return GLYPHS.axe;
  if (has('summit', 'miner')) return GLYPHS.mountain;
  if (has('bighorn', 'herd', 'northmen')) return GLYPHS.horns;
  if (has('mariner', 'brass')) return GLYPHS.anchor;
  if (has('motor', 'racer')) return GLYPHS.gear;
  if (has('archer', 'scout', 'rhythm')) return GLYPHS.arrow;
  if (has('ace')) return GLYPHS.spade;
  if (has('bruiser', 'founder', 'minutemen')) return GLYPHS.fist;
  if (has('quake', 'rocker', 'blaze')) return GLYPHS.bolt;
  if (has('general', 'summit', 'aces')) return GLYPHS.star;
  if (has('rocker')) return GLYPHS.note;
  if (has('stingray', 'evergreen')) return GLYPHS.wave;
  if (has('defender', 'general')) return GLYPHS.shield;
  return null;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  const c = (v: number) => Math.min(255, Math.max(0, v + amt));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}
/** Pick black or white text for contrast against a fill. */
function contrastInk(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return r * 0.299 + g * 0.587 + b * 0.114 > 140 ? '#0a0d16' : '#ffffff';
}

const cache = new Map<string, HTMLCanvasElement>();

/**
 * Render (and cache) a team's 8-bit crest at the given pixel size. Small sizes
 * lean on the monogram; larger sizes also show the mascot glyph as a backdrop.
 */
export function getTeamLogo(team: LogoTeam, size: number): HTMLCanvasElement {
  const key = `${team.abbr}|${team.colors[0]}|${team.colors[1]}|${size}`;
  const hit = cache.get(key);
  if (hit) return hit;

  // work on a 24x24 pixel grid, then scale to `size` crisply
  const G = 24;
  const px = Math.max(1, Math.floor(size / G)) || 1;
  const scale = size / G;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const primary = team.colors[0];
  const secondary = team.colors[1];
  const ink = contrastInk(primary);

  // badge shape seeded by abbr (roundel / shield / diamond)
  const seed = [...team.abbr].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  const shape = seed % 3; // 0 roundel, 1 shield, 2 diamond
  const cx = G / 2;
  const r = G / 2 - 1;

  const fillRect = (x: number, y: number, w: number, h: number, color: string) => {
    g.fillStyle = color;
    g.fillRect(Math.round(x * scale), Math.round(y * scale), Math.ceil(w * scale), Math.ceil(h * scale));
  };
  const inBadge = (x: number, y: number): boolean => {
    const dx = x + 0.5 - cx;
    const dy = y + 0.5 - cx;
    if (shape === 0) return dx * dx + dy * dy <= r * r; // circle
    if (shape === 2) return Math.abs(dx) + Math.abs(dy) <= r; // diamond
    // shield: rounded top, pointed bottom
    if (dy < 2) return Math.abs(dx) <= r - 0.5 && dx * dx + (dy + 1) * (dy + 1) <= r * r;
    const taper = r * (1 - (dy - 2) / (r + 2));
    return Math.abs(dx) <= Math.max(0, taper);
  };

  // paint badge base + a secondary border ring
  for (let y = 0; y < G; y++) {
    for (let x = 0; x < G; x++) {
      if (!inBadge(x, y)) continue;
      const edge =
        !inBadge(x - 1, y) || !inBadge(x + 1, y) || !inBadge(x, y - 1) || !inBadge(x, y + 1);
      fillRect(x, y, 1, 1, edge ? shade(secondary, -10) : primary);
    }
  }
  // inner ring accent in secondary
  for (let y = 0; y < G; y++) {
    for (let x = 0; x < G; x++) {
      if (!inBadge(x, y)) continue;
      const nearEdge =
        inBadge(x, y) &&
        (!inBadge(x - 2, y) || !inBadge(x + 2, y) || !inBadge(x, y - 2) || !inBadge(x, y + 2));
      if (nearEdge) fillRect(x, y, 1, 1, secondary);
    }
  }

  // mascot glyph watermark (upper area) when the badge is big enough
  const glyph = glyphFor(team.name);
  if (glyph && size >= 30) {
    const gw = glyph[0].length;
    const gh = glyph.length;
    const ox = Math.round(cx - gw / 2);
    const oy = 3;
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        if (glyph[y][x] === '#') fillRect(ox + x, oy + y, 1, 1, shade(secondary, 25));
      }
    }
  }

  // abbreviation in the pixel font, centered in the lower half (or middle)
  const text = team.abbr.slice(0, 3).toUpperCase();
  const glyphW = 3;
  const gap = 1;
  const textW = text.length * glyphW + (text.length - 1) * gap;
  const dotPx = glyph && size >= 30 ? Math.max(1, (r * 1.15) / (textW)) : Math.max(1, (r * 1.5) / textW);
  const startX = cx - (textW * dotPx) / 2;
  const startY = glyph && size >= 30 ? G - 3 - 5 * dotPx : cx - (5 * dotPx) / 2;
  let penX = startX;
  for (const ch of text) {
    const rows = FONT[ch];
    if (rows) {
      for (let ry = 0; ry < 5; ry++) {
        for (let rx = 0; rx < 3; rx++) {
          if (rows[ry][rx] === '#') {
            // 1px dark drop-shadow for punch, then the ink
            fillRect(penX + rx * dotPx + 0.4, startY + ry * dotPx + 0.4, dotPx, dotPx, 'rgba(0,0,0,0.35)');
            fillRect(penX + rx * dotPx, startY + ry * dotPx, dotPx, dotPx, ink);
          }
        }
      }
    }
    penX += (glyphW + gap) * dotPx;
  }

  void px;
  cache.set(key, c);
  return c;
}
