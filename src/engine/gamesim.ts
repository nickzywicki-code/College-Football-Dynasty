import type { BoxScore, GamePlan, Player, Team, TeamGameStats } from '../state/types'
import { computeTeamStrength, type TeamStrength } from './teamStrength'
import { RNG } from './rng'
import { fullName } from './player'

const QUARTER_SECONDS = 15 * 60
const GAME_SECONDS = QUARTER_SECONDS * 4

interface SimSide {
  team: Team
  strength: TeamStrength
  plan: GamePlan
  qb?: Player
  rb1?: Player
  rb2?: Player
  receivers: Player[]
  dl: Player[]
  lb: Player[]
  secondary: Player[]
  kicker?: Player
  punter?: Player
  stats: TeamGameStats
}

export interface SimGameInput {
  homeTeam: Team
  awayTeam: Team
  players: Record<string, Player>
  rng: RNG
  verbose: boolean
}

export interface SimGameOutput {
  homeScore: number
  awayScore: number
  boxScore: BoxScore
  playLog: string[]
}

function starters(team: Team, players: Record<string, Player>, pos: string, count: number): Player[] {
  const ids = team.depthChart[pos as keyof Team['depthChart']] ?? []
  return ids.slice(0, count).map((id) => players[id]).filter((p): p is Player => Boolean(p))
}

function buildSide(team: Team, players: Record<string, Player>): SimSide {
  const rbs = starters(team, players, 'RB', 2)
  return {
    team,
    strength: computeTeamStrength(team, players),
    plan: team.gamePlan,
    qb: starters(team, players, 'QB', 1)[0],
    rb1: rbs[0],
    rb2: rbs[1],
    receivers: [...starters(team, players, 'WR', 3), ...starters(team, players, 'TE', 1)],
    dl: starters(team, players, 'DL', 4),
    lb: starters(team, players, 'LB', 3),
    secondary: starters(team, players, 'CB', 2).concat(starters(team, players, 'S', 2)),
    kicker: starters(team, players, 'K', 1)[0],
    punter: starters(team, players, 'P', 1)[0],
    stats: { totalYards: 0, passYards: 0, rushYards: 0, turnovers: 0, timeOfPossession: 0, firstDowns: 0 },
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function weightedPlayer(rng: RNG, list: Player[], fn: (p: Player) => number, fallback?: Player): Player | undefined {
  if (list.length === 0) return fallback
  return rng.weighted(list.map((p) => ({ value: p, weight: Math.max(1, fn(p)) })))
}

function tempoSeconds(tempo: number, rng: RNG): number {
  const mean = 40 - (tempo / 100) * 18
  return clamp(Math.round(rng.normal(mean, 5)), 12, 42)
}

function passPlayProbability(plan: GamePlan, down: number, yardsToGo: number): number {
  let p = plan.runPassBalance / 100
  if (down >= 3 && yardsToGo >= 7) p += 0.22
  if (yardsToGo <= 2) p -= 0.18
  if (down === 1) p -= 0.05
  return clamp(p, 0.15, 0.9)
}

interface PlayOutcome {
  desc: string
  yards: number
  turnover: 'interception' | 'fumble' | null
  touchdown: boolean
  timeUsed: number
  isPass: boolean
  isSack: boolean
  scorerId?: string
}

function resolveScrimmagePlay(off: SimSide, def: SimSide, down: number, yardsToGo: number, ballOn: number, rng: RNG): PlayOutcome {
  const isPass = rng.bool(passPlayProbability(off.plan, down, yardsToGo))
  const timeUsed = tempoSeconds(off.plan.tempo, rng)

  if (isPass) {
    if (off.qb) off.qb.seasonStats.passAtt += 1

    const sackChance = clamp(0.05 + (def.strength.passRush - off.strength.passBlock) * 0.0015, 0.02, 0.16)
    if (rng.bool(sackChance)) {
      const rusher = weightedPlayer(rng, [...def.dl, ...def.lb], (p) => p.ratings.passRush)
      if (rusher) rusher.seasonStats.sacks += 1
      const yards = -rng.int(3, 9)
      return { desc: `Sacked by ${rusher ? fullName(rusher) : 'the defense'} for ${-yards} yards`, yards, turnover: null, touchdown: false, timeUsed, isPass: true, isSack: true }
    }

    const depthFactor = 0.45 + off.plan.aggressiveness / 180
    const compProb = clamp(0.60 + (off.strength.passOffense - def.strength.passDefense) * 0.0035 - depthFactor * 0.08, 0.32, 0.88)
    const target = weightedPlayer(rng, off.receivers, (p) => p.ratings.catching + p.ratings.speed * 0.3)

    if (rng.bool(compProb)) {
      const mean = 5.5 + depthFactor * 10 + (off.strength.passOffense - def.strength.passDefense) * 0.06
      let yards = Math.max(0, Math.round(rng.normal(mean, 6)))
      yards = Math.min(yards, 100 - ballOn)
      const touchdown = ballOn + yards >= 100
      if (off.qb) { off.qb.seasonStats.passComp += 1; off.qb.seasonStats.passYds += yards }
      if (target) { target.seasonStats.receptions += 1; target.seasonStats.recYds += yards }
      return {
        desc: `${off.qb ? fullName(off.qb) : 'QB'} completes to ${target ? fullName(target) : 'a receiver'} for ${yards} yards${touchdown ? ' — TOUCHDOWN!' : ''}`,
        yards, turnover: null, touchdown, timeUsed, isPass: true, isSack: false, scorerId: target?.id,
      }
    }

    const intChance = clamp(0.02 + depthFactor * 0.03 + (def.strength.passDefense - off.strength.passOffense) * 0.001, 0.01, 0.10)
    if (rng.bool(intChance)) {
      if (off.qb) off.qb.seasonStats.passInt += 1
      return { desc: `Pass intercepted!`, yards: 0, turnover: 'interception', touchdown: false, timeUsed, isPass: true, isSack: false }
    }
    return { desc: `${off.qb ? fullName(off.qb) : 'QB'} pass incomplete${target ? ` intended for ${fullName(target)}` : ''}`, yards: 0, turnover: null, touchdown: false, timeUsed, isPass: true, isSack: false }
  }

  const blockDiff = off.strength.runBlock - def.strength.runDefense
  const mean = 3.4 + blockDiff * 0.075
  let yards = Math.round(rng.normal(mean, 3.1))
  yards = Math.max(-4, yards)
  yards = Math.min(yards, 100 - ballOn)
  const touchdown = ballOn + yards >= 100
  const rusher = off.rb1

  const fumbleChance = clamp(0.012 + (def.strength.runDefense - off.strength.runBlock) * 0.0002, 0.004, 0.035)
  if (rng.bool(fumbleChance)) {
    if (rusher) rusher.seasonStats.rushAtt += 1
    const recoveredByDefense = rng.bool(0.58)
    if (recoveredByDefense) {
      const forcer = weightedPlayer(rng, [...def.dl, ...def.lb, ...def.secondary], (p) => p.ratings.tackling)
      if (forcer) forcer.seasonStats.forcedFumbles += 1
    }
    return {
      desc: `Fumble on the carry!${recoveredByDefense ? ' Recovered by the defense.' : ' Recovered by the offense.'}`,
      yards: Math.max(0, yards), turnover: recoveredByDefense ? 'fumble' : null, touchdown: false, timeUsed, isPass: false, isSack: false,
    }
  }

  if (rusher) { rusher.seasonStats.rushAtt += 1; rusher.seasonStats.rushYds += yards }
  if (!touchdown) {
    const tackler = weightedPlayer(rng, [...def.lb, ...def.dl, ...def.secondary], (p) => p.ratings.tackling)
    if (tackler) tackler.seasonStats.tackles += 1
  }
  return {
    desc: `${rusher ? fullName(rusher) : 'RB'} rushes for ${yards} yards${touchdown ? ' — TOUCHDOWN!' : ''}`,
    yards, turnover: null, touchdown, timeUsed, isPass: false, isSack: false, scorerId: rusher?.id,
  }
}

type FourthDownChoice = 'fg' | 'punt' | 'go'

function decideFourthDown(off: SimSide, ballOn: number, yardsToGo: number, rng: RNG): FourthDownChoice {
  const fgDistance = (100 - ballOn) + 17
  const kickerRating = off.kicker?.ratings.kicking ?? 55
  const fgMakeable = fgDistance <= 52 && kickerRating > 35

  if (yardsToGo <= 2 && (off.plan.fourthDownAggressiveness >= 55 || ballOn >= 70)) return 'go'
  if (fgMakeable && (ballOn >= 40 || fgDistance <= 38)) return 'fg'
  if (yardsToGo <= 3 && off.plan.fourthDownAggressiveness >= 80) return 'go'
  if (ballOn < 35) return 'punt'
  if (fgMakeable) return 'fg'
  return rng.bool(off.plan.fourthDownAggressiveness / 140) ? 'go' : 'punt'
}

function attemptFieldGoal(off: SimSide, ballOn: number, rng: RNG): { made: boolean; distance: number } {
  const distance = (100 - ballOn) + 17
  const rating = off.kicker?.ratings.kicking ?? 50
  const makeProb = clamp(0.98 - (distance - 20) * 0.0135 + (rating - 60) * 0.003, 0.05, 0.98)
  return { made: rng.bool(makeProb), distance }
}

function puntBall(off: SimSide, ballOn: number, rng: RNG): number {
  const rating = off.punter?.ratings.kicking ?? 50
  const distance = clamp(rng.normal(38 + (rating - 60) * 0.15, 6), 20, 60)
  const landing = ballOn + distance
  if (landing >= 100) return 25
  const returnYards = Math.max(0, Math.round(rng.normal(6, 5)))
  const afterReturn = clamp(landing - returnYards, ballOn + 5, 99)
  return clamp(100 - afterReturn, 2, 40)
}

export function simulateGame(input: SimGameInput): SimGameOutput {
  const { players, rng, verbose } = input
  const home = buildSide(input.homeTeam, players)
  const away = buildSide(input.awayTeam, players)

  let homeScore = 0
  let awayScore = 0
  const playLog: string[] = []

  const log = (msg: string) => { if (verbose) playLog.push(msg) }

  let offense = rng.bool(0.5) ? home : away
  let defense = offense === home ? away : home
  log(`${offense.team.name} ${offense.team.mascot} will receive the opening kickoff.`)

  let clock = GAME_SECONDS
  let ballOn = 25
  let quarterAnnounced = 1

  const scoreFor = (side: SimSide, points: number) => {
    if (side === home) homeScore += points
    else awayScore += points
  }

  const recordYards = (side: SimSide, opp: SimSide, isPass: boolean, yards: number) => {
    side.stats.totalYards += yards
    if (isPass) side.stats.passYards += yards
    else side.stats.rushYards += yards
    void opp
  }

  let safety = 0
  while (clock > 0 && safety < 400) {
    safety++
    const quarter = clamp(5 - Math.ceil(clock / QUARTER_SECONDS), 1, 4)
    if (quarter !== quarterAnnounced) {
      quarterAnnounced = quarter
      log(`— Start of Q${quarter} —`)
    }

    let down = 1
    let yardsToGo = 10
    let driveActive = true

    while (driveActive && clock > 0) {
      if (down > 4) { driveActive = false; break }

      if (down === 4) {
        const choice = decideFourthDown(offense, ballOn, yardsToGo, rng)
        if (choice === 'fg') {
          const { made, distance } = attemptFieldGoal(offense, ballOn, rng)
          clock -= tempoSeconds(50, rng)
          if (made) {
            scoreFor(offense, 3)
            if (offense.kicker) offense.kicker.seasonStats.fgMade++
            log(`${offense.kicker ? fullName(offense.kicker) : 'The kicker'} nails a ${distance}-yard field goal! ${home.team.abbr} ${homeScore} - ${away.team.abbr} ${awayScore}`)
          } else {
            log(`Field goal attempt from ${distance} yards is NO GOOD.`)
          }
          if (offense.kicker) offense.kicker.seasonStats.fgAtt++
          const nextSpot = made ? 25 : clamp(100 - ballOn, 20, 80)
          offense = defense; defense = offense === home ? away : home
          ballOn = nextSpot
          driveActive = false
          break
        }
        if (choice === 'punt') {
          const newSpot = puntBall(offense, ballOn, rng)
          clock -= tempoSeconds(45, rng)
          log(`Punt pins ${defense.team.name} at their own ${newSpot}.`)
          offense = defense; defense = offense === home ? away : home
          ballOn = newSpot
          driveActive = false
          break
        }
        // go for it — fall through to scrimmage play resolution below
      }

      const outcome = resolveScrimmagePlay(offense, defense, down, yardsToGo, ballOn, rng)
      clock -= outcome.timeUsed
      offense.stats.timeOfPossession += outcome.timeUsed
      if (!outcome.isSack) recordYards(offense, defense, outcome.isPass, Math.max(0, outcome.yards))

      if (outcome.turnover) {
        offense.stats.turnovers += 1
        if (outcome.turnover === 'interception') {
          const picker = weightedPlayer(rng, defense.secondary, (p) => p.ratings.coverage)
          if (picker) picker.seasonStats.interceptions += 1
          log(`INTERCEPTED! ${picker ? fullName(picker) : 'A defender'} picks it off for ${defense.team.name}.`)
        } else {
          const forcer = weightedPlayer(rng, [...defense.dl, ...defense.lb], (p) => p.ratings.tackling)
          if (forcer) forcer.seasonStats.forcedFumbles += 1
          log(`${outcome.desc} Ball goes over to ${defense.team.name}.`)
        }
        const spot = clamp(ballOn + Math.max(0, outcome.yards), 1, 99)
        offense = defense; defense = offense === home ? away : home
        ballOn = clamp(100 - spot, 1, 99)
        driveActive = false
        break
      }

      log(`Q${quarter} ${formatClock(clock)} — ${down}${ordinal(down)} & ${yardsToGo} at ${ballOn}: ${outcome.desc}`)

      if (outcome.touchdown) {
        scoreFor(offense, 6)
        const scorer = outcome.scorerId ? players[outcome.scorerId] : undefined
        if (scorer) {
          if (outcome.isPass) scorer.seasonStats.recTd += 1
          else scorer.seasonStats.rushTd += 1
        }
        if (outcome.isPass && offense.qb) offense.qb.seasonStats.passTd += 1
        const xp = attemptExtraPoint(offense, rng)
        if (xp) { scoreFor(offense, 1); log(`Extra point is good. ${home.team.abbr} ${homeScore} - ${away.team.abbr} ${awayScore}`) }
        else log(`Extra point attempt missed. ${home.team.abbr} ${homeScore} - ${away.team.abbr} ${awayScore}`)
        offense = defense; defense = offense === home ? away : home
        ballOn = 25
        driveActive = false
        break
      }

      const gained = outcome.yards
      ballOn = clamp(ballOn + gained, 0, 99)
      if (gained >= yardsToGo) {
        down = 1
        yardsToGo = Math.min(10, 100 - ballOn)
        offense.stats.firstDowns += 1
      } else {
        down += 1
        yardsToGo -= gained
        if (yardsToGo <= 0) yardsToGo = 1
      }

      if (down > 4) {
        log(`Turnover on downs.`)
        offense = defense; defense = offense === home ? away : home
        ballOn = clamp(100 - ballOn, 1, 99)
        driveActive = false
      }
      if (clock <= 0) driveActive = false
    }
    if (safety >= 400) break
  }

  const boxScore: BoxScore = { home: home.stats, away: away.stats }
  return { homeScore, awayScore, boxScore, playLog }
}

function attemptExtraPoint(offense: SimSide, rng: RNG): boolean {
  const rating = offense.kicker?.ratings.kicking ?? 55
  const prob = clamp(0.85 + (rating - 55) * 0.003, 0.7, 0.99)
  if (offense.kicker) offense.kicker.seasonStats.xpMade += rng.bool(prob) ? 1 : 0
  return rng.bool(prob)
}

function ordinal(n: number): string {
  return n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'
}

function formatClock(seconds: number): string {
  const s = clamp(seconds % (15 * 60), 0, 900)
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}
