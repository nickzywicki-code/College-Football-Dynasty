// Contracts and salary cap.

import { Rand } from '../rng';
import { marketSalary } from '../player';
import { autoDepthChart, teamPayroll } from '../league';
import type { League, Player, Team } from '../types';

export function capRoom(league: League, team: Team): number {
  return Math.round((league.salaryCap - teamPayroll(team, league.players)) * 10) / 10;
}

/** What a player wants per year to sign (slight premium over market). */
export function askingPrice(p: Player): number {
  return Math.round(marketSalary(p) * 1.05 * 10) / 10;
}

/** Preferred contract length given age (older players take shorter deals). */
export function preferredYears(r: Rand, p: Player): number {
  if (p.age >= 32) return 1;
  if (p.age >= 29) return r.int(1, 2);
  if (p.overall >= 80) return r.int(3, 5);
  return r.int(2, 3);
}

export function signPlayer(league: League, team: Team, p: Player, salary: number, years: number): void {
  p.teamId = team.id;
  p.contract = { salary: Math.round(salary * 10) / 10, yearsLeft: years };
  if (!team.playerIds.includes(p.id)) team.playerIds.push(p.id);
  autoDepthChart(team, league.players);
}

export function releasePlayer(league: League, team: Team, p: Player): void {
  team.playerIds = team.playerIds.filter((id) => id !== p.id);
  p.teamId = -1;
  p.contract = null;
  autoDepthChart(team, league.players);
}

/**
 * Whether a player accepts an offer of salary/years.
 * A little negotiating room; lowballs are rejected.
 */
export function offerAccepted(r: Rand, p: Player, salary: number, years: number, faDay = 1): boolean {
  const ask = askingPrice(p);
  // players get less picky as free agency drags on
  const discount = 1 - Math.min(0.2, (faDay - 1) * 0.035);
  let threshold = ask * discount;
  // long security discounts, one-year "prove it" costs extra
  if (years >= 3 && p.age < 30) threshold *= 0.95;
  if (years === 1 && p.overall > 72) threshold *= 1.1;
  const noise = r.range(0.96, 1.04);
  return salary * noise >= threshold;
}

/** Decrement contract years at season rollover; returns players hitting free agency. */
export function expireContracts(league: League): Player[] {
  const expiring: Player[] = [];
  for (const team of league.teams) {
    for (const pid of [...team.playerIds]) {
      const p = league.players[pid];
      if (!p || p.retired) continue;
      if (!p.contract) {
        expiring.push(p);
        continue;
      }
      p.contract.yearsLeft--;
      if (p.contract.yearsLeft <= 0) {
        team.playerIds = team.playerIds.filter((id) => id !== p.id);
        p.teamId = -1;
        p.contract = null;
        expiring.push(p);
      }
    }
    autoDepthChart(team, league.players);
  }
  return expiring;
}
