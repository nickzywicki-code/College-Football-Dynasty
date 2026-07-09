// ── Core enums / unions ─────────────────────────────────────────────

export type Position =
  | 'QB' | 'RB' | 'WR' | 'TE' | 'OL'
  | 'DL' | 'LB' | 'CB' | 'S'
  | 'K' | 'P'

export const POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P']

export const OFFENSE_POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE', 'OL']
export const DEFENSE_POSITIONS: Position[] = ['DL', 'LB', 'CB', 'S']
export const SPECIAL_POSITIONS: Position[] = ['K', 'P']

// starters needed per position for a valid depth chart
export const STARTER_SLOTS: Record<Position, number> = {
  QB: 1, RB: 1, WR: 3, TE: 1, OL: 5,
  DL: 4, LB: 3, CB: 2, S: 2,
  K: 1, P: 1,
}

export type ClassYear = 'FR' | 'SO' | 'JR' | 'SR'
export const CLASS_YEARS: ClassYear[] = ['FR', 'SO', 'JR', 'SR']

export type DevTrait = 'Normal' | 'Impact' | 'Star' | 'Elite'

export interface RatingBlock {
  speed: number
  strength: number
  agility: number
  awareness: number
  throwing: number   // QB arm talent/accuracy
  catching: number    // hands, route running
  blocking: number    // run + pass block
  passRush: number
  coverage: number
  tackling: number
  kicking: number     // power + accuracy for K/P
}

export interface Player {
  id: string
  firstName: string
  lastName: string
  position: Position
  teamId: string | null
  classYear: ClassYear
  redshirted: boolean
  redshirtEligible: boolean
  stars: 1 | 2 | 3 | 4 | 5
  potential: number // 40-99 ceiling
  devTrait: DevTrait
  ratings: RatingBlock
  overall: number
  stamina: number // 0-100 current condition
  morale: number // 0-100
  homeState: string
  injuryWeeksLeft: number
  seasonStats: PlayerSeasonStats
  careerStats: PlayerSeasonStats
  awards: string[]
  yearsOnTeam: number
}

export interface PlayerSeasonStats {
  passYds: number; passTd: number; passInt: number; passAtt: number; passComp: number
  rushYds: number; rushTd: number; rushAtt: number
  recYds: number; recTd: number; receptions: number
  tackles: number; sacks: number; interceptions: number; forcedFumbles: number
  fgMade: number; fgAtt: number; xpMade: number
  gamesPlayed: number
}

export function emptySeasonStats(): PlayerSeasonStats {
  return {
    passYds: 0, passTd: 0, passInt: 0, passAtt: 0, passComp: 0,
    rushYds: 0, rushTd: 0, rushAtt: 0,
    recYds: 0, recTd: 0, receptions: 0,
    tackles: 0, sacks: 0, interceptions: 0, forcedFumbles: 0,
    fgMade: 0, fgAtt: 0, xpMade: 0,
    gamesPlayed: 0,
  }
}

// ── Team / world ────────────────────────────────────────────────────

export type ConferenceTier = 'power' | 'group'

export interface Conference {
  id: string
  name: string
  abbr: string
  tier: ConferenceTier
  teamIds: string[]
  footprintStates: string[]
}

export interface TeamColors {
  primary: string
  secondary: string
}

export type StaffRole = 'OC' | 'DC' | 'RecruitingCoordinator' | 'STCoordinator'

export interface StaffMember {
  id: string
  name: string
  role: StaffRole
  rating: number // 40-99, affects related bonuses
  yearsExperience: number
}

export interface Facilities {
  stadium: number      // 1-10, affects gameday atmosphere/revenue
  training: number     // 1-10, affects dev/injury recovery
  academics: number    // 1-10, affects recruit appeal + graduation
  recruitingHub: number // 1-10, affects recruiting radius/points
}

export interface Team {
  id: string
  name: string
  mascot: string
  abbr: string
  conferenceId: string
  colors: TeamColors
  prestige: number // 1-100, slow moving
  facilities: Facilities
  staff: StaffMember[]
  rosterIds: string[]
  depthChart: Partial<Record<Position, string[]>> // ordered player ids, [0] = starter
  gamePlan: GamePlan
  isUserTeam: boolean
  headCoachName: string
  wins: number
  losses: number
  confWins: number
  confLosses: number
  pointsFor: number
  pointsAgainst: number
  rankingScore: number
  rank: number | null
  boosterFunds: number
}

// ── Game plan ────────────────────────────────────────────────────────

export type OffensiveScheme = 'Air Raid' | 'Pro Style' | 'Spread Option' | 'Power Run' | 'RPO Spread'
export type DefensiveScheme = '4-3 Base' | '3-4 Base' | 'Multiple Front' | 'Bend-Dont-Break' | 'Aggressive Blitz'

export const OFFENSIVE_SCHEMES: OffensiveScheme[] = ['Air Raid', 'Pro Style', 'Spread Option', 'Power Run', 'RPO Spread']
export const DEFENSIVE_SCHEMES: DefensiveScheme[] = ['4-3 Base', '3-4 Base', 'Multiple Front', 'Bend-Dont-Break', 'Aggressive Blitz']

export interface GamePlan {
  offensiveScheme: OffensiveScheme
  defensiveScheme: DefensiveScheme
  runPassBalance: number // 0 = all run, 100 = all pass
  tempo: number // 0 slow, 50 normal, 100 fast (hurry-up)
  aggressiveness: number // blitz freq / deep shots, 0-100
  fourthDownAggressiveness: number // 0-100
  practiceFocus: PracticeFocus
}

export type PracticeFocus = 'Balanced' | 'Offense' | 'Defense' | 'Conditioning' | 'Discipline'

export function defaultGamePlan(): GamePlan {
  return {
    offensiveScheme: 'Pro Style',
    defensiveScheme: '4-3 Base',
    runPassBalance: 50,
    tempo: 50,
    aggressiveness: 50,
    fourthDownAggressiveness: 40,
    practiceFocus: 'Balanced',
  }
}

// ── Recruiting ───────────────────────────────────────────────────────

export type RecruitPriority = 'PlayingTime' | 'Prestige' | 'Academics' | 'Proximity' | 'Facilities' | 'Championships'

export interface Recruit {
  id: string
  firstName: string
  lastName: string
  position: Position
  stars: 1 | 2 | 3 | 4 | 5
  potential: number
  devTraitHint: DevTrait
  ratings: RatingBlock
  overall: number
  homeState: string
  priority: RecruitPriority
  secondaryPriority: RecruitPriority
  interest: Record<string, number> // teamId -> 0-100
  scouted: Record<string, number> // teamId -> 0-100 (accuracy of visible ratings)
  offers: string[] // teamIds
  visited: string[] // teamIds
  committedTeamId: string | null
  signed: boolean
  leaningTeamId: string | null
}

export interface RecruitingBoard {
  year: number
  recruits: Recruit[]
  weeklyPoints: number
  pointsSpent: Record<string, number> // recruitId -> total points spent by user
}

// ── Schedule / season ────────────────────────────────────────────────

export type SeasonPhase = 'preseason' | 'regular' | 'conference_championship' | 'postseason' | 'offseason'

export interface GameResult {
  id: string
  week: number
  homeTeamId: string
  awayTeamId: string
  homeScore: number
  awayScore: number
  played: boolean
  isConference: boolean
  isRivalry: boolean
  isUserGame: boolean
  isPlayoff: boolean
  bowlName?: string
  boxScore?: BoxScore
  playLog?: string[]
}

export interface BoxScore {
  home: TeamGameStats
  away: TeamGameStats
  starOfGamePlayerId?: string
}

export interface TeamGameStats {
  totalYards: number
  passYards: number
  rushYards: number
  turnovers: number
  timeOfPossession: number // seconds
  firstDowns: number
}

export interface DriveState {
  offenseTeamId: string
  defenseTeamId: string
  ballOn: number // yards from offense's own goal line, 0-100
  down: number
  yardsToGo: number
  quarter: number
  clockSeconds: number
}

// ── News / flavor ────────────────────────────────────────────────────

export interface NewsItem {
  id: string
  week: number
  year: number
  headline: string
  body: string
  category: 'game' | 'recruiting' | 'award' | 'coaching' | 'program' | 'league'
}

// ── Coach career ─────────────────────────────────────────────────────

export interface CoachSeasonRecord {
  year: number
  teamId: string
  wins: number
  losses: number
  confChampion: boolean
  madePlayoff: boolean
  nationalChampion: boolean
  finalRank: number | null
}

export interface CoachProfile {
  name: string
  alma: string
  archetype: CoachArchetype
  hotSeat: number // 0-100, higher = safer
  careerWins: number
  careerLosses: number
  history: CoachSeasonRecord[]
  reputation: number // 1-100, drives job offers
}

export type CoachArchetype = 'Recruiter' | 'Strategist' | 'Motivator' | 'Developer'

export interface JobOffer {
  teamId: string
  prestige: number
  message: string
}

// ── Top-level dynasty save ──────────────────────────────────────────

export interface DynastyState {
  saveId: string
  createdAt: number
  updatedAt: number
  seed: number

  coach: CoachProfile
  userTeamId: string

  year: number
  week: number
  phase: SeasonPhase

  conferences: Conference[]
  teams: Record<string, Team>
  players: Record<string, Player>

  schedule: GameResult[] // current season's games
  recruitingBoard: RecruitingBoard

  news: NewsItem[]

  pollTop25: string[] // team ids in order

  pendingJobOffers: JobOffer[]

  playoffBracket: PlayoffBracket | null
}

export interface PlayoffBracket {
  size: number
  seeds: string[] // teamIds in seed order
  rounds: GameResult[][]
  champion: string | null
}

export interface SaveSlotMeta {
  saveId: string
  coachName: string
  teamId: string
  teamName: string
  year: number
  week: number
  wins: number
  losses: number
  updatedAt: number
}
