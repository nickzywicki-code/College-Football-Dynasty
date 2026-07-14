// Zustand app store: league state, navigation, engine action wrappers.

import { create } from 'zustand';
import { Rand, randomSeed } from '../engine/rng';
import { generateLeague } from '../engine/league';
import type { League } from '../engine/types';
import {
  advanceWeek,
  applyGameResult,
  simWeek,
  userGameForWeek,
  weekComplete,
} from '../engine/sim/seasonSim';
import { simulateGame } from '../engine/sim/gameSim';
import {
  beginOffseasonToDraft,
  finishDraftToFreeAgency,
  rolloverToNewSeason,
} from '../engine/franchise/offseason';
import { executePick, runDraftUntilUserPick, aiMakePick } from '../engine/franchise/draft';
import { advanceFreeAgencyDay, userOffer } from '../engine/franchise/freeAgency';
import { newCoachStaff } from '../engine/franchise/coaches';
import { executeDraftTrade, DraftTradeOffer } from '../engine/franchise/draftTrades';
import type { ProgressionReport } from '../engine/franchise/progression';
import { saveLeague } from './db';

export type Screen =
  | 'title'
  | 'newLeague'
  | 'hub'
  | 'roster'
  | 'player'
  | 'schedule'
  | 'standings'
  | 'stats'
  | 'boxscore'
  | 'draft'
  | 'freeAgency'
  | 'trade'
  | 'history'
  | 'coaches'
  | 'settings'
  | 'game'; // arcade

export interface NavEntry {
  screen: Screen;
  params?: { playerId?: number; gameId?: number; teamId?: number };
}

/** Non-deterministic runtime RNG for all user-driven league operations. */
export const runtimeRng = new Rand(randomSeed());

interface AppState {
  league: League | null;
  saveSlot: number;
  nav: NavEntry[];
  /** offseason recap data to show after progression runs */
  progressionReport: ProgressionReport | null;
  /** bump to force re-render after in-place league mutations */
  rev: number;

  navigate: (screen: Screen, params?: NavEntry['params']) => void;
  back: () => void;
  resetNav: (screen: Screen) => void;
  touch: () => void;

  newLeague: (teamId: number) => void;
  setLeague: (league: League, slot: number) => void;
  quitToTitle: () => void;
  persist: () => void;

  simRestOfWeek: (skipUserGame: boolean) => void;
  advance: () => void;
  simUserGame: () => void;

  continueOffseason: () => void;
  draftUntilUser: () => void;
  draftOnePick: () => void;
  makeUserPick: (playerId: number) => void;
  toggleWatch: (playerId: number) => void;
  draftPickTrade: (offer: DraftTradeOffer) => void;
  finishDraft: () => void;
  advanceFaDay: () => void;
  makeFaOffer: (playerId: number, salary: number, years: number) => boolean;
}

export const useStore = create<AppState>((set, get) => ({
  league: null,
  saveSlot: 1,
  nav: [{ screen: 'title' }],
  progressionReport: null,
  rev: 0,

  navigate: (screen, params) => set((s) => ({ nav: [...s.nav, { screen, params }] })),
  back: () => set((s) => ({ nav: s.nav.length > 1 ? s.nav.slice(0, -1) : s.nav })),
  resetNav: (screen) => set({ nav: [{ screen }] }),
  touch: () => set((s) => ({ rev: s.rev + 1 })),

  newLeague: (teamId) => {
    const league = generateLeague(randomSeed(), teamId);
    set({ league, nav: [{ screen: 'hub' }], progressionReport: null });
    get().persist();
  },

  setLeague: (league, slot) => {
    // backfill coaching staff for saves created before coaches existed
    for (const t of league.teams) if (!t.coaches) t.coaches = newCoachStaff(runtimeRng);
    set({ league, saveSlot: slot, nav: [{ screen: 'hub' }], progressionReport: null });
  },

  quitToTitle: () => {
    get().persist();
    set({ league: null, nav: [{ screen: 'title' }], progressionReport: null });
  },

  persist: () => {
    const { league, saveSlot } = get();
    if (league) void saveLeague(league, saveSlot);
  },

  /** Sim every non-user game this week (or all games if skipUserGame=false). */
  simRestOfWeek: (skipUserGame) => {
    const { league } = get();
    if (!league || (league.phase !== 'regularSeason' && league.phase !== 'playoffs')) return;
    const userGame = userGameForWeek(league, league.week);
    simWeek(league, runtimeRng, skipUserGame && userGame && !userGame.played ? userGame.id : null);
    get().touch();
    get().persist();
  },

  /** Sim the user's own game (quick sim). */
  simUserGame: () => {
    const { league } = get();
    if (!league) return;
    const g = userGameForWeek(league, league.week);
    if (!g || g.played) return;
    const { box, injuries } = simulateGame(runtimeRng, league, g, { fullLog: false });
    applyGameResult(league, g, box, injuries);
    get().touch();
    get().persist();
  },

  advance: () => {
    const { league } = get();
    if (!league || !weekComplete(league)) return;
    advanceWeek(league);
    get().touch();
    get().persist();
  },

  continueOffseason: () => {
    const { league } = get();
    if (!league || league.phase !== 'offseason') return;
    const report = beginOffseasonToDraft(league, runtimeRng);
    set({ progressionReport: report });
    runDraftUntilUserPick(league, runtimeRng);
    get().touch();
    get().persist();
  },

  draftUntilUser: () => {
    const { league } = get();
    if (!league || !league.draft) return;
    runDraftUntilUserPick(league, runtimeRng);
    if (league.draft.complete) get().finishDraft();
    get().touch();
    get().persist();
  },

  makeUserPick: (playerId) => {
    const { league } = get();
    if (!league || !league.draft || league.draft.complete) return;
    executePick(league, playerId);
    // stop after the user's pick so they can step through / trade the next picks
    if (league.draft.complete) get().finishDraft();
    get().touch();
    get().persist();
  },

  /** Advance a single AI pick (pick-by-pick stepping). */
  draftOnePick: () => {
    const { league } = get();
    if (!league || !league.draft || league.draft.complete) return;
    if (league.draft.order[league.draft.currentPickIndex].teamId === league.userTeamId) return;
    aiMakePick(league, runtimeRng);
    if (league.draft.complete) get().finishDraft();
    get().touch();
    get().persist();
  },

  toggleWatch: (playerId) => {
    const { league } = get();
    if (!league || !league.draft) return;
    const w = new Set(league.draft.watch ?? []);
    if (w.has(playerId)) w.delete(playerId);
    else w.add(playerId);
    league.draft.watch = [...w];
    get().touch();
    get().persist();
  },

  draftPickTrade: (offer) => {
    const { league } = get();
    if (!league || !league.draft) return;
    executeDraftTrade(league, offer);
    get().touch();
    get().persist();
  },

  finishDraft: () => {
    const { league } = get();
    if (!league || !league.draft?.complete || league.phase !== 'draft') return;
    finishDraftToFreeAgency(league);
    get().touch();
    get().persist();
  },

  advanceFaDay: () => {
    const { league } = get();
    if (!league || !league.freeAgency) return;
    advanceFreeAgencyDay(league, runtimeRng);
    if (league.freeAgency.complete) {
      rolloverToNewSeason(league, runtimeRng);
    }
    get().touch();
    get().persist();
  },

  makeFaOffer: (playerId, salary, years) => {
    const { league } = get();
    if (!league) return false;
    const ok = userOffer(league, runtimeRng, league.players[playerId], salary, years);
    get().touch();
    get().persist();
    return ok;
  },
}));

export function useLeague(): League {
  const league = useStore((s) => s.league);
  if (!league) throw new Error('No league loaded');
  return league;
}
