// In-draft pick trading: move up for a target, or trade back for extra picks.
// Operates on the live draft.order slots (not the season pick assets).

import type { League } from '../types';

export interface PickRef {
  index: number; // position in draft.order (0-based) == overall pick - 1
  round: number;
  pick: number;
  teamId: number;
}

export interface DraftTradeOffer {
  partnerId: number;
  giveIndices: number[]; // user's slots handed to the partner
  getIndices: number[]; // partner's slots the user receives
  summary: { give: string; get: string };
}

/** Standard draft value chart (approx. Jimmy-Johnson shape) by overall pick. */
export function pickValue(overallPick: number): number {
  if (overallPick <= 0) return 0;
  return Math.max(1, Math.round(3000 * Math.pow(0.955, overallPick - 1)) + Math.max(0, 40 - overallPick));
}

function label(p: PickRef): string {
  return `R${p.round} P${p.pick}`;
}

/** Upcoming (unmade) picks, in order. */
export function upcomingPicks(league: League): PickRef[] {
  const d = league.draft;
  if (!d) return [];
  const out: PickRef[] = [];
  for (let i = d.currentPickIndex; i < d.order.length; i++) {
    const s = d.order[i];
    if (s.selectedPlayerId == null) out.push({ index: i, round: s.round, pick: s.pick, teamId: s.teamId });
  }
  return out;
}

const val = (p: PickRef) => pickValue(p.index + 1);

/**
 * Offers where the user moves UP to an earlier pick owned by another team,
 * paying with their own upcoming picks (plus a move-up premium).
 */
export function findTradeUpOffers(league: League, limit = 6): DraftTradeOffer[] {
  const up = upcomingPicks(league);
  const mine = up.filter((p) => p.teamId === league.userTeamId).sort((a, b) => a.index - b.index);
  if (mine.length === 0) return [];
  const myNext = mine[0];
  const offers: DraftTradeOffer[] = [];
  // candidate targets: picks ahead of my next pick, within reach, owned by others
  const targets = up.filter((p) => p.teamId !== league.userTeamId && p.index < myNext.index).slice(-24);
  for (const target of targets) {
    const need = val(target) * 1.08; // premium to move up
    // greedily add my picks (best first) until I meet the price
    const pool = [...mine].sort((a, b) => val(b) - val(a));
    const give: PickRef[] = [];
    let sum = 0;
    for (const p of pool) {
      if (sum >= need) break;
      give.push(p);
      sum += val(p);
    }
    if (sum < need || give.length === 0) continue;
    // trim overpay
    give.sort((a, b) => val(a) - val(b));
    for (const p of [...give]) {
      if (sum - val(p) >= need) { sum -= val(p); give.splice(give.indexOf(p), 1); }
    }
    offers.push({
      partnerId: target.teamId,
      giveIndices: give.map((p) => p.index),
      getIndices: [target.index],
      summary: { give: give.map(label).join(' + '), get: label(target) },
    });
  }
  // rank by how far up you move (smallest target index first)
  return offers.sort((a, b) => a.getIndices[0] - b.getIndices[0]).slice(0, limit);
}

/**
 * Offers where the user trades BACK: give up their next pick for a later pick
 * from another team PLUS an extra pick (more total capital).
 */
export function findTradeBackOffers(league: League, limit = 6): DraftTradeOffer[] {
  const up = upcomingPicks(league);
  const mine = up.filter((p) => p.teamId === league.userTeamId).sort((a, b) => a.index - b.index);
  if (mine.length === 0) return [];
  const myNext = mine[0];
  const offers: DraftTradeOffer[] = [];
  const target = val(myNext); // value the partner must roughly match to move up
  // partners: teams with a later pick who also have a spare pick to add
  const byTeam = new Map<number, PickRef[]>();
  for (const p of up) {
    if (p.teamId === league.userTeamId || p.index <= myNext.index) continue;
    if (!byTeam.has(p.teamId)) byTeam.set(p.teamId, []);
    byTeam.get(p.teamId)!.push(p);
  }
  for (const [teamId, picks] of byTeam) {
    picks.sort((a, b) => a.index - b.index);
    const primary = picks[0]; // the later pick they send back
    // find the smallest extra pick that makes their package fair (>= my pick value)
    let best: { get: PickRef[]; sum: number } | null = null;
    for (let j = 1; j < picks.length; j++) {
      const extra = picks[j];
      const sum = val(primary) + val(extra);
      if (sum >= target * 0.98) { best = { get: [primary, extra], sum }; break; }
    }
    // if their single later pick already ~matches, just swap (rare)
    if (!best && val(primary) >= target * 1.02) best = { get: [primary], sum: val(primary) };
    if (!best) continue;
    offers.push({
      partnerId: teamId,
      giveIndices: [myNext.index],
      getIndices: best.get.map((p) => p.index),
      summary: { give: label(myNext), get: best.get.map(label).join(' + ') },
    });
  }
  // rank by total capital gained (most picks / value first)
  return offers
    .sort((a, b) => b.getIndices.length - a.getIndices.length)
    .slice(0, limit);
}

/** Reassign the traded slots. Does not change pick order, only ownership. */
export function executeDraftTrade(league: League, offer: DraftTradeOffer): void {
  const d = league.draft;
  if (!d) return;
  for (const i of offer.giveIndices) d.order[i].teamId = offer.partnerId;
  for (const i of offer.getIndices) d.order[i].teamId = league.userTeamId;
  const partner = league.teams[offer.partnerId];
  league.news.unshift(`DRAFT TRADE: ${league.teams[league.userTeamId].abbr} ↔ ${partner.abbr} swap picks.`);
}
