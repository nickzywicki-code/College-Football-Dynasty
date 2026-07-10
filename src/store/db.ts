// Save-game persistence via IndexedDB.

import { openDB, IDBPDatabase } from 'idb';
import type { League } from '../engine/types';
import { teamName } from '../engine/types';

const DB_NAME = 'gridiron-land';
const STORE = 'saves';

export interface SaveMeta {
  slot: number;
  teamName: string;
  season: number;
  week: number;
  phase: string;
  record: string;
  savedAt: number;
}

interface SaveBlob {
  meta: SaveMeta;
  league: League;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(d) {
        d.createObjectStore(STORE);
      },
    });
  }
  return dbPromise;
}

export function buildMeta(league: League, slot: number): SaveMeta {
  const t = league.teams[league.userTeamId];
  return {
    slot,
    teamName: teamName(t),
    season: league.season,
    week: league.week,
    phase: league.phase,
    record: `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ''}`,
    savedAt: Date.now(),
  };
}

export async function saveLeague(league: League, slot: number): Promise<void> {
  const blob: SaveBlob = { meta: buildMeta(league, slot), league };
  await (await db()).put(STORE, blob, slot);
}

export async function loadLeague(slot: number): Promise<League | null> {
  const blob = (await (await db()).get(STORE, slot)) as SaveBlob | undefined;
  return blob?.league ?? null;
}

export async function listSaves(): Promise<SaveMeta[]> {
  const d = await db();
  const keys = (await d.getAllKeys(STORE)) as number[];
  const metas: SaveMeta[] = [];
  for (const k of keys) {
    const blob = (await d.get(STORE, k)) as SaveBlob | undefined;
    if (blob?.meta) metas.push(blob.meta);
  }
  return metas.sort((a, b) => a.slot - b.slot);
}

export async function deleteSave(slot: number): Promise<void> {
  await (await db()).delete(STORE, slot);
}
