// Full-game simulation: drives, downs, clock, kicking, scoring, box score.

import { Rand, clamp } from './../rng';
import type { BoxScore, GameStatLine, League, Player, ScheduledGame, Team, TeamGameTotals } from './../types';
import { getStarters } from './../league';
import {
  Personnel,
  PassDepth,
  resolveSimPlay,
  fgMakeProbability,
} from './playSim';

const QUARTER_SECONDS = 900;

export interface GameSimOptions {
  /** keep the full play-by-play log (user games); otherwise only key plays */
  fullLog?: boolean;
  /** if provided, injuries roll after the game and are applied to players */
  applyInjuries?: boolean;
}

interface StatAcc {
  [playerId: number]: GameStatLine;
}

function stat(acc: StatAcc, p: Player): GameStatLine {
  let line = acc[p.id];
  if (!line) {
    line = { playerId: p.id };
    acc[p.id] = line;
  }
  return line;
}

function bump(line: GameStatLine, key: keyof Omit<GameStatLine, 'playerId'>, amount = 1): void {
  line[key] = ((line[key] as number | undefined) ?? 0) + amount;
}

export function buildPersonnel(team: Team, players: Record<number, Player>): Personnel {
  return {
    QB: getStarters(team, players, 'QB', 1)[0],
    RB: getStarters(team, players, 'RB', 2),
    WR: getStarters(team, players, 'WR', 3),
    TE: getStarters(team, players, 'TE', 1),
    OL: getStarters(team, players, 'OL', 5),
    DL: getStarters(team, players, 'DL', 4),
    LB: getStarters(team, players, 'LB', 3),
    CB: getStarters(team, players, 'CB', 2),
    S: getStarters(team, players, 'S', 2),
    K: getStarters(team, players, 'K', 1)[0],
    P: getStarters(team, players, 'P', 1)[0],
  };
}

interface SideState {
  team: Team;
  personnel: Personnel;
  score: number;
  quarterScores: number[];
  stats: StatAcc;
  totals: TeamGameTotals;
  timeouts: number;
}

function emptyTotals(): TeamGameTotals {
  return {
    totalYds: 0,
    passYds: 0,
    rushYds: 0,
    firstDowns: 0,
    turnovers: 0,
    timeOfPossession: 0,
    thirdDownAtt: 0,
    thirdDownConv: 0,
  };
}

/** Offensive play selection for the AI/sim. */
function choosePlayCall(
  r: Rand,
  down: number,
  toGo: number,
  yardsToGoal: number,
  scoreDiff: number, // offense score - defense score
  secondsLeft: number,
  half: number,
): { type: 'run'; direction: 'inside' | 'outside' } | { type: 'pass'; depth: PassDepth } | { type: 'kneel' } {
  // victory formation
  if (scoreDiff > 0 && half === 2 && secondsLeft < 120 && secondsLeft < 40 * (5 - down)) {
    return { type: 'kneel' };
  }
  const desperate = half === 2 && secondsLeft < 240 && scoreDiff < -3;
  const twoMinute = secondsLeft < 130;
  let passProb = 0.55;
  if (down === 1) passProb = 0.48;
  if (down === 2) passProb = toGo > 6 ? 0.62 : 0.48;
  if (down >= 3) passProb = toGo > 2 ? 0.85 : 0.42;
  if (desperate) passProb = 0.92;
  else if (twoMinute && scoreDiff <= 0) passProb += 0.2;
  if (scoreDiff > 10 && half === 2 && secondsLeft < 900) passProb -= 0.25;
  if (r.chance(clamp(passProb, 0.05, 0.95))) {
    let depth: PassDepth;
    if (desperate && yardsToGoal > 30 && secondsLeft < 45) depth = 'deep';
    else if (toGo >= 12) depth = r.chance(0.5) ? 'medium' : 'deep';
    else if (toGo >= 5) depth = r.chance(0.55) ? 'short' : r.chance(0.7) ? 'medium' : 'deep';
    else depth = r.chance(0.7) ? 'short' : 'medium';
    return { type: 'pass', depth };
  }
  return { type: 'run', direction: r.chance(0.62) ? 'inside' : 'outside' };
}

/** 4th-down decision: 'go' | 'fg' | 'punt' */
function fourthDownCall(
  r: Rand,
  toGo: number,
  yardsToGoal: number,
  kicker: Player,
  scoreDiff: number,
  secondsLeft: number,
  half: number,
): 'go' | 'fg' | 'punt' {
  const fgDist = yardsToGoal + 17;
  const mustScore = half === 2 && secondsLeft < 300 && scoreDiff < 0;
  const needTd = mustScore && scoreDiff < -3;
  if (mustScore) {
    if (needTd && (fgDist > 45 || scoreDiff < -3 && secondsLeft < 120)) return 'go';
    if (!needTd && fgDist <= 58) return 'fg';
    if (yardsToGoal > 40 && secondsLeft > 150 && toGo > 8) return 'punt';
    return fgDist <= 58 && !needTd ? 'fg' : 'go';
  }
  if (fgDist <= 38) return 'fg';
  if (fgDist <= 52) {
    if (toGo <= 1 && r.chance(0.35)) return 'go';
    return r.chance(fgMakeProbability(kicker, fgDist) > 0.6 ? 0.85 : 0.5) ? 'fg' : 'go';
  }
  if (toGo <= 1 && yardsToGoal < 45 && r.chance(0.5)) return 'go';
  if (fgDist <= 58 && r.chance(0.25)) return 'fg';
  return 'punt';
}

export interface GameResult {
  box: BoxScore;
  injuries: { playerId: number; weeks: number }[];
}

/**
 * Simulate a complete game. Mutates nothing outside itself; caller applies
 * the box score to league state via applyGameResult.
 */
export function simulateGame(
  r: Rand,
  league: League,
  game: ScheduledGame,
  opts: GameSimOptions = {},
): GameResult {
  const players = league.players;
  const home: SideState = {
    team: league.teams[game.homeId],
    personnel: buildPersonnel(league.teams[game.homeId], players),
    score: 0,
    quarterScores: [0, 0, 0, 0],
    stats: {},
    totals: emptyTotals(),
    timeouts: 3,
  };
  const away: SideState = {
    team: league.teams[game.awayId],
    personnel: buildPersonnel(league.teams[game.awayId], players),
    score: 0,
    quarterScores: [0, 0, 0, 0],
    stats: {},
    totals: emptyTotals(),
    timeouts: 3,
  };

  const log: string[] = [];
  const keyLog: string[] = [];
  const participated = new Set<number>();

  const addLog = (text: string, key = false) => {
    if (opts.fullLog) log.push(text);
    if (key) keyLog.push(text);
  };

  // home gets slight edge; receiving team of opening kickoff
  let quarter = 1;
  let clock = QUARTER_SECONDS;
  let offense = r.chance(0.5) ? home : away;
  const openedWithBall = offense;
  let yardsToGoal = 75; // touchback start
  let down = 1;
  let toGo = 10;

  const defenseOf = (o: SideState) => (o === home ? away : home);
  const qLabel = () => `Q${quarter} ${Math.floor(clock / 60)}:${String(Math.floor(clock % 60)).padStart(2, '0')}`;

  function score(side: SideState, points: number): void {
    side.score += points;
    side.quarterScores[Math.min(quarter, 4) - 1] += points;
  }

  function newDrive(o: SideState, startYtg: number): void {
    offense = o;
    yardsToGoal = clamp(Math.round(startYtg), 1, 99);
    down = 1;
    toGo = Math.min(10, yardsToGoal);
  }

  function homeAdv(side: SideState): number {
    return side === home ? 1.5 : 0;
  }

  /** Extra point / two-point conversion after a TD by `side`. */
  function pointAfter(side: SideState): void {
    const def = defenseOf(side);
    const scoreDiffAfterTd = side.score - def.score; // TD already added
    const needTwo =
      quarter >= 4 &&
      (scoreDiffAfterTd === -2 || scoreDiffAfterTd === -5 || scoreDiffAfterTd === 1 || scoreDiffAfterTd === -10);
    if (needTwo && r.chance(0.9)) {
      // two-point try resolved as a single short-yardage play
      const result = resolveSimPlay({
        r,
        offense: side.personnel,
        defense: def.personnel,
        yardsToGoal: 2,
        toGo: 2,
        call: r.chance(0.5) ? { type: 'run', direction: 'inside' } : { type: 'pass', depth: 'short' },
        hurryUp: false,
        defExpectsPass: 0.5,
      });
      if (result.yards >= 2 && !result.turnover) {
        score(side, 2);
        addLog(`${qLabel()} — Two-point conversion GOOD (${side.team.abbr}).`, true);
      } else {
        addLog(`${qLabel()} — Two-point conversion fails (${side.team.abbr}).`, true);
      }
      return;
    }
    const k = side.personnel.K;
    const line = stat(side.stats, k);
    bump(line, 'xpa');
    if (r.chance(clamp(0.94 + (k.attrs.kck - 75) * 0.002, 0.8, 0.995))) {
      bump(line, 'xpm');
      score(side, 1);
    } else {
      addLog(`${qLabel()} — ${k.lastName} MISSES the extra point (${side.team.abbr})!`, true);
    }
  }

  function advanceClock(seconds: number): void {
    const o = offense;
    const used = Math.min(clock, seconds);
    clock -= used;
    o.totals.timeOfPossession += used;
  }

  function endQuarterIfNeeded(): boolean {
    while (clock <= 0) {
      if (quarter === 4) return true;
      quarter += 1;
      clock = QUARTER_SECONDS;
      if (quarter === 3) {
        // halftime: other team receives
        home.timeouts = 3;
        away.timeouts = 3;
        newDrive(defenseOf(openedWithBall), 75);
        addLog(`— HALFTIME — ${away.team.abbr} ${away.score}, ${home.team.abbr} ${home.score}`, true);
      }
    }
    return false;
  }

  let playsRun = 0;
  const MAX_PLAYS = 400; // safety valve

  while (playsRun++ < MAX_PLAYS) {
    if (endQuarterIfNeeded()) break;
    const def = defenseOf(offense);
    const half = quarter <= 2 ? 1 : 2;
    const secondsLeftHalf = clock + (half === 1 ? (quarter === 1 ? QUARTER_SECONDS : 0) : quarter === 3 ? QUARTER_SECONDS : 0);
    const scoreDiff = offense.score - def.score;

    // 4th down decisions
    if (down === 4) {
      const call = fourthDownCall(r, toGo, yardsToGoal, offense.personnel.K, scoreDiff, secondsLeftHalf, half);
      if (call === 'fg') {
        const dist = yardsToGoal + 17;
        const k = offense.personnel.K;
        const line = stat(offense.stats, k);
        participated.add(k.id);
        bump(line, 'fga');
        advanceClock(r.int(4, 6));
        if (r.chance(fgMakeProbability(k, dist) + homeAdv(offense) * 0.002)) {
          bump(line, 'fgm');
          line.fgLong = Math.max(line.fgLong ?? 0, dist);
          score(offense, 3);
          addLog(`${qLabel()} — ${k.lastName} nails a ${dist}-yard field goal (${offense.team.abbr}).`, true);
          newDrive(def, 75);
        } else {
          addLog(`${qLabel()} — ${k.lastName} MISSES from ${dist} (${offense.team.abbr}).`, true);
          newDrive(def, Math.max(20, 100 - (yardsToGoal + 7)));
        }
        advanceClock(r.int(12, 20));
        continue;
      }
      if (call === 'punt') {
        const p = offense.personnel.P;
        const line = stat(offense.stats, p);
        participated.add(p.id);
        bump(line, 'punts');
        const gross = clamp(r.gauss(44 + (p.attrs.kck - 75) * 0.25, 5), 25, 68);
        const returnYds = r.chance(0.55) ? Math.max(0, r.gauss(7, 6)) : 0;
        const net = Math.round(gross - returnYds);
        bump(line, 'puntYds', Math.round(gross));
        let newYtg = 100 - (yardsToGoal - net);
        if (newYtg >= 100) newYtg = 80; // touchback
        addLog(`${qLabel()} — ${p.lastName} punts ${Math.round(gross)} yards.`);
        newDrive(def, newYtg);
        advanceClock(r.int(12, 18));
        continue;
      }
      // else: go for it — falls through to a normal play
    }

    const hurryUp = half === 2 && clock < 180 && scoreDiff < 0;
    const call = choosePlayCall(r, down, toGo, yardsToGoal, scoreDiff, secondsLeftHalf, half);
    const defExpectsPass = clamp(
      0.5 + (down >= 3 && toGo > 4 ? 0.25 : 0) + (scoreDiff < -7 && half === 2 ? 0.15 : 0) - (toGo <= 2 ? 0.2 : 0),
      0.1,
      0.95,
    );

    const result = resolveSimPlay({
      r,
      offense: offense.personnel,
      defense: def.personnel,
      yardsToGoal,
      toGo,
      call,
      hurryUp,
      defExpectsPass,
    });

    // --- attribute stats ---
    const oStats = offense.stats;
    const dStats = def.stats;
    if (result.passer) participated.add(result.passer.id);
    if (result.rusher) participated.add(result.rusher.id);
    if (result.receiver) participated.add(result.receiver.id);

    if (down === 3) offense.totals.thirdDownAtt++;

    if (result.kind === 'run' || result.kind === 'scramble' || result.kind === 'kneel') {
      const rusher = result.rusher ?? offense.personnel.RB[0];
      const line = stat(oStats, rusher);
      bump(line, 'rushAtt');
      bump(line, 'rushYds', result.yards);
      offense.totals.rushYds += result.yards;
      offense.totals.totalYds += result.yards;
      if (result.turnover === 'fumble') {
        bump(line, 'fumbles');
        offense.totals.turnovers++;
      }
      if (result.yards >= yardsToGoal) bump(line, 'rushTd');
      if (result.tackler) {
        bump(stat(dStats, result.tackler), 'tackles');
        participated.add(result.tackler.id);
      }
    } else if (result.kind === 'sack') {
      const qbLine = stat(oStats, offense.personnel.QB);
      bump(qbLine, 'sacked');
      offense.totals.totalYds += result.yards;
      offense.totals.passYds += result.yards;
      if (result.sacker) {
        bump(stat(dStats, result.sacker), 'sacks');
        bump(stat(dStats, result.sacker), 'tackles');
        participated.add(result.sacker.id);
      }
      if (result.turnover === 'fumble') {
        bump(qbLine, 'fumbles');
        offense.totals.turnovers++;
        if (result.sacker) bump(stat(dStats, result.sacker), 'forcedFum');
      }
    } else if (result.kind === 'pass') {
      const qbLine = stat(oStats, result.passer!);
      const recLine = stat(oStats, result.receiver!);
      bump(qbLine, 'passAtt');
      bump(recLine, 'targets');
      if (result.turnover === 'int') {
        bump(qbLine, 'passInt');
        offense.totals.turnovers++;
        if (result.interceptor) {
          bump(stat(dStats, result.interceptor), 'defInt');
          participated.add(result.interceptor.id);
        }
      } else if (result.complete) {
        bump(qbLine, 'passCmp');
        bump(qbLine, 'passYds', result.yards);
        bump(recLine, 'rec');
        bump(recLine, 'recYds', result.yards);
        offense.totals.passYds += result.yards;
        offense.totals.totalYds += result.yards;
        if (result.yards >= yardsToGoal) {
          bump(qbLine, 'passTd');
          bump(recLine, 'recTd');
        }
        if (result.turnover === 'fumble') {
          bump(recLine, 'fumbles');
          offense.totals.turnovers++;
        }
        if (result.tackler && result.yards < yardsToGoal) {
          bump(stat(dStats, result.tackler), 'tackles');
          participated.add(result.tackler.id);
        }
      }
    }

    addLog(`${qLabel()} [${offense.team.abbr}] ${down}&${toGo}: ${result.text}`, result.text.includes('TOUCHDOWN') || result.turnover !== null);

    advanceClock(result.timeElapsed);
    // defense uses timeouts late to preserve clock
    if (half === 2 && clock < 150 && def.score - offense.score <= 8 && def.score - offense.score >= -8 && def.timeouts > 0 && !result.clockStops && result.kind !== 'kneel') {
      def.timeouts--;
    }

    // --- update game state ---
    if (result.turnover) {
      newDrive(def, 100 - clamp(yardsToGoal - result.yards, 1, 99));
      continue;
    }
    const gained = result.yards;
    if (gained >= yardsToGoal) {
      // TOUCHDOWN
      score(offense, 6);
      pointAfter(offense);
      newDrive(def, 75);
      advanceClock(r.int(4, 8));
      continue;
    }
    yardsToGoal -= gained;
    if (yardsToGoal >= 100) {
      // safety
      score(def, 2);
      addLog(`${qLabel()} — SAFETY! ${offense.team.abbr} tackled in the end zone.`, true);
      newDrive(def, 65);
      continue;
    }
    if (gained >= toGo) {
      down = 1;
      toGo = Math.min(10, yardsToGoal);
      offense.totals.firstDowns++;
      if (down === 3) offense.totals.thirdDownConv++;
    } else {
      if (down === 3 && gained >= toGo) offense.totals.thirdDownConv++;
      down += 1;
      toGo -= gained;
      if (down > 4) {
        // turnover on downs
        addLog(`${qLabel()} — ${offense.team.abbr} turned over on downs.`, true);
        newDrive(def, 100 - yardsToGoal);
        continue;
      }
    }
  }

  // --- overtime: single sudden-death-ish period for ties (playoffs must resolve) ---
  if (home.score === away.score) {
    const isPlayoff = game.tag !== '';
    let otRounds = 0;
    let o = r.chance(0.5) ? home : away;
    while (home.score === away.score && (isPlayoff || otRounds < 2)) {
      otRounds++;
      // abstract OT: each round, one team gets a scoring chance
      const def = defenseOf(o);
      const driveQuality = r.random() + (o.personnel.QB.attrs.tha - 75) * 0.004;
      if (driveQuality > 0.62) {
        score(o, 7);
        const qb = o.personnel.QB;
        addLog(`OT — ${qb.lastName} leads a touchdown drive! ${o.team.abbr} wins it.`, true);
      } else if (driveQuality > 0.42) {
        score(o, 3);
        addLog(`OT — ${o.team.abbr} kicks a field goal.`, true);
      }
      o = def;
    }
    if (home.score === away.score) addLog(`— Game ends in a TIE —`, true);
  }

  const winner = home.score > away.score ? home : away.score > home.score ? away : null;
  addLog(
    `FINAL: ${away.team.abbr} ${away.score} @ ${home.team.abbr} ${home.score}${winner ? ` — ${winner.team.abbr} wins` : ' — TIE'}`,
    true,
  );

  // gamesPlayed for everyone who touched the stat sheet + all starters
  for (const side of [home, away]) {
    for (const key of Object.keys(side.personnel) as (keyof Personnel)[]) {
      const v = side.personnel[key];
      const list = Array.isArray(v) ? v : [v];
      for (const p of list) {
        if (!p) continue;
        participated.add(p.id);
      }
    }
    for (const pid of Object.keys(side.stats)) participated.add(Number(pid));
  }
  for (const side of [home, away]) {
    for (const pid of side.team.playerIds) {
      if (participated.has(pid)) {
        bump(stat(side.stats, players[pid]), 'gamesPlayed');
      }
    }
  }

  // --- injuries ---
  const injuries: { playerId: number; weeks: number }[] = [];
  if (opts.applyInjuries !== false) {
    for (const side of [home, away]) {
      for (const pid of side.team.playerIds) {
        const p = players[pid];
        if (!p || p.injuryWeeks > 0 || !participated.has(pid)) continue;
        // ~1.3 injuries per team-game
        const risk = 0.028 * (1 + (75 - p.attrs.sta) * 0.006);
        if (r.chance(clamp(risk, 0.005, 0.08))) {
          const weeks = r.weighted([1, 2, 3, 4, 6, 8], [40, 25, 15, 10, 6, 4]);
          injuries.push({ playerId: pid, weeks });
        }
      }
    }
  }

  const box: BoxScore = {
    gameId: game.id,
    season: league.season,
    week: game.week,
    homeId: game.homeId,
    awayId: game.awayId,
    homeScore: home.score,
    awayScore: away.score,
    quarterScores: [home.quarterScores, away.quarterScores],
    homeStats: Object.values(home.stats),
    awayStats: Object.values(away.stats),
    homeTeamTotals: home.totals,
    awayTeamTotals: away.totals,
    playByPlay: opts.fullLog ? log : keyLog,
  };
  return { box, injuries };
}
