// Rookie draft: class generation, scouting fog, order, AI picking.

import { Rand } from '../rng';
import { generatePlayer } from '../player';
import { autoDepthChart, ROSTER_COMPOSITION, STARTER_COUNTS } from '../league';
import { compareTeams } from '../sim/seasonSim';
import type { DraftState, League, Player, Position, Team } from '../types';
import { playerName } from '../types';

const ROUNDS = 7;

const CLASS_POSITION_MIX: { pos: Position; weight: number }[] = [
  { pos: 'QB', weight: 8 },
  { pos: 'RB', weight: 10 },
  { pos: 'WR', weight: 15 },
  { pos: 'TE', weight: 7 },
  { pos: 'OL', weight: 17 },
  { pos: 'DL', weight: 15 },
  { pos: 'LB', weight: 12 },
  { pos: 'CB', weight: 10 },
  { pos: 'S', weight: 7 },
  { pos: 'K', weight: 1.6 },
  { pos: 'P', weight: 1.4 },
];

function potentialGrade(pot: number): 'A' | 'B' | 'C' | 'D' {
  if (pot >= 85) return 'A';
  if (pot >= 76) return 'B';
  if (pot >= 66) return 'C';
  return 'D';
}

/** Draft order: worst record first; champion picks last. */
export function draftOrder(league: League): Team[] {
  const champGame = league.schedule.find((g) => g.tag === 'CHAMP' && g.played);
  const champId = champGame
    ? champGame.homeScore > champGame.awayScore
      ? champGame.homeId
      : champGame.awayId
    : -1;
  const runnerUpId = champGame
    ? champGame.homeScore > champGame.awayScore
      ? champGame.awayId
      : champGame.homeId
    : -1;
  const rest = league.teams
    .filter((t) => t.id !== champId && t.id !== runnerUpId)
    .sort((a, b) => -compareTeams(league, a, b)); // worst first
  const order = [...rest];
  if (runnerUpId >= 0) order.push(league.teams[runnerUpId]);
  if (champId >= 0) order.push(league.teams[champId]);
  return order;
}

/** Create the draft class + pick order. Uses picks with season === league.season. */
export function createDraft(league: League, r: Rand): void {
  // ~230 prospects, quality loosely tiered so early picks are better
  const classSize = ROUNDS * 32 + r.int(6, 14);
  const prospects: DraftState['prospects'] = [];
  const positions = CLASS_POSITION_MIX.map((x) => x.pos);
  const weights = CLASS_POSITION_MIX.map((x) => x.weight);
  for (let i = 0; i < classSize; i++) {
    const pos = r.weighted(positions, weights);
    const tier = i / classSize; // 0 = top of class
    const quality = r.gaussClamp(74 - tier * 26, 5, 38, 92);
    const p = generatePlayer(r, league.nextPlayerId++, {
      pos,
      age: r.weighted([21, 22, 23], [30, 50, 20]),
      quality,
      teamId: -1,
    });
    p.yearsPro = 0;
    // rookies have more runway: bump potential
    p.potential = Math.min(99, Math.max(p.potential, p.overall + Math.round(Math.max(0, r.gauss(10, 7)))));
    league.players[p.id] = p;
    const fog = r.int(3, 9);
    prospects.push({
      playerId: p.id,
      scoutedOvr: [Math.max(20, p.overall - fog), Math.min(99, p.overall + fog)],
      scoutedPot: potentialGrade(p.potential),
      drafted: false,
    });
  }
  // sort prospect board by scouted midpoint (what everyone's big board shows)
  prospects.sort(
    (a, b) => (b.scoutedOvr[0] + b.scoutedOvr[1]) / 2 - (a.scoutedOvr[0] + a.scoutedOvr[1]) / 2,
  );

  const baseOrder = draftOrder(league);
  const order: DraftState['order'] = [];
  for (let round = 1; round <= ROUNDS; round++) {
    baseOrder.forEach((slotTeam, i) => {
      // the pick belongs to whoever holds the asset (may have been traded)
      const owner = league.teams.find((t) =>
        t.draftPicks.some(
          (pk) => pk.season === league.season && pk.round === round && pk.originalTeamId === slotTeam.id,
        ),
      );
      order.push({
        round,
        pick: i + 1,
        teamId: (owner ?? slotTeam).id,
        selectedPlayerId: null,
      });
    });
  }
  league.draft = { prospects, order, currentPickIndex: 0, complete: false };
}

/** How badly a team needs a position (0 = stacked, higher = desperate). */
export function positionNeed(league: League, team: Team, pos: Position): number {
  const starters = STARTER_COUNTS[pos];
  const have = team.playerIds
    .map((id) => league.players[id])
    .filter((p) => p && !p.retired && p.pos === pos)
    .sort((a, b) => b.overall - a.overall);
  if (have.length < starters) return 3 + (starters - have.length);
  const starterQuality = have.slice(0, starters).reduce((s, p) => s + p.overall, 0) / starters;
  const depthShort = Math.max(0, ROSTER_COMPOSITION[pos] - 1 - have.length) * 0.4;
  return Math.max(0, (78 - starterQuality) / 10) + depthShort;
}

/** AI makes the current pick. Returns the drafted player. */
export function aiMakePick(league: League, r: Rand): Player | null {
  const draft = league.draft;
  if (!draft || draft.complete) return null;
  const slot = draft.order[draft.currentPickIndex];
  const team = league.teams[slot.teamId];
  // consider top of the remaining board, blend talent + need + potential
  const available = draft.prospects.filter((pr) => !pr.drafted).slice(0, 22);
  let best = available[0];
  let bestScore = -Infinity;
  for (const pr of available) {
    const p = league.players[pr.playerId];
    const mid = (pr.scoutedOvr[0] + pr.scoutedOvr[1]) / 2;
    const potBonus = { A: 6, B: 3, C: 0, D: -2 }[pr.scoutedPot];
    const need = positionNeed(league, team, p.pos);
    const posDiscount = p.pos === 'K' || p.pos === 'P' ? -14 : 0;
    const score = mid + potBonus + need * 2.6 + posDiscount + r.gauss(0, 2);
    if (score > bestScore) {
      bestScore = score;
      best = pr;
    }
  }
  return executePick(league, best.playerId);
}

/** Assign a prospect to the team currently on the clock. */
export function executePick(league: League, playerId: number): Player {
  const draft = league.draft!;
  const slot = draft.order[draft.currentPickIndex];
  const team = league.teams[slot.teamId];
  const prospect = draft.prospects.find((pr) => pr.playerId === playerId)!;
  const p = league.players[playerId];

  prospect.drafted = true;
  slot.selectedPlayerId = playerId;
  p.teamId = team.id;
  p.draftInfo = { season: league.season, round: slot.round, pick: slot.pick };
  // rookie scale: round 1 rich, late rounds cheap
  const scale = [0, 6.5, 3.2, 1.9, 1.3, 1.05, 0.9, 0.8][slot.round] ?? 0.8;
  const slotFactor = slot.round === 1 ? 1 + (16 - Math.min(slot.pick, 32)) * 0.045 : 1;
  p.contract = { salary: Math.round(scale * slotFactor * 10) / 10, yearsLeft: 4 };
  team.playerIds.push(p.id);
  autoDepthChart(team, league.players);

  draft.currentPickIndex++;
  if (draft.currentPickIndex >= draft.order.length) {
    draft.complete = true;
  }
  if (slot.round === 1) {
    league.news.unshift(
      `Draft R1 P${slot.pick}: ${team.abbr} select ${p.pos} ${playerName(p)}.`,
    );
  }
  return p;
}

/** Run AI picks until the user is on the clock (or the draft ends). */
export function runDraftUntilUserPick(league: League, r: Rand): void {
  const draft = league.draft;
  if (!draft) return;
  while (!draft.complete && draft.order[draft.currentPickIndex].teamId !== league.userTeamId) {
    aiMakePick(league, r);
  }
}

/** After the draft: grant every team its native picks two drafts out. */
export function grantFuturePicks(league: League): void {
  const futureSeason = league.season + 2;
  for (const team of league.teams) {
    // clear used picks from this season
    team.draftPicks = team.draftPicks.filter((pk) => pk.season > league.season);
    for (let round = 1; round <= ROUNDS; round++) {
      team.draftPicks.push({ season: futureSeason, round, originalTeamId: team.id });
    }
  }
}
