import { describe, expect, it } from 'vitest';
import { Rand } from '../rng';
import { generateLeague } from '../league';
import { createDraft } from './draft';
import { findTradeUpOffers, findTradeBackOffers, executeDraftTrade, upcomingPicks } from './draftTrades';

function draftLeague() {
  const league = generateLeague(31, 5);
  createDraft(league, new Rand(99));
  // advance a few AI picks so the user isn't first on the clock
  league.draft!.currentPickIndex = 3;
  return league;
}

describe('in-draft pick trades', () => {
  it('offers trade-up and trade-back that reassign slots correctly', () => {
    const league = draftLeague();
    const up = findTradeUpOffers(league);
    const back = findTradeBackOffers(league);
    expect(up.length + back.length).toBeGreaterThan(0);

    if (back.length) {
      const o = back[0];
      const beforeMine = upcomingPicks(league).filter((p) => p.teamId === league.userTeamId).length;
      executeDraftTrade(league, o);
      const afterMine = upcomingPicks(league).filter((p) => p.teamId === league.userTeamId).length;
      // trading back nets more total picks
      expect(afterMine).toBeGreaterThanOrEqual(beforeMine);
      // the slots I received are now mine
      for (const i of o.getIndices) expect(league.draft!.order[i].teamId).toBe(league.userTeamId);
    }
  });

  it('trade-up costs picks to move to an earlier slot', () => {
    const league = draftLeague();
    const up = findTradeUpOffers(league);
    if (up.length) {
      const o = up[0];
      // target slot is earlier than what I gave up
      const targetIdx = o.getIndices[0];
      expect(Math.min(...o.giveIndices)).toBeGreaterThan(targetIdx);
      executeDraftTrade(league, o);
      expect(league.draft!.order[targetIdx].teamId).toBe(league.userTeamId);
      for (const i of o.giveIndices) expect(league.draft!.order[i].teamId).toBe(o.partnerId);
    }
  });
});
