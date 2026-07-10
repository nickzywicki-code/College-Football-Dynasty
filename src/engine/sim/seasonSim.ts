// Season progression: apply results, standings/tiebreakers, playoffs.

import { Rand } from './../rng';
import type { BoxScore, GameStatLine, League, ScheduledGame, SeasonStats, Team } from './../types';
import { REGULAR_SEASON_WEEKS, emptySeasonStats, teamName } from './../types';
import { autoDepthChart } from './../league';
import { simulateGame } from './gameSim';

/** Merge a game stat line into a player's current-season totals. */
function applyStatLine(league: League, teamAbbr: string, line: GameStatLine): void {
  const p = league.players[line.playerId];
  if (!p) return;
  let season = p.stats.find((s) => s.season === league.season);
  if (!season) {
    season = emptySeasonStats(league.season, teamAbbr);
    p.stats.push(season);
  }
  season.teamAbbr = teamAbbr;
  for (const key of Object.keys(line) as (keyof GameStatLine)[]) {
    if (key === 'playerId') continue;
    const v = line[key];
    if (typeof v !== 'number') continue;
    if (key === 'fgLong') {
      season.fgLong = Math.max(season.fgLong, v);
    } else {
      (season[key as keyof SeasonStats] as number) += v;
    }
  }
}

export function applyGameResult(
  league: League,
  game: ScheduledGame,
  box: BoxScore,
  injuries: { playerId: number; weeks: number }[],
): void {
  const home = league.teams[game.homeId];
  const away = league.teams[game.awayId];
  game.played = true;
  game.homeScore = box.homeScore;
  game.awayScore = box.awayScore;
  league.boxScores[game.id] = box;

  if (game.tag === '') {
    if (box.homeScore > box.awayScore) {
      home.wins++;
      away.losses++;
    } else if (box.awayScore > box.homeScore) {
      away.wins++;
      home.losses++;
    } else {
      home.ties++;
      away.ties++;
    }
    home.ptsFor += box.homeScore;
    home.ptsAgainst += box.awayScore;
    away.ptsFor += box.awayScore;
    away.ptsAgainst += box.homeScore;
  }

  for (const line of box.homeStats) applyStatLine(league, home.abbr, line);
  for (const line of box.awayStats) applyStatLine(league, away.abbr, line);

  for (const inj of injuries) {
    const p = league.players[inj.playerId];
    if (!p) continue;
    p.injuryWeeks = inj.weeks;
    const t = league.teams[p.teamId];
    if (t && (p.teamId === league.userTeamId || inj.weeks >= 4)) {
      league.news.unshift(
        `${t.abbr} ${p.pos} ${p.firstName} ${p.lastName} injured — out ${inj.weeks} week${inj.weeks > 1 ? 's' : ''}.`,
      );
    }
  }
  // refresh depth charts for both teams (injuries shuffle starters)
  autoDepthChart(home, league.players);
  autoDepthChart(away, league.players);
}

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

export function winPct(t: Team): number {
  const g = t.wins + t.losses + t.ties;
  return g === 0 ? 0 : (t.wins + t.ties * 0.5) / g;
}

/** Head-to-head win margin between two teams this season (positive = a leads). */
function headToHead(league: League, a: Team, b: Team): number {
  let margin = 0;
  for (const g of league.schedule) {
    if (!g.played || g.tag !== '') continue;
    if (g.homeId === a.id && g.awayId === b.id) {
      margin += Math.sign(g.homeScore - g.awayScore);
    } else if (g.homeId === b.id && g.awayId === a.id) {
      margin += Math.sign(g.awayScore - g.homeScore);
    }
  }
  return margin;
}

function recordVs(league: League, t: Team, filter: (opp: Team) => boolean): number {
  let w = 0;
  let l = 0;
  for (const g of league.schedule) {
    if (!g.played || g.tag !== '') continue;
    let opp: Team | null = null;
    let won = false;
    if (g.homeId === t.id) {
      opp = league.teams[g.awayId];
      won = g.homeScore > g.awayScore;
    } else if (g.awayId === t.id) {
      opp = league.teams[g.homeId];
      won = g.awayScore > g.homeScore;
    }
    if (!opp || !filter(opp)) continue;
    if (won) w++;
    else l++;
  }
  const tot = w + l;
  return tot === 0 ? 0 : w / tot;
}

/** Sort comparator with tiebreakers: win% → H2H → division% → conference% → point diff. */
export function compareTeams(league: League, a: Team, b: Team): number {
  const pctDiff = winPct(b) - winPct(a);
  if (Math.abs(pctDiff) > 1e-9) return pctDiff < 0 ? -1 : 1;
  const h2h = headToHead(league, a, b);
  if (h2h !== 0) return -h2h;
  if (a.division === b.division && a.conference === b.conference) {
    const divDiff =
      recordVs(league, b, (o) => o.conference === b.conference && o.division === b.division) -
      recordVs(league, a, (o) => o.conference === a.conference && o.division === a.division);
    if (Math.abs(divDiff) > 1e-9) return divDiff < 0 ? -1 : 1;
  }
  const confDiff =
    recordVs(league, b, (o) => o.conference === b.conference) -
    recordVs(league, a, (o) => o.conference === a.conference);
  if (Math.abs(confDiff) > 1e-9) return confDiff < 0 ? -1 : 1;
  const pd = b.ptsFor - b.ptsAgainst - (a.ptsFor - a.ptsAgainst);
  if (pd !== 0) return pd < 0 ? -1 : 1;
  return a.id - b.id;
}

export function divisionStandings(league: League, conference: number, division: number): Team[] {
  return league.teams
    .filter((t) => t.conference === conference && t.division === division)
    .sort((a, b) => compareTeams(league, a, b));
}

/** 7 playoff seeds for a conference: 4 division winners then 3 wild cards. */
export function conferenceSeeds(league: League, conference: number): Team[] {
  const winners: Team[] = [];
  const rest: Team[] = [];
  for (let d = 0; d < 4; d++) {
    const div = divisionStandings(league, conference, d);
    winners.push(div[0]);
    rest.push(...div.slice(1));
  }
  winners.sort((a, b) => compareTeams(league, a, b));
  rest.sort((a, b) => compareTeams(league, a, b));
  return [...winners, ...rest.slice(0, 3)];
}

// ---------------------------------------------------------------------------
// Week advancement + playoffs
// ---------------------------------------------------------------------------

export function gamesForWeek(league: League, week: number): ScheduledGame[] {
  return league.schedule.filter((g) => g.week === week);
}

export function userGameForWeek(league: League, week: number): ScheduledGame | null {
  return (
    gamesForWeek(league, week).find(
      (g) => g.homeId === league.userTeamId || g.awayId === league.userTeamId,
    ) ?? null
  );
}

/** Simulate all unplayed games in the current week (optionally skipping one, e.g. the user's). */
export function simWeek(league: League, r: Rand, skipGameId: number | null = null): void {
  for (const g of gamesForWeek(league, league.week)) {
    if (g.played || g.id === skipGameId) continue;
    const { box, injuries } = simulateGame(r, league, g, { fullLog: false });
    applyGameResult(league, g, box, injuries);
  }
}

/** True when every game in the current week is done. */
export function weekComplete(league: League): boolean {
  return gamesForWeek(league, league.week).every((g) => g.played);
}

function decrementInjuries(league: League): void {
  for (const t of league.teams) {
    let changed = false;
    for (const pid of t.playerIds) {
      const p = league.players[pid];
      if (p && p.injuryWeeks > 0) {
        p.injuryWeeks--;
        changed = true;
      }
    }
    if (changed) autoDepthChart(t, league.players);
  }
}

/**
 * Advance to the next week. Handles regular season → playoffs → offseason
 * transitions, creating playoff games as rounds complete.
 */
export function advanceWeek(league: League, _r?: Rand): void {
  if (!weekComplete(league)) throw new Error('Cannot advance: games remain this week');
  decrementInjuries(league);

  if (league.phase === 'regularSeason') {
    if (league.week < REGULAR_SEASON_WEEKS) {
      league.week++;
      return;
    }
    // seed playoffs
    league.phase = 'playoffs';
    const seedsA = conferenceSeeds(league, 0);
    const seedsB = conferenceSeeds(league, 1);
    league.playoffTeams = [...seedsA.map((t) => t.id), ...seedsB.map((t) => t.id)];
    league.week = REGULAR_SEASON_WEEKS + 1;
    createWildCardRound(league);
    league.news.unshift('The playoff field is set! Wild Card weekend is here.');
    return;
  }

  if (league.phase === 'playoffs') {
    league.week++;
    const created = createNextPlayoffRound(league);
    if (!created) {
      // championship decided → offseason
      league.phase = 'offseason';
      const champGame = league.schedule.find((g) => g.tag === 'CHAMP');
      if (champGame) {
        const champId = champGame.homeScore > champGame.awayScore ? champGame.homeId : champGame.awayId;
        const champ = league.teams[champId];
        league.news.unshift(`🏆 The ${teamName(champ)} are Season ${league.season} champions!`);
      }
    }
  }
}

function addPlayoffGame(league: League, week: number, tag: 'WC' | 'DIV' | 'CONF' | 'CHAMP', homeId: number, awayId: number): void {
  league.schedule.push({
    id: league.nextGameId++,
    week,
    homeId,
    awayId,
    played: false,
    homeScore: 0,
    awayScore: 0,
    tag,
  });
}

function seedsOf(league: League, conference: number): number[] {
  return league.playoffTeams.slice(conference * 7, conference * 7 + 7);
}

function createWildCardRound(league: League): void {
  const w = league.week;
  for (let c = 0; c < 2; c++) {
    const s = seedsOf(league, c);
    // 1 seed bye; 2v7 3v6 4v5
    addPlayoffGame(league, w, 'WC', s[1], s[6]);
    addPlayoffGame(league, w, 'WC', s[2], s[5]);
    addPlayoffGame(league, w, 'WC', s[3], s[4]);
  }
}

function playoffWinners(league: League, tag: 'WC' | 'DIV' | 'CONF', conference: number): number[] {
  const seeds = seedsOf(league, conference);
  const winners: number[] = [];
  for (const g of league.schedule) {
    if (g.tag !== tag || !g.played) continue;
    const winnerId = g.homeScore > g.awayScore ? g.homeId : g.awayId;
    if (seeds.includes(winnerId)) winners.push(winnerId);
  }
  // sort winners by their seed order
  return winners.sort((a, b) => seeds.indexOf(a) - seeds.indexOf(b));
}

/** Create the next playoff round's games. Returns false when the championship is done. */
function createNextPlayoffRound(league: League): boolean {
  const w = league.week;
  const wcDone = league.schedule.filter((g) => g.tag === 'WC').length === 6 &&
    league.schedule.filter((g) => g.tag === 'WC' && g.played).length === 6;
  const divGames = league.schedule.filter((g) => g.tag === 'DIV');
  const confGames = league.schedule.filter((g) => g.tag === 'CONF');
  const champGames = league.schedule.filter((g) => g.tag === 'CHAMP');

  if (wcDone && divGames.length === 0) {
    for (let c = 0; c < 2; c++) {
      const seeds = seedsOf(league, c);
      const winners = playoffWinners(league, 'WC', c);
      // 1 seed hosts lowest remaining; 2nd-highest hosts other
      const field = [seeds[0], ...winners];
      field.sort((a, b) => seeds.indexOf(a) - seeds.indexOf(b));
      addPlayoffGame(league, w, 'DIV', field[0], field[3]);
      addPlayoffGame(league, w, 'DIV', field[1], field[2]);
    }
    return true;
  }
  if (divGames.length === 4 && divGames.every((g) => g.played) && confGames.length === 0) {
    for (let c = 0; c < 2; c++) {
      const winners = playoffWinners(league, 'DIV', c);
      addPlayoffGame(league, w, 'CONF', winners[0], winners[1]);
    }
    return true;
  }
  if (confGames.length === 2 && confGames.every((g) => g.played) && champGames.length === 0) {
    const winnersA = playoffWinners(league, 'CONF', 0);
    const winnersB = playoffWinners(league, 'CONF', 1);
    // championship at higher overall seed's home
    const a = league.teams[winnersA[0]];
    const b = league.teams[winnersB[0]];
    const home = compareTeams(league, a, b) <= 0 ? a : b;
    const away = home === a ? b : a;
    addPlayoffGame(league, w, 'CHAMP', home.id, away.id);
    return true;
  }
  return !(champGames.length === 1 && champGames.every((g) => g.played));
}

/** The champion's team id, once the title game has been played. */
export function championId(league: League): number | null {
  const g = league.schedule.find((x) => x.tag === 'CHAMP' && x.played);
  if (!g) return null;
  return g.homeScore > g.awayScore ? g.homeId : g.awayId;
}
