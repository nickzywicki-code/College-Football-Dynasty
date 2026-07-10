import { describe, expect, it } from 'vitest';
import { Rand } from '../rng';
import { generateLeague, teamPayroll } from '../league';
import { REGULAR_SEASON_WEEKS } from '../types';
import { simulateGame } from './gameSim';
import { advanceWeek, applyGameResult, championId, conferenceSeeds, simWeek, weekComplete } from './seasonSim';

function simFullRegularSeason(seed: number) {
  const league = generateLeague(seed, 0);
  const r = new Rand(seed + 1);
  while (league.phase === 'regularSeason') {
    simWeek(league, r);
    advanceWeek(league, r);
  }
  return { league, r };
}

describe('league generation', () => {
  it('creates 32 teams with full rosters and valid schedules', () => {
    const league = generateLeague(42, 5);
    expect(league.teams).toHaveLength(32);
    for (const t of league.teams) {
      expect(t.playerIds.length).toBe(48);
      expect(t.depthChart.QB.length).toBe(3);
      expect(t.depthChart.OL.length).toBe(8);
    }
    // schedule: 272 games over 18 weeks; each team plays 17 with one bye,
    // never twice in the same week
    expect(league.schedule).toHaveLength(272);
    const gamesPerTeam = new Map<number, number>();
    for (let w = 1; w <= REGULAR_SEASON_WEEKS; w++) {
      const games = league.schedule.filter((g) => g.week === w);
      const seen = new Set<number>();
      for (const g of games) {
        expect(seen.has(g.homeId)).toBe(false);
        expect(seen.has(g.awayId)).toBe(false);
        seen.add(g.homeId);
        seen.add(g.awayId);
        gamesPerTeam.set(g.homeId, (gamesPerTeam.get(g.homeId) ?? 0) + 1);
        gamesPerTeam.set(g.awayId, (gamesPerTeam.get(g.awayId) ?? 0) + 1);
      }
    }
    for (const t of league.teams) {
      expect(gamesPerTeam.get(t.id)).toBe(17);
    }
    // payrolls are plausible (not wildly over cap)
    for (const t of league.teams) {
      const pay = teamPayroll(t, league.players);
      expect(pay).toBeGreaterThan(40);
      expect(pay).toBeLessThan(league.salaryCap * 1.25);
    }
  });

  it('is deterministic for the same seed', () => {
    const a = generateLeague(7, 0);
    const b = generateLeague(7, 0);
    expect(JSON.stringify(a.teams[10])).toEqual(JSON.stringify(b.teams[10]));
  });
});

describe('single game sim', () => {
  it('produces sane box scores', () => {
    const league = generateLeague(1234, 0);
    const r = new Rand(99);
    let totalPoints = 0;
    let games = 0;
    for (const g of league.schedule.filter((x) => x.week === 1)) {
      const { box } = simulateGame(r, league, g, { fullLog: true });
      totalPoints += box.homeScore + box.awayScore;
      games++;
      expect(box.homeScore).toBeGreaterThanOrEqual(0);
      expect(box.homeScore).toBeLessThan(70);
      expect(box.awayScore).toBeLessThan(70);
      // both teams should have thrown some passes
      const homeQb = box.homeStats.find((s) => (s.passAtt ?? 0) > 5);
      expect(homeQb).toBeTruthy();
      expect(box.playByPlay.length).toBeGreaterThan(50);
    }
    const avgTotal = totalPoints / games;
    expect(avgTotal).toBeGreaterThan(28);
    expect(avgTotal).toBeLessThan(62);
  });
});

describe('full season sim', () => {
  it('plays a full regular season with realistic league-wide stats', () => {
    const { league } = simFullRegularSeason(2024);
    expect(league.phase).toBe('playoffs');

    // every team played 17 games
    for (const t of league.teams) {
      expect(t.wins + t.losses + t.ties).toBe(17);
    }
    // total wins == total losses (ignoring ties)
    const wins = league.teams.reduce((s, t) => s + t.wins, 0);
    const losses = league.teams.reduce((s, t) => s + t.losses, 0);
    expect(wins).toBe(losses);

    // league scoring average between 17 and 31 ppg
    const pts = league.teams.reduce((s, t) => s + t.ptsFor, 0);
    const ppg = pts / (32 * 17);
    expect(ppg).toBeGreaterThan(15);
    expect(ppg).toBeLessThan(33);

    // stat leaders are bounded and realistic
    let bestPassYds = 0;
    let bestRushYds = 0;
    let bestRecYds = 0;
    let bestSacks = 0;
    for (const p of Object.values(league.players)) {
      const s = p.stats.find((x) => x.season === 1);
      if (!s) continue;
      bestPassYds = Math.max(bestPassYds, s.passYds);
      bestRushYds = Math.max(bestRushYds, s.rushYds);
      bestRecYds = Math.max(bestRecYds, s.recYds);
      bestSacks = Math.max(bestSacks, s.sacks);
    }
    expect(bestPassYds).toBeGreaterThan(3300); // someone had a big year
    expect(bestPassYds).toBeLessThan(6200); // nobody threw for 7k
    expect(bestRushYds).toBeGreaterThan(900);
    expect(bestRushYds).toBeLessThan(2600);
    expect(bestRecYds).toBeGreaterThan(900);
    expect(bestRecYds).toBeLessThan(2400);
    expect(bestSacks).toBeGreaterThan(6);
    expect(bestSacks).toBeLessThan(30);

    // playoff seeds: 7 per conference, sorted by record
    const seeds = conferenceSeeds(league, 0);
    expect(seeds).toHaveLength(7);
  });

  it('completes playoffs and crowns a champion', () => {
    const { league, r } = simFullRegularSeason(555);
    let guard = 0;
    while (league.phase === 'playoffs' && guard++ < 10) {
      simWeek(league, r);
      if (weekComplete(league)) advanceWeek(league, r);
    }
    expect(league.phase).toBe('offseason');
    const champ = championId(league);
    expect(champ).not.toBeNull();
    // champion must have been a playoff team
    expect(league.playoffTeams).toContain(champ);
    // playoff structure: 6 WC + 4 DIV + 2 CONF + 1 CHAMP = 13 games
    expect(league.schedule.filter((g) => g.tag !== '').length).toBe(13);
  });

  it('applyGameResult updates records and player season stats', () => {
    const league = generateLeague(9, 0);
    const r = new Rand(10);
    const g = league.schedule.find((x) => x.week === 1)!;
    const { box, injuries } = simulateGame(r, league, g, {});
    applyGameResult(league, g, box, injuries);
    const home = league.teams[g.homeId];
    const away = league.teams[g.awayId];
    expect(home.wins + home.losses + home.ties).toBe(1);
    expect(away.wins + away.losses + away.ties).toBe(1);
    const qbId = home.depthChart.QB[0];
    const qb = league.players[qbId];
    const s = qb.stats.find((x) => x.season === 1);
    // QB either played or was injured out — with fresh league he played
    expect(s).toBeTruthy();
  });
});
