import { create } from 'zustand'
import type {
  ClassYear, CoachArchetype, CoachProfile, DynastyState, Facilities, GamePlan, GameResult,
  Player, Position, SaveSlotMeta, Team,
} from './types'
import { RNG, genId } from '../engine/rng'
import { autoSetDepthChart, type GeneratedWorld } from '../engine/world'
import { generateSeasonSchedule } from '../engine/schedule'
import {
  applyResult, buildBowlGames, buildPlayoffField, computeRankings, conferenceChampion,
  createPlayoffBracket, advancePlayoff, simulateGameResult, simulateWeekAiGames,
} from '../engine/season'
import { initBoard, weeklyPointBudget, weeklyRecruitingAiTick, performScout, performContact, performOffer, performVisit, checkCommitment, resolveSigningDay, RECRUIT_ACTION_COSTS } from '../engine/recruiting'
import { advanceOffseason, signRecruitsToRosters, fillRosterGaps, updateCoachCareer, generateJobOffers } from '../engine/offseason'
import { deleteDynastyFromStorage, listSaveSlots, loadDynastyFromStorage, saveDynastyToStorage } from './persist'
import { fullName } from '../engine/player'

const TOTAL_WEEKS_REGULAR = 12

export interface LiveGameView {
  gameId: string
  playLog: string[]
  revealIndex: number
  homeTeamId: string
  awayTeamId: string
  homeScore: number
  awayScore: number
  boxScore: GameResult['boxScore']
  committed: boolean
}

interface GameStore {
  dynasty: DynastyState | null
  liveGame: LiveGameView | null
  saveSlots: SaveSlotMeta[]
  lastOffseasonReport: string[] | null

  refreshSaveSlots: () => Promise<void>
  newDynasty: (input: { coachName: string; alma: string; archetype: CoachArchetype; teamId: string; seed: number; world: GeneratedWorld }) => void
  loadDynasty: (saveId: string) => Promise<void>
  deleteDynasty: (saveId: string) => Promise<void>
  saveNow: () => void

  userTeam: () => Team | null
  currentUserGame: () => GameResult | null

  setDepthChartOrder: (position: Position, orderedPlayerIds: string[]) => void
  autoOptimizeDepthChart: () => void
  updateGamePlan: (patch: Partial<GamePlan>) => void

  scoutRecruit: (recruitId: string) => void
  contactRecruit: (recruitId: string) => void
  offerRecruit: (recruitId: string) => void
  visitRecruit: (recruitId: string) => void

  startUserGame: () => void
  revealPlays: (count: number) => void
  revealAllPlays: () => void
  commitUserGameAndAdvance: () => void
  simUserGameInstantly: () => void
  advanceWeekNoUserGame: () => void

  acceptJobOffer: (teamId: string) => void
  declineJobOffers: () => void

  upgradeFacility: (kind: keyof Facilities) => void

  processOffseason: () => void
  startNewSeason: () => void
}

function touch(state: DynastyState): void {
  state.updatedAt = Date.now()
}

function pushNews(state: DynastyState, headline: string, body: string, category: DynastyState['news'][number]['category']): void {
  state.news.unshift({ id: genId('news'), week: state.week, year: state.year, headline, body, category })
  if (state.news.length > 120) state.news.length = 120
}

function footprintsFor(state: DynastyState): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  for (const team of Object.values(state.teams)) {
    const conf = state.conferences.find((c) => c.id === team.conferenceId)
    map[team.id] = conf?.footprintStates ?? []
  }
  return map
}

function markUserGames(state: DynastyState): void {
  for (const g of state.schedule) {
    g.isUserGame = g.homeTeamId === state.userTeamId || g.awayTeamId === state.userTeamId
  }
}

function runAiWeek(state: DynastyState, week: number, skipGameId?: string): void {
  const rng = new RNG(state.seed + week * 7919 + state.year * 104729)
  simulateWeekAiGames(state.schedule, week, state.teams, state.players, rng, skipGameId)
    .forEach((updated) => {
      const idx = state.schedule.findIndex((g) => g.id === updated.id)
      if (idx >= 0) state.schedule[idx] = updated
    })
}

function persistAsync(dynasty: DynastyState): void {
  saveDynastyToStorage(dynasty).catch((err) => console.error('Failed to save dynasty', err))
}

function finishPostseasonAndReturnDone(state: DynastyState): boolean {
  const bowls = state.schedule.filter((g) => !g.isPlayoff && g.bowlName)
  const bowlsDone = bowls.every((g) => g.played)
  if (!state.playoffBracket) return bowlsDone
  const lastRound = state.playoffBracket.rounds[state.playoffBracket.rounds.length - 1]
  const championDecided = Boolean(state.playoffBracket.champion)
  return championDecided && lastRound.every((g) => g.played) && bowlsDone
}

export const useGameStore = create<GameStore>((set, get) => ({
  dynasty: null,
  liveGame: null,
  saveSlots: [],
  lastOffseasonReport: null,

  refreshSaveSlots: async () => set({ saveSlots: await listSaveSlots() }),

  newDynasty: ({ coachName, alma, archetype, teamId, seed, world }) => {
    const rng = new RNG(seed)
    const team = world.teams[teamId]
    if (!team) return
    team.isUserTeam = true

    const coach: CoachProfile = {
      name: coachName, alma, archetype, hotSeat: 60, careerWins: 0, careerLosses: 0, history: [], reputation: 30 + team.prestige * 0.2,
    }

    const schedule = generateSeasonSchedule(world.conferences, world.teams, teamId, rng)
    const startYear = new Date().getFullYear()
    const board = initBoard(rng, startYear)

    const dynasty: DynastyState = {
      saveId: genId('save'), createdAt: Date.now(), updatedAt: Date.now(), seed,
      coach, userTeamId: teamId,
      year: startYear, week: 1, phase: 'regular',
      conferences: world.conferences, teams: world.teams, players: world.players,
      schedule, recruitingBoard: board, news: [], pollTop25: [], pendingJobOffers: [], playoffBracket: null,
    }
    computeRankings(dynasty.teams, dynasty.schedule)
    dynasty.pollTop25 = Object.values(dynasty.teams).sort((a, b) => b.rankingScore - a.rankingScore).map((t) => t.id)
    pushNews(dynasty, `${coachName} takes over at ${team.name}`, `${coachName} has been introduced as the new head coach of the ${team.name} ${team.mascot}. The rebuild — or the reign — starts now.`, 'coaching')

    persistAsync(dynasty)
    set({ dynasty, liveGame: null })
  },

  loadDynasty: async (saveId) => {
    const dynasty = await loadDynastyFromStorage(saveId)
    if (dynasty) set({ dynasty, liveGame: null })
  },

  deleteDynasty: async (saveId) => {
    await deleteDynastyFromStorage(saveId)
    set({ saveSlots: await listSaveSlots() })
  },

  saveNow: () => {
    const { dynasty } = get()
    if (!dynasty) return
    touch(dynasty)
    persistAsync(dynasty)
  },

  userTeam: () => {
    const { dynasty } = get()
    if (!dynasty) return null
    return dynasty.teams[dynasty.userTeamId] ?? null
  },

  currentUserGame: () => {
    const { dynasty } = get()
    if (!dynasty) return null
    return dynasty.schedule.find((g) => g.week === dynasty.week && !g.played
      && (g.homeTeamId === dynasty.userTeamId || g.awayTeamId === dynasty.userTeamId)) ?? null
  },

  setDepthChartOrder: (position, orderedPlayerIds) => set((s) => {
    if (!s.dynasty) return s
    const team = s.dynasty.teams[s.dynasty.userTeamId]
    team.depthChart = { ...team.depthChart, [position]: orderedPlayerIds }
    touch(s.dynasty)
    return { dynasty: { ...s.dynasty } }
  }),

  autoOptimizeDepthChart: () => set((s) => {
    if (!s.dynasty) return s
    const team = s.dynasty.teams[s.dynasty.userTeamId]
    autoSetDepthChart(team, s.dynasty.players)
    touch(s.dynasty)
    return { dynasty: { ...s.dynasty } }
  }),

  updateGamePlan: (patch) => set((s) => {
    if (!s.dynasty) return s
    const team = s.dynasty.teams[s.dynasty.userTeamId]
    team.gamePlan = { ...team.gamePlan, ...patch }
    touch(s.dynasty)
    return { dynasty: { ...s.dynasty } }
  }),

  scoutRecruit: (recruitId) => set((s) => spendOnRecruit(s.dynasty, recruitId, 'scout', (r, team) => performScout(r, team.id))),
  contactRecruit: (recruitId) => set((s) => spendOnRecruit(s.dynasty, recruitId, 'contact', (r, team) => performContact(r, team, footprintsFor(s.dynasty!)[team.id] ?? []))),
  offerRecruit: (recruitId) => set((s) => spendOnRecruit(s.dynasty, recruitId, 'offer', (r, team) => performOffer(r, team.id))),
  visitRecruit: (recruitId) => set((s) => spendOnRecruit(s.dynasty, recruitId, 'hostVisit', (r, team, rng) => performVisit(r, team.id, rng))),

  startUserGame: () => {
    const { dynasty } = get()
    if (!dynasty) return
    const game = dynasty.schedule.find((g) => g.week === dynasty.week && !g.played
      && (g.homeTeamId === dynasty.userTeamId || g.awayTeamId === dynasty.userTeamId))
    if (!game) return
    const rng = new RNG(dynasty.seed + dynasty.week * 65537 + dynasty.year * 911 + 13)
    const result = simulateGameResult(game, dynasty.teams, dynasty.players, rng, true)
    const idx = dynasty.schedule.findIndex((g) => g.id === game.id)
    dynasty.schedule[idx] = result
    set({
      liveGame: {
        gameId: result.id, playLog: result.playLog ?? [], revealIndex: 0,
        homeTeamId: result.homeTeamId, awayTeamId: result.awayTeamId,
        homeScore: result.homeScore, awayScore: result.awayScore,
        boxScore: result.boxScore, committed: false,
      },
      dynasty: { ...dynasty },
    })
  },

  revealPlays: (count) => set((s) => {
    if (!s.liveGame) return s
    return { liveGame: { ...s.liveGame, revealIndex: Math.min(s.liveGame.playLog.length, s.liveGame.revealIndex + count) } }
  }),

  revealAllPlays: () => set((s) => {
    if (!s.liveGame) return s
    return { liveGame: { ...s.liveGame, revealIndex: s.liveGame.playLog.length } }
  }),

  simUserGameInstantly: () => {
    get().startUserGame()
    get().revealAllPlays()
  },

  commitUserGameAndAdvance: () => {
    const { dynasty, liveGame } = get()
    if (!dynasty || !liveGame) return
    const game = dynasty.schedule.find((g) => g.id === liveGame.gameId)
    if (!game) return
    applyResult(dynasty.teams, game)

    const userWon = (game.homeTeamId === dynasty.userTeamId && game.homeScore > game.awayScore)
      || (game.awayTeamId === dynasty.userTeamId && game.awayScore > game.homeScore)
    const oppId = game.homeTeamId === dynasty.userTeamId ? game.awayTeamId : game.homeTeamId
    const opp = dynasty.teams[oppId]
    const userTeam = dynasty.teams[dynasty.userTeamId]
    pushNews(
      dynasty,
      `${userTeam.name} ${userWon ? 'defeats' : 'falls to'} ${opp?.name ?? 'their opponent'}`,
      `Final score: ${dynasty.teams[game.homeTeamId]?.name} ${game.homeScore} — ${dynasty.teams[game.awayTeamId]?.name} ${game.awayScore}.`,
      'game',
    )

    runAiWeek(dynasty, dynasty.week, game.id)
    advanceWeekCommon(dynasty)
    touch(dynasty)
    persistAsync(dynasty)
    set({ dynasty: { ...dynasty }, liveGame: null })
  },

  advanceWeekNoUserGame: () => {
    const { dynasty } = get()
    if (!dynasty) return
    runAiWeek(dynasty, dynasty.week)
    advanceWeekCommon(dynasty)
    touch(dynasty)
    persistAsync(dynasty)
    set({ dynasty: { ...dynasty } })
  },

  acceptJobOffer: (teamId) => set((s) => {
    if (!s.dynasty) return s
    const oldTeam = s.dynasty.teams[s.dynasty.userTeamId]
    const newTeam = s.dynasty.teams[teamId]
    if (!newTeam) return s
    oldTeam.isUserTeam = false
    newTeam.isUserTeam = true
    s.dynasty.userTeamId = teamId
    s.dynasty.pendingJobOffers = []
    pushNews(s.dynasty, `${s.dynasty.coach.name} bolts for ${newTeam.name}`, `${s.dynasty.coach.name} has left ${oldTeam.name} to become the head coach of the ${newTeam.name} ${newTeam.mascot}.`, 'coaching')
    touch(s.dynasty)
    return { dynasty: { ...s.dynasty } }
  }),

  declineJobOffers: () => set((s) => {
    if (!s.dynasty) return s
    s.dynasty.pendingJobOffers = []
    return { dynasty: { ...s.dynasty } }
  }),

  upgradeFacility: (kind) => set((s) => {
    if (!s.dynasty) return s
    const team = s.dynasty.teams[s.dynasty.userTeamId]
    const level = team.facilities[kind]
    if (level >= 10) return s
    const cost = (level + 1) * 40000
    if (team.boosterFunds < cost) return s
    team.boosterFunds -= cost
    team.facilities = { ...team.facilities, [kind]: level + 1 }
    touch(s.dynasty)
    return { dynasty: { ...s.dynasty } }
  }),

  processOffseason: () => {
    const { dynasty } = get()
    if (!dynasty || dynasty.phase !== 'offseason') return
    const rng = new RNG(dynasty.seed + dynasty.year * 31 + 17)
    const report: string[] = []

    const signed = resolveSigningDay(dynasty.recruitingBoard, dynasty.teams, rng)
    signRecruitsToRosters(signed, dynasty.teams, dynasty.players)
    const userSigned = signed.filter((r) => r.committedTeamId === dynasty.userTeamId)
    report.push(`Signed ${signed.length} prospects nationally, including ${userSigned.length} to ${dynasty.teams[dynasty.userTeamId].name}.`)

    const { departedPlayerIds, draftedPlayerIds } = advanceOffseason(dynasty.teams, dynasty.players, rng)
    report.push(`${departedPlayerIds.length} players graduated or departed the sport; ${draftedPlayerIds.length} declared early for the draft.`)

    let filled = 0
    for (const team of Object.values(dynasty.teams)) filled += fillRosterGaps(team, dynasty.players, rng)
    if (filled > 0) report.push(`${filled} walk-ons signed nationwide to fill out rosters.`)

    for (const team of Object.values(dynasty.teams)) {
      const drift = (team.wins - team.losses) * 0.6 + rng.float(-1.5, 1.5)
      team.prestige = Math.max(5, Math.min(99, Math.round(team.prestige + drift * 0.4)))
      team.boosterFunds += Math.round(team.prestige * 800 + team.wins * 4000)
    }

    const userTeam = dynasty.teams[dynasty.userTeamId]
    const madePlayoff = Boolean(dynasty.playoffBracket?.seeds.includes(dynasty.userTeamId))
    const champion = dynasty.playoffBracket?.champion === dynasty.userTeamId
    const conf = dynasty.conferences.find((c) => c.teamIds.includes(dynasty.userTeamId))
    const confChamp = conf ? conferenceChampion(conf, dynasty.teams) === dynasty.userTeamId : false
    dynasty.coach = updateCoachCareer(dynasty.coach, userTeam, dynasty.year, madePlayoff, champion, confChamp)
    report.push(`Season complete: ${userTeam.wins}-${userTeam.losses}. Career record now ${dynasty.coach.careerWins}-${dynasty.coach.careerLosses}.`)

    if (champion) report.push(`NATIONAL CHAMPIONS! ${userTeam.name} ${userTeam.mascot} claim the title.`)
    else if (confChamp) report.push(`${userTeam.name} won the ${conf?.name} title.`)

    dynasty.pendingJobOffers = generateJobOffers(dynasty.coach, userTeam, dynasty.teams, rng)
    if (dynasty.pendingJobOffers.length > 0) report.push(`${dynasty.pendingJobOffers.length} program(s) have called about their coaching vacancy.`)

    for (const r of report) pushNews(dynasty, 'Offseason Update', r, 'program')

    touch(dynasty)
    persistAsync(dynasty)
    set({ dynasty: { ...dynasty }, lastOffseasonReport: report })
  },

  startNewSeason: () => {
    const { dynasty } = get()
    if (!dynasty) return
    const rng = new RNG(dynasty.seed + (dynasty.year + 1) * 104729)
    for (const team of Object.values(dynasty.teams)) {
      team.wins = 0; team.losses = 0; team.confWins = 0; team.confLosses = 0
      team.pointsFor = 0; team.pointsAgainst = 0
      autoSetDepthChart(team, dynasty.players)
    }
    dynasty.year += 1
    dynasty.week = 1
    dynasty.phase = 'regular'
    dynasty.playoffBracket = null
    dynasty.schedule = generateSeasonSchedule(dynasty.conferences, dynasty.teams, dynasty.userTeamId, rng)
    dynasty.recruitingBoard = initBoard(rng, dynasty.year)
    computeRankings(dynasty.teams, dynasty.schedule)
    dynasty.pollTop25 = Object.values(dynasty.teams).sort((a, b) => b.rankingScore - a.rankingScore).map((t) => t.id)
    pushNews(dynasty, `${dynasty.year} season kicks off`, `A new season begins for ${dynasty.teams[dynasty.userTeamId].name}.`, 'league')

    touch(dynasty)
    persistAsync(dynasty)
    set({ dynasty: { ...dynasty }, lastOffseasonReport: null })
  },
}))

function spendOnRecruit(
  dynasty: DynastyState | null,
  recruitId: string,
  action: keyof typeof RECRUIT_ACTION_COSTS,
  apply: (recruit: DynastyState['recruitingBoard']['recruits'][number], team: Team, rng: RNG) => void,
): Partial<{ dynasty: DynastyState }> {
  if (!dynasty) return {}
  const board = dynasty.recruitingBoard
  const cost = RECRUIT_ACTION_COSTS[action]
  const spentSoFar = board.pointsSpent[recruitId] ?? 0
  if (board.weeklyPoints < cost) return {}
  const recruit = board.recruits.find((r) => r.id === recruitId)
  if (!recruit) return {}
  const rng = new RNG(dynasty.seed + dynasty.week * 31 + recruitId.length * 7)
  apply(recruit, dynasty.teams[dynasty.userTeamId], rng)
  board.weeklyPoints -= cost
  board.pointsSpent[recruitId] = spentSoFar + cost
  checkCommitment(recruit, rng)
  touch(dynasty)
  return { dynasty: { ...dynasty } }
}

function advanceWeekCommon(dynasty: DynastyState): void {
  computeRankings(dynasty.teams, dynasty.schedule)
  dynasty.pollTop25 = Object.values(dynasty.teams).sort((a, b) => b.rankingScore - a.rankingScore).map((t) => t.id)

  const rng = new RNG(dynasty.seed + dynasty.week * 1237 + dynasty.year * 97)
  weeklyRecruitingAiTick(dynasty.recruitingBoard, dynasty.teams, footprintsFor(dynasty), rng)
  for (const recruit of dynasty.recruitingBoard.recruits) checkCommitment(recruit, rng)
  dynasty.recruitingBoard.weeklyPoints = weeklyPointBudget(dynasty.teams[dynasty.userTeamId])

  if (dynasty.phase === 'regular') {
    if (dynasty.week >= TOTAL_WEEKS_REGULAR) {
      const field = buildPlayoffField(dynasty.pollTop25, dynasty.teams, 12)
      if (field.length === 12) {
        const bracket = createPlayoffBracket(field)
        bracket.rounds[0].forEach((g) => dynasty.schedule.push({ ...g, week: 13 }))
        dynasty.playoffBracket = bracket
      }
      const bowlField = dynasty.pollTop25.filter((id) => !field.includes(id))
      buildBowlGames(bowlField, dynasty.teams, rng, 13).forEach((g) => dynasty.schedule.push(g))
      markUserGames(dynasty)
      dynasty.phase = 'postseason'
      dynasty.week = 13
      pushNews(dynasty, 'Postseason field is set', 'The playoff bracket and bowl matchups have been announced.', 'league')
    } else {
      dynasty.week += 1
    }
    return
  }

  if (dynasty.phase === 'postseason') {
    if (dynasty.playoffBracket) {
      // Simulation replaces schedule entries with new GameResult objects, so the
      // bracket's own round arrays (built from the originals) go stale — resync by id.
      dynasty.playoffBracket.rounds = dynasty.playoffBracket.rounds.map((round) =>
        round.map((g) => dynasty.schedule.find((sg) => sg.id === g.id) ?? g))
      const bracket = dynasty.playoffBracket
      const lastRound = bracket.rounds[bracket.rounds.length - 1]
      if (lastRound.every((g) => g.played) && !bracket.champion) {
        const advanced = advancePlayoff(bracket, dynasty.teams, dynasty.week + 1)
        dynasty.playoffBracket = advanced
        const newRound = advanced.rounds[advanced.rounds.length - 1]
        if (newRound !== lastRound) {
          newRound.forEach((g) => dynasty.schedule.push(g))
          markUserGames(dynasty)
        }
        if (advanced.champion) {
          const champTeam = dynasty.teams[advanced.champion]
          pushNews(dynasty, `${champTeam.name} ${champTeam.mascot} are national champions!`, `${champTeam.name} has won the national championship.`, 'award')
        }
      }
    }
    if (finishPostseasonAndReturnDone(dynasty)) {
      dynasty.phase = 'offseason'
    } else {
      dynasty.week += 1
    }
    return
  }
}

export function playerFullName(p: Player): string {
  return fullName(p)
}

export type { ClassYear, Player, Team }
