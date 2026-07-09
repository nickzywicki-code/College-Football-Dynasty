import type { ClassYear, CoachProfile, CoachSeasonRecord, JobOffer, Player, Position, Recruit, Team } from '../state/types'
import { CLASS_YEARS, POSITIONS } from '../state/types'
import { RNG, genId } from './rng'
import { computeOverall, generatePlayer } from './player'
import { autoSetDepthChart } from './world'
import { emptySeasonStats } from '../state/types'

const DEV_RATE: Record<string, number> = { Normal: 1.4, Impact: 2.4, Star: 3.4, Elite: 4.6 }

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

const ALL_RATING_KEYS: (keyof Player['ratings'])[] = [
  'speed', 'strength', 'agility', 'awareness', 'throwing', 'catching',
  'blocking', 'passRush', 'coverage', 'tackling', 'kicking',
]

export function developPlayer(player: Player, practiceFocusBonus: number, rng: RNG): void {
  if (player.overall >= player.potential) return
  const room = player.potential - player.overall
  const rate = (DEV_RATE[player.devTrait] ?? 1.4) + practiceFocusBonus
  const growth = clamp(rng.normal(rate, 1.1), 0, rate + 3) * clamp(room / 20, 0.3, 1.3)

  for (const key of ALL_RATING_KEYS) {
    if (player.ratings[key] < 40 && growth < 1) continue
    const bump = growth * rng.float(0.4, 1.1) * 0.35
    player.ratings[key] = Math.round(clamp(player.ratings[key] + bump, 25, 99))
  }
  player.overall = computeOverall(player.position, player.ratings)
}

export function advanceOffseason(
  teams: Record<string, Team>,
  players: Record<string, Player>,
  rng: RNG,
): { departedPlayerIds: string[]; draftedPlayerIds: string[] } {
  const departedPlayerIds: string[] = []
  const draftedPlayerIds: string[] = []

  for (const player of Object.values(players)) {
    if (!player.teamId) continue
    const team = teams[player.teamId]
    if (!team) continue

    const focusBonus = team.gamePlan.practiceFocus === 'Offense' && isOffensivePlayer(player.position) ? 0.8
      : team.gamePlan.practiceFocus === 'Defense' && isDefensivePlayer(player.position) ? 0.8
      : team.gamePlan.practiceFocus === 'Conditioning' ? 0.4 : 0
    developPlayer(player, focusBonus, rng)
    player.stamina = 100
    player.seasonStats = emptySeasonStats()

    if (player.classYear === 'SR') {
      departedPlayerIds.push(player.id)
      continue
    }

    const earlyDeclare = player.classYear === 'JR' && player.overall >= 86 && rng.bool(0.35)
    if (earlyDeclare) {
      draftedPlayerIds.push(player.id)
      departedPlayerIds.push(player.id)
      continue
    }

    player.classYear = nextClassYear(player.classYear)
    player.yearsOnTeam += 1
  }

  for (const id of departedPlayerIds) {
    const player = players[id]
    if (!player?.teamId) continue
    const team = teams[player.teamId]
    if (team) team.rosterIds = team.rosterIds.filter((pid) => pid !== id)
    delete players[id]
  }

  return { departedPlayerIds, draftedPlayerIds }
}

function isOffensivePlayer(pos: Position): boolean {
  return pos === 'QB' || pos === 'RB' || pos === 'WR' || pos === 'TE' || pos === 'OL'
}
function isDefensivePlayer(pos: Position): boolean {
  return pos === 'DL' || pos === 'LB' || pos === 'CB' || pos === 'S'
}

function nextClassYear(y: ClassYear): ClassYear {
  const idx = CLASS_YEARS.indexOf(y)
  return CLASS_YEARS[Math.min(idx + 1, CLASS_YEARS.length - 1)]
}

export function convertRecruitToPlayer(recruit: Recruit, teamId: string): Player {
  return {
    id: genId('plyr'),
    firstName: recruit.firstName,
    lastName: recruit.lastName,
    position: recruit.position,
    teamId,
    classYear: 'FR',
    redshirted: false,
    redshirtEligible: true,
    stars: recruit.stars,
    potential: recruit.potential,
    devTrait: recruit.devTraitHint,
    ratings: { ...recruit.ratings },
    overall: recruit.overall,
    stamina: 100,
    morale: 80,
    homeState: recruit.homeState,
    injuryWeeksLeft: 0,
    seasonStats: emptySeasonStats(),
    careerStats: emptySeasonStats(),
    awards: [],
    yearsOnTeam: 0,
  }
}

export function signRecruitsToRosters(signed: Recruit[], teams: Record<string, Team>, players: Record<string, Player>): void {
  for (const recruit of signed) {
    const teamId = recruit.committedTeamId
    if (!teamId) continue
    const team = teams[teamId]
    if (!team) continue
    const player = convertRecruitToPlayer(recruit, teamId)
    players[player.id] = player
    team.rosterIds.push(player.id)
  }
  for (const team of Object.values(teams)) {
    autoSetDepthChart(team, players)
  }
}

const MIN_ROSTER: Record<Position, number> = {
  QB: 2, RB: 3, WR: 5, TE: 2, OL: 7, DL: 6, LB: 5, CB: 4, S: 4, K: 1, P: 1,
}

export function fillRosterGaps(team: Team, players: Record<string, Player>, rng: RNG): number {
  let added = 0
  const byPos: Partial<Record<Position, number>> = {}
  for (const id of team.rosterIds) {
    const p = players[id]
    if (!p) continue
    byPos[p.position] = (byPos[p.position] ?? 0) + 1
  }
  for (const position of POSITIONS) {
    const have = byPos[position] ?? 0
    const need = MIN_ROSTER[position]
    for (let i = have; i < need; i++) {
      const walkOn = makeWalkOn(rng, position, team.prestige)
      walkOn.teamId = team.id
      players[walkOn.id] = walkOn
      team.rosterIds.push(walkOn.id)
      added++
    }
  }
  if (added > 0) autoSetDepthChart(team, players)
  return added
}

function makeWalkOn(rng: RNG, position: Position, prestige: number): Player {
  const talentBias = clamp(prestige / 140 + rng.float(-0.05, 0.05), 0.02, 0.4)
  return generatePlayer(rng, position, 'FR', { talentBias, maxStars: 2 })
}

export function updateCoachCareer(
  coach: CoachProfile,
  team: Team,
  year: number,
  madePlayoff: boolean,
  nationalChampion: boolean,
  confChampion: boolean,
): CoachProfile {
  const record: CoachSeasonRecord = {
    year, teamId: team.id, wins: team.wins, losses: team.losses,
    confChampion, madePlayoff, nationalChampion, finalRank: team.rank,
  }
  const winPct = team.wins / Math.max(1, team.wins + team.losses)
  let hotSeat = coach.hotSeat + (winPct - 0.5) * 40
  if (nationalChampion) hotSeat += 30
  else if (madePlayoff) hotSeat += 15
  else if (winPct < 0.35) hotSeat -= 20
  hotSeat = clamp(hotSeat, 0, 100)

  let reputation = coach.reputation + (winPct - 0.5) * 12
  if (nationalChampion) reputation += 18
  else if (confChampion) reputation += 8
  else if (madePlayoff) reputation += 5
  reputation = clamp(reputation, 1, 100)

  return {
    ...coach,
    careerWins: coach.careerWins + team.wins,
    careerLosses: coach.careerLosses + team.losses,
    history: [...coach.history, record],
    hotSeat,
    reputation,
  }
}

export function generateJobOffers(coach: CoachProfile, currentTeam: Team, teams: Record<string, Team>, rng: RNG): JobOffer[] {
  if (coach.reputation < 45) return []
  const candidates = Object.values(teams).filter((t) => !t.isUserTeam && t.prestige > currentTeam.prestige + 8 && t.prestige <= coach.reputation + 10)
  const offers: JobOffer[] = []
  const count = coach.reputation > 80 ? rng.int(1, 3) : rng.int(0, 2)
  const shuffled = rng.shuffle(candidates)
  for (let i = 0; i < Math.min(count, shuffled.length); i++) {
    const t = shuffled[i]
    offers.push({
      teamId: t.id,
      prestige: t.prestige,
      message: `The ${t.name} ${t.mascot} want you to take over their program.`,
    })
  }
  return offers
}
