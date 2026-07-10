// Trades: value model, AI evaluation, execution.

import { autoDepthChart } from '../league';
import { positionNeed } from './draft';
import type { DraftPickAsset, League, Player, Team, TradeOffer } from '../types';
import { playerName } from '../types';

/** Trade value of a player: overall curve x age multiplier + potential upside. */
export function playerTradeValue(p: Player): number {
  // exponential-ish in overall: stars are worth far more than the sum of parts
  const o = p.overall;
  let base = Math.max(0, Math.pow(Math.max(0, o - 55), 2.1) * 0.55);
  // youth premium / age discount
  let ageMult: number;
  if (p.age <= 24) ageMult = 1.3;
  else if (p.age <= 27) ageMult = 1.1;
  else if (p.age <= 29) ageMult = 0.9;
  else if (p.age <= 31) ageMult = 0.65;
  else ageMult = 0.4;
  base *= ageMult;
  // upside for unrealized potential
  base += Math.max(0, p.potential - o) * (p.age <= 25 ? 9 : 3);
  // premium positions
  if (p.pos === 'QB') base *= 1.5;
  if (p.pos === 'K' || p.pos === 'P') base *= 0.4;
  // contract drag: expensive vets are slightly less attractive
  if (p.contract && p.contract.salary > 18 && p.age >= 29) base *= 0.85;
  return Math.round(base);
}

/** Value of a draft pick (round 1 early ≈ young star). */
export function pickTradeValue(league: League, pick: DraftPickAsset): number {
  const byRound = [0, 700, 320, 160, 85, 45, 25, 12];
  let v = byRound[pick.round] ?? 10;
  // future picks are discounted
  const yearsOut = pick.season - league.season;
  v *= Math.pow(0.85, Math.max(0, yearsOut));
  return Math.round(v);
}

export interface TradeEvaluation {
  accepted: boolean;
  aiGain: number; // positive = AI side wins the deal
  verdict: string;
}

function sideValue(league: League, forTeam: Team, playerIds: number[], picks: DraftPickAsset[]): number {
  let total = 0;
  for (const pid of playerIds) {
    const p = league.players[pid];
    if (!p) continue;
    let v = playerTradeValue(p);
    // receiving team values players at need positions more
    const need = positionNeed(league, forTeam, p.pos);
    v *= 1 + Math.min(0.25, need * 0.05);
    total += v;
  }
  for (const pick of picks) total += pickTradeValue(league, pick);
  return total;
}

/** Evaluate an offer from the AI team's perspective (offer.toTeamId is the AI). */
export function evaluateTrade(league: League, offer: TradeOffer): TradeEvaluation {
  const aiTeam = league.teams[offer.toTeamId];
  const receives = sideValue(league, aiTeam, offer.playersOut, offer.picksOut);
  const gives = sideValue(league, aiTeam, offer.playersIn, offer.picksIn);
  const aiGain = receives - gives;
  // AI needs a small premium to say yes; bigger deals need bigger premiums
  const threshold = Math.max(25, gives * 0.06);
  const accepted = aiGain >= threshold && offer.playersIn.length + offer.picksIn.length > 0;
  let verdict: string;
  if (accepted) verdict = 'Deal! We accept this trade.';
  else if (aiGain >= 0) verdict = 'Close, but we need a little more to make this work.';
  else if (aiGain > -threshold * 4) verdict = 'Not enough. Sweeten the offer significantly.';
  else verdict = "Insulting. We're not interested in anything like this.";
  return { accepted, aiGain, verdict };
}

function movePick(from: Team, to: Team, pick: DraftPickAsset): void {
  const idx = from.draftPicks.findIndex(
    (pk) => pk.season === pick.season && pk.round === pick.round && pk.originalTeamId === pick.originalTeamId,
  );
  if (idx >= 0) {
    from.draftPicks.splice(idx, 1);
    to.draftPicks.push(pick);
  }
}

/** Execute a trade (assumes already accepted/validated). */
export function executeTrade(league: League, offer: TradeOffer): string {
  const from = league.teams[offer.fromTeamId];
  const to = league.teams[offer.toTeamId];
  const names: string[] = [];
  for (const pid of offer.playersOut) {
    const p = league.players[pid];
    from.playerIds = from.playerIds.filter((id) => id !== pid);
    to.playerIds.push(pid);
    p.teamId = to.id;
    names.push(playerName(p));
  }
  for (const pid of offer.playersIn) {
    const p = league.players[pid];
    to.playerIds = to.playerIds.filter((id) => id !== pid);
    from.playerIds.push(pid);
    p.teamId = from.id;
    names.push(playerName(p));
  }
  for (const pick of offer.picksOut) movePick(from, to, pick);
  for (const pick of offer.picksIn) movePick(to, from, pick);
  autoDepthChart(from, league.players);
  autoDepthChart(to, league.players);
  const msg = `TRADE: ${from.abbr} and ${to.abbr} swap ${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}`;
  league.news.unshift(msg);
  return msg;
}
