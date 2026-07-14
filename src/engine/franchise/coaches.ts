// Coaching staff: head coach + coordinators that earn XP, level up, and unlock
// playbooks / defensive schemes and stat perks. Kept intentionally light so it
// serializes into the save with the rest of the league.

import type { Rand } from '../rng';
import { randomFirstName, randomLastName } from '../names';
import type { Coach, CoachRole, CoachStaff, Team } from '../types';

const HC_ARCHES = ['Program Builder', 'Motivator', 'Field General', 'Tactician'];
const OC_ARCHES = ['Air Raid', 'West Coast', 'Ground & Pound', 'Spread Guru'];
const DC_ARCHES = ['Blitz Happy', 'Coverage Mastermind', 'Bend-Dont-Break', 'Front Wizard'];

const MAX_LEVEL = 10;

function newCoach(r: Rand, role: CoachRole): Coach {
  const arches = role === 'HC' ? HC_ARCHES : role === 'OC' ? OC_ARCHES : DC_ARCHES;
  return {
    name: `${randomFirstName(r)} ${randomLastName(r)}`,
    role,
    archetype: r.choice(arches),
    level: 1,
    xp: 0,
  };
}

export function newCoachStaff(r: Rand): CoachStaff {
  return { hc: newCoach(r, 'HC'), oc: newCoach(r, 'OC'), dc: newCoach(r, 'DC') };
}

/** Ensure a team has a staff (backfill for legacy saves). */
export function ensureCoaches(team: Team, r: Rand): CoachStaff {
  if (!team.coaches) team.coaches = newCoachStaff(r);
  return team.coaches;
}

/** XP needed to go from `level` to `level+1`. */
export function xpForNext(level: number): number {
  return 100 + (level - 1) * 60; // 100, 160, 220, ...
}

export interface CoachXpResult {
  levelUps: string[]; // human-readable messages
}

/**
 * Award XP to a team's staff after a game. HC gets overall XP, OC scales with
 * offense, DC with defense. Returns any level-up notices.
 */
export function awardCoachXp(
  team: Team,
  r: Rand,
  o: { win: boolean; pointsFor: number; pointsAgainst: number },
): CoachXpResult {
  const staff = ensureCoaches(team, r);
  const base = o.win ? 45 : 20;
  const offXp = base + Math.min(40, o.pointsFor * 1.4);
  const defXp = base + Math.min(40, Math.max(0, 30 - o.pointsAgainst) * 1.6);
  const hcXp = base + (o.win ? 20 : 0) + Math.min(20, o.pointsFor * 0.5);

  const notices: string[] = [];
  const bump = (c: Coach, amt: number) => {
    if (c.level >= MAX_LEVEL) return;
    c.xp += Math.round(amt);
    while (c.level < MAX_LEVEL && c.xp >= xpForNext(c.level)) {
      c.xp -= xpForNext(c.level);
      c.level++;
      notices.push(`${c.name} (${c.role}) reached Level ${c.level}!`);
    }
    if (c.level >= MAX_LEVEL) c.xp = 0;
  };
  bump(staff.hc, hcXp);
  bump(staff.oc, offXp);
  bump(staff.dc, defXp);
  return { levelUps: notices };
}

// ---- unlocks -------------------------------------------------------------
// Offensive play ids unlock as the OC levels up. Base plays are always open.
export const OC_UNLOCKS: { level: number; playIds: string[]; label: string }[] = [
  { level: 2, playIds: ['flood', 'mesh'], label: 'Mesh & Flood concepts' },
  { level: 4, playIds: ['postcorner', 'pa-cross'], label: 'Play-action shots' },
  { level: 6, playIds: ['bomb', 'screen'], label: 'Screens & the deep bomb' },
];

// Defensive schemes unlock as the DC levels up.
export const DC_UNLOCKS: { level: number; calls: string[]; label: string }[] = [
  { level: 3, calls: ['blitz'], label: 'Zero Blitz package' },
  { level: 5, calls: ['coverage'], label: 'Coverage Shell' },
];

/** Set of offensive play ids the user's OC has unlocked (plus base plays). */
export function unlockedPlayIds(ocLevel: number): Set<string> {
  const base = new Set(['dive', 'blast', 'toss', 'sweep', 'draw', 'qbsneak', 'slants', 'curls', 'flats']);
  for (const u of OC_UNLOCKS) if (ocLevel >= u.level) u.playIds.forEach((id) => base.add(id));
  return base;
}

/** Defensive calls the user's DC has unlocked (balanced always available). */
export function unlockedDefCalls(dcLevel: number): Set<string> {
  const base = new Set(['balanced']);
  for (const u of DC_UNLOCKS) if (dcLevel >= u.level) u.calls.forEach((c) => base.add(c));
  return base;
}

/** A short perk description for the coach's current level. */
export function coachPerk(c: Coach): string {
  if (c.role === 'OC') {
    const next = OC_UNLOCKS.find((u) => u.level > c.level);
    const have = OC_UNLOCKS.filter((u) => u.level <= c.level).map((u) => u.label);
    return have.length
      ? `Unlocked: ${have.join(', ')}${next ? ` · Lv${next.level}: ${next.label}` : ''}`
      : next
        ? `Lv${next.level}: ${next.label}`
        : 'Full playbook unlocked';
  }
  if (c.role === 'DC') {
    const next = DC_UNLOCKS.find((u) => u.level > c.level);
    const have = DC_UNLOCKS.filter((u) => u.level <= c.level).map((u) => u.label);
    return have.length
      ? `Unlocked: ${have.join(', ')}${next ? ` · Lv${next.level}: ${next.label}` : ''}`
      : next
        ? `Lv${next.level}: ${next.label}`
        : 'Full scheme set unlocked';
  }
  return `+${c.level - 1} staff XP bonus · morale & development boost`;
}
