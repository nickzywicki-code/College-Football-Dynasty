// Offseason player development, aging, and retirement.

import { Rand } from '../rng';
import { agingDelta, applyDevelopment, retirementChance } from '../player';
import { autoDepthChart } from '../league';
import type { League, Player } from '../types';
import { playerName } from '../types';

export interface ProgressionReport {
  risers: { player: Player; delta: number }[];
  fallers: { player: Player; delta: number }[];
  retirements: Player[];
}

/** Age every player one year, develop/decline attributes, retire the old guard. */
export function runProgressionAndRetirements(league: League, r: Rand): ProgressionReport {
  const risers: { player: Player; delta: number }[] = [];
  const fallers: { player: Player; delta: number }[] = [];
  const retirements: Player[] = [];

  for (const p of Object.values(league.players)) {
    if (p.retired) continue;
    p.age++;
    p.yearsPro++;
    p.injuryWeeks = 0;

    if (r.chance(retirementChance(p))) {
      p.retired = true;
      if (p.teamId >= 0) {
        const team = league.teams[p.teamId];
        team.playerIds = team.playerIds.filter((id) => id !== p.id);
      }
      p.teamId = -1;
      p.contract = null;
      retirements.push(p);
      continue;
    }

    const before = p.overall;
    applyDevelopment(r, p, agingDelta(r, p));
    const delta = p.overall - before;
    if (delta >= 3) risers.push({ player: p, delta });
    else if (delta <= -3) fallers.push({ player: p, delta });
  }

  for (const team of league.teams) autoDepthChart(team, league.players);

  risers.sort((a, b) => b.delta - a.delta);
  fallers.sort((a, b) => a.delta - b.delta);
  retirements.sort((a, b) => b.overall - a.overall);

  // news: notable retirements and breakouts
  for (const p of retirements.slice(0, 5)) {
    if (p.overall >= 72 || p.awards.length > 0) {
      league.news.unshift(`${p.pos} ${playerName(p)} retires after ${p.yearsPro} pro seasons.`);
    }
  }
  for (const { player, delta } of risers.slice(0, 3)) {
    league.news.unshift(`Breakout: ${player.pos} ${playerName(player)} jumps ${delta} OVR in the offseason.`);
  }
  return { risers, fallers, retirements };
}
