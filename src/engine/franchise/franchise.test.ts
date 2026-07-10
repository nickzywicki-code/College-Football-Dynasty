import { describe, expect, it } from 'vitest';
import { Rand } from '../rng';
import { generateLeague, teamPayroll, ROSTER_COMPOSITION, STARTER_COUNTS } from '../league';
import type { Position } from '../types';
import { advanceWeek, simWeek, weekComplete } from '../sim/seasonSim';
import { beginOffseasonToDraft, finishDraftToFreeAgency, rolloverToNewSeason } from './offseason';
import { aiMakePick, runDraftUntilUserPick, executePick } from './draft';
import { advanceFreeAgencyDay, freeAgents, userOffer } from './freeAgency';
import { evaluateTrade, executeTrade, playerTradeValue } from './trades';
import { askingPrice } from './contracts';

function playSeasonToOffseason(league: ReturnType<typeof generateLeague>, r: Rand): void {
  let guard = 0;
  while (league.phase !== 'offseason' && guard++ < 40) {
    simWeek(league, r);
    if (weekComplete(league)) advanceWeek(league);
  }
  expect(league.phase).toBe('offseason');
}

describe('full franchise year loop', () => {
  it('runs season → awards → draft → free agency → season 2', () => {
    const league = generateLeague(777, 3);
    const r = new Rand(778);

    playSeasonToOffseason(league, r);

    // offseason: awards + progression + draft class
    const report = beginOffseasonToDraft(league, r);
    expect(league.phase).toBe('draft');
    expect(league.history).toHaveLength(1);
    expect(league.history[0].awards.length).toBeGreaterThanOrEqual(3);
    expect(league.history[0].allLeague.length).toBeGreaterThan(10);
    expect(report.retirements.length).toBeGreaterThan(0);
    expect(league.draft!.order.length).toBe(7 * 32);

    // user simulates picks: mix of auto (AI) and manual first pick
    runDraftUntilUserPick(league, r);
    if (!league.draft!.complete) {
      const best = league.draft!.prospects.find((p) => !p.drafted)!;
      executePick(league, best.playerId);
    }
    let guard = 0;
    while (!league.draft!.complete && guard++ < 300) {
      if (league.draft!.order[league.draft!.currentPickIndex].teamId === league.userTeamId) {
        const best = league.draft!.prospects.find((p) => !p.drafted)!;
        executePick(league, best.playerId);
      } else {
        aiMakePick(league, r);
      }
    }
    expect(league.draft!.complete).toBe(true);

    // every drafted rookie landed on a roster with a contract
    for (const slot of league.draft!.order) {
      expect(slot.selectedPlayerId).not.toBeNull();
      const p = league.players[slot.selectedPlayerId!];
      expect(p.teamId).toBe(slot.teamId);
      expect(p.contract).not.toBeNull();
    }

    finishDraftToFreeAgency(league);
    expect(league.phase).toBe('freeAgency');

    // user signs the best available FA they can afford
    const target = freeAgents(league).find((p) => askingPrice(p) < 20);
    if (target) {
      const ok = userOffer(league, r, target, askingPrice(target) * 1.2, 2);
      expect(ok).toBe(true);
      expect(target.teamId).toBe(league.userTeamId);
    }

    guard = 0;
    while (!league.freeAgency!.complete && guard++ < 12) {
      advanceFreeAgencyDay(league, r);
    }
    expect(league.freeAgency!.complete).toBe(true);

    // AI teams end FA cap-legal and with playable rosters
    for (const t of league.teams) {
      if (t.id === league.userTeamId) continue;
      // small overage tolerance: forced minimum-salary roster fills may nudge past cap
      expect(teamPayroll(t, league.players)).toBeLessThanOrEqual(league.salaryCap * 1.04);
      for (const pos of Object.keys(ROSTER_COMPOSITION) as Position[]) {
        const count = t.playerIds.filter((id) => league.players[id]?.pos === pos).length;
        expect(count).toBeGreaterThanOrEqual(Math.min(STARTER_COUNTS[pos], 1));
      }
    }

    rolloverToNewSeason(league, r);
    expect(league.season).toBe(2);
    expect(league.phase).toBe('regularSeason');
    expect(league.schedule.filter((g) => g.tag === '')).toHaveLength(272);
    expect(league.teams.every((t) => t.wins === 0 && t.losses === 0)).toBe(true);
    expect(league.teams[0].history).toHaveLength(1);

    // season 2 sims fine too (smoke)
    simWeek(league, r);
    expect(league.schedule.filter((g) => g.week === 1 && g.played).length).toBeGreaterThan(0);
  });

  it('trade evaluation is sane and trades execute', () => {
    const league = generateLeague(31, 0);
    const user = league.teams[0];
    const ai = league.teams[10];
    const userStar = user.playerIds
      .map((id) => league.players[id])
      .sort((a, b) => playerTradeValue(b) - playerTradeValue(a))[0];
    const aiScrub = ai.playerIds
      .map((id) => league.players[id])
      .sort((a, b) => playerTradeValue(a) - playerTradeValue(b))[0];

    // lopsided in AI favor → accepted
    const gift = {
      fromTeamId: 0,
      toTeamId: 10,
      playersOut: [userStar.id],
      picksOut: [],
      playersIn: [aiScrub.id],
      picksIn: [],
    };
    expect(evaluateTrade(league, gift).accepted).toBe(true);

    // reverse (user robs AI) → rejected
    const robbery = {
      fromTeamId: 0,
      toTeamId: 10,
      playersOut: [aiScrub.id],
      picksOut: [],
      playersIn: [userStar.id],
      picksIn: [],
    };
    // aiScrub isn't on user team, so evaluate only: values should reject
    expect(evaluateTrade(league, { ...robbery, playersOut: [], picksOut: [] }).accepted).toBe(false);

    executeTrade(league, gift);
    expect(league.players[userStar.id].teamId).toBe(10);
    expect(league.players[aiScrub.id].teamId).toBe(0);
    expect(user.playerIds).toContain(aiScrub.id);
    expect(ai.playerIds).toContain(userStar.id);
  });
});
