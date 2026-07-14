import { describe, it, expect } from 'vitest';
import { generateLeague } from '../engine/league';
import { ArcadeGame } from './arcade';
import { OFFENSIVE_PLAYS } from './playbook';

describe('live clock', () => {
  it('counts down during the play, not just between plays', () => {
    const league = generateLeague(7, 3);
    const g: any = new ArcadeGame(league, league.schedule[0]);
    g.possession = 'user';
    g.startDrive(75);
    g.callPlay(OFFENSIVE_PLAYS.find((p) => p.id === 'slants')!);
    g.snap();
    const clockAtSnap = g.clock;
    // tick ~2 seconds of live play (hold the ball)
    for (let i = 0; i < 120; i++) g.tick(1 / 60);
    const clockMidPlay = g.clock;
    // the clock should have visibly ticked down during the live play
    expect(clockAtSnap - clockMidPlay).toBeGreaterThan(1.5);
  });
});
