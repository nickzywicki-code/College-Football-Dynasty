// Offseason orchestration: awards → retirements/progression → contracts →
// draft → free agency → season rollover.

import { Rand } from '../rng';
import { autoDepthChart } from '../league';
import { generateSchedule } from '../schedule';
import type { League } from '../types';
import { finalizeSeasonAwards } from './awards';
import { expireContracts } from './contracts';
import { createDraft, grantFuturePicks } from './draft';
import { runProgressionAndRetirements, ProgressionReport } from './progression';
import { startFreeAgency } from './freeAgency';

/**
 * Move from post-championship recap into the draft. Runs awards (if not yet
 * run), retirements, development, contract expirations, and builds the class.
 */
export function beginOffseasonToDraft(league: League, r: Rand): ProgressionReport {
  // archive season history/awards once
  if (!league.history.some((h) => h.season === league.season)) {
    finalizeSeasonAwards(league);
  }
  const report = runProgressionAndRetirements(league, r);
  const expiring = expireContracts(league);
  league.news.unshift(`${expiring.length} players hit free agency as contracts expire.`);
  createDraft(league, r);
  league.phase = 'draft';
  return report;
}

/** After the draft completes: grant future picks and open free agency. */
export function finishDraftToFreeAgency(league: League): void {
  grantFuturePicks(league);
  startFreeAgency(league);
  league.phase = 'freeAgency';
  league.news.unshift('The draft is complete — free agency is open!');
}

/** Free agency wrapped up → build next season and kick off week 1. */
export function rolloverToNewSeason(league: League, r: Rand): void {
  league.season++;
  league.week = 1;
  league.phase = 'regularSeason';
  league.boxScores = {};
  league.playoffTeams = [];
  league.draft = null;
  league.freeAgency = null;

  for (const team of league.teams) {
    // archive last season's record
    team.history.push({
      season: league.season - 1,
      wins: team.wins,
      losses: team.losses,
      ties: team.ties,
      result: resultLabel(league, team.id),
    });
    team.wins = 0;
    team.losses = 0;
    team.ties = 0;
    team.ptsFor = 0;
    team.ptsAgainst = 0;
    autoDepthChart(team, league.players);
  }

  const { schedule, nextGameId } = generateSchedule(r, league.teams, league.season, league.nextGameId);
  league.schedule = schedule;
  league.nextGameId = nextGameId;
  league.news.unshift(`⚡ Season ${league.season} kicks off! A new schedule is out.`);
  // keep the news feed from growing unbounded
  league.news = league.news.slice(0, 60);
}

function resultLabel(league: League, teamId: number): string {
  const hist = league.history.find((h) => h.season === league.season - 1);
  if (hist?.championTeamId === teamId) return 'Won Championship 🏆';
  const champGame = league.schedule.find((g) => g.tag === 'CHAMP');
  if (champGame && (champGame.homeId === teamId || champGame.awayId === teamId)) {
    return 'Lost Championship';
  }
  const madePlayoffs = league.playoffTeams.includes(teamId);
  return madePlayoffs ? 'Made Playoffs' : '';
}
