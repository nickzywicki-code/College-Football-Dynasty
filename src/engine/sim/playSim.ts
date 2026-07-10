// Single-play resolution. This is the shared "physics" of the game: the sim
// engine rolls every check here, and the arcade game reuses the same
// probability helpers with user skill replacing some rolls.

import { Rand, clamp } from './../rng';
import type { Player } from './../types';

export interface Personnel {
  QB: Player;
  RB: Player[];
  WR: Player[];
  TE: Player[];
  OL: Player[];
  DL: Player[];
  LB: Player[];
  CB: Player[];
  S: Player[];
  K: Player;
  P: Player;
}

export type PassDepth = 'short' | 'medium' | 'deep';

export interface PlayResult {
  kind: 'run' | 'pass' | 'sack' | 'scramble' | 'kneel';
  yards: number;
  /** pass only */
  complete: boolean;
  turnover: 'int' | 'fumble' | null;
  timeElapsed: number; // seconds including between-play runoff
  clockStops: boolean; // incomplete / out of bounds / turnover / score
  text: string;
  // stat attribution
  passer?: Player;
  rusher?: Player;
  receiver?: Player;
  tackler?: Player;
  interceptor?: Player;
  sacker?: Player;
}

function avg(players: Player[], f: (p: Player) => number): number {
  if (!players.length) return 50;
  let s = 0;
  for (const p of players) s += f(p);
  return s / players.length;
}

/** Logistic helper: rating differential -> probability around base. */
export function ratingProb(base: number, diff: number, scale = 0.012): number {
  return clamp(base + diff * scale, 0.02, 0.98);
}

// ---------------------------------------------------------------------------
// Probability helpers (shared with the arcade engine)
// ---------------------------------------------------------------------------

export function completionProbability(
  qb: Player,
  receiver: Player,
  coverage: number, // effective coverage rating of nearest defender
  depth: PassDepth,
  pressured: boolean,
): number {
  const base = depth === 'short' ? 0.72 : depth === 'medium' ? 0.62 : 0.42;
  const offSkill = qb.attrs.tha * 0.55 + receiver.attrs.cth * 0.35 + receiver.attrs.spd * 0.1;
  const defSkill = coverage;
  let p = ratingProb(base, offSkill - defSkill * 0.92 - 8, 0.009);
  if (pressured) p -= 0.16;
  if (depth === 'deep') p += (qb.attrs.thp - 80) * 0.003;
  return clamp(p, 0.05, 0.85);
}

export function interceptionProbability(
  qb: Player,
  coverage: number,
  depth: PassDepth,
  pressured: boolean,
): number {
  const base = depth === 'short' ? 0.016 : depth === 'medium' ? 0.024 : 0.038;
  let p = base + (coverage - qb.attrs.tha) * 0.00045 + (75 - qb.attrs.awr) * 0.0003;
  if (pressured) p += 0.012;
  return clamp(p, 0.004, 0.09);
}

export function sackProbability(ol: Player[], dl: Player[], lb: Player[], blitz = false): number {
  const protect = avg(ol, (p) => p.attrs.blk) + 4;
  const rush = avg(dl, (p) => (p.attrs.str + p.attrs.spd + p.attrs.tkl) / 3);
  let p = ratingProb(0.055, rush - protect, 0.0028);
  if (blitz) {
    const lbRush = avg(lb.slice(0, 1), (p) => p.attrs.spd);
    p += 0.02 + (lbRush - 70) * 0.0008;
  }
  return clamp(p, 0.02, 0.16);
}

export function fgMakeProbability(kicker: Player, distanceYds: number): number {
  // distance = yardline distance + 17 (end zone + hold spot)
  const k = kicker.attrs.kck;
  if (distanceYds <= 30) return clamp(0.96 + (k - 75) * 0.001, 0.8, 0.995);
  if (distanceYds <= 40) return clamp(0.88 + (k - 75) * 0.003, 0.6, 0.99);
  if (distanceYds <= 50) return clamp(0.72 + (k - 75) * 0.006, 0.35, 0.95);
  if (distanceYds <= 58) return clamp(0.45 + (k - 75) * 0.009, 0.1, 0.85);
  return clamp(0.12 + (k - 80) * 0.008, 0.02, 0.45);
}

export function tackleBreakProbability(carrier: Player, tackler: Player): number {
  const off = carrier.attrs.agi * 0.5 + carrier.attrs.str * 0.35 + carrier.attrs.spd * 0.15;
  const def = tackler.attrs.tkl * 0.7 + tackler.attrs.str * 0.3;
  return clamp(0.18 + (off - def) * 0.006, 0.04, 0.5);
}

export function fumbleProbability(carrier: Player, hardHit: boolean): number {
  let p = 0.006 + (75 - carrier.attrs.car) * 0.00035;
  if (hardHit) p *= 2.2;
  return clamp(p, 0.001, 0.035);
}

// ---------------------------------------------------------------------------
// Full play resolution for the sim engine
// ---------------------------------------------------------------------------

export interface SimPlayInput {
  r: Rand;
  offense: Personnel;
  defense: Personnel;
  yardsToGoal: number; // 1-99, distance to opponent end zone
  toGo: number;
  call: { type: 'run'; direction: 'inside' | 'outside' } | { type: 'pass'; depth: PassDepth } | { type: 'kneel' };
  hurryUp: boolean;
  defExpectsPass: number; // 0..1, shifts outcomes
}

function pickTackler(r: Rand, def: Personnel, vsRun: boolean): Player {
  const pool = vsRun
    ? [...def.DL, ...def.DL, ...def.LB, ...def.LB, ...def.S]
    : [...def.LB, ...def.CB, ...def.CB, ...def.S, ...def.S];
  return r.choice(pool);
}

function pickReceiver(r: Rand, off: Personnel, depth: PassDepth): Player {
  // WRs get most targets, TE/RB on short stuff; weight by catch+speed
  const cands: Player[] = [...off.WR, ...off.TE, ...(depth === 'short' ? [off.RB[0]] : [])].filter(Boolean);
  const weights = cands.map((p) => {
    let w = Math.pow(Math.max(20, p.attrs.cth * 0.6 + p.attrs.spd * 0.4 - 40), 1.7);
    if (p.pos === 'TE' && depth === 'deep') w *= 0.4;
    if (p.pos === 'RB') w *= depth === 'short' ? 0.8 : 0.1;
    return w;
  });
  return r.weighted(cands, weights);
}

function pickCoverDefender(r: Rand, def: Personnel, receiver: Player): Player {
  if (receiver.pos === 'WR') return r.chance(0.8) ? r.choice(def.CB) : r.choice(def.S);
  if (receiver.pos === 'TE') return r.chance(0.55) ? r.choice(def.LB) : r.choice(def.S);
  return r.choice(def.LB);
}

function runYards(r: Rand, input: SimPlayInput, rb: Player, direction: 'inside' | 'outside'): number {
  const off = input.offense;
  const def = input.defense;
  const blocking = avg(off.OL, (p) => p.attrs.blk) * 0.7 + avg(off.TE, (p) => p.attrs.blk) * 0.3;
  const frontSeven = avg(def.DL, (p) => (p.attrs.str + p.attrs.tkl) / 2) * 0.6 +
    avg(def.LB, (p) => p.attrs.tkl) * 0.4;
  const trench = (blocking - frontSeven) * 0.04;
  const boxBonus = (input.defExpectsPass - 0.5) * 1.8; // light box vs pass look
  let base: number;
  if (direction === 'inside') {
    base = r.gauss(3.0 + trench + boxBonus, 3.0);
  } else {
    // outside runs: boom/bust based on RB speed
    base = r.gauss(2.7 + trench + boxBonus + (rb.attrs.spd - 78) * 0.04, 4.0);
  }
  // tackle-break can extend the run
  if (base > 0 && r.chance(tackleBreakProbability(rb, pickTackler(r, def, true)) * 0.5)) {
    base += Math.max(2, r.gauss(8, 6));
  }
  // explosive tail
  if (r.chance(0.014 + Math.max(0, rb.attrs.spd - 82) * 0.0008)) {
    base += r.range(12, 42);
  }
  return Math.round(clamp(base, -6, input.yardsToGoal));
}

export function resolveSimPlay(input: SimPlayInput): PlayResult {
  const { r, offense: off, defense: def } = input;
  const noResult: Omit<PlayResult, 'kind' | 'yards' | 'text'> = {
    complete: false,
    turnover: null,
    timeElapsed: 0,
    clockStops: false,
  };

  if (input.call.type === 'kneel') {
    return { ...noResult, kind: 'kneel', yards: -1, timeElapsed: 42, text: `${off.QB.lastName} kneels.` };
  }

  if (input.call.type === 'run') {
    // backfield rotation: RB1 gets ~72% of carries
    const rb = off.RB.length > 1 && r.chance(0.28) ? off.RB[1] : off.RB[0];
    const yards = runYards(r, input, rb, input.call.direction);
    const tackler = pickTackler(r, def, true);
    const fumble = r.chance(fumbleProbability(rb, r.chance(0.25)));
    const td = yards >= input.yardsToGoal;
    const time = input.hurryUp ? r.int(18, 26) : r.int(32, 42);
    return {
      ...noResult,
      kind: 'run',
      yards,
      turnover: fumble && !td ? 'fumble' : null,
      timeElapsed: time,
      clockStops: td || (fumble && !td) || (input.call.direction === 'outside' && r.chance(0.25)),
      text: fumble && !td
        ? `${rb.lastName} FUMBLES after a ${yards}-yard run! Recovered by the defense.`
        : td
          ? `${rb.lastName} rushes ${yards} yards for a TOUCHDOWN!`
          : `${rb.lastName} rushes ${input.call.direction} for ${yards} yards.`,
      rusher: rb,
      tackler,
    };
  }

  // --- pass play ---
  const depth = input.call.depth;
  const qb = off.QB;
  const blitz = r.chance(0.22);
  const sackP = sackProbability(off.OL, def.DL, def.LB, blitz);

  if (r.chance(sackP)) {
    // sack, or QB escapes and scrambles
    const escape = r.chance(clamp(0.25 + (qb.attrs.agi - 70) * 0.008, 0.1, 0.55));
    if (escape) {
      const yards = Math.round(clamp(r.gauss(5 + (qb.attrs.spd - 70) * 0.1, 4), -2, input.yardsToGoal));
      const td = yards >= input.yardsToGoal;
      return {
        ...noResult,
        kind: 'scramble',
        yards,
        timeElapsed: input.hurryUp ? r.int(20, 28) : r.int(34, 44),
        clockStops: td || r.chance(0.4),
        text: td
          ? `${qb.lastName} escapes and scrambles ${yards} yards for a TOUCHDOWN!`
          : `${qb.lastName} escapes the pocket and scrambles for ${yards} yards.`,
        rusher: qb,
      };
    }
    const sacker = r.chance(0.75) ? r.choice(def.DL) : r.choice(def.LB);
    const loss = -Math.round(r.range(4, 9));
    const fumble = r.chance(fumbleProbability(qb, true) * 1.5);
    return {
      ...noResult,
      kind: 'sack',
      yards: loss,
      turnover: fumble ? 'fumble' : null,
      timeElapsed: input.hurryUp ? r.int(22, 30) : r.int(36, 46),
      clockStops: fumble,
      text: fumble
        ? `${sacker.lastName} strip-sacks ${qb.lastName}! Defense recovers.`
        : `${qb.lastName} is sacked by ${sacker.lastName} for ${loss} yards.`,
      sacker,
      passer: qb,
    };
  }

  const receiver = pickReceiver(r, off, depth);
  const defender = pickCoverDefender(r, def, receiver);
  const pressured = r.chance(clamp(sackP * 2.2, 0.08, 0.4));
  const covEff = defender.attrs.cov + (input.defExpectsPass - 0.5) * 10;

  const airYards =
    depth === 'short'
      ? Math.round(r.range(1, 8))
      : depth === 'medium'
        ? Math.round(r.range(9, 18))
        : Math.round(r.range(19, 42));
  const cappedAir = Math.min(airYards, input.yardsToGoal);

  if (r.chance(interceptionProbability(qb, covEff, depth, pressured))) {
    const interceptor = r.chance(0.6) ? defender : r.choice([...def.CB, ...def.S, ...def.LB]);
    return {
      ...noResult,
      kind: 'pass',
      yards: 0,
      turnover: 'int',
      timeElapsed: r.int(8, 14),
      clockStops: true,
      text: `${qb.lastName}'s ${depth} pass is INTERCEPTED by ${interceptor.lastName}!`,
      passer: qb,
      receiver,
      interceptor,
    };
  }

  const cmpP = completionProbability(qb, receiver, covEff, depth, pressured);
  if (!r.chance(cmpP)) {
    return {
      ...noResult,
      kind: 'pass',
      yards: 0,
      timeElapsed: r.int(6, 12),
      clockStops: true,
      text: `${qb.lastName}'s ${depth} pass to ${receiver.lastName} falls incomplete.`,
      passer: qb,
      receiver,
    };
  }

  // completion: air yards + YAC
  let yac: number;
  const yacSkill = (receiver.attrs.spd + receiver.attrs.agi) / 2;
  if (depth === 'short') yac = Math.max(0, r.gauss(4.5 + (yacSkill - 75) * 0.09, 4));
  else if (depth === 'medium') yac = Math.max(0, r.gauss(3 + (yacSkill - 75) * 0.07, 3.5));
  else yac = Math.max(0, r.gauss(4 + (yacSkill - 78) * 0.12, 6));
  if (r.chance(tackleBreakProbability(receiver, defender) * 0.7)) {
    yac += Math.max(3, r.gauss(10, 8));
  }
  const yards = Math.round(clamp(cappedAir + yac, -2, input.yardsToGoal));
  const td = yards >= input.yardsToGoal;
  const fumble = !td && r.chance(fumbleProbability(receiver, r.chance(0.3)) * 0.7);
  const tackler = pickTackler(r, def, false);
  return {
    ...noResult,
    kind: 'pass',
    yards,
    complete: true,
    turnover: fumble ? 'fumble' : null,
    timeElapsed: input.hurryUp ? r.int(16, 24) : r.int(30, 42),
    clockStops: td || fumble || r.chance(depth === 'deep' ? 0.45 : 0.28),
    text: fumble
      ? `${receiver.lastName} catches it but FUMBLES! Defense recovers.`
      : td
        ? `${qb.lastName} hits ${receiver.lastName} for a ${yards}-yard TOUCHDOWN!`
        : `${qb.lastName} completes to ${receiver.lastName} for ${yards} yards.`,
    passer: qb,
    receiver,
    tackler,
  };
}
