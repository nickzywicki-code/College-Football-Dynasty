import { describe, expect, it } from 'vitest';
import { generateLeague } from '../league';
import { evaluateTrade } from './trades';
import { packageToAcquire, findReturnsForPlayer } from './tradeFinder';

describe('trade finder', () => {
  it('builds an acceptable package to acquire a target player', () => {
    const league = generateLeague(1234, 3);
    const myId = league.userTeamId;
    // pick a strong player on another team to target
    const other = league.teams.find((t) => t.id !== myId)!;
    const target = other.playerIds
      .map((id) => league.players[id])
      .sort((a, b) => b.overall - a.overall)[0];

    const found = packageToAcquire(league, myId, target.id);
    expect(found).not.toBeNull();
    if (found) {
      // the offer the finder returns must actually be accepted by the AI
      expect(evaluateTrade(league, found.offer).accepted).toBe(true);
      expect(found.offer.playersIn).toContain(target.id);
      // and it must not include the target from my own roster
      expect(found.offer.playersOut).not.toContain(target.id);
    }
  });

  it('finds acceptable returns when shopping a star, and each is valid', () => {
    const league = generateLeague(4321, 3);
    const myId = league.userTeamId;
    const myStar = league.teams[myId].playerIds
      .map((id) => league.players[id])
      .sort((a, b) => b.overall - a.overall)[0];

    const returns = findReturnsForPlayer(league, myId, myStar.id);
    expect(returns.length).toBeGreaterThan(0);
    // ranked by what I get back (descending)
    for (let i = 1; i < returns.length; i++) {
      expect(returns[i - 1].returnValue).toBeGreaterThanOrEqual(returns[i].returnValue);
    }
    // every suggested deal is genuinely accepted and gives me real assets
    for (const ft of returns) {
      expect(evaluateTrade(league, ft.offer).accepted).toBe(true);
      expect(ft.offer.playersOut).toEqual([myStar.id]);
      expect(ft.offer.playersIn.length + ft.offer.picksIn.length).toBeGreaterThan(0);
    }
  });
});
