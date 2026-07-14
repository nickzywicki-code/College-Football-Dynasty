// Core data model. Everything here must stay JSON-serializable (save files).

export type Position =
  | 'QB'
  | 'RB'
  | 'WR'
  | 'TE'
  | 'OL'
  | 'DL'
  | 'LB'
  | 'CB'
  | 'S'
  | 'K'
  | 'P';

export const POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'];

/** All ratings are 1-99 */
export interface Attributes {
  spd: number; // speed
  acc: number; // acceleration
  str: number; // strength
  agi: number; // agility
  thp: number; // throw power
  tha: number; // throw accuracy
  cth: number; // catching
  car: number; // carry security
  blk: number; // blocking
  tkl: number; // tackling
  cov: number; // coverage
  kck: number; // kicking
  sta: number; // stamina
  awr: number; // awareness
}

export type AttrKey = keyof Attributes;

export interface Contract {
  salary: number; // $M per year
  yearsLeft: number;
}

export interface SeasonStats {
  season: number;
  teamAbbr: string;
  gamesPlayed: number;
  // passing
  passAtt: number;
  passCmp: number;
  passYds: number;
  passTd: number;
  passInt: number;
  sacked: number;
  // rushing
  rushAtt: number;
  rushYds: number;
  rushTd: number;
  fumbles: number;
  // receiving
  targets: number;
  rec: number;
  recYds: number;
  recTd: number;
  // defense
  tackles: number;
  sacks: number;
  defInt: number;
  forcedFum: number;
  defTd: number;
  // kicking
  fgm: number;
  fga: number;
  fgLong: number;
  xpm: number;
  xpa: number;
  // punting
  punts: number;
  puntYds: number;
}

export interface Player {
  id: number;
  firstName: string;
  lastName: string;
  pos: Position;
  age: number;
  jersey: number;
  attrs: Attributes;
  /** Growth ceiling 1-99; hidden driver of development */
  potential: number;
  overall: number; // cached, recomputed on attr change
  teamId: number | -1; // -1 = free agent
  contract: Contract | null;
  injuryWeeks: number; // 0 = healthy
  yearsPro: number;
  draftInfo: { season: number; round: number; pick: number } | null; // null = undrafted
  stats: SeasonStats[]; // one entry per season played
  awards: string[]; // e.g. "S3 MVP"
  retired: boolean;
}

export interface DepthChart {
  QB: number[];
  RB: number[];
  WR: number[];
  TE: number[];
  OL: number[];
  DL: number[];
  LB: number[];
  CB: number[];
  S: number[];
  K: number[];
  P: number[];
}

export interface DraftPickAsset {
  season: number;
  round: number;
  originalTeamId: number;
}

export interface Team {
  id: number;
  city: string;
  name: string;
  abbr: string;
  colors: [string, string]; // primary, secondary
  conference: number; // 0 | 1
  division: number; // 0..3 within conference
  playerIds: number[];
  depthChart: DepthChart;
  wins: number;
  losses: number;
  ties: number;
  ptsFor: number;
  ptsAgainst: number;
  /** Season history: e.g. { season, wins, losses, result } */
  history: TeamSeasonRecord[];
  draftPicks: DraftPickAsset[];
  /** Coaching staff (optional on legacy saves; backfilled on load). */
  coaches?: CoachStaff;
}

export type CoachRole = 'HC' | 'OC' | 'DC';

export interface Coach {
  name: string;
  role: CoachRole;
  archetype: string; // flavor + perk theme
  level: number; // 1..10
  xp: number; // toward next level
}

export interface CoachStaff {
  hc: Coach;
  oc: Coach;
  dc: Coach;
}

export interface TeamSeasonRecord {
  season: number;
  wins: number;
  losses: number;
  ties: number;
  result: string; // '', 'Made Playoffs', 'Won Championship', etc.
}

export interface ScheduledGame {
  id: number;
  week: number; // 1-based; playoff weeks continue after regular season
  homeId: number;
  awayId: number;
  played: boolean;
  homeScore: number;
  awayScore: number;
  /** playoff round label: '' for regular season */
  tag: '' | 'WC' | 'DIV' | 'CONF' | 'CHAMP';
}

/** Per-player stat line within a single game (sparse: only non-zero fields kept) */
export type GameStatLine = Partial<Omit<SeasonStats, 'season' | 'teamAbbr'>> & { playerId: number };

export interface BoxScore {
  gameId: number;
  season: number;
  week: number;
  homeId: number;
  awayId: number;
  homeScore: number;
  awayScore: number;
  quarterScores: [number[], number[]]; // [home by quarter, away by quarter]
  homeStats: GameStatLine[];
  awayStats: GameStatLine[];
  homeTeamTotals: TeamGameTotals;
  awayTeamTotals: TeamGameTotals;
  playByPlay: string[]; // trimmed to key plays for non-user games
}

export interface TeamGameTotals {
  totalYds: number;
  passYds: number;
  rushYds: number;
  firstDowns: number;
  turnovers: number;
  timeOfPossession: number; // seconds
  thirdDownAtt: number;
  thirdDownConv: number;
}

export type LeaguePhase =
  | 'regularSeason'
  | 'playoffs'
  | 'offseason' // recap shown; next: retirements/progression happen on continue
  | 'draft'
  | 'freeAgency'
  | 'preseason'; // re-sign / roster prep before next season kicks off

export interface AwardWinner {
  award: string;
  playerId: number;
  playerName: string;
  teamAbbr: string;
  detail: string;
}

export interface SeasonHistoryEntry {
  season: number;
  championTeamId: number;
  championName: string;
  runnerUpName: string;
  awards: AwardWinner[];
  allLeague: { pos: Position; playerId: number; playerName: string; teamAbbr: string }[];
}

export interface LeagueRecordBook {
  /** single-season records, keyed by stat label */
  singleSeason: Record<string, { value: number; playerName: string; season: number; teamAbbr: string }>;
}

export interface TradeOffer {
  fromTeamId: number;
  toTeamId: number;
  playersOut: number[]; // user's players offered (from -> to)
  picksOut: DraftPickAsset[];
  playersIn: number[];
  picksIn: DraftPickAsset[];
}

export interface DraftProspect {
  playerId: number;
  /** scouted ratings shown to user: true value +- fog */
  scoutedOvr: [number, number]; // [low, high]
  scoutedPot: 'A' | 'B' | 'C' | 'D';
  drafted: boolean;
}

export interface DraftState {
  prospects: DraftProspect[];
  order: { round: number; pick: number; teamId: number; selectedPlayerId: number | null }[];
  currentPickIndex: number;
  complete: boolean;
  /** prospect playerIds the user is tracking */
  watch?: number[];
}

export interface FreeAgencyState {
  day: number; // 1..FA_DAYS
  complete: boolean;
  /** log of signings this FA period for the news feed */
  log: string[];
}

export interface GameSettings {
  quarterMinutes: number; // arcade game quarter length (sim uses full 15)
  difficulty: 'rookie' | 'pro' | 'legend';
}

export interface League {
  schemaVersion: number;
  seed: number;
  season: number; // 1-based
  week: number; // current week (next games to be played)
  phase: LeaguePhase;
  userTeamId: number;
  teams: Team[];
  players: Record<number, Player>;
  nextPlayerId: number;
  schedule: ScheduledGame[]; // current season only
  nextGameId: number;
  boxScores: Record<number, BoxScore>; // by gameId, current season only
  playoffTeams: number[]; // seeded team ids per conference, set when playoffs start
  draft: DraftState | null;
  freeAgency: FreeAgencyState | null;
  history: SeasonHistoryEntry[];
  recordBook: LeagueRecordBook;
  news: string[]; // rolling news feed (most recent first)
  settings: GameSettings;
  salaryCap: number; // $M
  /** pending coach level-up notices for the user (shown then cleared) */
  coachLevelUps?: string[];
}

export const SCHEMA_VERSION = 1;
export const SALARY_CAP = 220;
/** 18 weeks, 17 games per team, one bye each. */
export const REGULAR_SEASON_WEEKS = 18;
export const GAMES_PER_TEAM = 17;
export const ROSTER_SIZE = 48;
export const FA_DAYS = 7;

export function playerName(p: Player): string {
  return `${p.firstName} ${p.lastName}`;
}

export function teamName(t: Team): string {
  return `${t.city} ${t.name}`;
}

export function emptySeasonStats(season: number, teamAbbr: string): SeasonStats {
  return {
    season,
    teamAbbr,
    gamesPlayed: 0,
    passAtt: 0,
    passCmp: 0,
    passYds: 0,
    passTd: 0,
    passInt: 0,
    sacked: 0,
    rushAtt: 0,
    rushYds: 0,
    rushTd: 0,
    fumbles: 0,
    targets: 0,
    rec: 0,
    recYds: 0,
    recTd: 0,
    tackles: 0,
    sacks: 0,
    defInt: 0,
    forcedFum: 0,
    defTd: 0,
    fgm: 0,
    fga: 0,
    fgLong: 0,
    xpm: 0,
    xpa: 0,
    punts: 0,
    puntYds: 0,
  };
}
