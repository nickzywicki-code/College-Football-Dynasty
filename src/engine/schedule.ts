import type { Conference, GameResult, Team } from '../state/types'
import { RNG, genId } from './rng'

const NON_CONFERENCE_GAMES = 4
const TOTAL_WEEKS_REGULAR = 12

// Round-robin scheduling within a conference (each team plays every other once).
function conferenceRoundRobin(teamIds: string[], rng: RNG): { home: string; away: string }[] {
  const ids = rng.shuffle(teamIds)
  const pairs: { home: string; away: string }[] = []
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const homeFirst = rng.bool()
      pairs.push(homeFirst ? { home: ids[i], away: ids[j] } : { home: ids[j], away: ids[i] })
    }
  }
  return pairs
}

export function generateSeasonSchedule(
  conferences: Conference[],
  teams: Record<string, Team>,
  userTeamId: string,
  rng: RNG,
): GameResult[] {
  // Each team's game list, built as pairs, then packed into weeks avoiding double-booking.
  const allPairs: { home: string; away: string; isConference: boolean }[] = []

  for (const conf of conferences) {
    for (const pair of conferenceRoundRobin(conf.teamIds, rng)) {
      allPairs.push({ ...pair, isConference: true })
    }
  }

  // Non-conference games: pair teams across different conferences randomly, balancing counts.
  const nonConfCount: Record<string, number> = {}
  for (const id of Object.keys(teams)) nonConfCount[id] = 0

  const allTeamIds = rng.shuffle(Object.keys(teams))
  let guard = 0
  while (allTeamIds.some((id) => nonConfCount[id] < NON_CONFERENCE_GAMES) && guard < 20000) {
    guard++
    const candidates = allTeamIds.filter((id) => nonConfCount[id] < NON_CONFERENCE_GAMES)
    if (candidates.length < 2) break
    const a = rng.pick(candidates)
    const others = candidates.filter((id) => id !== a && teams[id].conferenceId !== teams[a].conferenceId)
    if (others.length === 0) { nonConfCount[a] = NON_CONFERENCE_GAMES; continue }
    const b = rng.pick(others)
    const homeFirst = rng.bool()
    allPairs.push({ home: homeFirst ? a : b, away: homeFirst ? b : a, isConference: false })
    nonConfCount[a]++
    nonConfCount[b]++
  }

  // Pack into weeks: greedy — each week, assign as many non-conflicting pairs as possible.
  const weeks: { home: string; away: string; isConference: boolean }[][] = Array.from({ length: TOTAL_WEEKS_REGULAR }, () => [])
  const remaining = rng.shuffle(allPairs)
  const teamWeekCount: Record<string, number> = {}
  for (const id of Object.keys(teams)) teamWeekCount[id] = 0

  for (const pair of remaining) {
    let placed = false
    const weekOrder = rng.shuffle(Array.from({ length: TOTAL_WEEKS_REGULAR }, (_, i) => i))
    for (const w of weekOrder) {
      const busy = new Set<string>()
      for (const g of weeks[w]) { busy.add(g.home); busy.add(g.away) }
      if (!busy.has(pair.home) && !busy.has(pair.away)
        && teamWeekCount[pair.home] < TOTAL_WEEKS_REGULAR && teamWeekCount[pair.away] < TOTAL_WEEKS_REGULAR) {
        weeks[w].push(pair)
        teamWeekCount[pair.home]++
        teamWeekCount[pair.away]++
        placed = true
        break
      }
    }
    if (!placed) {
      // fallback: find any week with room even if it means dropping a fair spread
      for (let w = 0; w < TOTAL_WEEKS_REGULAR; w++) {
        const busy = new Set<string>()
        for (const g of weeks[w]) { busy.add(g.home); busy.add(g.away) }
        if (!busy.has(pair.home) && !busy.has(pair.away)) {
          weeks[w].push(pair)
          placed = true
          break
        }
      }
    }
  }

  const games: GameResult[] = []
  weeks.forEach((weekGames, idx) => {
    const week = idx + 1
    for (const g of weekGames) {
      games.push({
        id: genId('game'),
        week,
        homeTeamId: g.home,
        awayTeamId: g.away,
        homeScore: 0,
        awayScore: 0,
        played: false,
        isConference: g.isConference,
        isRivalry: false,
        isUserGame: g.home === userTeamId || g.away === userTeamId,
        isPlayoff: false,
      })
    }
  })

  return games
}
