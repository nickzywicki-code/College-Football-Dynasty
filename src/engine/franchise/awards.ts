// Season awards, All-League teams, record book, season history.

import type { AwardWinner, League, Player, Position, SeasonStats } from '../types';
import { playerName, teamName } from '../types';
import { championId } from '../sim/seasonSim';

function seasonLine(p: Player, season: number): SeasonStats | undefined {
  return p.stats.find((s) => s.season === season);
}

function teamWins(league: League, abbr: string): number {
  return league.teams.find((t) => t.abbr === abbr)?.wins ?? 0;
}

function mvpScore(league: League, _p: Player, s: SeasonStats): number {
  return (
    s.passYds * 0.025 +
    s.passTd * 3.2 -
    s.passInt * 2 +
    s.rushYds * 0.06 +
    s.rushTd * 3.5 +
    s.recYds * 0.055 +
    s.recTd * 3.2 +
    teamWins(league, s.teamAbbr) * 3
  );
}

function offenseScore(s: SeasonStats): number {
  return s.rushYds * 0.06 + s.rushTd * 3.5 + s.recYds * 0.06 + s.recTd * 3.2 + s.rec * 0.35;
}

function defenseScore(s: SeasonStats): number {
  return s.tackles * 0.45 + s.sacks * 5 + s.defInt * 6.5 + s.forcedFum * 4 + s.defTd * 6;
}

function bestBy(
  league: League,
  filter: (p: Player, s: SeasonStats) => boolean,
  score: (p: Player, s: SeasonStats) => number,
): { p: Player; s: SeasonStats } | null {
  let best: { p: Player; s: SeasonStats } | null = null;
  let bestVal = -Infinity;
  for (const p of Object.values(league.players)) {
    const s = seasonLine(p, league.season);
    if (!s || !filter(p, s)) continue;
    const v = score(p, s);
    if (v > bestVal) {
      bestVal = v;
      best = { p, s };
    }
  }
  return best;
}

const ALL_LEAGUE_SLOTS: { pos: Position; count: number }[] = [
  { pos: 'QB', count: 1 },
  { pos: 'RB', count: 1 },
  { pos: 'WR', count: 2 },
  { pos: 'TE', count: 1 },
  { pos: 'OL', count: 3 },
  { pos: 'DL', count: 2 },
  { pos: 'LB', count: 2 },
  { pos: 'CB', count: 2 },
  { pos: 'S', count: 1 },
  { pos: 'K', count: 1 },
];

function allLeagueScore(p: Player, s: SeasonStats): number {
  switch (p.pos) {
    case 'QB':
      return s.passYds * 0.025 + s.passTd * 3 - s.passInt * 2 + s.rushYds * 0.05;
    case 'RB':
      return s.rushYds * 0.07 + s.rushTd * 3.5 + s.recYds * 0.05;
    case 'WR':
    case 'TE':
      return s.recYds * 0.07 + s.recTd * 3.2 + s.rec * 0.4;
    case 'OL':
      return p.overall + s.gamesPlayed * 0.3; // no counting stats for OL
    case 'DL':
    case 'LB':
      return defenseScore(s);
    case 'CB':
    case 'S':
      return s.defInt * 8 + s.tackles * 0.4 + p.overall * 0.3;
    case 'K':
      return s.fgm * 2.5 + s.fgLong * 0.15 + (s.fga > 0 ? (s.fgm / s.fga) * 30 : 0);
    case 'P':
      return s.punts > 0 ? s.puntYds / s.punts : 0;
  }
}

/** Compute all awards for the just-finished season and archive it into history. */
export function finalizeSeasonAwards(league: League): void {
  const season = league.season;
  const awards: AwardWinner[] = [];

  const give = (award: string, entry: { p: Player; s: SeasonStats } | null, detail: (s: SeasonStats) => string) => {
    if (!entry) return;
    const { p, s } = entry;
    p.awards.push(`S${season} ${award}`);
    awards.push({
      award,
      playerId: p.id,
      playerName: playerName(p),
      teamAbbr: s.teamAbbr,
      detail: detail(s),
    });
  };

  give(
    'MVP',
    bestBy(league, (_p, s) => s.gamesPlayed >= 10, (p, s) => mvpScore(league, p, s)),
    (s) =>
      s.passYds > 500
        ? `${s.passYds} pass yds, ${s.passTd} TD`
        : `${s.rushYds + s.recYds} yds from scrimmage`,
  );
  give(
    'Off. Player of the Year',
    bestBy(league, (p, s) => p.pos !== 'QB' && s.gamesPlayed >= 10, (_p, s) => offenseScore(s)),
    (s) => `${s.rushYds + s.recYds} scrimmage yds, ${s.rushTd + s.recTd} TD`,
  );
  give(
    'Def. Player of the Year',
    bestBy(
      league,
      (p, s) => ['DL', 'LB', 'CB', 'S'].includes(p.pos) && s.gamesPlayed >= 10,
      (_p, s) => defenseScore(s),
    ),
    (s) => `${s.tackles} tkl, ${s.sacks} sacks, ${s.defInt} INT`,
  );
  give(
    'Rookie of the Year',
    bestBy(
      league,
      (p, s) => p.yearsPro === 0 && s.gamesPlayed >= 8,
      (p, s) => mvpScore(league, p, s) * 0.7 + defenseScore(s) + p.overall * 0.2,
    ),
    (s) => `${s.teamAbbr} rookie standout`,
  );

  // All-League team
  const allLeague: { pos: Position; playerId: number; playerName: string; teamAbbr: string }[] = [];
  for (const { pos, count } of ALL_LEAGUE_SLOTS) {
    const cands = Object.values(league.players)
      .map((p) => ({ p, s: seasonLine(p, season) }))
      .filter((x): x is { p: Player; s: SeasonStats } => !!x.s && x.p.pos === pos && x.s.gamesPlayed >= 8)
      .sort((a, b) => allLeagueScore(b.p, b.s) - allLeagueScore(a.p, a.s))
      .slice(0, count);
    for (const { p, s } of cands) {
      p.awards.push(`S${season} All-League`);
      allLeague.push({ pos, playerId: p.id, playerName: playerName(p), teamAbbr: s.teamAbbr });
    }
  }

  // record book
  const records: { label: string; value: (s: SeasonStats) => number }[] = [
    { label: 'Passing Yards', value: (s) => s.passYds },
    { label: 'Passing TDs', value: (s) => s.passTd },
    { label: 'Rushing Yards', value: (s) => s.rushYds },
    { label: 'Rushing TDs', value: (s) => s.rushTd },
    { label: 'Receiving Yards', value: (s) => s.recYds },
    { label: 'Receptions', value: (s) => s.rec },
    { label: 'Receiving TDs', value: (s) => s.recTd },
    { label: 'Sacks', value: (s) => s.sacks },
    { label: 'Interceptions', value: (s) => s.defInt },
    { label: 'Field Goals Made', value: (s) => s.fgm },
  ];
  for (const p of Object.values(league.players)) {
    const s = seasonLine(p, season);
    if (!s) continue;
    for (const rec of records) {
      const v = rec.value(s);
      if (v <= 0) continue;
      const cur = league.recordBook.singleSeason[rec.label];
      if (!cur || v > cur.value) {
        league.recordBook.singleSeason[rec.label] = {
          value: v,
          playerName: playerName(p),
          season,
          teamAbbr: s.teamAbbr,
        };
      }
    }
  }

  // history entry
  const champId = championId(league);
  const champGame = league.schedule.find((g) => g.tag === 'CHAMP' && g.played);
  const runnerUpId = champGame
    ? champGame.homeId === champId
      ? champGame.awayId
      : champGame.homeId
    : -1;
  league.history.push({
    season,
    championTeamId: champId ?? -1,
    championName: champId != null ? teamName(league.teams[champId]) : '—',
    runnerUpName: runnerUpId >= 0 ? teamName(league.teams[runnerUpId]) : '—',
    awards,
    allLeague,
  });
  const mvp = awards.find((a) => a.award === 'MVP');
  if (mvp) league.news.unshift(`${mvp.playerName} (${mvp.teamAbbr}) named Season ${season} MVP — ${mvp.detail}.`);
}
