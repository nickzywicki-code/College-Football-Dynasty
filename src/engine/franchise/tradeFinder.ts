// Trade finder: auto-build realistic, acceptable trades.
//  - packageToAcquire: what would it cost ME to land a target player?
//  - findReturnsForPlayer: which teams would deal for MY player, and for what?
// Both lean on the same value model + AI acceptance logic as manual trades.

import type { DraftPickAsset, League, TradeOffer } from '../types';
import { evaluateTrade, playerTradeValue, pickTradeValue, TradeEvaluation } from './trades';

export interface FoundTrade {
  offer: TradeOffer;
  evaluation: TradeEvaluation;
  /** total trade value the USER receives in this deal */
  returnValue: number;
  /** total trade value the USER gives up */
  costValue: number;
}

type Asset =
  | { kind: 'player'; id: number; value: number }
  | { kind: 'pick'; pick: DraftPickAsset; value: number };

function myAssets(league: League, teamId: number, excludePlayer?: number): Asset[] {
  const t = league.teams[teamId];
  const players: Asset[] = t.playerIds
    .filter((id) => id !== excludePlayer && league.players[id])
    .map((id) => ({ kind: 'player' as const, id, value: playerTradeValue(league.players[id]) }));
  const picks: Asset[] = t.draftPicks.map((pick) => ({
    kind: 'pick' as const,
    pick,
    value: pickTradeValue(league, pick),
  }));
  return [...players, ...picks];
}

function split(assets: Asset[]): { players: number[]; picks: DraftPickAsset[] } {
  return {
    players: assets.filter((a): a is Extract<Asset, { kind: 'player' }> => a.kind === 'player').map((a) => a.id),
    picks: assets.filter((a): a is Extract<Asset, { kind: 'pick' }> => a.kind === 'pick').map((a) => a.pick),
  };
}

const totalValue = (assets: Asset[]) => assets.reduce((s, a) => s + a.value, 0);

/**
 * Build the cheapest package of MY assets that lands the target player from his
 * team. Returns null if my whole roster + picks still can't get it done.
 */
export function packageToAcquire(
  league: League,
  myTeamId: number,
  targetPlayerId: number,
): FoundTrade | null {
  const target = league.players[targetPlayerId];
  if (!target || target.teamId < 0 || target.teamId === myTeamId) return null;
  const partnerId = target.teamId;

  const build = (out: Asset[]): { offer: TradeOffer; evaluation: TradeEvaluation } => {
    const s = split(out);
    const offer: TradeOffer = {
      fromTeamId: myTeamId,
      toTeamId: partnerId,
      playersOut: s.players,
      picksOut: s.picks,
      playersIn: [targetPlayerId],
      picksIn: [],
    };
    return { offer, evaluation: evaluateTrade(league, offer) };
  };

  // greedily add my best assets until the partner accepts
  const pool = myAssets(league, myTeamId).sort((a, b) => b.value - a.value);
  const selected: Asset[] = [];
  let res = build(selected);
  for (const a of pool) {
    if (res.evaluation.accepted) break;
    selected.push(a);
    res = build(selected);
  }
  if (!res.evaluation.accepted) return null;

  // trim overpay: drop the smallest assets that aren't needed for acceptance
  selected.sort((a, b) => a.value - b.value);
  for (const a of [...selected]) {
    const trial = selected.filter((x) => x !== a);
    const r = build(trial);
    if (r.evaluation.accepted) {
      selected.splice(selected.indexOf(a), 1);
      res = r;
    }
  }

  return {
    offer: res.offer,
    evaluation: res.evaluation,
    returnValue: playerTradeValue(target),
    costValue: totalValue(selected),
  };
}

/**
 * For a player I'm shopping, find the best acceptable return from every other
 * team, ranked by what I get back. Empty list = no team bites.
 */
export function findReturnsForPlayer(
  league: League,
  myTeamId: number,
  myPlayerId: number,
  limit = 8,
): FoundTrade[] {
  const mine = league.players[myPlayerId];
  if (!mine || mine.teamId !== myTeamId) return [];
  const found: FoundTrade[] = [];

  for (const partner of league.teams) {
    if (partner.id === myTeamId) continue;
    const build = (inn: Asset[]): { offer: TradeOffer; evaluation: TradeEvaluation } => {
      const s = split(inn);
      const offer: TradeOffer = {
        fromTeamId: myTeamId,
        toTeamId: partner.id,
        playersOut: [myPlayerId],
        picksOut: [],
        playersIn: s.players,
        picksIn: s.picks,
      };
      return { offer, evaluation: evaluateTrade(league, offer) };
    };

    // greedily pull the most valuable assets the partner will still part with
    // (start empty and add while the deal stays acceptable to them)
    const pool = myAssets(league, partner.id).sort((a, b) => b.value - a.value);
    const got: Asset[] = [];
    for (const a of pool) {
      const trial = [...got, a];
      if (build(trial).evaluation.accepted) got.push(a);
    }
    if (got.length === 0) continue; // nothing they'd give makes a fair deal
    const res = build(got);
    found.push({
      offer: res.offer,
      evaluation: res.evaluation,
      returnValue: totalValue(got),
      costValue: playerTradeValue(mine),
    });
  }

  return found.sort((a, b) => b.returnValue - a.returnValue).slice(0, limit);
}
