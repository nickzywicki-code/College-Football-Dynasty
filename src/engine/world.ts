import type { Conference, Facilities, Player, StaffMember, StaffRole, Team } from '../state/types'
import { POSITIONS, defaultGamePlan } from '../state/types'
import { CITY_NAMES, COACH_FIRST_NAMES, COLOR_PAIRS, CONFERENCE_NAMES, LAST_NAMES, MASCOTS, US_STATES } from '../data/names'
import { RNG, genId } from './rng'
import { generatePlayer } from './player'
import type { Position, ClassYear } from '../state/types'

const ROSTER_TARGETS: Record<Position, number> = {
  QB: 3, RB: 4, WR: 7, TE: 3, OL: 9,
  DL: 8, LB: 7, CB: 5, S: 5,
  K: 1, P: 1,
}

const CLASS_DISTRIBUTION: ClassYear[] = ['FR', 'FR', 'SO', 'SO', 'JR', 'JR', 'SR', 'SR']

export interface GeneratedWorld {
  conferences: Conference[]
  teams: Record<string, Team>
  players: Record<string, Player>
}

function staffRating(rng: RNG, prestige: number): number {
  return Math.round(clamp(rng.normal(35 + prestige * 0.5, 10), 30, 99))
}

function generateStaffMember(rng: RNG, role: StaffRole, prestige: number): StaffMember {
  return {
    id: genId('staff'),
    name: `${rng.pick(COACH_FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`,
    role,
    rating: staffRating(rng, prestige),
    yearsExperience: rng.int(1, 25),
  }
}

function facilitiesForPrestige(rng: RNG, prestige: number): Facilities {
  const base = Math.round(prestige / 10)
  const jitter = () => clamp(base + rng.int(-1, 1), 1, 10)
  return {
    stadium: jitter(),
    training: jitter(),
    academics: jitter(),
    recruitingHub: jitter(),
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

export function generateWorld(seed: number): GeneratedWorld {
  const rng = new RNG(seed)
  const usedNames = new Set<string>()
  const cityPool = rng.shuffle(CITY_NAMES)
  const mascotPool = rng.shuffle(MASCOTS)
  const colorPool = rng.shuffle(COLOR_PAIRS)

  const conferences: Conference[] = []
  const teams: Record<string, Team> = {}
  const players: Record<string, Player> = {}

  let nameIdx = 0
  let colorIdx = 0
  const statePool = rng.shuffle(US_STATES)
  const statesPerConf = Math.ceil(statePool.length / CONFERENCE_NAMES.length)

  CONFERENCE_NAMES.forEach((confDef, confIdx) => {
    const conference: Conference = {
      id: genId('conf'),
      name: confDef.name,
      abbr: confDef.abbr.replace('*', ''),
      tier: confDef.tier,
      teamIds: [],
      footprintStates: statePool.slice(confIdx * statesPerConf, confIdx * statesPerConf + statesPerConf),
    }

    for (let i = 0; i < 8; i++) {
      const city = cityPool[nameIdx % cityPool.length]
      const mascot = mascotPool[nameIdx % mascotPool.length]
      nameIdx++
      const colors = colorPool[colorIdx % colorPool.length]
      colorIdx++

      const key = `${city} ${mascot}`
      usedNames.add(key)

      const prestige = confDef.tier === 'power'
        ? rng.int(52, 92)
        : rng.int(28, 62)

      const teamId = genId('team')
      const team: Team = {
        id: teamId,
        name: city,
        mascot,
        abbr: abbreviate(city),
        conferenceId: conference.id,
        colors,
        prestige,
        facilities: facilitiesForPrestige(rng, prestige),
        staff: [
          generateStaffMember(rng, 'OC', prestige),
          generateStaffMember(rng, 'DC', prestige),
          generateStaffMember(rng, 'RecruitingCoordinator', prestige),
          generateStaffMember(rng, 'STCoordinator', prestige),
        ],
        rosterIds: [],
        depthChart: {},
        gamePlan: defaultGamePlan(),
        isUserTeam: false,
        headCoachName: `${rng.pick(COACH_FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`,
        wins: 0, losses: 0, confWins: 0, confLosses: 0,
        pointsFor: 0, pointsAgainst: 0,
        rankingScore: prestige,
        rank: null,
        boosterFunds: Math.round(prestige * 1000),
      }

      const talentBias = clamp(prestige / 100 + rng.float(-0.08, 0.08), 0.05, 0.98)

      for (const position of POSITIONS) {
        const count = ROSTER_TARGETS[position]
        for (let p = 0; p < count; p++) {
          const classYear = CLASS_DISTRIBUTION[(p + nameIdx) % CLASS_DISTRIBUTION.length]
          const player = generatePlayer(rng, position, classYear, { talentBias })
          player.teamId = teamId
          player.yearsOnTeam = classYear === 'FR' ? 0 : rng.int(1, 3)
          players[player.id] = player
          team.rosterIds.push(player.id)
        }
      }

      autoSetDepthChart(team, players)

      teams[teamId] = team
      conference.teamIds.push(teamId)
    }

    conferences.push(conference)
  })

  return { conferences, teams, players }
}

function abbreviate(city: string): string {
  const words = city.split(' ')
  if (words.length === 1) return city.slice(0, 3).toUpperCase()
  return words.map((w) => w[0]).join('').slice(0, 4).toUpperCase()
}

export function autoSetDepthChart(team: Team, players: Record<string, Player>): void {
  const byPosition: Partial<Record<Position, Player[]>> = {}
  for (const id of team.rosterIds) {
    const player = players[id]
    if (!player) continue
    if (!byPosition[player.position]) byPosition[player.position] = []
    byPosition[player.position]!.push(player)
  }
  const depthChart: Partial<Record<Position, string[]>> = {}
  for (const position of POSITIONS) {
    const list = (byPosition[position] ?? []).slice().sort((a, b) => b.overall - a.overall)
    depthChart[position] = list.map((p) => p.id)
  }
  team.depthChart = depthChart
}
