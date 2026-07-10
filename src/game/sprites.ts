// Procedural pixel-art player sprites — original art, drawn in a chunky
// big-head cartoon style: oversized helmet, dark outline, two-tone shading.
// Each pose is authored as a 16x20 character grid, painted per team-color
// scheme, then auto-outlined and rim-shaded onto a cached offscreen canvas.
//
// Legend: . transparent | H helmet | G helmet stripe (secondary)
//         F facemask | S skin | J jersey (primary) | N number (secondary)
//         A sleeve | P pants | W sock | K shoe | B ball

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

const POSES: Record<Pose, string[]> = {
  idle: [
    '.....HGGHHH.....',
    '....HHGGHHHH....',
    '...HHHGGHHHHH...',
    '...HHHHHHHHHH...',
    '...HHHHFFFFS....',
    '...HHHHFFFFS....',
    '....HHHSSSSS....',
    '......JJJJ......',
    '....JJJJJJJJ....',
    '...AJJJJJJJJA...',
    '...AJJNNNNJJA...',
    '...SSJNNNNJSS...',
    '.....JJJJJJ.....',
    '.....PPPPPP.....',
    '.....PPPPPP.....',
    '.....PP..PP.....',
    '.....PP..PP.....',
    '.....WW..WW.....',
    '.....WW..WW.....',
    '....KKK..KKK....',
  ],
  // stride A: right leg extended forward, left back, arms pumping
  run0: [
    '.....HGGHHH.....',
    '....HHGGHHHH....',
    '...HHHGGHHHHH...',
    '...HHHHHHHHHH...',
    '...HHHHFFFFS....',
    '...HHHHFFFFS....',
    '....HHHSSSSS....',
    '......JJJJ.....A',
    '....JJJJJJJJ..AA',
    '..AAJJJJJJJJAA..',
    '.AAJJJNNNNJJ....',
    '.SS.JJNNNNJJ....',
    '.....JJJJJJ.....',
    '.....PPPPPP.....',
    '....PPP..PPP....',
    '...PPP....PPP...',
    '..PPP......PPP..',
    '..WW........WW..',
    '.KKK........WW..',
    '............KKK.',
  ],
  // stride B: legs passing under the body
  run1: [
    '.....HGGHHH.....',
    '....HHGGHHHH....',
    '...HHHGGHHHHH...',
    '...HHHHHHHHHH...',
    '...HHHHFFFFS....',
    '...HHHHFFFFS....',
    '....HHHSSSSS....',
    '......JJJJ......',
    '....JJJJJJJJ....',
    '...AJJJJJJJJA...',
    '...AJJNNNNJJA...',
    '...SSJNNNNJSS...',
    '.....JJJJJJ.....',
    '.....PPPPPP.....',
    '.....PPPPP......',
    '.....PPP.PP.....',
    '.....PP...PP....',
    '.....WW...WW....',
    '....KKK...WW....',
    '..........KKK...',
  ],
  // stride C: mirror of A
  run2: [
    '.....HGGHHH.....',
    '....HHGGHHHH....',
    '...HHHGGHHHHH...',
    '...HHHHHHHHHH...',
    '...HHHHFFFFS....',
    '...HHHHFFFFS....',
    '....HHHSSSSS....',
    'A.....JJJJ......',
    'AA..JJJJJJJJ....',
    '..AAJJJJJJJJAA..',
    '....JJNNNNJJAA..',
    '....JJNNNNJJ.SS.',
    '.....JJJJJJ.....',
    '.....PPPPPP.....',
    '....PPP..PPP....',
    '...PPP....PPP...',
    '..PPP......PPP..',
    '..WW........WW..',
    '..WW........KKK.',
    '.KKK............',
  ],
  // stride D: legs passing (other arm forward)
  run3: [
    '.....HGGHHH.....',
    '....HHGGHHHH....',
    '...HHHGGHHHHH...',
    '...HHHHHHHHHH...',
    '...HHHHFFFFS....',
    '...HHHHFFFFS....',
    '....HHHSSSSS....',
    '......JJJJ......',
    '....JJJJJJJJ....',
    '...AJJJJJJJJA...',
    '...AJJNNNNJJA...',
    '...SSJNNNNJSS...',
    '.....JJJJJJ.....',
    '.....PPPPPP.....',
    '......PPPPP.....',
    '.....PP.PPP.....',
    '....PP...PP.....',
    '....WW...WW.....',
    '....WW...KKK....',
    '...KKK..........',
  ],
  // QB windup: ball cocked high behind the helmet
  throw: [
    '............SBB.',
    '.....HGGHHH.SBB.',
    '....HHGGHHHHAA..',
    '...HHHGGHHHHA...',
    '...HHHHHHHHA....',
    '...HHHHFFFFS....',
    '...HHHHFFFFS....',
    '....HHHSSSSS....',
    '......JJJJ......',
    '....JJJJJJJJ....',
    '...AJJJJJJJJ....',
    '...AJJNNNNJJ....',
    '...SSJNNNNJJ....',
    '.....JJJJJJ.....',
    '.....PPPPPP.....',
    '....PPP.PPP.....',
    '....PP...PPP....',
    '....WW....WW....',
    '...KKK....WW....',
    '..........KKK...',
  ],
  // follow-through: arm extended toward the target
  release: [
    '.....HGGHHH.....',
    '....HHGGHHHH....',
    '...HHHGGHHHHH...',
    '...HHHHHHHHHH...',
    '...HHHHFFFFS....',
    '...HHHHFFFFSSS..',
    '....HHHSSSSAASS.',
    '......JJJJAA....',
    '....JJJJJJJJ....',
    '...AJJJJJJJJ....',
    '...AJJNNNNJJ....',
    '...SSJNNNNJJ....',
    '.....JJJJJJ.....',
    '.....PPPPPP.....',
    '....PPP.PPP.....',
    '...PPP...PPP....',
    '...WW.....WW....',
    '...WW.....WW....',
    '..KKK.....KKK...',
    '................',
  ],
  // both arms straight up for the catch
  reach: [
    '...SS......SS...',
    '...AA......AA...',
    '...AAHGGHH.AA...',
    '...AHHGGHHHA....',
    '...HHHGGHHHHH...',
    '...HHHHHHHHHH...',
    '...HHHHFFFFS....',
    '....HHHSSSSS....',
    '.....JJJJJJ.....',
    '....JJJJJJJJ....',
    '....JJNNNNJJ....',
    '....JJNNNNJJ....',
    '.....JJJJJJ.....',
    '.....PPPPPP.....',
    '.....PPPPP......',
    '.....PP.PPP.....',
    '.....WW..WW.....',
    '.....WW..WW.....',
    '....KKK..KKK....',
    '................',
  ],
  // crouched pass-pro stance, arms punched forward
  block: [
    '................',
    '.....HGGHHH.....',
    '....HHGGHHHH....',
    '...HHHGGHHHHH...',
    '...HHHHHHHHHH...',
    '...HHHHFFFFS....',
    '...HHHHFFFFS....',
    '....HHHSSSSSSS..',
    '.....JJJJJAASS..',
    '....JJJJJJAASS..',
    '....JJNNNNJJ....',
    '....JJNNNNJJ....',
    '.....JJJJJJ.....',
    '....PPPPPPPP....',
    '...PPP....PPP...',
    '..PPP......PPP..',
    '..WW........WW..',
    '..WW........WW..',
    '.KKK........KKK.',
    '................',
  ],
  // horizontal diving tackle
  tackle: [
    '................',
    '................',
    '................',
    '............SSS.',
    '.......HGGHHASS.',
    '......HHGGHHHH..',
    '.....HHHGGHHHHH.',
    '.....HHHHFFFFS..',
    '...JJHHHSSSSS...',
    '..JJJJJJJJ......',
    '.JJJJJJJJJJAA...',
    '.JJNNNNJJ..SS...',
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
    '............SS..',
    '..KK.WW.PPJJSS..',
    '.KKKWWPPPJJJJHH.',
    '....PPPJJJJHHHH.',
    '...PPJJNNNJHGGH.',
    '......JJJJJHHHH.',
    '................',
    '................',
  ],
  // ball raised on one arm, hop
  celebrate: [
    '..SS...BBB..SS..',
    '..AA..BBBBB.AA..',
    '..AA...BBB..AA..',
    '..AAHGGHHHH.AA..',
    '...HHHGGHHHHA...',
    '...HHHHHHHHHH...',
    '...HHHHFFFFS....',
    '...HHHHFFFFS....',
    '....HHHSSSSS....',
    '.....JJJJJJ.....',
    '....JJJJJJJJ....',
    '....JJNNNNJJ....',
    '....JJNNNNJJ....',
    '.....JJJJJJ.....',
    '.....PPPPPP.....',
    '....PPP..PPP....',
    '....PP....PP....',
    '....WW....WW....',
    '...KKK....KKK...',
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
    F: '#dfe3ea',
    S: scheme.skin,
    J: scheme.primary,
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
