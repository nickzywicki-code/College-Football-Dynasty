import type { Position, Recruit, RecruitPriority, RecruitingBoard, Team } from '../state/types'
import { POSITIONS } from '../state/types'
import { RNG, genId } from './rng'
import { generatePlayer, potentialForStars, devTraitForStars } from './player'
import { US_STATES } from '../data/names'

// Sized to roughly match league-wide roster attrition (~80 teams x ~13-15 departures/year).
const CLASS_SIZE = 1400

const POSITION_WEIGHTS: Record<Position, number> = {
  QB: 6, RB: 10, WR: 18, TE: 8, OL: 24,
  DL: 20, LB: 16, CB: 14, S: 12,
  K: 2, P: 2,
}

const PRIORITIES: RecruitPriority[] = ['PlayingTime', 'Prestige', 'Academics', 'Proximity', 'Facilities', 'Championships']

export function generateRecruitClass(rng: RNG, year: number): Recruit[] {
  const recruits: Recruit[] = []
  const weightedPositions: Position[] = []
  for (const pos of POSITIONS) {
    for (let i = 0; i < POSITION_WEIGHTS[pos]; i++) weightedPositions.push(pos)
  }

  for (let i = 0; i < CLASS_SIZE; i++) {
    const position = rng.pick(weightedPositions)
    const base = generatePlayer(rng, position, 'FR', { maxStars: 5 })
    const stars = weightedRecruitStar(rng)
    const potential = potentialForStars(rng, stars)
    const devTraitHint = devTraitForStars(rng, stars)
    // recruit's *current* overall should sit below potential — they're unproven
    const overallDampen = Math.round((potential - base.overall) * 0.55)
    const recruit: Recruit = {
      id: genId('rec'),
      firstName: base.firstName,
      lastName: base.lastName,
      position,
      stars,
      potential,
      devTraitHint,
      ratings: base.ratings,
      overall: Math.max(35, base.overall - Math.max(0, overallDampen)),
      homeState: rng.pick(US_STATES),
      priority: rng.pick(PRIORITIES),
      secondaryPriority: rng.pick(PRIORITIES),
      interest: {},
      scouted: {},
      offers: [],
      visited: [],
      committedTeamId: null,
      signed: false,
      leaningTeamId: null,
    }
    recruits.push(recruit)
  }

  void year
  return recruits
}

function weightedRecruitStar(rng: RNG): 1 | 2 | 3 | 4 | 5 {
  return rng.weighted([
    { value: 5 as const, weight: 2 },
    { value: 4 as const, weight: 13 },
    { value: 3 as const, weight: 40 },
    { value: 2 as const, weight: 35 },
    { value: 1 as const, weight: 10 },
  ])
}

export function initBoard(rng: RNG, year: number): RecruitingBoard {
  return {
    year,
    recruits: generateRecruitClass(rng, year),
    weeklyPoints: 100,
    pointsSpent: {},
  }
}

export function weeklyPointBudget(team: Team): number {
  const coordinator = team.staff.find((s) => s.role === 'RecruitingCoordinator')
  const staffBonus = coordinator ? coordinator.rating * 0.6 : 30
  const facilityBonus = team.facilities.recruitingHub * 6
  return Math.round(60 + staffBonus + facilityBonus)
}

export const RECRUIT_ACTION_COSTS = {
  scout: 8,
  contact: 12,
  offer: 15,
  hostVisit: 45,
} as const

export function fitScore(recruit: Recruit, team: Team, conferenceFootprint: string[]): number {
  const idealPrestige = 30 + recruit.stars * 13
  const prestigeGap = Math.abs(team.prestige - idealPrestige)
  let score = 55 - prestigeGap * 0.5

  if (recruit.priority === 'Prestige' || recruit.secondaryPriority === 'Prestige') score += team.prestige * 0.25
  if (recruit.priority === 'Academics' || recruit.secondaryPriority === 'Academics') score += team.facilities.academics * 3
  if (recruit.priority === 'Facilities' || recruit.secondaryPriority === 'Facilities') score += team.facilities.stadium * 2 + team.facilities.training * 2
  if (recruit.priority === 'Championships' || recruit.secondaryPriority === 'Championships') score += (team.wins - team.losses) * 3
  if ((recruit.priority === 'Proximity' || recruit.secondaryPriority === 'Proximity') && conferenceFootprint.includes(recruit.homeState)) score += 18
  if (recruit.priority === 'PlayingTime' || recruit.secondaryPriority === 'PlayingTime') score += 8

  return score
}

export function weeklyRecruitingAiTick(board: RecruitingBoard, teams: Record<string, Team>, footprints: Record<string, string[]>, rng: RNG): void {
  for (const recruit of board.recruits) {
    if (recruit.signed || recruit.committedTeamId) continue
    for (const team of Object.values(teams)) {
      if (team.isUserTeam) continue
      const current = recruit.interest[team.id] ?? rng.float(5, 20)
      const fit = fitScore(recruit, team, footprints[team.id] ?? [])
      const drift = (fit - current) * 0.08 + rng.float(-2, 2)
      recruit.interest[team.id] = clamp(current + drift, 0, 100)
    }
    // AI teams occasionally offer/commit interest leaders
    const best = Object.entries(recruit.interest).sort((a, b) => b[1] - a[1])[0]
    if (best && best[1] > 55 && !recruit.offers.includes(best[0]) && rng.bool(0.4)) {
      recruit.offers.push(best[0])
    }
  }
}

export function performScout(recruit: Recruit, teamId: string): void {
  recruit.scouted[teamId] = clamp((recruit.scouted[teamId] ?? 0) + 35, 0, 100)
}

export function performContact(recruit: Recruit, team: Team, footprint: string[]): void {
  const fit = fitScore(recruit, team, footprint)
  const current = recruit.interest[team.id] ?? 10
  recruit.interest[team.id] = clamp(current + 10 + fit * 0.08, 0, 100)
}

export function performOffer(recruit: Recruit, teamId: string): void {
  if (!recruit.offers.includes(teamId)) recruit.offers.push(teamId)
  recruit.interest[teamId] = clamp((recruit.interest[teamId] ?? 20) + 12, 0, 100)
}

export function performVisit(recruit: Recruit, teamId: string, rng: RNG): void {
  if (!recruit.visited.includes(teamId)) recruit.visited.push(teamId)
  recruit.interest[teamId] = clamp((recruit.interest[teamId] ?? 20) + rng.int(15, 28), 0, 100)
}

export function checkCommitment(recruit: Recruit, rng: RNG): void {
  if (recruit.committedTeamId || recruit.signed) return
  const entries = Object.entries(recruit.interest).filter(([teamId]) => recruit.offers.includes(teamId))
  if (entries.length === 0) return
  const top = entries.sort((a, b) => b[1] - a[1])[0]
  if (top[1] >= 78 && rng.bool(0.22)) {
    recruit.committedTeamId = top[0]
    recruit.leaningTeamId = top[0]
  } else if (top[1] >= 55) {
    recruit.leaningTeamId = top[0]
  }
}

export function resolveSigningDay(board: RecruitingBoard, teams: Record<string, Team>, rng: RNG): Recruit[] {
  const signed: Recruit[] = []
  for (const recruit of board.recruits) {
    if (recruit.signed) continue
    let teamId = recruit.committedTeamId
    if (!teamId) {
      const entries = Object.entries(recruit.interest)
      if (entries.length === 0) continue
      const sorted = entries.sort((a, b) => b[1] - a[1])
      if (sorted[0][1] < 25) continue // uninterested enough to go unsigned / juco
      teamId = rng.weighted(sorted.slice(0, 3).map(([id, v]) => ({ value: id, weight: Math.max(1, v) })))
    }
    if (!teams[teamId]) continue
    recruit.committedTeamId = teamId
    recruit.signed = true
    signed.push(recruit)
  }
  return signed
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
