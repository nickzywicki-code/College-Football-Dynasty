// Procedural pixel-art player sprites. Each pose is authored as a 12x16
// character grid and painted per team-color scheme onto a cached offscreen
// canvas. All art is original.
//
// Legend: . transparent | H helmet | F facemask | S skin | J jersey (primary)
//         N number patch (secondary) | A sleeve | P pants | K shoe | B ball

export type Pose =
  | 'idle'
  | 'run0'
  | 'run1'
  | 'run2'
  | 'throw'
  | 'release'
  | 'reach'
  | 'block'
  | 'tackle'
  | 'down'
  | 'celebrate';

const GRID_W = 12;
const GRID_H = 16;

const POSES: Record<Pose, string[]> = {
  idle: [
    '....HHHH....',
    '...HHHHHH...',
    '...HHHFFS...',
    '....SSSS....',
    '...JJJJJJ...',
    '..AJJJJJJA..',
    '..AJNNNNJA..',
    '..S.NNNN.S..',
    '....JJJJ....',
    '....PPPP....',
    '....PPPP....',
    '....P..P....',
    '....P..P....',
    '....K..K....',
    '....K..K....',
    '...KK..KK...',
  ],
  run0: [
    '....HHHH....',
    '...HHHHHH...',
    '...HHHFFS...',
    '....SSSS....',
    '...JJJJJJ..A',
    '..AJJJJJJAA.',
    '.AAJNNNNJ...',
    '.S..NNNN....',
    '....JJJJ....',
    '....PPPP....',
    '...PP..PP...',
    '..PP....PP..',
    '..P......PP.',
    '.KK.......K.',
    '..........KK',
    'KK..........',
  ],
  run1: [
    '....HHHH....',
    '...HHHHHH...',
    '...HHHFFS...',
    '....SSSS....',
    '...JJJJJJ...',
    '..AJJJJJJA..',
    '..AJNNNNJA..',
    '..S.NNNN.S..',
    '....JJJJ....',
    '....PPPP....',
    '....PPPP....',
    '....PP.P....',
    '....P..PP...',
    '...KK...K...',
    '........KK..',
    '...KK.......',
  ],
  run2: [
    '....HHHH....',
    '...HHHHHH...',
    '...HHHFFS...',
    '....SSSS....',
    'A..JJJJJJ...',
    '.AAJJJJJJA..',
    '...JNNNNJAA.',
    '....NNNN..S.',
    '....JJJJ....',
    '....PPPP....',
    '...PP..PP...',
    '..PP....PP..',
    '.PP......P..',
    '.K.......KK.',
    'KK..........',
    '..........KK',
  ],
  throw: [
    '.........BB.',
    '....HHHH.SB.',
    '...HHHHHHSA.',
    '...HHHFFSA..',
    '....SSSSA...',
    '...JJJJJJ...',
    '..AJJJJJJ...',
    '..AJNNNNJ...',
    '..S.NNNN....',
    '....JJJJ....',
    '....PPPP....',
    '...PP.PP....',
    '...P...PP...',
    '..PP....P...',
    '..K.....KK..',
    '.KK.......K.',
  ],
  reach: [
    '..S......S..',
    '..A.HHHH.A..',
    '..AHHHHHHA..',
    '..AHHHFFSA..',
    '..A.SSSS.A..',
    '...JJJJJJ...',
    '...JJJJJJ...',
    '...JNNNNJ...',
    '....NNNN....',
    '....JJJJ....',
    '....PPPP....',
    '....PP.P....',
    '....P..PP...',
    '...KK...K...',
    '........KK..',
    '...KK.......',
  ],
  release: [
    '....HHHH....',
    '...HHHHHH...',
    '...HHHFFS...',
    '....SSSS.SS.',
    '...JJJJJAAS.',
    '..AJJJJJJ...',
    '..AJNNNNJ...',
    '..S.NNNN....',
    '....JJJJ....',
    '....PPPP....',
    '...PP.PP....',
    '...P...PP...',
    '..PP....P...',
    '..K.....KK..',
    '.KK.......K.',
    '............',
  ],
  block: [
    '............',
    '....HHHH....',
    '...HHHHHH...',
    '...HHHFFS...',
    '....SSSS....',
    '...JJJJJJSS.',
    '..JJJJJJAAS.',
    '..JJNNNNAA..',
    '..S.NNNNA...',
    '....JJJJ....',
    '....PPPP....',
    '...PP..PP...',
    '..PP....PP..',
    '..K......K..',
    '.KK......KK.',
    '............',
  ],
  tackle: [
    '............',
    '............',
    '............',
    '............',
    '..........SS',
    '......HHHHAS',
    '.....HHHHHH.',
    '.....HHHFFS.',
    '..JJJJSSSS..',
    '.JJJJJJJJ...',
    '.JNNNNJJAA..',
    'PPNNNN..SS..',
    'PPPP........',
    'KPP.........',
    'KK..........',
    '............',
  ],
  celebrate: [
    '..S..BB..S..',
    '..A..BB..A..',
    '..A.HHHH.A..',
    '..AHHHHHHA..',
    '..AHHHFFSA..',
    '....SSSS....',
    '...JJJJJJ...',
    '...JNNNNJ...',
    '....NNNN....',
    '....JJJJ....',
    '....PPPP....',
    '...PP..PP...',
    '...P....P...',
    '...K....K...',
    '..KK....KK..',
    '............',
  ],
  down: [
    '............',
    '............',
    '............',
    '............',
    '............',
    '............',
    '............',
    '............',
    '............',
    '............',
    '..........SS',
    '.KK.PPP.JJSS',
    'KK.PPPPJJJJH',
    '...PP.JJNNHH',
    '......JJJJHH',
    '............',
  ],
};

const SKIN_TONES = ['#f3c39a', '#d9a066', '#a5673f', '#6b4226'];

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

const cache = new Map<string, HTMLCanvasElement>();

/** Paint (and cache) one pose at a given integer pixel size. */
export function getSprite(scheme: SpriteScheme, pose: Pose, px: number): HTMLCanvasElement {
  const key = `${scheme.primary}|${scheme.secondary}|${scheme.skin}|${pose}|${px}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const canvas = document.createElement('canvas');
  canvas.width = GRID_W * px;
  canvas.height = GRID_H * px;
  const ctx = canvas.getContext('2d')!;
  const colors: Record<string, string> = {
    H: scheme.primary,
    F: '#e8e8e8',
    S: scheme.skin,
    J: scheme.primary,
    A: shade(scheme.primary, -28),
    N: scheme.secondary,
    P: '#e6e6ee',
    K: '#15151d',
    B: '#8a5220',
  };
  const rows = POSES[pose];
  for (let y = 0; y < GRID_H; y++) {
    const row = rows[y] ?? '';
    for (let x = 0; x < GRID_W; x++) {
      const c = row[x];
      if (!c || c === '.') continue;
      ctx.fillStyle = colors[c] ?? '#fff';
      ctx.fillRect(x * px, y * px, px, px);
      // helmet shine + jersey shading for a little depth
      if (c === 'H' && y <= 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.fillRect(x * px, y * px, px, Math.max(1, px / 3));
      }
    }
  }
  cache.set(key, canvas);
  return canvas;
}

/** Pick the run-cycle pose for an entity given elapsed time. */
export function runPose(timeSec: number): Pose {
  const seq: Pose[] = ['run0', 'run1', 'run2', 'run1'];
  return seq[Math.floor(timeSec * 9) % 4];
}

export const SPRITE_GRID = { w: GRID_W, h: GRID_H };
