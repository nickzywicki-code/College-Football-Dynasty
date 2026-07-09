import type { Player, Position, Team } from '../state/types'

export interface TeamStrength {
  passOffense: number
  runOffense: number
  passBlock: number
  runBlock: number
  passDefense: number
  runDefense: number
  passRush: number
  special: number
  overall: number
}

function starters(team: Team, players: Record<string, Player>, position: Position, count: number): Player[] {
  const ids = team.depthChart[position] ?? []
  return ids
    .slice(0, count)
    .map((id) => players[id])
    .filter((p): p is Player => Boolean(p))
}

function avg(list: Player[], fn: (p: Player) => number): number {
  if (list.length === 0) return 45
  return list.reduce((s, p) => s + fn(p), 0) / list.length
}

export function computeTeamStrength(team: Team, players: Record<string, Player>): TeamStrength {
  const qb = starters(team, players, 'QB', 1)
  const rb = starters(team, players, 'RB', 1)
  const wr = starters(team, players, 'WR', 3)
  const te = starters(team, players, 'TE', 1)
  const ol = starters(team, players, 'OL', 5)
  const dl = starters(team, players, 'DL', 4)
  const lb = starters(team, players, 'LB', 3)
  const cb = starters(team, players, 'CB', 2)
  const s = starters(team, players, 'S', 2)
  const k = starters(team, players, 'K', 1)
  const p = starters(team, players, 'P', 1)

  const qbThrow = avg(qb, (x) => x.ratings.throwing)
  const qbAware = avg(qb, (x) => x.ratings.awareness)
  const recCatch = avg([...wr, ...te], (x) => x.ratings.catching)
  const olBlock = avg(ol, (x) => x.ratings.blocking)
  const rbAgility = avg(rb, (x) => x.ratings.agility)
  const rbSpeed = avg(rb, (x) => x.ratings.speed)

  const passOffense = qbThrow * 0.45 + recCatch * 0.35 + qbAware * 0.2
  const runOffense = olBlock * 0.4 + rbAgility * 0.3 + rbSpeed * 0.3
  const passBlock = olBlock
  const runBlock = olBlock * 0.7 + avg(te, (x) => x.ratings.blocking) * 0.3

  const dlPassRush = avg(dl, (x) => x.ratings.passRush)
  const lbPassRush = avg(lb, (x) => x.ratings.passRush)
  const secCoverage = avg([...cb, ...s], (x) => x.ratings.coverage)
  const dlRunStop = avg(dl, (x) => x.ratings.tackling) * 0.5 + avg(dl, (x) => x.ratings.strength) * 0.5
  const lbRunStop = avg(lb, (x) => x.ratings.tackling)

  const passDefense = secCoverage * 0.55 + avg(lb, (x) => x.ratings.coverage) * 0.2 + avg([...cb, ...s], (x) => x.ratings.awareness) * 0.25
  const runDefense = dlRunStop * 0.5 + lbRunStop * 0.35 + avg(s, (x) => x.ratings.tackling) * 0.15
  const passRush = dlPassRush * 0.65 + lbPassRush * 0.35

  const special = avg([...k, ...p], (x) => x.ratings.kicking)

  const overall = (passOffense + runOffense + passDefense + runDefense + passRush * 0.5 + special * 0.3) / 5.3

  return { passOffense, runOffense, passBlock, runBlock, passDefense, runDefense, passRush, special, overall }
}
