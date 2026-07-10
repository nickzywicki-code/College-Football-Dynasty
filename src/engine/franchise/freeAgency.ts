// Free agency: pool building, AI signings day by day, user offers.

import { Rand } from '../rng';
import { askingPrice, capRoom, offerAccepted, preferredYears, signPlayer } from './contracts';
import { positionNeed } from './draft';
import { ROSTER_COMPOSITION } from '../league';
import type { League, Player, Position, Team } from '../types';
import { FA_DAYS, ROSTER_SIZE, playerName } from '../types';

export function freeAgents(league: League): Player[] {
  return Object.values(league.players)
    .filter((p) => !p.retired && p.teamId === -1)
    .sort((a, b) => b.overall - a.overall);
}

export function startFreeAgency(league: League): void {
  league.freeAgency = { day: 1, complete: false, log: [] };
}

function rosterCount(league: League, team: Team, pos?: Position): number {
  return team.playerIds.filter((id) => {
    const p = league.players[id];
    return p && !p.retired && (!pos || p.pos === pos);
  }).length;
}

/** One AI team makes at most one signing this pass; returns true if it signed someone. */
function aiTrySign(league: League, r: Rand, team: Team, pool: Player[], day: number): boolean {
  if (rosterCount(league, team) >= ROSTER_SIZE) return false;
  const room = capRoom(league, team);
  // find the position we need most
  const needs = (Object.keys(ROSTER_COMPOSITION) as Position[])
    .map((pos) => ({ pos, need: positionNeed(league, team, pos) }))
    .sort((a, b) => b.need - a.need);
  for (const { pos, need } of needs) {
    if (need <= 0.4 && rosterCount(league, team) >= ROSTER_SIZE - 4) continue;
    const cands = pool.filter((p) => p.pos === pos).slice(0, 5);
    for (const p of cands) {
      const price = askingPrice(p);
      // AI discipline: don't blow the cap; deprioritize stars early unless rich
      if (price > room) continue;
      // early days only the aggressive/needy teams sign stars
      if (day <= 2 && p.overall >= 78 && !r.chance(0.4 + need * 0.1)) continue;
      if (!r.chance(0.75)) continue;
      const years = preferredYears(r, p);
      signPlayer(league, team, p, price, years);
      const msg = `${team.abbr} sign ${p.pos} ${playerName(p)} (${p.overall} OVR) — $${price}M x ${years}yr`;
      league.freeAgency!.log.unshift(msg);
      if (p.overall >= 80) league.news.unshift(msg);
      return true;
    }
  }
  return false;
}

/**
 * Advance one FA day: every AI team gets a few signing chances.
 * Cheap depth signings accelerate in later days.
 */
export function advanceFreeAgencyDay(league: League, r: Rand): void {
  const fa = league.freeAgency;
  if (!fa || fa.complete) return;
  const teams = r.shuffle(league.teams.filter((t) => t.id !== league.userTeamId));
  const passes = fa.day <= 2 ? 1 : fa.day <= 4 ? 2 : 4;
  for (let pass = 0; pass < passes; pass++) {
    const pool = freeAgents(league);
    for (const team of teams) {
      aiTrySign(league, r, team, pool, fa.day);
    }
  }
  fa.day++;
  if (fa.day > FA_DAYS) {
    finishFreeAgency(league, r);
  }
}

/** User makes an offer to a free agent. Returns whether it was accepted. */
export function userOffer(league: League, r: Rand, p: Player, salary: number, years: number): boolean {
  const team = league.teams[league.userTeamId];
  if (p.teamId !== -1 || p.retired) return false;
  if (rosterCount(league, team) >= ROSTER_SIZE + 5) return false; // hard stop way over roster
  if (salary > capRoom(league, team)) return false;
  const day = league.freeAgency?.day ?? 1;
  if (!offerAccepted(r, p, salary, years, day)) return false;
  signPlayer(league, team, p, salary, years);
  const msg = `You sign ${p.pos} ${playerName(p)} (${p.overall} OVR) — $${salary}M x ${years}yr`;
  league.freeAgency?.log.unshift(msg);
  league.news.unshift(msg);
  return true;
}

/** Fill any AI roster holes with minimum-salary depth and close the period. */
export function finishFreeAgency(league: League, r: Rand): void {
  const fa = league.freeAgency;
  if (!fa) return;
  for (const team of league.teams) {
    if (team.id === league.userTeamId) continue;
    // ensure minimum bodies at each position — cheapest viable body, min salary
    for (const pos of Object.keys(ROSTER_COMPOSITION) as Position[]) {
      const minAt = Math.max(1, Math.ceil(ROSTER_COMPOSITION[pos] * 0.6));
      let have = rosterCount(league, team, pos);
      while (have < minAt) {
        const pool = freeAgents(league).filter((p) => p.pos === pos);
        const p = pool[pool.length - 1]; // worst (cheapest) available
        if (!p) break;
        signPlayer(league, team, p, Math.min(askingPrice(p), 1.2), 1);
        have++;
      }
    }
    // top up to a playable roster size with cheap depth, cap-aware
    while (rosterCount(league, team) < ROSTER_SIZE - 6) {
      const pool = freeAgents(league).filter((p) => askingPrice(p) <= Math.max(1.2, capRoom(league, team)));
      const p = pool[pool.length - 1];
      if (!p) break;
      signPlayer(league, team, p, Math.min(askingPrice(p), 1.2), 1);
    }
  }
  fa.complete = true;
  fa.day = FA_DAYS + 1;
  void r;
}
