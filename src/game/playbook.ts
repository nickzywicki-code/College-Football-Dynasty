// Arcade playbook: formations, routes, and play definitions.
// Coordinates are in yards relative to the ball spot at the line of scrimmage:
// x = lateral (negative left, positive right), y = downfield (positive = toward
// the end zone the offense attacks).

export interface RoutePoint {
  x: number;
  y: number;
}

export type EligibleSlot = 'WR1' | 'WR2' | 'WR3' | 'TE' | 'RB';

export interface OffensivePlay {
  id: string;
  name: string;
  desc: string;
  type: 'run' | 'pass';
  /** run plays: RB aiming point relative to LOS */
  runPoint?: RoutePoint;
  /** pass plays: routes per eligible slot */
  routes?: Partial<Record<EligibleSlot, RoutePoint[]>>;
  /** whether RB stays in to block on pass plays */
  rbBlocks?: boolean;
  /** play-action holds LBs briefly */
  playAction?: boolean;
}

/** Lineup offsets from ball position at snap (shotgun base). */
export const OFFENSE_ALIGNMENT: Record<string, RoutePoint> = {
  QB: { x: 0, y: -5 },
  RB: { x: -2.2, y: -5 },
  TE: { x: 8.5, y: -0.8 },
  WR1: { x: -21, y: -0.5 },
  WR2: { x: 21, y: -0.5 },
  WR3: { x: -14, y: -1.2 },
  OL0: { x: -4, y: -0.6 },
  OL1: { x: -2, y: -0.6 },
  OL2: { x: 0, y: -0.6 },
  OL3: { x: 2, y: -0.6 },
  OL4: { x: 4, y: -0.6 },
};

export const DEFENSE_ALIGNMENT: Record<string, RoutePoint> = {
  DL0: { x: -3.5, y: 1 },
  DL1: { x: -1.2, y: 1 },
  DL2: { x: 1.2, y: 1 },
  DL3: { x: 3.5, y: 1 },
  LB0: { x: -4, y: 4.5 },
  LB1: { x: 0, y: 4.8 },
  LB2: { x: 4, y: 4.5 },
  CB0: { x: -21, y: 6 },
  CB1: { x: 21, y: 6 },
  S0: { x: -8, y: 13 },
  S1: { x: 8, y: 13 },
};

export const OFFENSIVE_PLAYS: OffensivePlay[] = [
  // ---- runs ----
  { id: 'dive', name: 'HB Dive', desc: 'Quick hit up the middle', type: 'run', runPoint: { x: 0.5, y: 8 } },
  { id: 'blast', name: 'HB Blast', desc: 'Power run behind the line', type: 'run', runPoint: { x: -2.5, y: 8 } },
  { id: 'toss', name: 'Toss Left', desc: 'Get outside in a hurry', type: 'run', runPoint: { x: -14, y: 10 } },
  { id: 'sweep', name: 'Sweep Right', desc: 'Stretch the edge', type: 'run', runPoint: { x: 14, y: 10 } },
  { id: 'draw', name: 'HB Draw', desc: 'Fake pass, run inside', type: 'run', runPoint: { x: 1.5, y: 9 } },
  {
    id: 'qbsneak',
    name: 'QB Sneak',
    desc: 'Short-yardage QB plunge',
    type: 'run',
    runPoint: { x: 0, y: 3 },
  },
  // ---- quick passes ----
  {
    id: 'slants',
    name: 'Slants',
    desc: 'Fast slants across the middle',
    type: 'pass',
    routes: {
      WR1: [{ x: -21, y: 1.5 }, { x: -10, y: 8 }],
      WR2: [{ x: 21, y: 1.5 }, { x: 10, y: 8 }],
      WR3: [{ x: -14, y: 1 }, { x: -5, y: 7 }],
      TE: [{ x: 8.5, y: 4 }, { x: 5, y: 7 }],
      RB: [{ x: -6, y: 1 }, { x: -9, y: 3 }],
    },
  },
  {
    id: 'curls',
    name: 'Curls',
    desc: 'Hook up at 8 yards',
    type: 'pass',
    routes: {
      WR1: [{ x: -21, y: 9 }, { x: -19, y: 7.4 }],
      WR2: [{ x: 21, y: 9 }, { x: 19, y: 7.4 }],
      WR3: [{ x: -14, y: 7 }, { x: -13, y: 5.6 }],
      TE: [{ x: 8.5, y: 6 }, { x: 7, y: 5 }],
      RB: [{ x: 3, y: 1 }, { x: 6, y: 3 }],
    },
  },
  {
    id: 'flood',
    name: 'Flood Right',
    desc: 'Three levels to one side',
    type: 'pass',
    routes: {
      WR2: [{ x: 21, y: 12 }, { x: 23, y: 22 }],
      TE: [{ x: 10, y: 5 }, { x: 16, y: 9 }],
      RB: [{ x: 4, y: 0 }, { x: 12, y: 2.5 }],
      WR1: [{ x: -21, y: 10 }, { x: -8, y: 14 }],
      WR3: [{ x: -14, y: 4 }, { x: -16, y: 5.5 }],
    },
  },
  {
    id: 'mesh',
    name: 'Mesh',
    desc: 'Crossers underneath',
    type: 'pass',
    routes: {
      WR1: [{ x: -21, y: 4 }, { x: 12, y: 6.5 }],
      WR3: [{ x: -14, y: 2.5 }, { x: 14, y: 4.5 }],
      TE: [{ x: 8.5, y: 3 }, { x: -12, y: 5.5 }],
      WR2: [{ x: 21, y: 12 }, { x: 18, y: 18 }],
      RB: [{ x: -5, y: 0.5 }, { x: -12, y: 2 }],
    },
  },
  {
    id: 'postcorner',
    name: 'Post & Corner',
    desc: 'Dual deep breaks',
    type: 'pass',
    rbBlocks: true,
    routes: {
      WR1: [{ x: -21, y: 10 }, { x: -8, y: 22 }],
      WR2: [{ x: 21, y: 10 }, { x: 25, y: 20 }],
      WR3: [{ x: -14, y: 6 }, { x: -13, y: 5 }],
      TE: [{ x: 8.5, y: 7 }, { x: 3, y: 12 }],
    },
  },
  {
    id: 'bomb',
    name: 'Streaks',
    desc: 'Everybody go deep',
    type: 'pass',
    rbBlocks: true,
    routes: {
      WR1: [{ x: -20, y: 30 }],
      WR2: [{ x: 20, y: 30 }],
      WR3: [{ x: -12, y: 26 }],
      TE: [{ x: 7, y: 16 }],
    },
  },
  {
    id: 'pa-cross',
    name: 'PA Deep Cross',
    desc: 'Play-action, deep crosser',
    type: 'pass',
    playAction: true,
    rbBlocks: true,
    routes: {
      WR1: [{ x: -21, y: 8 }, { x: 10, y: 16 }],
      WR2: [{ x: 21, y: 14 }, { x: 16, y: 26 }],
      WR3: [{ x: -14, y: 4 }, { x: -18, y: 6 }],
      TE: [{ x: 8.5, y: 5 }, { x: 12, y: 8 }],
    },
  },
  {
    id: 'screen',
    name: 'HB Screen',
    desc: 'Let the rush in, dump it off',
    type: 'pass',
    routes: {
      RB: [{ x: -7, y: -2 }, { x: -10, y: 0.5 }],
      WR1: [{ x: -21, y: 8 }, { x: -20, y: 12 }],
      WR2: [{ x: 21, y: 8 }, { x: 20, y: 12 }],
      WR3: [{ x: -14, y: 6 }, { x: -12, y: 9 }],
      TE: [{ x: 8.5, y: 5 }, { x: 9, y: 8 }],
    },
  },
  {
    id: 'flats',
    name: 'Quick Flats',
    desc: 'Easy throws to the sideline',
    type: 'pass',
    routes: {
      RB: [{ x: -8, y: 0 }, { x: -16, y: 2 }],
      TE: [{ x: 12, y: 2 }, { x: 18, y: 3.5 }],
      WR1: [{ x: -21, y: 6 }, { x: -23, y: 10 }],
      WR2: [{ x: 21, y: 6 }, { x: 23, y: 10 }],
      WR3: [{ x: -14, y: 9 }, { x: -10, y: 13 }],
    },
  },
];

/** Defensive shells the CPU rolls between (also user coach-calls vs CPU offense). */
export type DefCall = 'balanced' | 'blitz' | 'coverage';

export const DEF_CALLS: { id: DefCall; name: string; desc: string }[] = [
  { id: 'balanced', name: 'Balanced', desc: 'Base defense' },
  { id: 'blitz', name: 'Blitz', desc: 'Send extra rushers, risky' },
  { id: 'coverage', name: 'Coverage Shell', desc: 'Drop everyone, soft vs run' },
];
