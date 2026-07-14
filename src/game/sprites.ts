// Procedural pixel-art player sprites — original art, drawn in a chunky
// big-head cartoon style: oversized helmet with a protruding facemask,
// shoulder pads, jersey trim, dark outline, two-tone shading.
// Each pose is authored as a 16x20 character grid, painted per team-color
// scheme, then auto-outlined and rim-shaded onto a cached offscreen canvas.
//
// Legend: . transparent | H helmet | G helmet/jersey stripe (secondary)
//         F facemask bars | S skin | J jersey (primary) | D shoulder pad
//         N number (secondary) | A sleeve (dark primary) | P pants
//         W sock | K shoe | B ball

export type Pose =
  | 'idle'
  | 'run0'
  | 'run1'
  | 'run2'
  | 'run3'
  | 'throw'
  | 'release'
  | 'reach'
  | 'block'
  | 'tackle'
  | 'down'
  | 'celebrate';

const GRID_W = 16;
const GRID_H = 20;

// Shared head: big helmet, secondary stripe over the crown, grey facemask
// bars protruding in front of the face (sprites face right).
const HEAD = [
  '....HHHHHH......',
  '...HGGGGGGH.....',
  '..HHHHHHHHHH....',
  '..HHHHHHHHSFF...',
  '..HHHHHHHHSF....',
  '..HHHHHHHHSFF...',
  '...HHHHHHSS.....',
];

const POSES: Record<Pose, string[]> = {
  idle: [
    ...HEAD,
    '..DDJJJJJJDD....',
    '.AADJJJJJJDAA...',
    '.SSJJNNNNJJSS...',
    '...JJNNNNJJ.....',
    '...GJJJJJJG.....',
    '....PPPPPP......',
    '....PPPPPP......',
    '....PP..PP......',
    '....PP..PP......',
    '....WW..WW......',
    '....WW..WW......',
    '...KKK..KKK.....',
    '................',
  ],
  // stride A: right leg extended forward, arms pumping
  run0: [
    ...HEAD,
    '..DDJJJJJJDD..AA',
    '.AADJJJJJJDAAA..',
    'ASSJJNNNNJJ.....',
    '...JJNNNNJJ.....',
    '...GJJJJJJG.....',
    '....PPPPPP......',
    '...PPP..PPP.....',
    '..PPP....PPP....',
    '.PPP......PPP...',
    '.WW........WW...',
    'KKK........WW...',
    '...........KKK..',
    '................',
  ],
  // stride B: legs passing under the body
  run1: [
    ...HEAD,
    '..DDJJJJJJDD....',
    '.AADJJJJJJDAA...',
    '.SSJJNNNNJJSS...',
    '...JJNNNNJJ.....',
    '...GJJJJJJG.....',
    '....PPPPPP......',
    '....PPPPP.......',
    '....PPP.PP......',
    '....PP...PP.....',
    '....WW...WW.....',
    '...KKK...WW.....',
    '.........KKK....',
    '................',
  ],
  // stride C: mirror of A
  run2: [
    ...HEAD,
    'AA..DJJJJJJDD...',
    '..AAADJJJJJDAA..',
    '.....JNNNNJJSSA.',
    '...JJNNNNJJ.....',
    '...GJJJJJJG.....',
    '....PPPPPP......',
    '...PPP..PPP.....',
    '..PPP....PPP....',
    '.PPP......PPP...',
    '.WW........WW...',
    '.WW........KKK..',
    'KKK.............',
    '................',
  ],
  // stride D: legs passing (other phase)
  run3: [
    ...HEAD,
    '..DDJJJJJJDD....',
    '.AADJJJJJJDAA...',
    '.SSJJNNNNJJSS...',
    '...JJNNNNJJ.....',
    '...GJJJJJJG.....',
    '....PPPPPP......',
    '.....PPPPP......',
    '....PP.PPP......',
    '...PP...PP......',
    '...WW...WW......',
    '...WW...KKK.....',
    '..KKK...........',
    '................',
  ],
  // QB windup: ball cocked high behind the helmet
  throw: [
    '...........SBB..',
    '....HHHHHH.SBB..',
    '...HGGGGGGHA....',
    '..HHHHHHHHHA....',
    '..HHHHHHHHSFF...',
    '..HHHHHHHHSF....',
    '..HHHHHHHHSFF...',
    '...HHHHHHSS.....',
    '..DDJJJJJJDD....',
    '.AADJJJJJJD.....',
    '.SSJJNNNNJJ.....',
    '...JJNNNNJJ.....',
    '...GJJJJJJG.....',
    '....PPPPPP......',
    '...PPP.PPP......',
    '...PP...PPP.....',
    '...WW....WW.....',
    '..KKK....WW.....',
    '.........KKK....',
    '................',
  ],
  // follow-through: throwing arm extended toward the target
  release: [
    ...HEAD,
    '..DDJJJJJJDDSS..',
    '.AADJJJJJJDAASS.',
    '.SSJJNNNNJJ.....',
    '...JJNNNNJJ.....',
    '...GJJJJJJG.....',
    '....PPPPPP......',
    '...PPP.PPP......',
    '..PPP...PPP.....',
    '..WW.....WW.....',
    '..WW.....WW.....',
    '.KKK.....KKK....',
    '................',
    '................',
  ],
  // both arms straight up for the catch
  reach: [
    '..SS......SS....',
    '..AA......AA....',
    '..AA.HHHH.AA....',
    '..AHGGGGGGHA....',
    '..HHHHHHHHHH....',
    '..HHHHHHHHSFF...',
    '..HHHHHHHHSF....',
    '...HHHHHHSS.....',
    '..DDJJJJJJDD....',
    '...JJJJJJJJ.....',
    '...JJNNNNJJ.....',
    '...GJJJJJJG.....',
    '....PPPPPP......',
    '....PPPPP.......',
    '....PPP.PP......',
    '....WW...WW.....',
    '...KKK...WW.....',
    '.........KKK....',
    '................',
    '................',
  ],
  // crouched pass-pro stance, arms punched forward
  block: [
    '................',
    ...HEAD,
    '..DDJJJJJJDDSS..',
    '.AADJJJJJJDAASS.',
    '..SJJNNNNJJAA...',
    '...JJNNNNJJ.....',
    '...GJJJJJJG.....',
    '...PPPPPPPP.....',
    '..PPP....PPP....',
    '.PPP......PPP...',
    '.WW........WW...',
    'KKK........KKK..',
    '................',
  ],
  // horizontal diving tackle, arms outstretched
  tackle: [
    '................',
    '................',
    '.............SS.',
    '..........AAASS.',
    '......HHHHHHA...',
    '.....HGGGGGGH...',
    '....HHHHHHHHHH..',
    '....HHHHHHHHSFF.',
    '.....HHHHHHSSF..',
    '..DDJJJJJJDD....',
    '.JJJJJJJJJJ.AA..',
    '.JJNNNNJJ...SS..',
    'PPJNNNNJ........',
    'PPPPPP..........',
    'PPPP............',
    'WWW.............',
    'KKK.............',
    '................',
    '................',
    '................',
  ],
  // flat on the turf
  down: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '.............SS.',
    '..KK.WW.PPJJDSS.',
    '.KKKWWPPPJJJJHH.',
    '....PPPJJJJHHHH.',
    '...PPJJNNNJHGGH.',
    '......JJJJJHHHH.',
    '................',
    '................',
  ],
  // ball raised on one arm
  celebrate: [
    '..SS...BBB..SS..',
    '..AA..BBBBB.AA..',
    '..AA...BBB..AA..',
    '..AA.HHHHHH.AA..',
    '..AHGGGGGGHHA...',
    '..HHHHHHHHHH....',
    '..HHHHHHHHSFF...',
    '..HHHHHHHHSF....',
    '...HHHHHHSS.....',
    '..DDJJJJJJDD....',
    '...JJJJJJJJ.....',
    '...JJNNNNJJ.....',
    '...GJJJJJJG.....',
    '....PPPPPP......',
    '...PPP..PPP.....',
    '...PP....PP.....',
    '...WW....WW.....',
    '..KKK....KKK....',
    '................',
    '................',
  ],
};

const SKIN_TONES = ['#f3c39a', '#d9a066', '#a5673f', '#6b4226'];
const OUTLINE = '#10121f';

export interface SpriteScheme {
  primary: string;
  secondary: string;
  skin: string;
}

export function skinFor(playerId: number): string {
  return SKIN_TONES[playerId % SKIN_TONES.length];
}

function shade(hex: string, amt: number): string {
  const h = hex.replace('#', '');
  const r = Math.min(255, Math.max(0, parseInt(h.slice(0, 2), 16) + amt));
  const g = Math.min(255, Math.max(0, parseInt(h.slice(2, 4), 16) + amt));
  const b = Math.min(255, Math.max(0, parseInt(h.slice(4, 6), 16) + amt));
  return `rgb(${r},${g},${b})`;
}

function shadeRgb(rgb: string, amt: number): string {
  const m = rgb.match(/rgb\((\d+),(\d+),(\d+)\)/);
  if (!m) return shade(rgb, amt);
  const c = (v: string) => Math.min(255, Math.max(0, parseInt(v, 10) + amt));
  return `rgb(${c(m[1])},${c(m[2])},${c(m[3])})`;
}

const cache = new Map<string, HTMLCanvasElement>();

/**
 * Paint (and cache) one pose at a given integer pixel size, adding a 1px
 * cartoon outline around the silhouette and rim shading on the light/dark
 * edges so the characters read with depth instead of flat blobs.
 */
export function getSprite(scheme: SpriteScheme, pose: Pose, px: number): HTMLCanvasElement {
  const key = `${scheme.primary}|${scheme.secondary}|${scheme.skin}|${pose}|${px}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const canvas = document.createElement('canvas');
  canvas.width = (GRID_W + 2) * px; // +1px border each side for the outline
  canvas.height = (GRID_H + 2) * px;
  const ctx = canvas.getContext('2d')!;
  const colors: Record<string, string> = {
    H: scheme.primary,
    G: scheme.secondary,
    F: '#c9cedb',
    S: scheme.skin,
    J: scheme.primary,
    D: shade(scheme.primary, 30), // shoulder pads catch the light
    A: shade(scheme.primary, -34),
    N: scheme.secondary,
    P: '#e8e8f0',
    W: '#f4f4f8',
    K: '#191a24',
    B: '#8a5220',
  };

  const rows = POSES[pose];
  const filled = (x: number, y: number): string | null => {
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return null;
    const c = rows[y]?.[x];
    return c && c !== '.' ? c : null;
  };

  for (let y = -1; y <= GRID_H; y++) {
    for (let x = -1; x <= GRID_W; x++) {
      const c = filled(x, y);
      const dx = (x + 1) * px;
      const dy = (y + 1) * px;
      if (!c) {
        // outline: empty cell touching a filled cell
        if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) {
          ctx.fillStyle = OUTLINE;
          ctx.fillRect(dx, dy, px, px);
        }
        continue;
      }
      let color = colors[c] ?? '#fff';
      // rim shading: light from top-left — darken bottom/right silhouette
      // edges, brighten the top edge of each region
      const lit = !filled(x, y - 1);
      const shadowed = !filled(x + 1, y) || !filled(x, y + 1);
      if (lit && c !== 'F') color = color.startsWith('rgb(') ? shadeRgb(color, 30) : shade(color, 30);
      else if (shadowed && c !== 'F') color = color.startsWith('rgb(') ? shadeRgb(color, -26) : shade(color, -26);
      ctx.fillStyle = color;
      ctx.fillRect(dx, dy, px, px);
      // glossy helmet dome highlight
      if (c === 'H' && y <= 2) {
        ctx.fillStyle = 'rgba(255,255,255,0.30)';
        ctx.fillRect(dx, dy, px, Math.max(1, px / 3));
      }
    }
  }
  cache.set(key, canvas);
  return canvas;
}

// --- front-facing bareheaded roster portrait (no helmet) -------------------
// 18x18 grid. Legend: R hair, S skin, E eye, M mouth, J jersey (primary),
// N jersey trim (secondary), . transparent.
const HEADSHOT = [
  '.......RRRR.......',
  '.....RRRRRRRR.....',
  '....RRRRRRRRRR....',
  '...RRRRRRRRRRRR...',
  '...RRSSSSSSSSRR...',
  '..RRSSSSSSSSSSRR..',
  '..RSSEESSSSEESSR..',
  '..SSSSSSSSSSSSSS..',
  '..SSSSSSSSSSSSSS..',
  '..SSSSSMMMMSSSSS..',
  '...SSSSSSSSSSSS...',
  '....SSSSSSSSSS....',
  '.....SSSSSSSS.....',
  '.....SSSSSSSS.....',
  '..JJJJNNNNNNJJJJ..',
  '.JJJJJJJJJJJJJJJJ.',
  'JJJJJJJJJJJJJJJJJJ',
  'JJJJJJJNNNNJJJJJJJ',
];
const HS_W = 18;
const HS_H = 18;
const HAIR = ['#1b1712', '#2b2320', '#3a2a1a', '#5a3a22', '#7a5a34', '#0e0e12', '#6b6b70'];

const hsCache = new Map<string, HTMLCanvasElement>();

/**
 * Render (and cache) a front-facing bareheaded roster portrait in the team's
 * jersey colors, framed on a subtle gradient card — an 8-bit "headshot".
 */
export function getHeadshot(scheme: SpriteScheme, px: number, hair = HAIR[1]): HTMLCanvasElement {
  const key = `${scheme.primary}|${scheme.secondary}|${scheme.skin}|${hair}|${px}`;
  const hit = hsCache.get(key);
  if (hit) return hit;

  const canvas = document.createElement('canvas');
  canvas.width = (HS_W + 2) * px;
  canvas.height = (HS_H + 2) * px;
  const ctx = canvas.getContext('2d')!;

  // background card (team-tinted) so the portrait reads like a headshot
  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bg.addColorStop(0, shade(scheme.secondary, -60).replace('rgb', 'rgba').replace(')', ',0.35)'));
  bg.addColorStop(1, 'rgba(10,12,20,0.5)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const colors: Record<string, string> = {
    R: hair,
    S: scheme.skin,
    E: '#20222f',
    M: shade(scheme.skin, -40),
    J: scheme.primary,
    N: scheme.secondary,
  };
  const flat = 'EM'; // don't rim-shade eyes/mouth
  const rows = HEADSHOT;
  const filled = (x: number, y: number): string | null => {
    if (x < 0 || y < 0 || x >= HS_W || y >= HS_H) return null;
    const c = rows[y]?.[x];
    return c && c !== '.' ? c : null;
  };
  for (let y = -1; y <= HS_H; y++) {
    for (let x = -1; x <= HS_W; x++) {
      const c = filled(x, y);
      const dx = (x + 1) * px;
      const dy = (y + 1) * px;
      if (!c) {
        if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) {
          ctx.fillStyle = OUTLINE;
          ctx.fillRect(dx, dy, px, px);
        }
        continue;
      }
      let color = colors[c] ?? '#fff';
      const lit = !filled(x, y - 1);
      const shadowed = !filled(x + 1, y) || !filled(x, y + 1);
      if (!flat.includes(c)) {
        if (lit) color = color.startsWith('rgb(') ? shadeRgb(color, 26) : shade(color, 26);
        else if (shadowed) color = color.startsWith('rgb(') ? shadeRgb(color, -22) : shade(color, -22);
      }
      ctx.fillStyle = color;
      ctx.fillRect(dx, dy, px, px);
    }
  }
  hsCache.set(key, canvas);
  return canvas;
}

/** Deterministic hair color for a player id (variety across a roster). */
export function hairFor(playerId: number): string {
  return HAIR[playerId % HAIR.length];
}

export const HEADSHOT_GRID = { w: HS_W + 2, h: HS_H + 2 };

/** Pick the run-cycle pose from a speed-accumulated phase. */
export function runPose(phase: number): Pose {
  const seq: Pose[] = ['run0', 'run1', 'run2', 'run3'];
  return seq[Math.floor(phase) % 4];
}

/** Vertical bob (in grid pixels) for a given run phase — adds bounce. */
export function runBob(phase: number): number {
  return Math.abs(Math.sin(phase * Math.PI)) * 1.2;
}

export const SPRITE_GRID = { w: GRID_W + 2, h: GRID_H + 2 };
