// Player generation: position archetypes, attribute distributions, overall calc.

import { Rand, clamp } from './rng';
import { randomFirstName, randomLastName } from './names';
import type { Attributes, AttrKey, Player, Position } from './types';

/** Weights used to compute a position's overall rating (must sum to 1). */
export const OVERALL_WEIGHTS: Record<Position, Partial<Record<AttrKey, number>>> = {
  QB: { tha: 0.34, thp: 0.22, awr: 0.2, spd: 0.08, agi: 0.08, str: 0.04, sta: 0.04 },
  RB: { spd: 0.24, agi: 0.22, str: 0.14, car: 0.16, cth: 0.08, acc: 0.12, sta: 0.04 },
  WR: { spd: 0.26, cth: 0.28, agi: 0.18, acc: 0.14, awr: 0.1, str: 0.04 },
  TE: { cth: 0.26, blk: 0.2, str: 0.16, spd: 0.16, agi: 0.1, awr: 0.12 },
  OL: { blk: 0.5, str: 0.28, awr: 0.14, agi: 0.08 },
  DL: { str: 0.3, tkl: 0.26, spd: 0.16, agi: 0.14, awr: 0.14 },
  LB: { tkl: 0.28, spd: 0.2, cov: 0.16, str: 0.16, awr: 0.2 },
  CB: { cov: 0.34, spd: 0.26, agi: 0.18, tkl: 0.08, awr: 0.14 },
  S: { cov: 0.26, tkl: 0.2, spd: 0.22, awr: 0.2, agi: 0.12 },
  K: { kck: 0.8, awr: 0.2 },
  P: { kck: 0.8, awr: 0.2 },
};

/** Which attrs are "core" for a position — generated higher and developed faster. */
const CORE_ATTRS: Record<Position, AttrKey[]> = {
  QB: ['tha', 'thp', 'awr'],
  RB: ['spd', 'agi', 'car', 'acc', 'str'],
  WR: ['spd', 'cth', 'agi', 'acc'],
  TE: ['cth', 'blk', 'str', 'spd'],
  OL: ['blk', 'str', 'awr'],
  DL: ['str', 'tkl', 'spd', 'agi'],
  LB: ['tkl', 'spd', 'cov', 'str', 'awr'],
  CB: ['cov', 'spd', 'agi'],
  S: ['cov', 'tkl', 'spd', 'awr'],
  K: ['kck'],
  P: ['kck'],
};

const ALL_ATTRS: AttrKey[] = [
  'spd', 'acc', 'str', 'agi', 'thp', 'tha', 'cth', 'car', 'blk', 'tkl', 'cov', 'kck', 'sta', 'awr',
];

/** Baseline speed by position so OL don't outrun WRs in the arcade game. */
const SPEED_BASE: Record<Position, number> = {
  QB: 62, RB: 78, WR: 82, TE: 68, OL: 42, DL: 55, LB: 68, CB: 82, S: 78, K: 50, P: 50,
};

const JERSEY_RANGES: Record<Position, [number, number]> = {
  QB: [1, 19], RB: [20, 39], WR: [10, 89], TE: [80, 89], OL: [50, 79],
  DL: [50, 99], LB: [40, 59], CB: [20, 39], S: [20, 49], K: [1, 9], P: [1, 9],
};

export function computeOverall(pos: Position, attrs: Attributes): number {
  const weights = OVERALL_WEIGHTS[pos];
  let total = 0;
  for (const key of Object.keys(weights) as AttrKey[]) {
    total += attrs[key] * (weights[key] ?? 0);
  }
  return Math.round(clamp(total, 1, 99));
}

/**
 * Generate attributes targeting a rough quality level (1-99).
 * Core attrs cluster near `quality`; non-core attrs are lower and noisier.
 */
export function generateAttributes(r: Rand, pos: Position, quality: number): Attributes {
  const attrs = {} as Attributes;
  const core = CORE_ATTRS[pos];
  for (const key of ALL_ATTRS) {
    if (key === 'spd') {
      const base = SPEED_BASE[pos];
      const lift = core.includes('spd') ? (quality - 70) * 0.45 : (quality - 70) * 0.2;
      attrs.spd = Math.round(r.gaussClamp(base + lift, 5, 20, 99));
    } else if (core.includes(key)) {
      attrs[key] = Math.round(r.gaussClamp(quality, 6, 25, 99));
    } else {
      attrs[key] = Math.round(r.gaussClamp(quality - 22, 10, 15, 90));
    }
  }
  // stamina and awareness get a floor so sims behave
  attrs.sta = Math.round(r.gaussClamp(Math.max(attrs.sta, 60), 8, 40, 99));
  // kickers can't throw/block etc — dampen irrelevant attrs slightly for flavor realism
  if (pos === 'K' || pos === 'P') {
    attrs.str = Math.min(attrs.str, 60);
    attrs.tkl = Math.min(attrs.tkl, 45);
  }
  if (pos !== 'QB') {
    attrs.thp = Math.min(attrs.thp, 55);
    attrs.tha = Math.min(attrs.tha, 50);
  }
  return attrs;
}

export interface GeneratePlayerOpts {
  pos: Position;
  age: number;
  /** target quality of core ratings, ~40-95 */
  quality: number;
  teamId: number;
}

let usedJerseyScratch: Set<number> | null = null;

/** Optionally provide a set of taken jersey numbers so teammates don't collide. */
export function setJerseyScratch(taken: Set<number> | null): void {
  usedJerseyScratch = taken;
}

export function generatePlayer(r: Rand, id: number, opts: GeneratePlayerOpts): Player {
  const attrs = generateAttributes(r, opts.pos, opts.quality);
  const [jMin, jMax] = JERSEY_RANGES[opts.pos];
  let jersey = r.int(jMin, jMax);
  if (usedJerseyScratch) {
    for (let tries = 0; tries < 60 && usedJerseyScratch.has(jersey); tries++) {
      jersey = r.int(1, 99);
    }
    usedJerseyScratch.add(jersey);
  }
  // Potential: young players may have high ceilings; older players are what they are.
  const overall = computeOverall(opts.pos, attrs);
  let potential: number;
  if (opts.age <= 24) {
    potential = Math.round(clamp(overall + Math.max(0, r.gauss(9, 7)), overall, 99));
  } else {
    potential = Math.round(clamp(overall + Math.max(0, r.gauss(2, 3)), overall, 99));
  }
  return {
    id,
    firstName: randomFirstName(r),
    lastName: randomLastName(r),
    pos: opts.pos,
    age: opts.age,
    jersey,
    attrs,
    potential,
    overall,
    teamId: opts.teamId,
    contract: null,
    injuryWeeks: 0,
    yearsPro: Math.max(0, opts.age - 22),
    draftInfo: null,
    stats: [],
    awards: [],
    retired: false,
  };
}

/** Expected market salary in $M/yr given overall, age, position. */
export function marketSalary(p: { overall: number; age: number; pos: Position }): number {
  // 60 ovr backup ≈ $1.1M; 80 ovr starter ≈ $9M; 92 ovr star QB ≈ $38M
  const posMult: Record<Position, number> = {
    QB: 1.9, RB: 0.8, WR: 1.15, TE: 0.9, OL: 1.0, DL: 1.15, LB: 0.95, CB: 1.1, S: 0.9, K: 0.35, P: 0.3,
  };
  const o = p.overall;
  let base: number;
  if (o < 60) base = 0.8 + (o - 40) * 0.015;
  else if (o < 75) base = 1.1 + (o - 60) * 0.22;
  else if (o < 85) base = 4.4 + (o - 75) * 0.95;
  else base = 13.9 + (o - 85) * 1.8;
  // age discount for veterans past 30
  const ageMult = p.age >= 31 ? Math.max(0.55, 1 - (p.age - 30) * 0.08) : 1;
  return Math.max(0.75, Math.round(base * posMult[p.pos] * ageMult * 10) / 10);
}

/** How a player's core attrs shift in one offseason. Positive early, negative late. */
export function agingDelta(r: Rand, p: Player): number {
  const peakAge = p.pos === 'RB' ? 26 : p.pos === 'QB' || p.pos === 'K' || p.pos === 'P' ? 30 : 27;
  const declineRate = p.pos === 'RB' ? 1.6 : 1.1;
  if (p.age < peakAge) {
    // growth scaled by remaining potential gap
    const gap = Math.max(0, p.potential - p.overall);
    const youth = (peakAge - p.age) / peakAge;
    return Math.max(0, r.gauss(gap * 0.35 * (0.5 + youth), 1.6));
  }
  if (p.age <= peakAge + 2) {
    return r.gauss(0, 1.0); // plateau
  }
  const yearsPast = p.age - (peakAge + 2);
  return -Math.max(0, r.gauss(yearsPast * declineRate, 1.4));
}

/** Apply an overall delta by nudging attributes (core attrs move most). */
export function applyDevelopment(r: Rand, p: Player, delta: number): void {
  if (delta === 0) return;
  const core = CORE_ATTRS[p.pos];
  const perAttr = delta / core.length;
  for (const key of core) {
    p.attrs[key] = Math.round(clamp(p.attrs[key] + r.gauss(perAttr * 1.3, 1), 15, 99));
  }
  // physical decline also hits speed/acceleration for everyone
  if (delta < 0) {
    p.attrs.spd = Math.round(clamp(p.attrs.spd + r.gauss(delta * 0.4, 0.6), 15, 99));
    p.attrs.acc = Math.round(clamp(p.attrs.acc + r.gauss(delta * 0.4, 0.6), 15, 99));
  }
  p.overall = computeOverall(p.pos, p.attrs);
}

export function retirementChance(p: Player): number {
  const lateAge = p.pos === 'QB' || p.pos === 'K' || p.pos === 'P' ? 36 : p.pos === 'RB' ? 30 : 32;
  if (p.age < lateAge - 2) return 0;
  const over = p.age - (lateAge - 2);
  let chance = over * 0.16;
  if (p.overall < 62) chance += 0.25; // fringe players hang it up sooner
  return clamp(chance, 0, 0.97);
}
