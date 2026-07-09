import type { ClassYear, DevTrait, Player, Position, RatingBlock } from '../state/types'
import { emptySeasonStats } from '../state/types'
import { CITY_NAMES, FIRST_NAMES, LAST_NAMES, US_STATES } from '../data/names'
import { RNG, genId } from './rng'

export const OVERALL_WEIGHTS: Record<Position, Partial<Record<keyof RatingBlock, number>>> = {
  QB: { throwing: 0.40, awareness: 0.25, agility: 0.15, speed: 0.10, strength: 0.10 },
  RB: { speed: 0.30, agility: 0.25, strength: 0.15, blocking: 0.10, catching: 0.10, awareness: 0.10 },
  WR: { catching: 0.35, speed: 0.30, agility: 0.20, awareness: 0.15 },
  TE: { catching: 0.25, blocking: 0.30, strength: 0.15, speed: 0.15, awareness: 0.15 },
  OL: { blocking: 0.55, strength: 0.30, awareness: 0.15 },
  DL: { passRush: 0.40, strength: 0.30, tackling: 0.20, awareness: 0.10 },
  LB: { tackling: 0.30, coverage: 0.20, passRush: 0.20, speed: 0.15, awareness: 0.15 },
  CB: { coverage: 0.45, speed: 0.30, agility: 0.15, awareness: 0.10 },
  S: { coverage: 0.30, tackling: 0.30, speed: 0.20, awareness: 0.20 },
  K: { kicking: 0.85, awareness: 0.15 },
  P: { kicking: 0.85, awareness: 0.15 },
}

const PRIMARY_FIELDS: Record<Position, (keyof RatingBlock)[]> = {
  QB: ['throwing', 'awareness'],
  RB: ['speed', 'agility'],
  WR: ['catching', 'speed'],
  TE: ['catching', 'blocking'],
  OL: ['blocking', 'strength'],
  DL: ['passRush', 'strength'],
  LB: ['tackling', 'coverage'],
  CB: ['coverage', 'speed'],
  S: ['coverage', 'tackling'],
  K: ['kicking'],
  P: ['kicking'],
}

const ALL_RATING_KEYS: (keyof RatingBlock)[] = [
  'speed', 'strength', 'agility', 'awareness', 'throwing', 'catching',
  'blocking', 'passRush', 'coverage', 'tackling', 'kicking',
]

export function computeOverall(position: Position, ratings: RatingBlock): number {
  const weights = OVERALL_WEIGHTS[position]
  let total = 0
  for (const key of Object.keys(weights) as (keyof RatingBlock)[]) {
    total += ratings[key] * (weights[key] ?? 0)
  }
  return Math.round(clamp(total, 30, 99))
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

export function starsForTalent(rng: RNG, talent: number): 1 | 2 | 3 | 4 | 5 {
  // talent 0-1 biases the roll
  const roll = rng.next() + (talent - 0.5) * 0.6
  if (roll > 0.93) return 5
  if (roll > 0.75) return 4
  if (roll > 0.45) return 3
  if (roll > 0.18) return 2
  return 1
}

export function potentialForStars(rng: RNG, stars: number): number {
  const ranges: Record<number, [number, number]> = {
    5: [90, 99], 4: [82, 92], 3: [72, 85], 2: [62, 76], 1: [50, 66],
  }
  const [lo, hi] = ranges[stars] ?? [55, 70]
  return rng.int(lo, hi)
}

export function devTraitForStars(rng: RNG, stars: number): DevTrait {
  const table: Record<number, { value: DevTrait; weight: number }[]> = {
    5: [{ value: 'Elite', weight: 35 }, { value: 'Star', weight: 40 }, { value: 'Impact', weight: 20 }, { value: 'Normal', weight: 5 }],
    4: [{ value: 'Elite', weight: 10 }, { value: 'Star', weight: 35 }, { value: 'Impact', weight: 35 }, { value: 'Normal', weight: 20 }],
    3: [{ value: 'Elite', weight: 2 }, { value: 'Star', weight: 13 }, { value: 'Impact', weight: 35 }, { value: 'Normal', weight: 50 }],
    2: [{ value: 'Star', weight: 4 }, { value: 'Impact', weight: 21 }, { value: 'Normal', weight: 75 }],
    1: [{ value: 'Impact', weight: 8 }, { value: 'Normal', weight: 92 }],
  }
  return rng.weighted(table[stars] ?? table[2])
}

function generateRatings(rng: RNG, position: Position, talent: number): RatingBlock {
  const primary = PRIMARY_FIELDS[position]
  const base: RatingBlock = {
    speed: 45, strength: 45, agility: 45, awareness: 40, throwing: 30,
    catching: 30, blocking: 35, passRush: 30, coverage: 30, tackling: 40, kicking: 25,
  }
  const talentMean = 55 + talent * 30 // 55-85 mean for primary fields
  for (const key of ALL_RATING_KEYS) {
    const isPrimary = primary.includes(key)
    const mean = isPrimary ? talentMean : base[key] + talent * 15
    const stdDev = isPrimary ? 7 : 10
    base[key] = Math.round(clamp(rng.normal(mean, stdDev), 25, 99))
  }
  return base
}

const REDSHIRT_ELIGIBLE_DEFAULT = true

export function generatePlayer(rng: RNG, position: Position, classYear: ClassYear, opts?: { minStars?: number; maxStars?: number; talentBias?: number }): Player {
  const talent = clamp((opts?.talentBias ?? rng.next()), 0, 1)
  const stars = clampStars(starsForTalent(rng, talent), opts?.minStars, opts?.maxStars)
  const ratings = generateRatings(rng, position, talent)
  const overall = computeOverall(position, ratings)
  const potential = Math.max(overall, potentialForStars(rng, stars))
  const devTrait = devTraitForStars(rng, stars)

  return {
    id: genId('plyr'),
    firstName: rng.pick(FIRST_NAMES),
    lastName: rng.pick(LAST_NAMES),
    position,
    teamId: null,
    classYear,
    redshirted: false,
    redshirtEligible: REDSHIRT_ELIGIBLE_DEFAULT,
    stars,
    potential,
    devTrait,
    ratings,
    overall,
    stamina: 100,
    morale: rng.int(60, 90),
    homeState: rng.pick(US_STATES),
    injuryWeeksLeft: 0,
    seasonStats: emptySeasonStats(),
    careerStats: emptySeasonStats(),
    awards: [],
    yearsOnTeam: 0,
  }
}

function clampStars(s: number, min?: number, max?: number): 1 | 2 | 3 | 4 | 5 {
  let v = s
  if (min) v = Math.max(v, min)
  if (max) v = Math.min(v, max)
  return clamp(v, 1, 5) as 1 | 2 | 3 | 4 | 5
}

export function randomHometown(rng: RNG): string {
  return `${rng.pick(CITY_NAMES)}, ${rng.pick(US_STATES)}`
}

export function fullName(p: Player | { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName}`
}
