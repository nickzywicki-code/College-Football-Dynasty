import type { Conference, GameResult, PlayoffBracket, Team } from '../state/types'
import { simulateGame } from './gamesim'
import { RNG, genId } from './rng'
import type { Player } from '../state/types'

export function applyResult(teams: Record<string, Team>, result: GameResult): void {
  const home = teams[result.homeTeamId]
  const away = teams[result.awayTeamId]
  if (!home || !away) return

  home.pointsFor += result.homeScore
  home.pointsAgainst += result.awayScore
  away.pointsFor += result.awayScore
  away.pointsAgainst += result.homeScore

  const homeWon = result.homeScore > result.awayScore
  if (homeWon) { home.wins++; away.losses++ } else if (result.awayScore > result.homeScore) { away.wins++; home.losses++ }

  if (result.isConference) {
    if (homeWon) { home.confWins++; away.confLosses++ } else if (result.awayScore > result.homeScore) { away.confWins++; home.confLosses++ }
  }
}

export function simulateGameResult(
  result: GameResult,
  teams: Record<string, Team>,
  players: Record<string, Player>,
  rng: RNG,
  verbose: boolean,
): GameResult {
  const home = teams[result.homeTeamId]
  const away = teams[result.awayTeamId]
  const out = simulateGame({ homeTeam: home, awayTeam: away, players, rng, verbose })
  const updated: GameResult = {
    ...result,
    homeScore: out.homeScore,
    awayScore: out.awayScore,
    played: true,
    boxScore: out.boxScore,
    playLog: verbose ? out.playLog : undefined,
  }
  return updated
}

export function simulateWeekAiGames(
  schedule: GameResult[],
  week: number,
  teams: Record<string, Team>,
  players: Record<string, Player>,
  rng: RNG,
  skipGameId?: string,
): GameResult[] {
  const updates: GameResult[] = []
  for (const g of schedule) {
    if (g.week !== week || g.played || g.id === skipGameId) continue
    const result = simulateGameResult(g, teams, players, rng, false)
    applyResult(teams, result)
    updates.push(result)
  }
  return updates
}

export function computeRankings(teams: Record<string, Team>, schedule: GameResult[]): string[] {
  const opponentQuality: Record<string, number[]> = {}
  for (const id of Object.keys(teams)) opponentQuality[id] = []

  for (const g of schedule) {
    if (!g.played) continue
    const home = teams[g.homeTeamId]
    const away = teams[g.awayTeamId]
    if (!home || !away) continue
    opponentQuality[g.homeTeamId]?.push(away.prestige + away.wins * 4 - away.losses * 2)
    opponentQuality[g.awayTeamId]?.push(home.prestige + home.wins * 4 - home.losses * 2)
  }

  for (const team of Object.values(teams)) {
    const sos = opponentQuality[team.id]?.length
      ? opponentQuality[team.id].reduce((a, b) => a + b, 0) / opponentQuality[team.id].length
      : team.prestige
    const pointDiff = team.pointsFor - team.pointsAgainst
    const gamesPlayed = team.wins + team.losses
    team.rankingScore = team.wins * 14 - team.losses * 6 + sos * 0.25 + pointDiff * 0.05 + team.prestige * 0.1
      + (gamesPlayed === 0 ? team.prestige * 0.3 : 0)
  }

  const ranked = Object.values(teams).sort((a, b) => b.rankingScore - a.rankingScore)
  ranked.forEach((t, i) => { t.rank = i + 1 })
  return ranked.map((t) => t.id)
}

export function conferenceChampion(conf: Conference, teams: Record<string, Team>): string | null {
  const ranked = conf.teamIds
    .map((id) => teams[id])
    .filter(Boolean)
    .sort((a, b) => (b.confWins - b.confLosses) - (a.confWins - a.confLosses) || b.rankingScore - a.rankingScore)
  return ranked[0]?.id ?? null
}

const BOWL_NAMES = [
  'Coastal Bowl', 'Frontier Bowl', 'Heartland Bowl', 'Ironworks Bowl', 'Cactus Bowl',
  'Timberline Bowl', 'Gulf Coast Bowl', 'Summit Bowl', 'Harbor Bowl', 'Sunbelt Bowl',
  'Copper Bowl', 'Pioneer Bowl', 'Redrock Bowl', 'Lakeshore Bowl', 'Palmetto Bowl',
  'Ridgeline Bowl', 'Delta Bowl', 'Granite Bowl', 'Cascade Bowl', 'Anchor Bowl',
]

export function buildPlayoffField(pollOrder: string[], teams: Record<string, Team>, size = 12): string[] {
  const eligible = pollOrder.filter((id) => (teams[id]?.wins ?? 0) >= 6)
  return eligible.slice(0, size)
}

export function createPlayoffBracket(seeds: string[]): PlayoffBracket {
  const size = seeds.length
  const round0: GameResult[] = []
  if (size === 12) {
    const pairs = [[4, 11], [5, 10], [6, 9], [7, 8]]
    for (const [a, b] of pairs) {
      round0.push(makePlayoffGame(seeds[a], seeds[b], 1))
    }
  }
  return { size, seeds, rounds: size === 12 ? [round0] : [], champion: null }
}

function makePlayoffGame(home: string, away: string, week: number): GameResult {
  return {
    id: genId('game'), week, homeTeamId: home, awayTeamId: away, homeScore: 0, awayScore: 0,
    played: false, isConference: false, isRivalry: false, isUserGame: false, isPlayoff: true,
  }
}

export function advancePlayoff(bracket: PlayoffBracket, teams: Record<string, Team>, week: number): PlayoffBracket {
  const rounds = bracket.rounds.map((r) => [...r])
  const lastRound = rounds[rounds.length - 1]
  if (!lastRound.every((g) => g.played)) return bracket

  if (rounds.length === 1 && bracket.size === 12) {
    // Quarterfinals: seeds 1-4 get byes, paired vs round0 winners (reverse order)
    const winners = lastRound.map((g) => (g.homeScore > g.awayScore ? g.homeTeamId : g.awayTeamId))
    const seeds = bracket.seeds
    const qf: GameResult[] = [
      makePlayoffGame(seeds[0], winners[3], week),
      makePlayoffGame(seeds[1], winners[2], week),
      makePlayoffGame(seeds[2], winners[1], week),
      makePlayoffGame(seeds[3], winners[0], week),
    ]
    rounds.push(qf)
    return { ...bracket, rounds, champion: null }
  }

  if (rounds.length === 2) {
    const winners = lastRound.map((g) => (g.homeScore > g.awayScore ? g.homeTeamId : g.awayTeamId))
    const sf: GameResult[] = [
      makePlayoffGame(winners[0], winners[3], week),
      makePlayoffGame(winners[1], winners[2], week),
    ]
    rounds.push(sf)
    return { ...bracket, rounds, champion: null }
  }

  if (rounds.length === 3) {
    const winners = lastRound.map((g) => (g.homeScore > g.awayScore ? g.homeTeamId : g.awayTeamId))
    const final: GameResult[] = [makePlayoffGame(winners[0], winners[1], week)]
    rounds.push(final)
    return { ...bracket, rounds, champion: null }
  }

  if (rounds.length === 4) {
    const finalGame = lastRound[0]
    const champion = finalGame.homeScore > finalGame.awayScore ? finalGame.homeTeamId : finalGame.awayTeamId
    void teams
    return { ...bracket, champion }
  }

  return bracket
}

export function buildBowlGames(remainingRanked: string[], teams: Record<string, Team>, rng: RNG, week: number): GameResult[] {
  const eligible = remainingRanked.filter((id) => (teams[id]?.wins ?? 0) >= 6)
  const games: GameResult[] = []
  const names = rng.shuffle(BOWL_NAMES)
  let nameIdx = 0
  for (let i = 0; i + 1 < eligible.length; i += 2) {
    games.push({
      id: genId('game'), week, homeTeamId: eligible[i], awayTeamId: eligible[i + 1],
      homeScore: 0, awayScore: 0, played: false, isConference: false, isRivalry: false,
      isUserGame: false, isPlayoff: false, bowlName: names[nameIdx % names.length],
    })
    nameIdx++
  }
  return games
}
