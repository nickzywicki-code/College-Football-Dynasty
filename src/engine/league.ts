// League + roster generation and depth chart management.

import { Rand } from './rng';
import { TEAM_IDENTITIES } from './names';
import { generatePlayer, marketSalary, setJerseyScratch, computeOverall } from './player';
import { generateSchedule } from './schedule';
import type { DepthChart, League, Player, Position, Team } from './types';
import { SALARY_CAP, SCHEMA_VERSION, playerName } from './types';

/** Roster composition: how many of each position a full roster carries. */
export const ROSTER_COMPOSITION: Record<Position, number> = {
  QB: 3, RB: 4, WR: 6, TE: 3, OL: 8, DL: 7, LB: 6, CB: 5, S: 4, K: 1, P: 1,
};

/** Starters used by the sim/arcade per position. */
export const STARTER_COUNTS: Record<Position, number> = {
  QB: 1, RB: 1, WR: 3, TE: 1, OL: 5, DL: 4, LB: 3, CB: 2, S: 2, K: 1, P: 1,
};

export function emptyDepthChart(): DepthChart {
  return { QB: [], RB: [], WR: [], TE: [], OL: [], DL: [], LB: [], CB: [], S: [], K: [], P: [] };
}

/** Sort roster into a depth chart by overall (healthy players first). */
export function autoDepthChart(team: Team, players: Record<number, Player>): void {
  const dc = emptyDepthChart();
  for (const pid of team.playerIds) {
    const p = players[pid];
    if (!p || p.retired) continue;
    dc[p.pos].push(pid);
  }
  for (const pos of Object.keys(dc) as Position[]) {
    dc[pos].sort((a, b) => {
      const pa = players[a];
      const pb = players[b];
      const injA = pa.injuryWeeks > 0 ? 1 : 0;
      const injB = pb.injuryWeeks > 0 ? 1 : 0;
      if (injA !== injB) return injA - injB;
      return pb.overall - pa.overall;
    });
  }
  team.depthChart = dc;
}

/** Get healthy starters at a position (falls back to injured if roster is decimated). */
export function getStarters(
  team: Team,
  players: Record<number, Player>,
  pos: Position,
  count: number,
): Player[] {
  const list = team.depthChart[pos].map((id) => players[id]).filter((p) => p && !p.retired);
  const healthy = list.filter((p) => p.injuryWeeks === 0);
  const pool = healthy.length >= count ? healthy : list;
  return pool.slice(0, count);
}

/**
 * Contract length for a generated veteran: fringe guys on short deals,
 * stars locked up longer.
 */
function initialContract(r: Rand, p: Player): { salary: number; yearsLeft: number } {
  const salary = marketSalary(p);
  const years = p.overall >= 82 ? r.int(2, 5) : p.overall >= 70 ? r.int(1, 4) : r.int(1, 2);
  return { salary, yearsLeft: years };
}

/** Team quality tiers so the league starts with contenders and rebuilders. */
function teamQualityCurve(r: Rand): number {
  return r.gaussClamp(74, 5, 62, 88);
}

export function generateLeague(seed: number, userTeamId: number): League {
  const r = new Rand(seed);
  const players: Record<number, Player> = {};
  let nextPlayerId = 1;

  const teams: Team[] = TEAM_IDENTITIES.map((ident, i) => ({
    id: i,
    city: ident.city,
    name: ident.name,
    abbr: ident.abbr,
    colors: ident.colors,
    conference: Math.floor(i / 16),
    division: Math.floor(i / 4) % 4,
    playerIds: [],
    depthChart: emptyDepthChart(),
    wins: 0,
    losses: 0,
    ties: 0,
    ptsFor: 0,
    ptsAgainst: 0,
    history: [],
    draftPicks: [],
  }));

  for (const team of teams) {
    const teamQuality = teamQualityCurve(r);
    const takenJerseys = new Set<number>();
    setJerseyScratch(takenJerseys);
    for (const pos of Object.keys(ROSTER_COMPOSITION) as Position[]) {
      const count = ROSTER_COMPOSITION[pos];
      const starters = STARTER_COUNTS[pos];
      for (let depth = 0; depth < count; depth++) {
        // starters near team quality, backups fall off
        const drop = depth < starters ? depth * 1.5 : 8 + (depth - starters) * 4;
        const quality = r.gaussClamp(teamQuality - drop, 4, 45, 97);
        const age = r.int(22, 33);
        const p = generatePlayer(r, nextPlayerId++, { pos, age, quality, teamId: team.id });
        p.contract = initialContract(r, p);
        players[p.id] = p;
        team.playerIds.push(p.id);
      }
    }
    setJerseyScratch(null);
    autoDepthChart(team, players);
    // each team starts with its own picks for the next 2 drafts
    for (const season of [1, 2]) {
      for (let round = 1; round <= 7; round++) {
        team.draftPicks.push({ season, round, originalTeamId: team.id });
      }
    }
  }

  const { schedule, nextGameId } = generateSchedule(r, teams, 1, 1);

  const league: League = {
    schemaVersion: SCHEMA_VERSION,
    seed,
    season: 1,
    week: 1,
    phase: 'regularSeason',
    userTeamId,
    teams,
    players,
    nextPlayerId,
    schedule,
    nextGameId,
    boxScores: {},
    playoffTeams: [],
    draft: null,
    freeAgency: null,
    history: [],
    recordBook: { singleSeason: {} },
    news: [`Welcome to Season 1! You are the GM and head coach of the ${teams[userTeamId].city} ${teams[userTeamId].name}.`],
    settings: { quarterMinutes: 3, difficulty: 'pro' },
    salaryCap: SALARY_CAP,
  };
  return league;
}

export function teamPayroll(team: Team, players: Record<number, Player>): number {
  let total = 0;
  for (const pid of team.playerIds) {
    const p = players[pid];
    if (p && !p.retired && p.contract) total += p.contract.salary;
  }
  return Math.round(total * 10) / 10;
}

export function teamOverall(team: Team, players: Record<number, Player>): number {
  let sum = 0;
  let n = 0;
  for (const pos of Object.keys(STARTER_COUNTS) as Position[]) {
    for (const p of getStarters(team, players, pos, STARTER_COUNTS[pos])) {
      sum += p.overall;
      n++;
    }
  }
  return n ? Math.round(sum / n) : 0;
}

/** Best player at a position on a team (for news/awards flavor). */
export function bestAt(team: Team, players: Record<number, Player>, pos: Position): Player | null {
  const starters = getStarters(team, players, pos, 1);
  return starters[0] ?? null;
}

/** Re-check a player's overall after an attribute edit. */
export function refreshOverall(p: Player): void {
  p.overall = computeOverall(p.pos, p.attrs);
}

export function describePlayer(p: Player): string {
  return `${p.pos} ${playerName(p)} (${p.overall} OVR, ${p.age}y)`;
}
