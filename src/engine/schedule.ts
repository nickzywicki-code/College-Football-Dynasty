// Season schedule generation: 17 games per team over 18 weeks (one bye each),
// pro-style matchup formula, then week assignment via greedy placement with
// Kempe-chain recoloring (edge-coloring technique) when a game's teams have no
// common free week.

import { Rand } from './rng';
import type { ScheduledGame, Team } from './types';
import { GAMES_PER_TEAM, REGULAR_SEASON_WEEKS } from './types';

interface Matchup {
  homeId: number;
  awayId: number;
}

/**
 * Build the 272-game matchup list:
 *  - 6 games vs own division (home & away vs each of 3 rivals)
 *  - 4 games vs a rotating division in-conference
 *  - 4 games vs a rotating division cross-conference
 *  - 3 extra games vs same-rank teams from other divisions
 */
function buildMatchups(teams: Team[], season: number): Matchup[] {
  const matchups: Matchup[] = [];
  const divisions: number[][] = []; // 8 divisions of 4 team ids, ordered by id
  for (let c = 0; c < 2; c++) {
    for (let d = 0; d < 4; d++) {
      divisions.push(
        teams.filter((t) => t.conference === c && t.division === d).map((t) => t.id),
      );
    }
  }

  // 1) division round-robin, home and away
  for (const div of divisions) {
    for (let i = 0; i < div.length; i++) {
      for (let j = i + 1; j < div.length; j++) {
        matchups.push({ homeId: div[i], awayId: div[j] });
        matchups.push({ homeId: div[j], awayId: div[i] });
      }
    }
  }

  // 2) intra-conference rotating division pairing
  const rotIntra = (d: number) => (d + 1 + ((season - 1) % 3)) % 4;
  for (let c = 0; c < 2; c++) {
    const done = new Set<number>();
    for (let d = 0; d < 4; d++) {
      let target = rotIntra(d);
      if (target === d) target = (target + 1) % 4;
      if (done.has(d) || done.has(target)) continue;
      done.add(d).add(target);
      const divA = divisions[c * 4 + d];
      const divB = divisions[c * 4 + target];
      divA.forEach((a, i) => {
        divB.forEach((b, j) => {
          // alternate home/away by parity so home games balance
          if ((i + j) % 2 === 0) matchups.push({ homeId: a, awayId: b });
          else matchups.push({ homeId: b, awayId: a });
        });
      });
    }
  }

  // 3) cross-conference rotating division
  const rotCross = (d: number) => (d + (season - 1)) % 4;
  for (let d = 0; d < 4; d++) {
    const divA = divisions[d]; // conference 0
    const divB = divisions[4 + rotCross(d)]; // conference 1
    divA.forEach((a, i) => {
      divB.forEach((b, j) => {
        if ((i + j) % 2 === 0) matchups.push({ homeId: a, awayId: b });
        else matchups.push({ homeId: b, awayId: a });
      });
    });
  }

  // 4) fill to 17 games per team with same-rank pairings vs divisions not yet
  // played (first in-conference, then cross-conference)
  const oppCount = new Map<string, number>();
  const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  for (const m of matchups) {
    const k = key(m.homeId, m.awayId);
    oppCount.set(k, (oppCount.get(k) ?? 0) + 1);
  }
  const gamesPerTeam = new Map<number, number>();
  for (const m of matchups) {
    gamesPerTeam.set(m.homeId, (gamesPerTeam.get(m.homeId) ?? 0) + 1);
    gamesPerTeam.set(m.awayId, (gamesPerTeam.get(m.awayId) ?? 0) + 1);
  }
  const tryAdd = (a: number, b: number, aHome: boolean) => {
    if ((gamesPerTeam.get(a) ?? 0) >= GAMES_PER_TEAM) return;
    if ((gamesPerTeam.get(b) ?? 0) >= GAMES_PER_TEAM) return;
    const k = key(a, b);
    if ((oppCount.get(k) ?? 0) > 0) return;
    matchups.push(aHome ? { homeId: a, awayId: b } : { homeId: b, awayId: a });
    oppCount.set(k, 1);
    gamesPerTeam.set(a, (gamesPerTeam.get(a) ?? 0) + 1);
    gamesPerTeam.set(b, (gamesPerTeam.get(b) ?? 0) + 1);
  };
  for (let c = 0; c < 2; c++) {
    for (let d = 0; d < 4; d++) {
      for (let other = d + 1; other < 4; other++) {
        for (let rank = 0; rank < 4; rank++) {
          tryAdd(divisions[c * 4 + d][rank], divisions[c * 4 + other][rank], rank % 2 === 0);
        }
      }
    }
  }
  for (let d = 0; d < 4; d++) {
    for (let d2 = 0; d2 < 4; d2++) {
      for (let rank = 0; rank < 4; rank++) {
        tryAdd(divisions[d][rank], divisions[4 + d2][rank], d % 2 === 0);
      }
    }
  }

  return matchups;
}

/**
 * Assign matchups to weeks 1..18 (each team idle exactly once) by treating
 * weeks as edge colors. When a game's two teams share no free week, run a
 * Kempe-chain swap: walk the alternating α/β path from one endpoint and flip
 * its colors, freeing a common week.
 */
function assignWeeks(r: Rand, matchups: Matchup[]): ScheduledGame[] | null {
  const weeks = REGULAR_SEASON_WEEKS;
  const shuffled = r.shuffle([...matchups]);
  // busy[team] maps week -> game occupying it
  const busy = new Map<number, Map<number, Matchup>>();
  const weekOf = new Map<Matchup, number>();
  const teamIds = new Set<number>();
  for (const m of shuffled) {
    teamIds.add(m.homeId);
    teamIds.add(m.awayId);
  }
  for (const t of teamIds) busy.set(t, new Map());

  const freeWeeks = (t: number): number[] => {
    const b = busy.get(t)!;
    const res: number[] = [];
    for (let w = 1; w <= weeks; w++) if (!b.has(w)) res.push(w);
    return res;
  };

  const place = (m: Matchup, w: number) => {
    busy.get(m.homeId)!.set(w, m);
    busy.get(m.awayId)!.set(w, m);
    weekOf.set(m, w);
  };

  /**
   * `start` is free in `beta`, `anchor` is free in `alpha`. Walk the chain of
   * games from `start` alternating weeks alpha/beta and flip each game's week.
   * Fails if the chain reaches `anchor` (flip would steal its free week).
   */
  const kempeSwap = (anchor: number, start: number, alpha: number, beta: number): boolean => {
    const path: { game: Matchup; week: number }[] = [];
    let node = start;
    let color = alpha;
    const seen = new Set<Matchup>();
    for (;;) {
      const g = busy.get(node)!.get(color);
      if (!g) break;
      if (seen.has(g)) return false;
      seen.add(g);
      path.push({ game: g, week: color });
      node = g.homeId === node ? g.awayId : g.homeId;
      if (node === anchor) return false;
      color = color === alpha ? beta : alpha;
    }
    for (const { game, week } of path) {
      busy.get(game.homeId)!.delete(week);
      busy.get(game.awayId)!.delete(week);
    }
    for (const { game, week } of path) {
      const newWeek = week === alpha ? beta : alpha;
      busy.get(game.homeId)!.set(newWeek, game);
      busy.get(game.awayId)!.set(newWeek, game);
      weekOf.set(game, newWeek);
    }
    return true;
  };

  for (const m of shuffled) {
    const fh = freeWeeks(m.homeId);
    const faSet = new Set(freeWeeks(m.awayId));
    const common = fh.filter((w) => faSet.has(w));
    if (common.length) {
      place(m, common[Math.floor(r.random() * common.length)]);
      continue;
    }
    let placed = false;
    const fa = [...faSet];
    outer: for (const alpha of r.shuffle([...fh])) {
      for (const beta of r.shuffle([...fa])) {
        // free `away` in alpha by flipping the chain that starts at away
        if (kempeSwap(m.homeId, m.awayId, alpha, beta)) {
          place(m, alpha);
          placed = true;
          break outer;
        }
        // or free `home` in beta by flipping the chain that starts at home
        if (kempeSwap(m.awayId, m.homeId, beta, alpha)) {
          place(m, beta);
          placed = true;
          break outer;
        }
      }
    }
    if (!placed) return null;
  }

  const games: ScheduledGame[] = [];
  for (let w = 1; w <= weeks; w++) {
    for (const m of shuffled) {
      if (weekOf.get(m) !== w) continue;
      games.push({
        id: 0, // assigned by caller
        week: w,
        homeId: m.homeId,
        awayId: m.awayId,
        played: false,
        homeScore: 0,
        awayScore: 0,
        tag: '',
      });
    }
  }
  return games;
}

export function generateSchedule(
  r: Rand,
  teams: Team[],
  season: number,
  startGameId: number,
): { schedule: ScheduledGame[]; nextGameId: number } {
  const matchups = buildMatchups(teams, season);
  let games: ScheduledGame[] | null = null;
  for (let attempt = 0; attempt < 200 && !games; attempt++) {
    games = assignWeeks(r, matchups);
  }
  if (!games) {
    throw new Error('Failed to build schedule');
  }
  let id = startGameId;
  for (const g of games) g.id = id++;
  return { schedule: games, nextGameId: id };
}
