// Arcade game engine: live 2D plays for the user's offense, watchable quick
// resolution for the CPU's offense, kicking meter, full game/clock state.
// Outcome probabilities reuse the sim engine's helpers so arcade results stay
// statistically consistent with simulated games.

import { Rand, clamp, randomSeed } from '../engine/rng';
import type { GameStatLine, League, Player, ScheduledGame, BoxScore, TeamGameTotals } from '../engine/types';
import { buildPersonnel } from '../engine/sim/gameSim';
import {
  Personnel,
  completionProbability,
  fgMakeProbability,
  fumbleProbability,
  interceptionProbability,
  resolveSimPlay,
  tackleBreakProbability,
} from '../engine/sim/playSim';
import { audio } from './audio';
import type Matter from 'matter-js';
import { PhysicsWorld } from './physics';
import {
  DEFENSE_ALIGNMENT,
  DefCall,
  EligibleSlot,
  OFFENSE_ALIGNMENT,
  OffensivePlay,
  RoutePoint,
} from './playbook';

export const FIELD_W = 53.33;
export const FIELD_LEN = 120; // includes both 10yd end zones

export type ArcadePhase =
  | 'playcall' // user picking an offensive play
  | 'presnap' // lined up, waiting for snap
  | 'live' // ball in play, user controls
  | 'playover' // result banner
  | 'kickmeter' // FG/punt/XP meter
  | 'kickflight' // ball flying at the uprights / downfield
  | 'patchoice' // XP or 2pt after user TD
  | 'defcall' // user picks defensive shell before CPU drive
  | 'cpu' // CPU offense auto-resolving
  | 'gameover';

export interface Ent {
  player: Player;
  side: 'off' | 'def';
  role: string; // QB, RB, WR1.., TE, OL0.., DL0.., LB0.., CB0.., S0..
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetX: number;
  targetY: number;
  /** route waypoints in absolute field coords */
  route: RoutePoint[];
  routeIdx: number;
  engagedWith: Ent | null; // blocking
  engageTimer: number;
  stunTimer: number; // beaten defender / juked
  isBlocking: boolean;
  body: Matter.Body | null; // physics body during live plays
  lungeT: number; // tackle-lunge pose timer
  celebT: number; // celebration pose timer
  animPhase: number; // run-cycle phase, advanced by actual speed
  diveCd: number; // cooldown between tackle-dive attempts
  diving: boolean; // mid-dive: widened tackle radius, whiff = eat turf
  // --- pass rush / coverage bookkeeping ---
  rusher: boolean; // this defender is rushing the passer on this snap
  wonBlock: boolean; // rusher has beaten his blocker and has a free lane
  beatBy: Ent | null; // blocker was beaten by this rusher — can't re-grab yet
  beatT: number; // cooldown before a beaten blocker may re-engage
  assignRole: string | null; // man-coverage assignment (offense role) or null for zone
  zone: RoutePoint | null; // zone-drop landmark (absolute coords), null if man
  beatenT: number; // coverage: DB lost a rep, can't close for this long
  beatenIdx: number; // last route-break index this DB has already contested
  contain: boolean; // edge rusher keeping outside leverage on the QB
  spy: boolean; // QB spy: mirrors the QB, jumps a scramble
  readDelay: number; // second-level defender reads for a beat before filling
  faceRight: boolean; // last committed facing (hysteresis to stop idle spinning)
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface BallState {
  x: number;
  y: number;
  inFlight: boolean;
  /** live fumble rolling on the turf */
  loose: boolean;
  looseVx: number;
  looseVy: number;
  /** nobody may recover until this expires (scramble drama) */
  looseLockout: number;
  flightT: number;
  flightDur: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  targetEnt: Ent | null;
}

export interface HudState {
  phase: ArcadePhase;
  quarter: number;
  clock: number;
  down: number;
  toGo: number;
  yardsToGoal: number;
  userScore: number;
  cpuScore: number;
  userAbbr: string;
  cpuAbbr: string;
  userColors: [string, string];
  cpuColors: [string, string];
  possession: 'user' | 'cpu';
  quarterLabel: string;
  ballOn: string;
  userHasBall: boolean;
  banner: { big: string; small: string } | null;
  lastPlayText: string;
  receivers: { slot: EligibleSlot; label: string; color: string }[];
  meter: { value: number; kind: 'fg' | 'punt' | 'xp'; zoneLo: number; zoneHi: number } | null;
  canJuke: boolean;
  gameOver: boolean;
  finalMsg: string;
}

interface SideStats {
  lines: Record<number, GameStatLine>;
  totals: TeamGameTotals;
  quarterScores: number[];
  score: number;
}

function newSideStats(): SideStats {
  return {
    lines: {},
    totals: {
      totalYds: 0,
      passYds: 0,
      rushYds: 0,
      firstDowns: 0,
      turnovers: 0,
      timeOfPossession: 0,
      thirdDownAtt: 0,
      thirdDownConv: 0,
    },
    quarterScores: [0, 0, 0, 0],
    score: 0,
  };
}

function speedOf(p: Player): number {
  return 5.6 + (p.attrs.spd / 99) * 5.2; // yds/sec (elite ~10.8)
}

export class ArcadeGame {
  readonly league: League;
  readonly game: ScheduledGame;
  readonly userIsHome: boolean;
  readonly r: Rand;
  userP: Personnel;
  cpuP: Personnel;

  phase: ArcadePhase = 'playcall';
  quarter = 1;
  clock: number;
  readonly quarterSeconds: number;
  readonly timeScale: number; // scaled seconds charged per football-second

  possession: 'user' | 'cpu';
  down = 1;
  toGo = 10;
  yardsToGoal = 75; // offense's distance to opponent goal line
  playClockCharge = 0;

  userStats = newSideStats();
  cpuStats = newSideStats();
  playByPlay: string[] = [];

  // live play
  play: OffensivePlay | null = null;
  ents: Ent[] = [];
  ball: BallState = {
    x: 0, y: 0, inFlight: false, loose: false, looseVx: 0, looseVy: 0, looseLockout: 0,
    flightT: 0, flightDur: 0, fromX: 0, fromY: 0, toX: 0, toY: 0, targetEnt: null,
  };
  phys: PhysicsWorld | null = null;
  /** screen-space throw-icon hit circles, refreshed by the renderer each frame */
  iconHits: { slot: EligibleSlot; x: number; y: number; r: number }[] = [];
  fx: Particle[] = [];
  shake = 0;
  releaseT = 0; // QB throw-release pose timer
  private postPlayTimer = 0;
  private afterPlay: (() => void) | null = null;
  /** kick-in-flight visual: from/to field coords + progress */
  kickAnim: {
    kind: 'fg' | 'xp' | 'punt';
    made: boolean;
    fromX: number; fromY: number; toX: number; toY: number;
    t: number; dur: number;
  } | null = null;
  carrier: Ent | null = null;
  qbEnt: Ent | null = null;
  passThrown = false;
  passDepthAtThrow: 'short' | 'medium' | 'deep' = 'short';
  handoffTimer = 0;
  playElapsed = 0;
  jukeCooldown = 0;
  stick = { x: 0, y: 0 };
  losY = 0; // absolute y of line of scrimmage during live play
  firstDownY = 0;
  scrambling = false;
  carrierSince = 0; // playElapsed when the current carrier took the ball
  twoPtLive = false; // user is running a live 2-point conversion play
  lastBlockSfx = -1; // throttle for pad-pop block SFX
  coverPress = false; // tighter coverage when the user spams one play
  /** recent user play outcomes, for defensive adjustments to repetition */
  recentPlays: { id: string; type: 'run' | 'pass'; scramble: boolean; inside: boolean }[] = [];

  banner: HudState['banner'] = null;
  bannerTimer = 0;
  lastPlayText = '';
  defCall: DefCall = 'balanced';
  cpuTickTimer = 0;
  meter: HudState['meter'] = null;
  meterDir = 1;
  pendingPat: 'user' | 'cpu' | null = null;
  openedWithBall: 'user' | 'cpu';
  halfKicked = false;
  gameOverMsg = '';
  private hudCb: ((h: HudState) => void) | null = null;
  private endedCb: (() => void) | null = null;

  constructor(league: League, game: ScheduledGame) {
    this.league = league;
    this.game = game;
    this.userIsHome = game.homeId === league.userTeamId;
    this.r = new Rand(randomSeed());
    const userTeam = league.teams[league.userTeamId];
    const cpuTeam = league.teams[this.userIsHome ? game.awayId : game.homeId];
    this.userP = buildPersonnel(userTeam, league.players);
    this.cpuP = buildPersonnel(cpuTeam, league.players);
    this.quarterSeconds = league.settings.quarterMinutes * 60;
    this.timeScale = this.quarterSeconds / 900;
    this.clock = this.quarterSeconds;
    this.possession = this.r.chance(0.5) ? 'user' : 'cpu';
    this.openedWithBall = this.possession;
    this.startDrive(75);
  }

  get userTeam() {
    return this.league.teams[this.league.userTeamId];
  }
  get cpuTeam() {
    return this.league.teams[this.userIsHome ? this.game.awayId : this.game.homeId];
  }
  get offenseP(): Personnel {
    return this.possession === 'user' ? this.userP : this.cpuP;
  }
  get defenseP(): Personnel {
    return this.possession === 'user' ? this.cpuP : this.userP;
  }
  get offStats(): SideStats {
    return this.possession === 'user' ? this.userStats : this.cpuStats;
  }
  get defStats(): SideStats {
    return this.possession === 'user' ? this.cpuStats : this.userStats;
  }

  onHud(cb: (h: HudState) => void): void {
    this.hudCb = cb;
    this.pushHud();
  }
  onEnded(cb: () => void): void {
    this.endedCb = cb;
  }

  // ---------------------------------------------------------------------
  // stats helpers
  // ---------------------------------------------------------------------
  private line(stats: SideStats, p: Player): GameStatLine {
    let l = stats.lines[p.id];
    if (!l) {
      l = { playerId: p.id };
      stats.lines[p.id] = l;
    }
    return l;
  }
  private bump(l: GameStatLine, key: keyof Omit<GameStatLine, 'playerId'>, amt = 1): void {
    l[key] = ((l[key] as number | undefined) ?? 0) + amt;
  }

  private score(side: 'user' | 'cpu', pts: number): void {
    const s = side === 'user' ? this.userStats : this.cpuStats;
    s.score += pts;
    s.quarterScores[Math.min(this.quarter, 4) - 1] += pts;
  }

  private log(text: string): void {
    this.playByPlay.push(`Q${this.quarter} — ${text}`);
    this.lastPlayText = text;
  }

  // ---------------------------------------------------------------------
  // drive / down management
  // ---------------------------------------------------------------------
  private startDrive(ytg: number): void {
    this.yardsToGoal = Math.round(clamp(ytg, 1, 99));
    this.down = 1;
    this.toGo = Math.min(10, this.yardsToGoal);
    if (this.possession === 'user') {
      this.phase = 'playcall';
    } else {
      this.phase = 'defcall';
    }
    this.pushHud();
  }

  private chargeClock(footballSeconds: number): void {
    const charged = footballSeconds * this.timeScale;
    this.clock -= charged;
    this.offStats.totals.timeOfPossession += charged;
    if (this.clock <= 0) this.endQuarter();
  }

  private endQuarter(): void {
    if (this.quarter >= 4) {
      if (this.userStats.score === this.cpuStats.score) {
        this.resolveOvertime();
      }
      this.finish();
      return;
    }
    this.quarter++;
    this.clock = this.quarterSeconds;
    if (this.quarter === 3 && !this.halfKicked) {
      this.halfKicked = true;
      this.possession = this.openedWithBall === 'user' ? 'cpu' : 'user';
      this.setBanner('HALFTIME', `${this.userTeam.abbr} ${this.userStats.score} — ${this.cpuTeam.abbr} ${this.cpuStats.score}`);
      this.startDrive(75);
    }
  }

  private resolveOvertime(): void {
    // abstract OT: alternate scoring chances until decided (playoffs) or one round (reg season)
    const isPlayoff = this.game.tag !== '';
    let rounds = 0;
    let side: 'user' | 'cpu' = this.r.chance(0.5) ? 'user' : 'cpu';
    while (this.userStats.score === this.cpuStats.score && (isPlayoff || rounds < 2)) {
      rounds++;
      const P = side === 'user' ? this.userP : this.cpuP;
      const q = this.r.random() + (P.QB.attrs.tha - 75) * 0.004;
      if (q > 0.62) this.score(side, 7);
      else if (q > 0.42) this.score(side, 3);
      side = side === 'user' ? 'cpu' : 'user';
    }
    this.log(
      this.userStats.score === this.cpuStats.score
        ? 'Overtime ends — a tie.'
        : `Overtime: ${this.userStats.score > this.cpuStats.score ? this.userTeam.abbr : this.cpuTeam.abbr} win it!`,
    );
  }

  private turnover(kind: string, spotYtgForNewOffense: number): void {
    // a turnover on a 2-point try just ends the conversion (no return)
    if (this.twoPtLive) {
      this.twoPtLive = false;
      this.offStats.totals.turnovers++;
      this.setBanner('2-PT NO GOOD', '');
      this.afterScoreKickoff();
      this.pushHud();
      return;
    }
    audio.play(this.possession === 'user' ? 'turnover' : 'touchdown');
    this.offStats.totals.turnovers++;
    this.log(kind);
    this.possession = this.possession === 'user' ? 'cpu' : 'user';
    this.setBanner(kind.includes('INTERCEPT') ? 'INTERCEPTED!' : 'TURNOVER!', '');
    this.startDrive(spotYtgForNewOffense);
  }

  private touchdownFor(side: 'user' | 'cpu'): void {
    audio.play(side === 'user' ? 'touchdown' : 'crowd');
    this.score(side, 6);
    this.setBanner('TOUCHDOWN!', side === 'user' ? this.userTeam.abbr : this.cpuTeam.abbr);
    this.pendingPat = side;
    if (side === 'user') {
      this.phase = 'patchoice';
    } else {
      // CPU decides: kick unless chasing late
      const diff = this.cpuStats.score - this.userStats.score;
      if (this.quarter >= 4 && [-2, 1, -5, -10].includes(diff)) {
        this.resolveCpuTwoPoint();
      } else {
        const k = this.cpuP.K;
        const l = this.line(this.cpuStats, k);
        this.bump(l, 'xpa');
        if (this.r.chance(clamp(0.94 + (k.attrs.kck - 75) * 0.002, 0.8, 0.995))) {
          this.bump(l, 'xpm');
          this.score('cpu', 1);
        }
        this.afterScoreKickoff();
      }
    }
    this.pushHud();
  }

  private resolveCpuTwoPoint(): void {
    const res = resolveSimPlay({
      r: this.r,
      offense: this.cpuP,
      defense: this.userP,
      yardsToGoal: 2,
      toGo: 2,
      call: this.r.chance(0.5) ? { type: 'run', direction: 'inside' } : { type: 'pass', depth: 'short' },
      hurryUp: false,
      defExpectsPass: 0.5,
    });
    if (res.yards >= 2 && !res.turnover) this.score('cpu', 2);
    this.afterScoreKickoff();
  }

  /** After any score: abstract kickoff, other team gets it at the 25. */
  private afterScoreKickoff(): void {
    this.pendingPat = null;
    this.chargeClock(6);
    if (this.phase === 'gameover') return;
    this.possession = this.pendingPossessionAfterScore();
    this.startDrive(75);
  }

  private pendingPossessionAfterScore(): 'user' | 'cpu' {
    // whoever just scored kicks off
    return this.possession === 'user' ? 'cpu' : 'user';
  }

  // ---------------------------------------------------------------------
  // user PAT
  // ---------------------------------------------------------------------
  choosePat(kind: 'xp' | 'two'): void {
    if (this.phase !== 'patchoice') return;
    if (kind === 'xp') {
      this.startMeter('xp');
    } else {
      // play a REAL down from the 2 — pick a play and go for it
      this.pendingPat = null;
      this.twoPtLive = true;
      this.possession = 'user';
      this.down = 1;
      this.toGo = 2;
      this.yardsToGoal = 2;
      this.phase = 'playcall';
      this.setBanner('GO FOR TWO', 'Pick your play from the 2');
      this.pushHud();
    }
  }

  // ---------------------------------------------------------------------
  // kicking meter
  // ---------------------------------------------------------------------
  private startMeter(kind: 'fg' | 'punt' | 'xp'): void {
    this.phase = 'kickmeter';
    this.meter = { value: 0, kind, zoneLo: 0.68, zoneHi: 0.92 };
    this.meterDir = 1;
    this.pushHud();
  }

  kickNow(): void {
    if (!this.meter) return;
    const v = this.meter.value;
    const center = (this.meter.zoneLo + this.meter.zoneHi) / 2;
    const inZone = v >= this.meter.zoneLo && v <= this.meter.zoneHi;
    const off = Math.abs(v - center);
    const kind = this.meter.kind;
    this.meter = null;
    audio.play('kick');

    const midX = FIELD_W / 2;
    const losY = 10 + (100 - this.yardsToGoal);
    const hookDir = v < center ? -1 : 1;

    if (kind === 'xp' || kind === 'fg') {
      const dist = kind === 'xp' ? 20 : this.yardsToGoal + 17;
      const k = this.userP.K;
      const l = this.line(this.userStats, k);
      this.bump(l, kind === 'xp' ? 'xpa' : 'fga');
      let p = kind === 'xp'
        ? clamp(0.96 - off * 1.4 + (k.attrs.kck - 75) * 0.002, 0.2, 0.99)
        : clamp(fgMakeProbability(k, dist) + (inZone ? 0.12 : -0.3) - off * 0.8, 0.02, 0.99);
      const made = this.r.chance(p);
      // fly the ball at the uprights (back of the attacked end zone)
      this.kickAnim = {
        kind, made,
        fromX: midX, fromY: losY - 7,
        toX: made ? midX : clamp(midX + hookDir * 6, 2, FIELD_W - 2),
        toY: 120, t: 0, dur: 1.35,
      };
      this.ball.inFlight = false;
      this.ball.loose = false;
      this.kickThen(1.5, () => {
        if (kind === 'xp') {
          if (made) { this.bump(l, 'xpm'); this.score('user', 1); this.setBanner('EXTRA POINT GOOD', ''); }
          else this.setBanner('XP MISSED!', '');
          this.afterScoreKickoff();
        } else {
          this.chargeClock(6);
          if (made) {
            this.bump(l, 'fgm');
            l.fgLong = Math.max(l.fgLong ?? 0, dist);
            this.score('user', 3);
            audio.play('fieldgoal');
            this.log(`${k.lastName} drills the ${dist}-yard field goal!`);
            this.setBanner('FIELD GOAL IS GOOD!', `${dist} yards`);
            this.possession = 'cpu';
            this.startDrive(75);
          } else {
            this.log(`${k.lastName} misses from ${dist}.`);
            this.setBanner('NO GOOD', `${dist} yards`);
            this.possession = 'cpu';
            this.startDrive(Math.max(20, 100 - (this.yardsToGoal + 7)));
          }
          this.chargeClock(8);
        }
        this.pushHud();
      });
    } else {
      // punt — fly the ball downfield with a high arc
      const punter = this.userP.P;
      const l = this.line(this.userStats, punter);
      this.bump(l, 'punts');
      const power = clamp(v, 0.2, 1);
      const gross = clamp(28 + power * 32 + (punter.attrs.kck - 75) * 0.2, 20, 65);
      const returnYds = this.r.chance(0.5) ? Math.max(0, this.r.gauss(7, 6)) : 0;
      const net = Math.round(gross - returnYds);
      this.bump(l, 'puntYds', Math.round(gross));
      let newYtg = 100 - (this.yardsToGoal - net);
      if (newYtg >= 100) newYtg = 80;
      this.kickAnim = {
        kind: 'punt', made: true,
        fromX: midX, fromY: losY,
        toX: clamp(midX + this.r.range(-4, 4), 3, FIELD_W - 3),
        toY: Math.min(118, losY + gross), t: 0, dur: 1.3,
      };
      this.kickThen(1.4, () => {
        this.log(`${punter.lastName} punts ${Math.round(gross)} yards.`);
        this.setBanner('PUNT', `${Math.round(gross)} yards`);
        this.chargeClock(14);
        this.possession = 'cpu';
        this.startDrive(newYtg);
        this.pushHud();
      });
    }
    this.pushHud();
  }

  // ---------------------------------------------------------------------
  // play calling (user offense)
  // ---------------------------------------------------------------------
  callPlay(play: OffensivePlay): void {
    if (this.phase !== 'playcall') return;
    this.play = play;
    // CPU defense picks a shell, biased by down & distance
    this.defCall = this.pickCpuDefense();
    this.setupFormation(play);
    this.assignDefense();
    this.phase = 'presnap';
    this.pushHud();
  }

  /** The CPU defensive coordinator's call vs the user offense. */
  private pickCpuDefense(): DefCall {
    const longYardage = this.toGo >= 8;
    const shortYardage = this.toGo <= 3;
    // weights: [balanced, blitz, coverage]
    let w: [number, number, number] = [0.5, 0.25, 0.25];
    if (this.down >= 3 && longYardage) w = [0.28, 0.32, 0.4]; // expect pass
    else if (this.down >= 3 && shortYardage) w = [0.4, 0.45, 0.15]; // sell out vs the sticks
    else if (shortYardage) w = [0.5, 0.35, 0.15];
    const roll = this.r.range(0, w[0] + w[1] + w[2]);
    if (roll < w[0]) return 'balanced';
    if (roll < w[0] + w[1]) return 'blitz';
    return 'coverage';
  }

  /**
   * Assign every defender a job for this snap based on the called shell:
   * who rushes, who plays man, who drops to a zone. Ratings then decide
   * whether they win their reps.
   */
  private assignDefense(): void {
    const man: Record<string, string> = { CB0: 'WR1', CB1: 'WR2', S0: 'WR3', S1: 'TE' };
    const zoneLandmark = (rel: RoutePoint): RoutePoint => ({
      x: clamp(FIELD_W / 2 + rel.x, 2, FIELD_W - 2),
      y: this.losY + rel.y,
    });
    // read the last few user plays and ADJUST to repetition
    const recent = this.recentPlays.slice(-3);
    const scrambleHeat = recent.filter((p) => p.scramble).length;
    const insideHeat = recent.filter((p) => p.type === 'run' && p.inside).length;
    const sameCall = recent.length >= 2 && recent.every((p) => p.id === recent[0].id);
    this.coverPress = sameCall; // DBs jump routes when you keep dialing it up
    for (const e of this.ents) {
      if (e.side !== 'def') continue;
      e.rusher = false;
      e.wonBlock = false;
      e.assignRole = null;
      e.zone = null;
      e.contain = false;
      e.spy = false;
      e.readDelay = 0;
      if (e.role.startsWith('DL')) {
        e.rusher = true; // four down linemen always rush
        // ends keep contain so the QB can't just bounce outside and take off
        if (e.role === 'DL0' || e.role === 'DL3') e.contain = true;
        continue;
      }
      if (e.role.startsWith('LB')) {
        const i = Number(e.role[2]);
        // LBs read the play for a beat before flowing (opens inside lanes
        // long enough for the back to hit the hole); if the user keeps
        // pounding it inside, they trigger downhill faster
        e.readDelay = clamp(0.75 - insideHeat * 0.18 - (e.player.attrs.awr / 99) * 0.15, 0.1, 0.75);
        if (this.defCall === 'blitz' && (i === 1 || i === 0)) {
          e.rusher = true; // blitz sends two linebackers
        } else if (this.defCall === 'coverage') {
          e.zone = zoneLandmark({ x: (i - 1) * 9, y: 8 });
          if (i === 1) e.spy = true; // middle dropper doubles as a QB spy
        } else {
          // balanced: LB0 spies RB, LB2 covers TE, LB1 spies the QB
          e.assignRole = i === 0 ? 'RB' : i === 2 ? 'TE' : null;
          if (i === 1) e.spy = true;
          else if (!e.assignRole) e.zone = zoneLandmark({ x: 0, y: 7 });
        }
        // if the user has been scrambling, add a second spy to wall the QB
        if (scrambleHeat >= 2 && i === 0 && this.defCall !== 'blitz') {
          e.spy = true;
          e.assignRole = null;
        }
        continue;
      }
      // secondary
      if (this.defCall === 'coverage') {
        // zone shell: corners take deep thirds, safeties split the deep middle
        const zmap: Record<string, RoutePoint> = {
          CB0: { x: -16, y: 16 }, CB1: { x: 16, y: 16 },
          S0: { x: -7, y: 20 }, S1: { x: 7, y: 20 },
        };
        e.zone = zoneLandmark(zmap[e.role] ?? { x: 0, y: 16 });
      } else {
        // man coverage; in balanced one safety plays deep help
        e.assignRole = man[e.role] ?? null;
        if (this.defCall === 'balanced' && e.role === 'S1') {
          e.assignRole = null;
          e.zone = zoneLandmark({ x: 0, y: 18 }); // deep middle help
        }
      }
    }
  }

  callFieldGoal(): void {
    if (this.phase !== 'playcall') return;
    this.startMeter('fg');
  }

  callPunt(): void {
    if (this.phase !== 'playcall') return;
    this.startMeter('punt');
  }

  callDefense(call: DefCall): void {
    if (this.phase !== 'defcall') return;
    this.defCall = call;
    this.phase = 'cpu';
    this.cpuTickTimer = 0.4;
    this.pushHud();
  }

  private setupFormation(play: OffensivePlay): void {
    const off = this.offenseP;
    const def = this.defenseP;
    this.ents = [];
    this.losY = 10 + (100 - this.yardsToGoal); // own goal line at y=10 basis: offense attacks +y toward y=110
    this.firstDownY = Math.min(110, this.losY + this.toGo);
    const midX = FIELD_W / 2;

    this.phys = new PhysicsWorld(FIELD_W, FIELD_LEN);
    this.fx = [];
    this.shake = 0;
    this.releaseT = 0;
    const addEnt = (p: Player, side: 'off' | 'def', role: string, rel: RoutePoint) => {
      this.ents.push({
        player: p, side, role,
        x: midX + rel.x, y: this.losY + rel.y,
        vx: 0, vy: 0, targetX: midX + rel.x, targetY: this.losY + rel.y,
        route: [], routeIdx: 0, engagedWith: null, engageTimer: 0, stunTimer: 0, isBlocking: false,
        body: null, lungeT: 0, celebT: 0, animPhase: 0, diveCd: 0, diving: false,
        rusher: false, wonBlock: false, beatBy: null, beatT: 0,
        assignRole: null, zone: null, beatenT: 0, beatenIdx: -1,
        contain: false, spy: false, readDelay: 0, faceRight: side === 'off',
      });
    };
    const addOff = (p: Player, role: string, rel: RoutePoint) => addEnt(p, 'off', role, rel);
    const addDef = (p: Player, role: string, rel: RoutePoint) => addEnt(p, 'def', role, rel);

    addOff(off.QB, 'QB', OFFENSE_ALIGNMENT.QB);
    addOff(off.RB[0], 'RB', OFFENSE_ALIGNMENT.RB);
    addOff(off.TE[0], 'TE', OFFENSE_ALIGNMENT.TE);
    addOff(off.WR[0], 'WR1', OFFENSE_ALIGNMENT.WR1);
    addOff(off.WR[1], 'WR2', OFFENSE_ALIGNMENT.WR2);
    addOff(off.WR[2], 'WR3', OFFENSE_ALIGNMENT.WR3);
    off.OL.forEach((p, i) => addOff(p, `OL${i}`, OFFENSE_ALIGNMENT[`OL${i}`]));
    def.DL.forEach((p, i) => addDef(p, `DL${i}`, DEFENSE_ALIGNMENT[`DL${i}`]));
    def.LB.forEach((p, i) => addDef(p, `LB${i}`, DEFENSE_ALIGNMENT[`LB${i}`]));
    def.CB.forEach((p, i) => addDef(p, `CB${i}`, DEFENSE_ALIGNMENT[`CB${i}`]));
    def.S.forEach((p, i) => addDef(p, `S${i}`, DEFENSE_ALIGNMENT[`S${i}`]));

    // clamp x to field, then give every player a physics body
    for (const e of this.ents) {
      e.x = clamp(e.x, 1.5, FIELD_W - 1.5);
      e.targetX = e.x;
      e.body = this.phys.addPlayer(e.x, e.y, e.player);
    }

    // routes (absolute coords)
    if (play.routes) {
      for (const [slot, pts] of Object.entries(play.routes)) {
        const ent = this.ents.find((e) => e.role === slot);
        if (ent && pts) {
          ent.route = pts.map((pt) => ({ x: clamp(midX + pt.x, 1.5, FIELD_W - 1.5), y: this.losY + pt.y }));
        }
      }
    }

    this.qbEnt = this.ents.find((e) => e.role === 'QB')!;
    const qb = this.qbEnt;
    this.ball.x = qb.x;
    this.ball.y = qb.y;
    this.ball.inFlight = false;
    this.ball.loose = false;
    this.ball.targetEnt = null;
    this.carrier = null;
    this.passThrown = false;
    this.scrambling = false;
    this.playElapsed = 0;
    this.jukeCooldown = 0;
    this.handoffTimer = play.type === 'run' ? 0.42 : -1;
  }

  snap(): void {
    if (this.phase !== 'presnap') return;
    audio.play('snap');
    this.phase = 'live';
    this.carrier = this.qbEnt;
    this.carrierSince = this.playElapsed;
    // QB sneak: QB is instantly the runner
    if (this.play?.id === 'qbsneak') this.handoffTimer = -1;
    this.pushHud();
  }

  setStick(x: number, y: number): void {
    this.stick.x = x;
    this.stick.y = y;
  }

  throwTo(slot: EligibleSlot): void {
    if (this.phase !== 'live' || this.passThrown || !this.carrier || this.carrier !== this.qbEnt) return;
    if (this.play?.type !== 'pass') return;
    const target = this.ents.find((e) => e.role === slot && e.side === 'off');
    if (!target) return;
    const qb = this.qbEnt!;
    // lead the receiver
    const lead = 0.45;
    const toX = clamp(target.x + target.vx * lead, 1, FIELD_W - 1);
    const toY = target.y + target.vy * lead;
    const dist = Math.hypot(toX - qb.x, toY - qb.y);
    const passSpeed = 16 + (qb.player.attrs.thp / 99) * 12;
    this.ball.inFlight = true;
    this.ball.flightT = 0;
    this.ball.flightDur = Math.max(0.28, dist / passSpeed);
    this.ball.fromX = qb.x;
    this.ball.fromY = qb.y;
    this.ball.toX = toX;
    this.ball.toY = toY;
    this.ball.targetEnt = target;
    this.passThrown = true;
    this.releaseT = 0.35;
    const air = toY - this.losY;
    this.passDepthAtThrow = air < 9 ? 'short' : air < 19 ? 'medium' : 'deep';
    this.carrier = null;
    this.pushHud();
  }

  juke(): void {
    if (this.phase !== 'live' || !this.carrier || this.jukeCooldown > 0) return;
    const c = this.carrier;
    this.jukeCooldown = 1.4;
    // stun nearest defender within 2.2 yds based on agility check
    let nearest: Ent | null = null;
    let nd = 2.2;
    for (const e of this.ents) {
      if (e.side !== 'def') continue;
      const d = Math.hypot(e.x - c.x, e.y - c.y);
      if (d < nd) {
        nd = d;
        nearest = e;
      }
    }
    // sideways burst perpendicular to current motion
    if (c.body && this.phys) {
      const dir = Math.sign(this.stick.x || (this.r.chance(0.5) ? 1 : -1));
      this.phys.impulse(c.body, dir * 6.5, 0);
    }
    if (nearest && this.r.chance(clamp(0.45 + (c.player.attrs.agi - nearest.player.attrs.tkl) * 0.008, 0.15, 0.85))) {
      nearest.stunTimer = 0.8;
      nearest.lungeT = 0.4; // whiffed dive
      this.spawnDust(nearest.x, nearest.y, 5);
    }
  }

  // ---------------------------------------------------------------------
  // effects
  // ---------------------------------------------------------------------
  spawnDust(x: number, y: number, n = 8): void {
    for (let i = 0; i < n; i++) {
      const a = this.r.range(0, Math.PI * 2);
      const sp = this.r.range(1, 4.5);
      this.fx.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: this.r.range(0.25, 0.55), maxLife: 0.55,
        color: this.r.chance(0.5) ? '#c9b78a' : '#e8dfc2', size: this.r.range(0.14, 0.3),
      });
    }
  }

  spawnConfetti(x: number, y: number): void {
    const colors = [this.userTeam.colors[0], this.userTeam.colors[1], '#ffcf40', '#ffffff'];
    for (let i = 0; i < 36; i++) {
      const a = this.r.range(-Math.PI, 0);
      const sp = this.r.range(4, 12);
      this.fx.push({
        x: x + this.r.range(-2, 2), y,
        vx: Math.cos(a) * sp * 0.4, vy: Math.sin(a) * sp * 0.3,
        life: this.r.range(0.8, 1.6), maxLife: 1.6,
        color: colors[i % colors.length], size: this.r.range(0.18, 0.34),
      });
    }
  }

  private updateFx(dt: number): void {
    for (const f of this.fx) {
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.vx *= 0.92;
      f.vy *= 0.92;
      f.life -= dt;
    }
    this.fx = this.fx.filter((f) => f.life > 0);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.2);
  }

  /** Freeze the action briefly (hit-stop / celebration), then resolve. */
  private freezeThen(duration: number, fn: () => void): void {
    this.phase = 'playover';
    this.postPlayTimer = duration;
    this.afterPlay = fn;
    this.pushHud();
  }

  /** Play a kick-flight animation, then run the resolution. */
  private kickThen(duration: number, fn: () => void): void {
    this.phase = 'kickflight';
    this.postPlayTimer = duration;
    this.afterPlay = fn;
    this.pushHud();
  }

  // ---------------------------------------------------------------------
  // live play tick
  // ---------------------------------------------------------------------
  tick(dt: number): void {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) {
        this.banner = null;
        this.pushHud();
      }
    }
    if (this.meter) {
      this.meter.value += this.meterDir * dt * 1.35;
      if (this.meter.value >= 1) {
        this.meter.value = 1;
        this.meterDir = -1;
      } else if (this.meter.value <= 0) {
        this.meter.value = 0;
        this.meterDir = 1;
      }
      this.pushHud();
      return;
    }
    if (this.phase === 'cpu') {
      this.cpuTickTimer -= dt;
      if (this.cpuTickTimer <= 0) {
        this.cpuTickTimer = 1.5;
        this.cpuPlay();
      }
      return;
    }
    // post-play hit-stop / celebration: physics keeps settling, then resolve
    if (this.phase === 'playover') {
      this.stepPhysics(dt);
      this.updateFx(dt);
      this.updatePoseTimers(dt);
      this.updateBall(dt);
      this.postPlayTimer -= dt;
      if (this.postPlayTimer <= 0 && this.afterPlay) {
        const fn = this.afterPlay;
        this.afterPlay = null;
        fn();
      }
      this.pushHud();
      return;
    }
    // kick in flight: advance the ball toward the uprights / downfield
    if (this.phase === 'kickflight') {
      if (this.kickAnim) {
        this.kickAnim.t += dt;
        const a = this.kickAnim;
        const p = Math.min(1, a.t / a.dur);
        this.ball.x = a.fromX + (a.toX - a.fromX) * p;
        this.ball.y = a.fromY + (a.toY - a.fromY) * p;
      }
      this.updateFx(dt);
      this.postPlayTimer -= dt;
      if (this.postPlayTimer <= 0 && this.afterPlay) {
        const fn = this.afterPlay;
        this.afterPlay = null;
        this.kickAnim = null;
        fn();
      }
      this.pushHud();
      return;
    }
    if (this.phase !== 'live') return;

    this.playElapsed += dt;
    if (this.jukeCooldown > 0) this.jukeCooldown -= dt;
    if (this.releaseT > 0) this.releaseT -= dt;

    // game clock ticks down in real time DURING the play so it visibly moves
    // (endQuarter is deferred to the play's natural end)
    if (this.clock > 0) {
      this.clock = Math.max(0, this.clock - dt);
      this.offStats.totals.timeOfPossession += dt;
    }

    // handoff
    if (this.handoffTimer > 0) {
      this.handoffTimer -= dt;
      if (this.handoffTimer <= 0) {
        const rb = this.ents.find((e) => e.role === 'RB')!;
        this.carrier = rb;
        this.carrierSince = this.playElapsed;
        // downhill burst toward the aiming point so the back hits the hole
        // with momentum instead of accelerating from a standstill into traffic
        if (rb.body && this.phys && this.play?.runPoint) {
          const aimX = clamp(FIELD_W / 2 + this.play.runPoint.x, 2, FIELD_W - 2);
          const dx = aimX - rb.x;
          const dl = Math.hypot(dx, 6) || 1;
          this.phys.impulse(rb.body, (dx / dl) * 4, (6 / dl) * 9);
        }
      }
    }

    this.updateOffense(dt);
    this.updateDefense(dt);
    this.stepPhysics(dt);
    this.updateFx(dt);
    this.updatePoseTimers(dt);
    this.updateBall(dt);
    this.checkOutcomes();
    this.pushHud();
  }

  /** Advance matter-js and copy body state back onto entities. */
  private stepPhysics(dt: number): void {
    if (!this.phys) return;
    // occupied (engaged) players become "blocked" so the ball carrier slips
    // through the pile instead of getting stuck behind his own line
    for (const e of this.ents) {
      if (!e.body) continue;
      this.phys.setBlocked(e.body, e.engagedWith != null && e !== this.carrier);
      this.phys.setPhasing(e.body, e === this.carrier);
    }
    this.phys.step(dt);
    for (const e of this.ents) {
      if (!e.body) continue;
      e.x = e.body.position.x;
      e.y = e.body.position.y;
      const v = this.phys.velocityOf(e.body);
      e.vx = v.vx;
      e.vy = v.vy;
      e.animPhase += Math.hypot(e.vx, e.vy) * dt * 0.55; // stride cadence
    }
  }

  private updatePoseTimers(dt: number): void {
    for (const e of this.ents) {
      if (e.lungeT > 0) {
        e.lungeT -= dt;
        if (e.lungeT <= 0 && e.diving) {
          // dive missed: defender eats turf and needs a beat to get up
          e.diving = false;
          e.stunTimer = Math.max(e.stunTimer, 0.55);
          this.spawnDust(e.x, e.y, 4);
        }
      }
      if (e.celebT > 0) e.celebT -= dt;
      if (e.diveCd > 0) e.diveCd -= dt;
      if (e.beatT > 0) {
        e.beatT -= dt;
        if (e.beatT <= 0) e.beatBy = null;
      }
      if (e.beatenT > 0) e.beatenT -= dt;
    }
  }

  private moveToward(e: Ent, tx: number, ty: number, dt: number, speedMult = 1): void {
    if (!e.body || !this.phys) return;
    const sp = speedOf(e.player) * speedMult;
    const dx = tx - e.x;
    const dy = ty - e.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.1) {
      this.phys.drive(e.body, 0, 0, 14, dt);
      return;
    }
    const acc = 13 + (e.player.attrs.acc / 99) * 11;
    this.phys.drive(e.body, (dx / d) * sp, (dy / d) * sp, acc, dt);
  }

  /**
   * Ball-carrier speed edge — a short BURST right after taking the ball so you
   * can hit the hole or beat a man to the edge, then it fades. It is time-based
   * (not depth-based) so an outside run can't just keep the boost all the way to
   * the sideline.
   */
  private offSpeedMult(e: Ent): number {
    if (e !== this.carrier) return 1;
    const carry = this.playElapsed - this.carrierSince;
    return carry < 0.75 ? 1.08 : 1.0; // burst window, then normal speed
  }

  /**
   * Defender pursuit-speed edge that RAMPS with how long the play has been
   * live. Early on the defense is a hair slow (let the play develop / blocks
   * matter); once you're in space it outpaces you, so scrambles and bounced
   * edge runs get run down instead of housing it every time.
   */
  private defPursuitMult(_carrier: Ent): number {
    const ramp = clamp(this.playElapsed - 0.7, 0, 1.4);
    return clamp(0.9 + ramp * 0.19, 0.9, 1.17); // 0.9 → ~1.17 over ~1.4s
  }

  private updateOffense(dt: number): void {
    const play = this.play!;
    for (const e of this.ents) {
      if (e.side !== 'off') continue;
      if (e === this.carrier) {
        // user steers the carrier through physics (momentum + collisions real)
        let sx = this.stick.x;
        let sy = this.stick.y;
        // RUN ASSIST: for the first beat after the handoff, bias the back toward
        // the designed hole and away from the nearest defender so he finds the
        // crease instead of running into his own line.
        if (
          play.type === 'run' &&
          e.role === 'RB' &&
          e.y < this.losY + 2 &&
          this.playElapsed < 1.5
        ) {
          const holeX = clamp(FIELD_W / 2 + (play.runPoint?.x ?? 0), 2.5, FIELD_W - 2.5);
          let toX = (holeX - e.x) * 0.4;
          let toY = 1;
          // dodge the closest defender in front
          let near: Ent | null = null;
          let nd = 3.5;
          for (const o of this.ents) {
            if (o.side !== 'def' || o.engagedWith || o.y < e.y) continue;
            const dd = Math.hypot(o.x - e.x, o.y - e.y);
            if (dd < nd) { nd = dd; near = o; }
          }
          if (near) toX += (e.x - near.x) * 0.5;
          const tl = Math.hypot(toX, toY) || 1;
          const assist = 0.55;
          sx = sx * (1 - assist) + (toX / tl) * assist;
          sy = sy * (1 - assist) + (toY / tl) * assist;
        }
        const mag = Math.hypot(sx, sy);
        if (e.body && this.phys) {
          if (mag > 0.08) {
            const sp = speedOf(e.player) * this.offSpeedMult(e);
            const acc = 14 + (e.player.attrs.acc / 99) * 12;
            // response curve: small drags still move near full speed
            const throttle = Math.min(1, Math.pow(Math.min(1, mag), 0.5));
            this.phys.drive(
              e.body,
              (sx / mag) * sp * throttle,
              (sy / mag) * sp * throttle,
              acc,
              dt,
            );
          } else {
            this.phys.drive(e.body, 0, 0, 12, dt);
          }
        }
        if (e === this.qbEnt && !this.scrambling && e.y > this.losY) this.scrambling = true;
        continue;
      }
      if (e.role.startsWith('OL')) {
        this.updateBlocker(e, dt);
        continue;
      }
      if (e.role === 'RB' && (play.type === 'run' ? this.handoffTimer > 0 : play.rbBlocks)) {
        if (play.type === 'run') {
          // run to mesh point behind QB
          this.moveToward(e, this.qbEnt!.x - 0.7, this.qbEnt!.y, dt, 0.9);
        } else {
          this.updateBlocker(e, dt); // pass pro
        }
        continue;
      }
      if (e.route.length > 0 && e !== this.carrier) {
        // run route
        const wp = e.route[Math.min(e.routeIdx, e.route.length - 1)];
        const d = Math.hypot(wp.x - e.x, wp.y - e.y);
        if (d < 0.7 && e.routeIdx < e.route.length - 1) e.routeIdx++;
        else if (d < 0.7 && e.routeIdx === e.route.length - 1) {
          // extend upfield / drift on scramble
          this.moveToward(e, e.x, e.y + 6, dt, 0.55);
          continue;
        }
        this.moveToward(e, wp.x, wp.y, dt);
        continue;
      }
      if (this.carrier && this.carrier !== e && !e.role.startsWith('OL')) {
        // Downfield blocking (runs, and after a catch): find the nearest
        // defender between the carrier and the end zone and go wall him; if
        // none is close, lead the carrier upfield instead of standing still.
        const c = this.carrier;
        let target: Ent | null = null;
        let bestD = 9;
        for (const d of this.ents) {
          if (d.side !== 'def' || d.stunTimer > 0 || d.engagedWith) continue;
          if (d.y < c.y - 1) continue; // only defenders in front of the ball
          const dist = Math.hypot(d.x - c.x, d.y - c.y);
          if (dist < bestD) { bestD = dist; target = d; }
        }
        if (target) {
          // get between the defender and the carrier and shove him away
          const bx = target.x + (target.x - c.x) * 0.15;
          this.moveToward(e, bx, target.y, dt, 0.95);
          if (Math.hypot(target.x - e.x, target.y - e.y) < 1.2 && !e.engagedWith && target.engagedWith == null) {
            e.engagedWith = target;
            target.engagedWith = e;
            e.engageTimer = 0.7;
          }
        } else {
          // lead upfield, staying just ahead of and beside the carrier
          this.moveToward(e, c.x + (e.x < c.x ? -1.5 : 1.5), c.y + 4, dt, 0.9);
        }
      } else if (e !== this.carrier && e.route.length === 0 && !e.role.startsWith('OL')) {
        // idle skill player with no job (e.g. a route already run out): settle
        // toward open space near the QB instead of jittering in place
        this.moveToward(e, e.x, this.losY + 10, dt, 0.4);
      }
    }
  }

  private updateBlocker(e: Ent, dt: number): void {
    const isRun = this.play?.type === 'run';
    // engaged: keep driving THROUGH the rusher so the bodies genuinely shove
    if (e.engagedWith && e.engagedWith.stunTimer <= 0 && e.engageTimer > 0) {
      e.engageTimer -= dt;
      const d = e.engagedWith;
      // block leverage: blk vs str decides how hard the blocker drives.
      const edge = (e.player.attrs.blk - d.player.attrs.str) * (isRun ? 0.016 : 0.009);
      const drivePow = (isRun ? 0.95 : 0.5) + edge;
      if (isRun) {
        // RUN blocking: drive the defender laterally OUT of the aiming gap so a
        // real lane opens, plus a little downfield push — instead of shoving him
        // into the back's path.
        const holeX = clamp(FIELD_W / 2 + (this.play?.runPoint?.x ?? 0), 2.5, FIELD_W - 2.5);
        const lateral = d.x < holeX ? -1 : 1; // wall him to his own side of the hole
        this.moveToward(e, d.x + lateral * 2.2, d.y + 1.1, dt, clamp(drivePow, 0.25, 1.1));
      } else {
        // PASS pro: wall the rusher away from the QB
        const protectee = this.carrier ?? this.qbEnt!;
        const awayX = d.x - protectee.x;
        const awayY = d.y - protectee.y;
        const al = Math.hypot(awayX, awayY) || 1;
        this.moveToward(e, d.x + (awayX / al) * 0.8, d.y + (awayY / al) * 0.8, dt, clamp(drivePow, 0.2, 1.05));
      }
      if (e.engageTimer <= 0 && this.phys && d.body) {
        // rusher WINS the rep: sheds with a burst to the ball and the blocker
        // can't re-grab him for a beat — this is how pressure gets home
        e.engagedWith = null;
        d.engagedWith = null;
        d.wonBlock = true;
        e.beatBy = d;
        e.beatT = 1.1;
        const t = this.carrier ?? this.qbEnt!;
        const sx = t.x - d.x;
        const sy = t.y - d.y;
        const sl = Math.hypot(sx, sy) || 1;
        this.phys.impulse(d.body, (sx / sl) * 6 + this.r.range(-1.5, 1.5), (sy / sl) * 6);
        e.stunTimer = 0.3; // blocker beaten for a beat
        this.spawnDust((e.x + d.x) / 2, (e.y + d.y) / 2, 4);
      }
      return;
    }
    // find someone to block: prefer an unblocked rusher threatening the QB,
    // skip anyone who just beat us and anyone already past us with a free lane
    const protectee = this.carrier ?? this.qbEnt!;
    let nearest: Ent | null = null;
    let best = 8;
    for (const d of this.ents) {
      if (d.side !== 'def' || d.engagedWith || d.stunTimer > 0) continue;
      if (d === e.beatBy || d.wonBlock) continue;
      const dist = Math.hypot(d.x - e.x, d.y - e.y);
      // weight rushers between us and the QB as the priority threat
      const threat = d.rusher || isRun ? dist : dist + 3;
      if (threat < best) {
        best = threat;
        nearest = d;
      }
    }
    // lock up sooner on runs so DL get walled at the line instead of shooting
    // into the backfield before an OL can reach them
    const engageRange = isRun ? 2.0 : 1.2;
    if (nearest && Math.hypot(nearest.x - e.x, nearest.y - e.y) < engageRange && !e.engagedWith) {
      // hold time from blk vs str; the pocket decays as the play ages so no
      // one blocks forever — a QB who holds the ball WILL eventually get hit
      const pocketDecay = this.play?.type === 'pass' ? this.playElapsed * 0.16 : 0;
      const hold = clamp(
        1.0 + (e.player.attrs.blk - nearest.player.attrs.str) * 0.03 + this.r.gauss(0, 0.22) - pocketDecay,
        0.3,
        3.4,
      );
      e.engagedWith = nearest;
      nearest.engagedWith = e;
      // run blocks sustain much longer so the crease stays open until the back
      // clears the line (a lost rep still eventually sheds via pursuit logic)
      e.engageTimer = isRun ? Math.max(1.6, hold + 1.1) : hold;
      this.spawnDust((e.x + nearest.x) / 2, (e.y + nearest.y) / 2, 3);
      // pad-pop on the initial hit, throttled so the line isn't a machine gun
      if (this.playElapsed - this.lastBlockSfx > 0.11) {
        this.lastBlockSfx = this.playElapsed;
        audio.play('block');
      }
    } else if (nearest) {
      // slide to wall off the threat (mirror between him and the QB)
      const mx = (nearest.x + protectee.x) / 2;
      const my = nearest.y - 0.3;
      this.moveToward(e, isRun ? nearest.x : mx, isRun ? nearest.y : my, dt, 0.9);
    }
  }

  private updateDefense(dt: number): void {
    const play = this.play!;
    const blitz = this.r; // deterministic-enough per-tick decisions below
    void blitz;
    for (const e of this.ents) {
      if (e.side !== 'def') continue;
      if (e.stunTimer > 0) {
        e.stunTimer -= dt;
        e.vx = 0;
        e.vy = 0;
        continue;
      }
      if (e.engagedWith) {
        const t = this.carrier ?? this.qbEnt!;
        // carrier has run DOWNFIELD past this battle: rip off and give chase.
        // (Only when the ball is past the defender — not when the back is still
        // in the backfield behind the line, which was stuffing every run.)
        if (this.carrier && this.carrier !== this.qbEnt && this.carrier.y - e.y > 2.5) {
          e.engagedWith.engagedWith = null;
          e.engagedWith = null;
          continue;
        }
        // in the blocker's grasp: bull-rush toward the ball, leverage from str.
        // On runs an engaged lineman gets walled and barely penetrates, so the
        // hole stays open — he only wins if he badly out-strengths the blocker.
        const isRunNow = this.play?.type === 'run';
        const bull = 0.12 + Math.max(0, e.player.attrs.str - e.engagedWith.player.attrs.blk) * 0.004;
        this.moveToward(e, t.x, t.y, dt, clamp(bull, isRunNow ? 0.03 : 0.1, isRunNow ? 0.22 : 0.5));
        if (e.engagedWith.engagedWith !== e || e.engagedWith.engageTimer <= 0) e.engagedWith = null;
        continue;
      }

      const carrier = this.carrier;
      const ballLive = !this.ball.inFlight;
      if (e.readDelay > 0) e.readDelay -= dt;

      // QB SPY: shadow the QB and blow up the easy scramble. Releases to
      // normal pursuit the moment the ball goes to someone else.
      if (e.spy && this.qbEnt && (!carrier || carrier === this.qbEnt)) {
        const qb = this.qbEnt;
        if (this.scrambling || qb.y > this.losY - 0.3) {
          this.moveToward(e, qb.x + qb.vx * 0.12, qb.y + qb.vy * 0.12, dt, 1.0); // trigger downhill
        } else {
          // sit just in front of the QB, mirroring his lateral moves
          this.moveToward(e, qb.x, Math.min(this.losY + 1.5, qb.y + 3), dt, 0.85);
        }
        continue;
      }

      // COVERAGE PLASTER: on a QB scramble/rollout the ball is still a pass
      // threat, so man/zone coverage defenders STAY with their receiver instead
      // of all running up at the QB (which left receivers wide open). They only
      // trigger up once the QB is a committed runner deep past the line or gets
      // close to them.
      const qb = this.qbEnt;
      const qbScramble = !!qb && carrier === qb && this.scrambling && !this.passThrown;
      if (qbScramble && qb && (e.assignRole || e.zone)) {
        const committed = qb.y > this.losY + 6;
        const near = Math.hypot(qb.x - e.x, qb.y - e.y) < 3.5;
        if (!committed && !near && ballLive) {
          if (e.assignRole) {
            const assign = this.ents.find((x) => x.side === 'off' && x.role === e.assignRole);
            if (assign) { this.coverTarget(e, assign, dt); continue; }
          } else if (e.zone) {
            this.moveToward(e, e.zone.x, e.zone.y, dt, 0.8);
            continue;
          }
        }
      }

      // ball carrier pursuit dominates everything once ball is committed
      if (carrier && (carrier !== this.qbEnt || this.scrambling || play.type === 'run')) {
        // second-level defenders read for a beat before flowing — this is what
        // opens an inside running lane instead of instant gang-tackles
        if (e.readDelay > 0 && e.role.startsWith('LB') && !this.scrambling) {
          this.moveToward(e, e.x, this.losY + 4.5, dt, 0.45);
          continue;
        }
        const dist = Math.hypot(carrier.x - e.x, carrier.y - e.y);
        const mySpeed = speedOf(e.player);
        const pm = this.defPursuitMult(carrier);
        if (dist > 3) {
          // true intercept: aim where the carrier will be when I can arrive
          const t = Math.min(0.7, dist / Math.max(4, mySpeed));
          this.moveToward(e, carrier.x + carrier.vx * t, carrier.y + carrier.vy * t, dt, pm);
        } else {
          // attack phase: aim straight at the body, no overshooting lead
          this.moveToward(e, carrier.x + carrier.vx * 0.08, carrier.y + carrier.vy * 0.08, dt, pm);
          // dive attempt: close, off cooldown, and actually closing in
          if (dist < 1.9 && e.diveCd <= 0 && this.phys && e.body) {
            const dvx = carrier.x + carrier.vx * 0.15 - e.x;
            const dvy = carrier.y + carrier.vy * 0.15 - e.y;
            const dl = Math.hypot(dvx, dvy) || 1;
            this.phys.impulse(e.body, (dvx / dl) * 7.5, (dvy / dl) * 7.5);
            e.lungeT = 0.38;
            e.diving = true;
            e.diveCd = 1.3;
          }
        }
        continue;
      }

      // play-action freezes a spying/rushing LB for a beat
      if (e.role.startsWith('LB') && play.playAction && this.playElapsed < 0.7) continue;

      // RUSHERS: designated pass rush (or beat their blocker). Once a rusher
      // has a free lane, drive hard for the QB — this is how sacks happen.
      if (e.rusher || e.wonBlock) {
        const qb = this.qbEnt!;
        // edge contain: squeeze from outside so the QB can't bounce and bolt
        if (e.contain && this.carrier === qb && !this.scrambling && qb.y <= this.losY + 0.5) {
          const side = e.role === 'DL0' ? -1 : 1;
          const tx = clamp(qb.x + side * 2.6, 1.5, FIELD_W - 1.5);
          this.moveToward(e, tx, qb.y + 0.2, dt, 0.9);
          continue;
        }
        const t = this.carrier ?? qb;
        const mult = e.wonBlock ? 1.02 : 0.95;
        this.moveToward(e, t.x + t.vx * 0.1, t.y + t.vy * 0.1, dt, mult);
        continue;
      }

      // BALL IN FLIGHT: break on the throw. The defender nearest the catch
      // point drives to contest it; everyone else stays TIGHT to their man
      // instead of drifting back toward the QB (which used to leave deep
      // receivers wide open).
      if (this.ball.inFlight) {
        const catchX = this.ball.toX;
        const catchY = this.ball.toY;
        const myD = Math.hypot(catchX - e.x, catchY - e.y);
        let iAmClosest = true;
        for (const o of this.ents) {
          if (o.side !== 'def' || o === e) continue;
          if (Math.hypot(catchX - o.x, catchY - o.y) < myD) { iAmClosest = false; break; }
        }
        const coversTarget = this.ball.targetEnt && e.assignRole === this.ball.targetEnt.role;
        if (iAmClosest || coversTarget) {
          this.moveToward(e, catchX, catchY, dt, 1.06); // drive to the ball
        } else if (e.assignRole) {
          const assign = this.ents.find((x) => x.side === 'off' && x.role === e.assignRole);
          if (assign) this.coverTarget(e, assign, dt);
        } else if (e.zone) {
          this.moveToward(e, e.zone.x, e.zone.y, dt, 0.7);
        } else {
          this.moveToward(e, e.x, e.y + 2, dt, 0.3); // hold, don't chase the QB
        }
        continue;
      }

      // MAN coverage on an assigned receiver
      if (e.assignRole) {
        const assign = this.ents.find((x) => x.side === 'off' && x.role === e.assignRole);
        if (assign && ballLive) {
          this.coverTarget(e, assign, dt);
          continue;
        }
      }

      // ZONE drop: sit at the landmark, but jump the nearest live threat in the area
      if (e.zone && ballLive) {
        let threat: Ent | null = null;
        let td = 7.5;
        for (const o of this.ents) {
          if (o.side !== 'off' || o.route.length === 0) continue;
          const d = Math.hypot(o.x - e.zone.x, o.y - e.zone.y);
          if (d < td) {
            td = d;
            threat = o;
          }
        }
        if (threat) this.coverTarget(e, threat, dt, 0.5);
        else this.moveToward(e, e.zone.x, e.zone.y, dt, 0.8);
        continue;
      }

      // fallback: mirror the ball at medium depth
      this.moveToward(e, this.ball.x, this.losY + 8, dt, 0.8);
    }
  }

  /**
   * Coverage step. Separation is a race: the defender runs at his OWN speed, so
   * a faster receiver naturally pulls away. cov rating sets how tightly he
   * anticipates the break; a low-cov defender who loses a rep is briefly
   * "beaten" and can't close, springing the receiver open.
   */
  private coverTarget(e: Ent, target: Ent, dt: number, cushionMul = 1): void {
    const covSkill = e.player.attrs.cov / 99;
    // on a route break, contest it: cov+agi vs the receiver's route-running
    if (target.routeIdx > (e.beatenIdx ?? -1) && target.route.length > 0) {
      e.beatenIdx = target.routeIdx;
      const winCover = 0.35 + (e.player.attrs.cov + e.player.attrs.agi) / 2 / 99 * 0.5
        - (target.player.attrs.agi + target.player.attrs.spd) / 2 / 99 * 0.5;
      if (!this.r.chance(clamp(winCover, 0.12, 0.9))) {
        e.beatenT = 0.35 + (1 - covSkill) * 0.5; // lost the rep — trails the cut
      }
    }
    // anticipate: good cover keys the receiver's lead; a beaten DB flat-foots
    const lead = e.beatenT > 0 ? -0.3 : covSkill * 0.35;
    const cushion = (1 - covSkill) * 1.1 * cushionMul * (this.coverPress ? 0.5 : 1);
    const tx = target.x + target.vx * lead;
    const ty = target.y + target.vy * lead - cushion;
    const speedMul = e.beatenT > 0 ? 0.72 : 1.0;
    this.moveToward(e, tx, ty, dt, speedMul);
  }

  private updateBall(dt: number): void {
    if (this.ball.loose) {
      this.ball.x = clamp(this.ball.x + this.ball.looseVx * dt, 0.2, FIELD_W - 0.2);
      this.ball.y += this.ball.looseVy * dt;
      this.ball.looseVx *= Math.pow(0.35, dt); // turf friction
      this.ball.looseVy *= Math.pow(0.35, dt);
      return;
    }
    if (this.ball.inFlight) {
      this.ball.flightT += dt;
      const t = Math.min(1, this.ball.flightT / this.ball.flightDur);
      this.ball.x = this.ball.fromX + (this.ball.toX - this.ball.fromX) * t;
      this.ball.y = this.ball.fromY + (this.ball.toY - this.ball.fromY) * t;
      if (t >= 1) this.resolveCatch();
      return;
    }
    const holder = this.carrier ?? this.qbEnt;
    if (holder) {
      this.ball.x = holder.x;
      this.ball.y = holder.y;
    }
  }

  private resolveCatch(): void {
    this.ball.inFlight = false;
    const target = this.ball.targetEnt;
    if (!target) {
      this.endPlay('incomplete', 0);
      return;
    }
    const qb = this.qbEnt!.player;
    const recvDist = Math.hypot(target.x - this.ball.toX, target.y - this.ball.toY);
    // nearest defender to the catch point
    let defEnt: Ent | null = null;
    let defDist = 99;
    for (const e of this.ents) {
      if (e.side !== 'def') continue;
      const d = Math.hypot(e.x - this.ball.toX, e.y - this.ball.toY);
      if (d < defDist) {
        defDist = d;
        defEnt = e;
      }
    }
    // separation → effective coverage rating
    const sep = defDist - recvDist;
    const covEff = defEnt ? clamp(92 - sep * 18, 20, 98) : 25;
    const pressured = false;

    // interception check first: defender jumps a badly-placed ball
    if (defEnt && defDist < 1.4 && defDist < recvDist) {
      const intP = interceptionProbability(qb, defEnt.player.attrs.cov, this.passDepthAtThrow, pressured) * 6;
      if (this.r.chance(clamp(intP, 0.08, 0.5))) {
        const qbLine = this.line(this.offStats, qb);
        this.bump(qbLine, 'passAtt');
        this.bump(qbLine, 'passInt');
        this.bump(this.line(this.defStats, defEnt.player), 'defInt');
        this.log(`${qb.lastName}'s pass INTERCEPTED by ${defEnt.player.lastName}!`);
        this.turnover('INTERCEPTED!', 100 - Math.round(clamp(this.ballSpotYtg(), 1, 99)));
        return;
      }
    }

    // receiver must be near the ball at all
    if (recvDist > 2.6) {
      const qbLine = this.line(this.offStats, qb);
      this.bump(qbLine, 'passAtt');
      this.bump(this.line(this.offStats, target.player), 'targets');
      this.log(`${qb.lastName}'s pass to ${target.player.lastName} falls incomplete.`);
      this.endPlay('incomplete', 0);
      return;
    }

    const catchP = completionProbability(qb, target.player, covEff, this.passDepthAtThrow, pressured) + 0.12;
    const qbLine = this.line(this.offStats, qb);
    this.bump(qbLine, 'passAtt');
    this.bump(this.line(this.offStats, target.player), 'targets');
    if (this.r.chance(clamp(catchP, 0.1, 0.96))) {
      this.carrier = target;
      this.carrierSince = this.playElapsed;
      target.route = [];
      audio.play('catch');
      this.setBannerFlash('CATCH!');
    } else {
      this.log(`${qb.lastName}'s pass to ${target.player.lastName} is ${sep < 0.5 ? 'broken up' : 'dropped'}.`);
      if (defEnt && sep < 0.5) {
        defEnt.lungeT = 0.45; // pass breakup swat
        this.spawnDust(this.ball.toX, this.ball.toY, 5);
      }
      this.freezeThen(0.5, () => this.endPlay('incomplete', 0));
    }
  }

  /** carrier's current yards-to-goal given ball y */
  private ballSpotYtg(): number {
    return 110 - this.ball.y;
  }

  private checkOutcomes(): void {
    if (this.phase !== 'live') return;

    // loose ball scramble: first body on the spot recovers it
    if (this.ball.loose) {
      this.ball.looseLockout -= 1 / 60;
      if (this.ball.looseLockout <= 0) {
        for (const e of this.ents) {
          if (e.stunTimer > 0) continue;
          if (Math.hypot(e.x - this.ball.x, e.y - this.ball.y) < 0.8) {
            this.recoverFumble(e);
            return;
          }
        }
      }
      // rolled out of bounds / dead: offense retains at the spot
      if (this.ball.x <= 0.4 || this.ball.x >= FIELD_W - 0.4 || this.playElapsed > 16) {
        this.ball.loose = false;
        this.log('The fumble rolls out of bounds — offense retains.');
        this.freezeThen(0.5, () => this.finishLivePlay(this.ball.y - this.losY, false, true));
      }
      return;
    }

    const c = this.carrier;
    if (!c) return;

    // touchdown → celebration hit-stop with confetti
    if (c.y >= this.losY + this.yardsToGoal) {
      c.celebT = 1.3;
      this.spawnConfetti(c.x, c.y);
      this.freezeThen(1.15, () => this.finishLivePlay(this.yardsToGoal + 1, true, false));
      return;
    }
    // out of bounds
    if (c.x <= 0.4 || c.x >= FIELD_W - 0.4) {
      this.freezeThen(0.4, () => this.finishLivePlay(c.y - this.losY, false, true));
      return;
    }
    // tackle checks: contact is physical, resolution is a momentum contest
    for (const e of this.ents) {
      if (e.side !== 'def' || e.stunTimer > 0 || e.engagedWith) continue;
      const d = Math.hypot(e.x - c.x, e.y - c.y);
      const reach = e.diving ? 1.45 : 1.1; // outstretched arms mid-dive
      if (d < reach) {
        e.diving = false; // contact made — resolve the attempt
        const isSack = c === this.qbEnt && !this.passThrown && !this.scrambling && this.play?.type === 'pass';
        // closing speed feeds the tackle: full-speed hits stick more often
        const closing = Math.hypot(e.vx - c.vx, e.vy - c.vy);
        // a back hit behind the line more often bounces off the first man so a
        // single penetrator doesn't blow up every run for a loss
        const behindLine =
          this.play?.type === 'run' && c !== this.qbEnt && c.y < this.losY + 1 ? 1.9 : 1;
        const breakP = tackleBreakProbability(c.player, e.player) * (isSack ? 0.3 : 1) * behindLine * clamp(1.25 - closing * 0.05, 0.5, 1.25);
        if (this.r.chance(clamp(breakP, 0.03, behindLine > 1 ? 0.75 : 0.55))) {
          // broken tackle: defender bounces off and eats turf
          e.stunTimer = 0.8;
          e.lungeT = 0.5;
          if (this.phys && e.body && c.body) {
            const kx = e.x - c.x;
            const ky = e.y - c.y;
            const kl = Math.hypot(kx, ky) || 1;
            this.phys.impulse(e.body, (kx / kl) * 4, (ky / kl) * 4);
            this.phys.impulse(c.body, (-kx / kl) * 1.2, (-ky / kl) * 1.2);
          }
          this.spawnDust((e.x + c.x) / 2, (e.y + c.y) / 2, 6);
          audio.play('kick');
          continue;
        }
        // fumble? ball pops out and is LIVE on the turf
        if (this.r.chance(fumbleProbability(c.player, true) * (isSack ? 2 : 1))) {
          const l = this.line(this.offStats, c.player);
          this.bump(l, 'fumbles');
          this.bump(this.line(this.defStats, e.player), 'forcedFum');
          this.log(`${c.player.lastName} FUMBLES — the ball is loose!`);
          this.setBanner('FUMBLE!', 'Ball is loose!');
          audio.play('tackle');
          this.shake = Math.min(1, this.shake + 0.7);
          this.spawnDust(c.x, c.y, 12);
          c.stunTimer = 0.9;
          e.lungeT = 0.5;
          const popA = this.r.range(0, Math.PI * 2);
          this.ball.loose = true;
          this.ball.looseVx = Math.cos(popA) * this.r.range(3, 7) + c.vx * 0.4;
          this.ball.looseVy = Math.sin(popA) * this.r.range(3, 7) + c.vy * 0.4;
          this.ball.looseLockout = 0.45;
          this.carrier = null;
          return;
        }
        // clean tackle: knockback along the hit vector, dust, camera shake
        audio.play('tackle');
        this.bump(this.line(this.defStats, e.player), 'tackles');
        if (isSack) {
          this.bump(this.line(this.defStats, e.player), 'sacks');
          this.bump(this.line(this.offStats, c.player), 'sacked');
          this.log(`${c.player.lastName} sacked by ${e.player.lastName}.`);
        }
        if (this.phys && c.body && e.body) {
          const hx = c.x - e.x;
          const hy = c.y - e.y;
          const hl = Math.hypot(hx, hy) || 1;
          const pop = 2.5 + closing * 0.35 + (e.player.attrs.str / 99) * 2;
          this.phys.impulse(c.body, (hx / hl) * pop + e.vx * 0.3, (hy / hl) * pop + e.vy * 0.3);
        }
        c.stunTimer = 1.0; // carrier down
        e.lungeT = 0.6; // tackler lunge pose
        this.shake = Math.min(1, this.shake + 0.35 + closing * 0.04);
        this.spawnDust((e.x + c.x) / 2, (e.y + c.y) / 2, 9);
        const spotY = c.y;
        this.freezeThen(0.8, () => this.finishLivePlay(spotY - this.losY, false, false));
        return;
      }
    }
    // play clock safety: force end after 14 seconds
    if (this.playElapsed > 14) {
      audio.play('whistle');
      this.freezeThen(0.4, () => this.finishLivePlay(c.y - this.losY, false, false));
    }
  }

  /** A live fumble gets scooped: offense plays on, defense takes over. */
  private recoverFumble(e: Ent): void {
    this.ball.loose = false;
    const offenseSide = 'off';
    if (e.side === offenseSide) {
      this.carrier = e;
      this.carrierSince = this.playElapsed;
      e.route = [];
      this.log(`${e.player.lastName} falls on the loose ball — offense keeps it!`);
      this.setBannerFlash('RECOVERED!');
      audio.play('catch');
    } else {
      this.log(`${e.player.lastName} recovers the fumble for the defense!`);
      const spotYtg = 100 - Math.round(clamp(110 - this.ball.y, 1, 99));
      this.freezeThen(0.7, () => this.turnover('FUMBLE!', spotYtg));
    }
  }

  /** Wrap up a live play: stats, downs, clock. `gained` in yards from LOS. */
  private finishLivePlay(gained: number, touchdown: boolean, outOfBounds: boolean): void {
    const c = this.carrier;
    const play = this.play!;
    const yards = Math.round(clamp(gained, -15, this.yardsToGoal));
    const qb = this.qbEnt!.player;

    // remember what the user just did so the defense can adjust to repetition
    if (this.possession === 'user') {
      const scramble = c === this.qbEnt && play.type === 'pass' && !this.passThrown;
      const inside = play.type === 'run' && Math.abs(play.runPoint?.x ?? 99) <= 3.5;
      this.recentPlays.push({ id: play.id, type: play.type, scramble, inside });
      if (this.recentPlays.length > 6) this.recentPlays.shift();
    }

    if (c) {
      if (c === this.qbEnt && play.type === 'pass' && !this.passThrown) {
        // scramble
        const l = this.line(this.offStats, qb);
        this.bump(l, 'rushAtt');
        this.bump(l, 'rushYds', yards);
        if (touchdown) this.bump(l, 'rushTd');
        this.offStats.totals.rushYds += yards;
        this.offStats.totals.totalYds += yards;
        this.log(`${qb.lastName} scrambles for ${yards} yards${touchdown ? ' — TOUCHDOWN!' : ''}.`);
      } else if (play.type === 'run' || c.role === 'RB' && !this.passThrown || c === this.qbEnt) {
        const l = this.line(this.offStats, c.player);
        this.bump(l, 'rushAtt');
        this.bump(l, 'rushYds', yards);
        if (touchdown) this.bump(l, 'rushTd');
        this.offStats.totals.rushYds += yards;
        this.offStats.totals.totalYds += yards;
        this.log(`${c.player.lastName} runs for ${yards} yards${touchdown ? ' — TOUCHDOWN!' : ''}.`);
      } else {
        // completed pass
        const qbLine = this.line(this.offStats, qb);
        this.bump(qbLine, 'passCmp');
        this.bump(qbLine, 'passYds', yards);
        if (touchdown) this.bump(qbLine, 'passTd');
        const rl = this.line(this.offStats, c.player);
        this.bump(rl, 'rec');
        this.bump(rl, 'recYds', yards);
        if (touchdown) this.bump(rl, 'recTd');
        this.offStats.totals.passYds += yards;
        this.offStats.totals.totalYds += yards;
        this.log(`${qb.lastName} to ${c.player.lastName} for ${yards} yards${touchdown ? ' — TOUCHDOWN!' : ''}.`);
      }
    }

    if (!touchdown) audio.play('whistle');

    // live 2-point conversion: reaching the goal is worth 2, anything else fails
    if (this.twoPtLive) {
      this.twoPtLive = false;
      if (touchdown) { this.score('user', 2); audio.play('touchdown'); this.setBanner('2-POINT CONVERSION!', 'Good!'); }
      else this.setBanner('2-PT NO GOOD', '');
      this.afterScoreKickoff();
      this.pushHud();
      return;
    }

    const clockStops = touchdown || outOfBounds;
    // the play's own duration already ran off live; charge the play-clock runoff
    // between snaps (large when the clock keeps running) to curb 50+ pt games
    this.chargeClock(clockStops ? 10 : 52);

    if (touchdown) {
      this.touchdownFor(this.possession);
      return;
    }
    this.advanceDowns(yards);
  }

  private endPlay(kind: 'incomplete', _yards: number): void {
    void kind;
    audio.play('whistle');
    if (this.twoPtLive) {
      this.twoPtLive = false;
      this.setBanner('2-PT NO GOOD', '');
      this.afterScoreKickoff();
      this.pushHud();
      return;
    }
    this.setBanner('INCOMPLETE', '');
    this.chargeClock(7);
    this.advanceDowns(0, true);
  }

  private advanceDowns(yards: number, incomplete = false): void {
    if (this.phase === 'gameover') return;
    if (this.down === 3) this.offStats.totals.thirdDownAtt++;
    this.yardsToGoal -= yards;
    if (!incomplete && yards >= this.toGo) {
      this.down = 1;
      this.toGo = Math.min(10, this.yardsToGoal);
      this.offStats.totals.firstDowns++;
      audio.play('firstdown');
    } else if (yards >= this.toGo && !incomplete) {
      // unreachable, kept for clarity
    } else {
      if (this.down === 3 && yards >= this.toGo) this.offStats.totals.thirdDownConv++;
      this.down++;
      this.toGo -= incomplete ? 0 : yards;
      if (this.down > 4) {
        this.log(`Turnover on downs!`);
        this.possession = this.possession === 'user' ? 'cpu' : 'user';
        this.setBanner('TURNOVER ON DOWNS', '');
        this.startDrive(100 - this.yardsToGoal);
        return;
      }
    }
    this.phase = this.possession === 'user' ? 'playcall' : 'defcall';
    this.pushHud();
  }

  // ---------------------------------------------------------------------
  // CPU offense: quick-resolve plays with the sim engine
  // ---------------------------------------------------------------------
  private cpuPlay(): void {
    if (this.phase !== 'cpu') return;
    const scoreDiff = this.cpuStats.score - this.userStats.score;
    const secondsLeftHalf = this.clock / this.timeScale;
    const half = this.quarter <= 2 ? 1 : 2;

    // 4th down logic
    if (this.down === 4) {
      const fgDist = this.yardsToGoal + 17;
      const mustScore = this.quarter === 4 && this.clock < this.quarterSeconds * 0.4 && scoreDiff < 0;
      if (fgDist <= 52 && (!mustScore || scoreDiff >= -3)) {
        const k = this.cpuP.K;
        const l = this.line(this.cpuStats, k);
        this.bump(l, 'fga');
        this.chargeClock(12);
        if (this.r.chance(fgMakeProbability(k, fgDist))) {
          this.bump(l, 'fgm');
          l.fgLong = Math.max(l.fgLong ?? 0, fgDist);
          this.score('cpu', 3);
          this.log(`${this.cpuTeam.abbr} FG good from ${fgDist}.`);
          this.setBanner(`${this.cpuTeam.abbr} FIELD GOAL`, `${fgDist} yards`);
          this.possession = 'user';
          this.startDrive(75);
        } else {
          this.log(`${this.cpuTeam.abbr} FG MISSED from ${fgDist}!`);
          this.possession = 'user';
          this.startDrive(Math.max(20, 100 - (this.yardsToGoal + 7)));
        }
        return;
      }
      if (!mustScore && this.yardsToGoal > 35 && this.toGo > 1.5) {
        const p = this.cpuP.P;
        const l = this.line(this.cpuStats, p);
        this.bump(l, 'punts');
        const gross = clamp(this.r.gauss(43, 5), 25, 62);
        this.bump(l, 'puntYds', Math.round(gross));
        let newYtg = 100 - (this.yardsToGoal - Math.round(gross - 6));
        if (newYtg >= 100) newYtg = 80;
        this.log(`${this.cpuTeam.abbr} punt.`);
        this.chargeClock(14);
        this.possession = 'user';
        this.startDrive(newYtg);
        return;
      }
    }

    // pick a play like the season sim does
    let passProb = this.down >= 3 && this.toGo > 2 ? 0.85 : 0.52;
    if (scoreDiff < -7 && half === 2) passProb += 0.2;
    // user's defensive call shifts outcomes
    let defExpectsPass = 0.5;
    if (this.defCall === 'blitz') defExpectsPass = 0.62;
    if (this.defCall === 'coverage') defExpectsPass = 0.78;

    const call: Parameters<typeof resolveSimPlay>[0]['call'] = this.r.chance(clamp(passProb, 0.1, 0.95))
      ? { type: 'pass', depth: this.toGo >= 10 ? (this.r.chance(0.5) ? 'medium' : 'deep') : this.r.chance(0.6) ? 'short' : 'medium' }
      : { type: 'run', direction: this.r.chance(0.62) ? 'inside' : 'outside' };

    const res = resolveSimPlay({
      r: this.r,
      offense: this.cpuP,
      defense: this.userP,
      yardsToGoal: this.yardsToGoal,
      toGo: this.toGo,
      call,
      hurryUp: half === 2 && secondsLeftHalf < 180 && scoreDiff < 0,
      defExpectsPass,
    });

    // blitz call: more sacks & more big plays already encoded via defExpectsPass;
    // add explicit modifiers
    let yards = res.yards;
    if (this.defCall === 'blitz' && res.kind === 'pass' && res.complete && this.r.chance(0.25)) {
      yards = Math.round(Math.min(this.yardsToGoal, yards * 1.4 + 4));
    }

    // stats
    this.applyCpuStats(res, yards);
    this.log(`${this.cpuTeam.abbr}: ${res.text}`);
    this.chargeClock(res.timeElapsed);
    if ((this.phase as ArcadePhase) === 'gameover') return;

    if (res.turnover) {
      this.possession = 'user';
      this.setBanner(res.turnover === 'int' ? 'INTERCEPTION!' : 'FUMBLE RECOVERED!', 'Your ball!');
      this.startDrive(100 - clamp(this.yardsToGoal - yards, 1, 99));
      return;
    }
    if (yards >= this.yardsToGoal) {
      this.touchdownFor('cpu');
      return;
    }
    this.yardsToGoal -= yards;
    if (yards >= this.toGo) {
      this.down = 1;
      this.toGo = Math.min(10, this.yardsToGoal);
      this.cpuStats.totals.firstDowns++;
    } else {
      this.down++;
      this.toGo -= yards;
      if (this.down > 4) {
        this.log(`${this.cpuTeam.abbr} turned over on downs!`);
        this.possession = 'user';
        this.setBanner('TURNOVER ON DOWNS', 'Your ball!');
        this.startDrive(100 - this.yardsToGoal);
        return;
      }
    }
    this.pushHud();
  }

  private applyCpuStats(res: ReturnType<typeof resolveSimPlay>, yards: number): void {
    const s = this.cpuStats;
    const d = this.userStats;
    if (this.down === 3) s.totals.thirdDownAtt++;
    if (res.kind === 'run' || res.kind === 'scramble' || res.kind === 'kneel') {
      const rusher = res.rusher ?? this.cpuP.RB[0];
      const l = this.line(s, rusher);
      this.bump(l, 'rushAtt');
      this.bump(l, 'rushYds', yards);
      if (yards >= this.yardsToGoal) this.bump(l, 'rushTd');
      if (res.turnover === 'fumble') this.bump(l, 'fumbles');
      s.totals.rushYds += yards;
      s.totals.totalYds += yards;
      if (res.tackler) this.bump(this.line(d, res.tackler), 'tackles');
    } else if (res.kind === 'sack') {
      this.bump(this.line(s, this.cpuP.QB), 'sacked');
      s.totals.passYds += yards;
      s.totals.totalYds += yards;
      if (res.sacker) {
        this.bump(this.line(d, res.sacker), 'sacks');
        this.bump(this.line(d, res.sacker), 'tackles');
      }
    } else if (res.kind === 'pass') {
      const qbL = this.line(s, res.passer!);
      this.bump(qbL, 'passAtt');
      if (res.receiver) this.bump(this.line(s, res.receiver), 'targets');
      if (res.turnover === 'int') {
        this.bump(qbL, 'passInt');
        if (res.interceptor) this.bump(this.line(d, res.interceptor), 'defInt');
      } else if (res.complete) {
        this.bump(qbL, 'passCmp');
        this.bump(qbL, 'passYds', yards);
        const rl = this.line(s, res.receiver!);
        this.bump(rl, 'rec');
        this.bump(rl, 'recYds', yards);
        if (yards >= this.yardsToGoal) {
          this.bump(qbL, 'passTd');
          this.bump(rl, 'recTd');
        }
        s.totals.passYds += yards;
        s.totals.totalYds += yards;
        if (res.tackler) this.bump(this.line(d, res.tackler), 'tackles');
      }
    }
    if (res.turnover) s.totals.turnovers++;
  }

  /** Skip the rest of the CPU's current drive instantly. */
  skipCpuDrive(): void {
    let guard = 0;
    while (this.phase === 'cpu' && guard++ < 30) this.cpuPlay();
    this.pushHud();
  }

  /** Instantly resolve the rest of the game with the sim engine. */
  simRestOfGame(): void {
    let guard = 0;
    while (this.phase !== 'gameover' && guard++ < 600) {
      if (this.phase === 'cpu') {
        this.cpuPlay();
        continue;
      }
      if (this.phase === 'defcall') {
        this.callDefense('balanced');
        continue;
      }
      if (this.phase === 'patchoice') {
        // auto XP
        const k = this.userP.K;
        const l = this.line(this.userStats, k);
        this.bump(l, 'xpa');
        if (this.r.chance(0.94)) {
          this.bump(l, 'xpm');
          this.score('user', 1);
        }
        this.afterScoreKickoff();
        continue;
      }
      if (this.phase === 'kickmeter') {
        this.meter = null;
        this.phase = 'playcall';
        continue;
      }
      // user offense: auto-resolve with sim engine
      if (this.phase === 'playcall' || this.phase === 'presnap' || this.phase === 'live') {
        this.autoResolveUserPlay();
      }
    }
    this.pushHud();
  }

  private autoResolveUserPlay(): void {
    const scoreDiff = this.userStats.score - this.cpuStats.score;
    if (this.down === 4) {
      const fgDist = this.yardsToGoal + 17;
      if (fgDist <= 50) {
        const k = this.userP.K;
        const l = this.line(this.userStats, k);
        this.bump(l, 'fga');
        this.chargeClock(12);
        if (this.r.chance(fgMakeProbability(k, fgDist))) {
          this.bump(l, 'fgm');
          l.fgLong = Math.max(l.fgLong ?? 0, fgDist);
          this.score('user', 3);
          this.possession = 'cpu';
          this.startDrive(75);
        } else {
          this.possession = 'cpu';
          this.startDrive(Math.max(20, 100 - (this.yardsToGoal + 7)));
        }
        return;
      }
      if (this.yardsToGoal > 35) {
        const p = this.userP.P;
        const l = this.line(this.userStats, p);
        this.bump(l, 'punts');
        const gross = clamp(this.r.gauss(43, 5), 25, 62);
        this.bump(l, 'puntYds', Math.round(gross));
        let newYtg = 100 - (this.yardsToGoal - Math.round(gross - 6));
        if (newYtg >= 100) newYtg = 80;
        this.chargeClock(14);
        this.possession = 'cpu';
        this.startDrive(newYtg);
        return;
      }
    }
    const res = resolveSimPlay({
      r: this.r,
      offense: this.userP,
      defense: this.cpuP,
      yardsToGoal: this.yardsToGoal,
      toGo: this.toGo,
      call: this.r.chance(this.down >= 3 && this.toGo > 2 ? 0.85 : 0.52)
        ? { type: 'pass', depth: this.r.chance(0.6) ? 'short' : this.r.chance(0.6) ? 'medium' : 'deep' }
        : { type: 'run', direction: this.r.chance(0.62) ? 'inside' : 'outside' },
      hurryUp: this.quarter === 4 && this.clock < this.quarterSeconds * 0.3 && scoreDiff < 0,
      defExpectsPass: 0.5,
    });
    // reuse cpu stat application against the right side
    const swap = this.possession;
    void swap;
    this.applyUserSimStats(res);
    this.chargeClock(res.timeElapsed);
    if ((this.phase as ArcadePhase) === 'gameover') return;
    if (res.turnover) {
      this.userStats.totals.turnovers++;
      this.possession = 'cpu';
      this.startDrive(100 - clamp(this.yardsToGoal - res.yards, 1, 99));
      return;
    }
    if (res.yards >= this.yardsToGoal) {
      this.score('user', 6);
      const k = this.userP.K;
      const l = this.line(this.userStats, k);
      this.bump(l, 'xpa');
      if (this.r.chance(0.94)) {
        this.bump(l, 'xpm');
        this.score('user', 1);
      }
      this.possession = 'cpu';
      this.startDrive(75);
      return;
    }
    this.yardsToGoal -= res.yards;
    if (res.yards >= this.toGo) {
      this.down = 1;
      this.toGo = Math.min(10, this.yardsToGoal);
      this.userStats.totals.firstDowns++;
    } else {
      this.down++;
      this.toGo -= Math.max(0, res.yards);
      if (this.down > 4) {
        this.possession = 'cpu';
        this.startDrive(100 - this.yardsToGoal);
      }
    }
  }

  private applyUserSimStats(res: ReturnType<typeof resolveSimPlay>): void {
    const s = this.userStats;
    const d = this.cpuStats;
    const yards = res.yards;
    if (res.kind === 'run' || res.kind === 'scramble' || res.kind === 'kneel') {
      const rusher = res.rusher ?? this.userP.RB[0];
      const l = this.line(s, rusher);
      this.bump(l, 'rushAtt');
      this.bump(l, 'rushYds', yards);
      if (yards >= this.yardsToGoal) this.bump(l, 'rushTd');
      s.totals.rushYds += yards;
      s.totals.totalYds += yards;
    } else if (res.kind === 'sack') {
      this.bump(this.line(s, this.userP.QB), 'sacked');
      if (res.sacker) this.bump(this.line(d, res.sacker), 'sacks');
    } else if (res.kind === 'pass') {
      const qbL = this.line(s, res.passer!);
      this.bump(qbL, 'passAtt');
      if (res.turnover === 'int') {
        this.bump(qbL, 'passInt');
        if (res.interceptor) this.bump(this.line(d, res.interceptor), 'defInt');
      } else if (res.complete) {
        this.bump(qbL, 'passCmp');
        this.bump(qbL, 'passYds', yards);
        const rl = this.line(s, res.receiver!);
        this.bump(rl, 'rec');
        this.bump(rl, 'recYds', yards);
        if (yards >= this.yardsToGoal) {
          this.bump(qbL, 'passTd');
          this.bump(rl, 'recTd');
        }
        s.totals.passYds += yards;
        s.totals.totalYds += yards;
      }
    }
  }

  // ---------------------------------------------------------------------
  // finish
  // ---------------------------------------------------------------------
  private finish(): void {
    this.phase = 'gameover';
    const u = this.userStats.score;
    const c = this.cpuStats.score;
    this.gameOverMsg =
      u > c ? `You win ${u}–${c}!` : u < c ? `You fall ${u}–${c}.` : `It ends in a ${u}–${c} tie.`;
    // mark games played
    for (const [stats, P] of [
      [this.userStats, this.userP],
      [this.cpuStats, this.cpuP],
    ] as const) {
      const all = [P.QB, ...P.RB, ...P.WR, ...P.TE, ...P.OL, ...P.DL, ...P.LB, ...P.CB, ...P.S, P.K, P.P];
      for (const p of all) {
        if (!p) continue;
        this.bump(this.line(stats, p), 'gamesPlayed');
      }
    }
    this.pushHud();
    this.endedCb?.();
  }

  buildBoxScore(): BoxScore {
    const homeSide = this.userIsHome ? this.userStats : this.cpuStats;
    const awaySide = this.userIsHome ? this.cpuStats : this.userStats;
    return {
      gameId: this.game.id,
      season: this.league.season,
      week: this.game.week,
      homeId: this.game.homeId,
      awayId: this.game.awayId,
      homeScore: homeSide.score,
      awayScore: awaySide.score,
      quarterScores: [homeSide.quarterScores, awaySide.quarterScores],
      homeStats: Object.values(homeSide.lines),
      awayStats: Object.values(awaySide.lines),
      homeTeamTotals: homeSide.totals,
      awayTeamTotals: awaySide.totals,
      playByPlay: this.playByPlay.slice(-120),
    };
  }

  // ---------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------
  private setBanner(big: string, small: string): void {
    this.banner = { big, small };
    this.bannerTimer = 1.9;
    this.pushHud();
  }
  private setBannerFlash(big: string): void {
    this.banner = { big, small: '' };
    this.bannerTimer = 0.55;
  }

  /** Fixed button assignment per slot — gamepad-style letters and colors. */
  static readonly RECV_ICONS: Record<EligibleSlot, { label: string; color: string }> = {
    WR1: { label: 'X', color: '#3b82f6' },
    WR2: { label: 'A', color: '#22c55e' },
    WR3: { label: 'Y', color: '#eab308' },
    TE: { label: 'B', color: '#ef4444' },
    RB: { label: 'RB', color: '#8b93a8' },
  };

  private receiverButtons(): HudState['receivers'] {
    if (this.phase !== 'live' || this.passThrown || this.play?.type !== 'pass' || this.carrier !== this.qbEnt) {
      return [];
    }
    const slots: EligibleSlot[] = ['WR1', 'WR2', 'WR3', 'TE', 'RB'];
    return slots
      .filter((s) => this.play?.routes?.[s])
      .map((s) => ({ slot: s, ...ArcadeGame.RECV_ICONS[s] }));
  }

  private pushHud(): void {
    this.hudCb?.({
      phase: this.phase,
      quarter: this.quarter,
      clock: Math.max(0, this.clock),
      down: this.down,
      toGo: Math.max(1, Math.round(this.toGo)),
      yardsToGoal: Math.round(this.yardsToGoal),
      userScore: this.userStats.score,
      cpuScore: this.cpuStats.score,
      userAbbr: this.userTeam.abbr,
      cpuAbbr: this.cpuTeam.abbr,
      userColors: [this.userTeam.colors[0], this.userTeam.colors[1]],
      cpuColors: [this.cpuTeam.colors[0], this.cpuTeam.colors[1]],
      possession: this.possession,
      quarterLabel: ['1ST', '2ND', '3RD', '4TH'][Math.min(3, this.quarter - 1)],
      ballOn: this.ballOnLabel(),
      userHasBall: this.possession === 'user',
      banner: this.banner,
      lastPlayText: this.lastPlayText,
      receivers: this.receiverButtons(),
      meter: this.meter,
      canJuke: this.phase === 'live' && !!this.carrier && this.jukeCooldown <= 0,
      gameOver: this.phase === 'gameover',
      finalMsg: this.gameOverMsg,
    });
  }

  /** Broadcast-style ball spot, e.g. "OPP 35", "OWN 22", or "50". */
  private ballOnLabel(): string {
    const ytg = Math.round(this.yardsToGoal);
    if (ytg === 50) return '50';
    const offAbbr = this.possession === 'user' ? this.userTeam.abbr : this.cpuTeam.abbr;
    const defAbbr = this.possession === 'user' ? this.cpuTeam.abbr : this.userTeam.abbr;
    return ytg < 50 ? `${defAbbr} ${ytg}` : `${offAbbr} ${100 - ytg}`;
  }
}
