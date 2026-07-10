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
}

export interface BallState {
  x: number;
  y: number;
  inFlight: boolean;
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
  userHasBall: boolean;
  banner: { big: string; small: string } | null;
  lastPlayText: string;
  receivers: { slot: EligibleSlot; label: string }[];
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
  return 4.3 + (p.attrs.spd / 99) * 4.9; // yds/sec
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
    x: 0, y: 0, inFlight: false, flightT: 0, flightDur: 0, fromX: 0, fromY: 0, toX: 0, toY: 0, targetEnt: null,
  };
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
      const res = resolveSimPlay({
        r: this.r,
        offense: this.userP,
        defense: this.cpuP,
        yardsToGoal: 2,
        toGo: 2,
        call: this.r.chance(0.5) ? { type: 'run', direction: 'inside' } : { type: 'pass', depth: 'short' },
        hurryUp: false,
        defExpectsPass: 0.5,
      });
      if (res.yards >= 2 && !res.turnover) {
        this.score('user', 2);
        this.setBanner('2-PT GOOD!', '');
      } else {
        this.setBanner('2-PT FAILED', '');
      }
      this.afterScoreKickoff();
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
    const inZone = v >= this.meter.zoneLo && v <= this.meter.zoneHi;
    const off = Math.abs(v - (this.meter.zoneLo + this.meter.zoneHi) / 2);
    const kind = this.meter.kind;
    this.meter = null;
    audio.play('kick');

    if (kind === 'xp') {
      const k = this.userP.K;
      const l = this.line(this.userStats, k);
      this.bump(l, 'xpa');
      const p = clamp(0.96 - off * 1.4 + (k.attrs.kck - 75) * 0.002, 0.2, 0.99);
      if (this.r.chance(p)) {
        this.bump(l, 'xpm');
        this.score('user', 1);
        this.setBanner('EXTRA POINT GOOD', '');
      } else {
        this.setBanner('XP MISSED!', '');
      }
      this.afterScoreKickoff();
    } else if (kind === 'fg') {
      const dist = this.yardsToGoal + 17;
      const k = this.userP.K;
      const l = this.line(this.userStats, k);
      this.bump(l, 'fga');
      let p = fgMakeProbability(k, dist);
      p = clamp(p + (inZone ? 0.12 : -0.3) - off * 0.8, 0.02, 0.99);
      this.chargeClock(6);
      if (this.r.chance(p)) {
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
    } else {
      // punt
      const p = this.userP.P;
      const l = this.line(this.userStats, p);
      this.bump(l, 'punts');
      const power = clamp(v, 0.2, 1);
      const gross = clamp(28 + power * 32 + (p.attrs.kck - 75) * 0.2, 20, 65);
      const returnYds = this.r.chance(0.5) ? Math.max(0, this.r.gauss(7, 6)) : 0;
      const net = Math.round(gross - returnYds);
      this.bump(l, 'puntYds', Math.round(gross));
      let newYtg = 100 - (this.yardsToGoal - net);
      if (newYtg >= 100) newYtg = 80;
      this.log(`${p.lastName} punts ${Math.round(gross)} yards.`);
      this.chargeClock(14);
      this.possession = 'cpu';
      this.startDrive(newYtg);
    }
    this.pushHud();
  }

  // ---------------------------------------------------------------------
  // play calling (user offense)
  // ---------------------------------------------------------------------
  callPlay(play: OffensivePlay): void {
    if (this.phase !== 'playcall') return;
    this.play = play;
    this.setupFormation(play);
    this.phase = 'presnap';
    this.pushHud();
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

    const addOff = (p: Player, role: string, rel: RoutePoint) => {
      this.ents.push({
        player: p, side: 'off', role,
        x: midX + rel.x, y: this.losY + rel.y,
        vx: 0, vy: 0, targetX: midX + rel.x, targetY: this.losY + rel.y,
        route: [], routeIdx: 0, engagedWith: null, engageTimer: 0, stunTimer: 0, isBlocking: false,
      });
    };
    const addDef = (p: Player, role: string, rel: RoutePoint) => {
      this.ents.push({
        player: p, side: 'def', role,
        x: midX + rel.x, y: this.losY + rel.y,
        vx: 0, vy: 0, targetX: midX + rel.x, targetY: this.losY + rel.y,
        route: [], routeIdx: 0, engagedWith: null, engageTimer: 0, stunTimer: 0, isBlocking: false,
      });
    };

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

    // clamp x to field
    for (const e of this.ents) {
      e.x = clamp(e.x, 1.5, FIELD_W - 1.5);
      e.targetX = e.x;
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
    this.ball.targetEnt = null;
    this.carrier = null;
    this.passThrown = false;
    this.scrambling = false;
    this.playElapsed = 0;
    this.jukeCooldown = 0;
    this.handoffTimer = play.type === 'run' ? 0.55 : -1;
  }

  snap(): void {
    if (this.phase !== 'presnap') return;
    audio.play('snap');
    this.phase = 'live';
    this.carrier = this.qbEnt;
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
    if (nearest && this.r.chance(clamp(0.45 + (c.player.attrs.agi - nearest.player.attrs.tkl) * 0.008, 0.15, 0.85))) {
      nearest.stunTimer = 0.8;
    }
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
    if (this.phase !== 'live') return;

    this.playElapsed += dt;
    if (this.jukeCooldown > 0) this.jukeCooldown -= dt;

    // handoff
    if (this.handoffTimer > 0) {
      this.handoffTimer -= dt;
      if (this.handoffTimer <= 0) {
        const rb = this.ents.find((e) => e.role === 'RB')!;
        this.carrier = rb;
      }
    }

    this.updateOffense(dt);
    this.updateDefense(dt);
    this.updateBall(dt);
    this.checkOutcomes();
    this.pushHud();
  }

  private moveToward(e: Ent, tx: number, ty: number, dt: number, speedMult = 1): void {
    const sp = speedOf(e.player) * speedMult;
    const dx = tx - e.x;
    const dy = ty - e.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.05) {
      e.vx = 0;
      e.vy = 0;
      return;
    }
    const nx = dx / d;
    const ny = dy / d;
    e.vx = nx * sp;
    e.vy = ny * sp;
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.x = clamp(e.x, 0.3, FIELD_W - 0.3);
  }

  private updateOffense(dt: number): void {
    const play = this.play!;
    for (const e of this.ents) {
      if (e.side !== 'off') continue;
      if (e === this.carrier) {
        // user controls carrier via stick
        const mag = Math.hypot(this.stick.x, this.stick.y);
        if (mag > 0.12) {
          const sp = speedOf(e.player);
          e.vx = (this.stick.x / Math.max(1, mag)) * sp;
          e.vy = (this.stick.y / Math.max(1, mag)) * sp;
          e.x = clamp(e.x + e.vx * dt, 0.3, FIELD_W - 0.3);
          e.y += e.vy * dt;
        } else {
          e.vx = 0;
          e.vy = 0;
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
      if (play.type === 'run' && this.carrier && this.carrier !== e && !e.role.startsWith('OL')) {
        // downfield blockers drift with the carrier
        this.updateBlocker(e, dt);
      }
    }
  }

  private updateBlocker(e: Ent, dt: number): void {
    // find nearest unengaged rusher
    if (e.engagedWith && e.engagedWith.stunTimer <= 0 && e.engageTimer > 0) {
      e.engageTimer -= dt;
      const d = e.engagedWith;
      // hold position between defender and QB/carrier
      const protectee = this.carrier ?? this.qbEnt!;
      const px = (d.x + protectee.x) / 2;
      const py = (d.y + protectee.y) / 2;
      this.moveToward(e, px, py, dt, 0.75);
      if (e.engageTimer <= 0) {
        e.engagedWith = null; // shed
      }
      return;
    }
    let nearest: Ent | null = null;
    let nd = 7;
    for (const d of this.ents) {
      if (d.side !== 'def' || d.engagedWith || d.stunTimer > 0) continue;
      const dist = Math.hypot(d.x - e.x, d.y - e.y);
      if (dist < nd) {
        nd = dist;
        nearest = d;
      }
    }
    if (nearest && nd < 1.1 && !e.engagedWith) {
      // engage: hold time from blk vs str
      const hold = clamp(
        1.1 + (e.player.attrs.blk - nearest.player.attrs.str) * 0.028 + this.r.gauss(0, 0.25),
        0.35,
        3.2,
      );
      e.engagedWith = nearest;
      nearest.engagedWith = e;
      e.engageTimer = hold;
    } else if (nearest) {
      this.moveToward(e, nearest.x, nearest.y, dt, 0.85);
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
        // pinned by blocker: push slowly toward QB
        const t = this.carrier ?? this.qbEnt!;
        this.moveToward(e, t.x, t.y, dt, 0.12);
        if (e.engagedWith.engagedWith !== e || e.engagedWith.engageTimer <= 0) e.engagedWith = null;
        continue;
      }

      const carrier = this.carrier;
      const ballLive = !this.ball.inFlight;

      // ball carrier pursuit dominates everything once ball is committed
      if (carrier && (carrier !== this.qbEnt || this.scrambling || play.type === 'run')) {
        // intercept angle
        const lead = clamp(Math.hypot(carrier.x - e.x, carrier.y - e.y) * 0.18, 0, 1.4);
        this.moveToward(e, carrier.x + carrier.vx * lead, carrier.y + carrier.vy * lead, dt);
        continue;
      }

      if (e.role.startsWith('DL')) {
        // rush the passer / run fit
        const t = this.carrier ?? this.qbEnt!;
        this.moveToward(e, t.x, t.y, dt, 0.92);
        continue;
      }
      if (e.role.startsWith('LB')) {
        const i = Number(e.role[2]);
        // one LB rushes sometimes; others cover RB/TE/short zone
        if (i === 1 && play.playAction && this.playElapsed < 0.8) {
          // frozen by play action
          continue;
        }
        const assignRole = i === 0 ? 'RB' : i === 2 ? 'TE' : null;
        const assign = assignRole ? this.ents.find((x) => x.side === 'off' && x.role === assignRole) : null;
        if (assign && ballLive) {
          this.coverTarget(e, assign, dt);
        } else {
          // middle zone: hover 6 yds past LOS near ball x
          this.moveToward(e, this.ball.x, this.losY + 6.5, dt, 0.85);
        }
        continue;
      }
      // DBs: man coverage
      const map: Record<string, string> = { CB0: 'WR1', CB1: 'WR2', S0: 'WR3', S1: 'TE' };
      const assign = this.ents.find((x) => x.side === 'off' && x.role === map[e.role]);
      if (e.role === 'S1' && play.routes && !play.routes.TE) {
        // deep safety help
        this.moveToward(e, this.ball.x, this.losY + 15, dt, 0.8);
        continue;
      }
      if (assign) this.coverTarget(e, assign, dt);
    }
  }

  private coverTarget(e: Ent, target: Ent, dt: number): void {
    // coverage skill controls reaction: worse cover = trails further behind
    const covSkill = e.player.attrs.cov / 99;
    const trail = (1 - covSkill) * 1.6 + 0.25;
    const tx = target.x - target.vx * trail * 0.4;
    const ty = target.y - Math.abs(trail) * 0.6;
    this.moveToward(e, tx, ty, dt, 0.98);
  }

  private updateBall(dt: number): void {
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
      target.route = [];
      audio.play('catch');
      this.setBannerFlash('CATCH!');
    } else {
      this.log(`${qb.lastName}'s pass to ${target.player.lastName} is ${sep < 0.5 ? 'broken up' : 'dropped'}.`);
      this.endPlay('incomplete', 0);
    }
  }

  /** carrier's current yards-to-goal given ball y */
  private ballSpotYtg(): number {
    return 110 - this.ball.y;
  }

  private checkOutcomes(): void {
    if (this.phase !== 'live') return;
    const c = this.carrier;
    if (!c) return;

    // touchdown
    if (c.y >= 110 - (110 - 10 - (100 - this.yardsToGoal)) * 0 + 0) {
      // goal line is y = 110 (losY + yardsToGoal)
    }
    if (c.y >= this.losY + this.yardsToGoal) {
      this.finishLivePlay(this.yardsToGoal + 1, true, false);
      return;
    }
    // out of bounds
    if (c.x <= 0.4 || c.x >= FIELD_W - 0.4) {
      this.finishLivePlay(c.y - this.losY, false, true);
      return;
    }
    // safety (carried into own end zone)
    if (c.y <= 10 - 0.5 && this.losY - (100 - this.yardsToGoal) <= 10) {
      // simplification: treat as big loss, engine clamps
    }
    // tackle checks
    for (const e of this.ents) {
      if (e.side !== 'def' || e.stunTimer > 0 || e.engagedWith) continue;
      const d = Math.hypot(e.x - c.x, e.y - c.y);
      if (d < 0.85) {
        // QB in pocket, ball not thrown → sack
        const isSack = c === this.qbEnt && !this.passThrown && !this.scrambling && this.play?.type === 'pass';
        const breakP = tackleBreakProbability(c.player, e.player) * (isSack ? 0.3 : 1);
        if (this.r.chance(clamp(breakP, 0.03, 0.5))) {
          e.stunTimer = 0.75;
          continue;
        }
        // fumble?
        if (this.r.chance(fumbleProbability(c.player, true) * (isSack ? 2 : 1))) {
          const l = this.line(this.offStats, c.player);
          this.bump(l, 'fumbles');
          this.bump(this.line(this.defStats, e.player), 'forcedFum');
          this.log(`${c.player.lastName} FUMBLES! Recovered by ${this.possession === 'user' ? this.cpuTeam.abbr : this.userTeam.abbr}.`);
          this.turnover('FUMBLE!', 100 - Math.round(clamp(110 - c.y, 1, 99)));
          return;
        }
        audio.play('tackle');
        this.bump(this.line(this.defStats, e.player), 'tackles');
        if (isSack) {
          this.bump(this.line(this.defStats, e.player), 'sacks');
          this.bump(this.line(this.offStats, c.player), 'sacked');
          this.log(`${c.player.lastName} sacked by ${e.player.lastName}.`);
        }
        this.finishLivePlay(c.y - this.losY, false, false);
        return;
      }
    }
    // play clock safety: force end after 14 seconds
    if (this.playElapsed > 14) {
      this.finishLivePlay(c.y - this.losY, false, false);
    }
  }

  /** Wrap up a live play: stats, downs, clock. `gained` in yards from LOS. */
  private finishLivePlay(gained: number, touchdown: boolean, outOfBounds: boolean): void {
    const c = this.carrier;
    const play = this.play!;
    const yards = Math.round(clamp(gained, -15, this.yardsToGoal));
    const qb = this.qbEnt!.player;

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
    const clockStops = touchdown || outOfBounds || (play.type === 'pass' && !this.passThrown && false);
    this.chargeClock(6 + this.playElapsed * 0.4 + (clockStops ? 0 : 26));

    if (touchdown) {
      this.touchdownFor(this.possession);
      return;
    }
    this.advanceDowns(yards);
  }

  private endPlay(kind: 'incomplete', _yards: number): void {
    void kind;
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

  private receiverButtons(): HudState['receivers'] {
    if (this.phase !== 'live' || this.passThrown || this.play?.type !== 'pass' || this.carrier !== this.qbEnt) {
      return [];
    }
    const slots: EligibleSlot[] = ['WR1', 'WR2', 'WR3', 'TE', 'RB'];
    return slots
      .filter((s) => this.play?.routes?.[s])
      .map((s, i) => ({ slot: s, label: `${i + 1}` }));
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
}
