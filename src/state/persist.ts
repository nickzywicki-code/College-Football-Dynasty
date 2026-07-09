import type { DynastyState, SaveSlotMeta } from './types'

const DB_NAME = 'gridiron_legacy_v1'
const DB_VERSION = 1
const SAVES_STORE = 'saves'
const INDEX_STORE = 'save_index'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(SAVES_STORE)) db.createObjectStore(SAVES_STORE, { keyPath: 'saveId' })
      if (!db.objectStoreNames.contains(INDEX_STORE)) db.createObjectStore(INDEX_STORE, { keyPath: 'saveId' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx<T>(storeName: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(storeName, mode)
    const store = t.objectStore(storeName)
    const req = run(store)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }))
}

export async function listSaveSlots(): Promise<SaveSlotMeta[]> {
  try {
    const all = await tx<SaveSlotMeta[]>(INDEX_STORE, 'readonly', (s) => s.getAll())
    return all.sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

export async function saveDynastyToStorage(state: DynastyState): Promise<void> {
  const team = state.teams[state.userTeamId]
  const meta: SaveSlotMeta = {
    saveId: state.saveId,
    coachName: state.coach.name,
    teamId: state.userTeamId,
    teamName: team ? `${team.name} ${team.mascot}` : 'Unknown',
    year: state.year,
    week: state.week,
    wins: team?.wins ?? 0,
    losses: team?.losses ?? 0,
    updatedAt: state.updatedAt,
  }
  await tx(SAVES_STORE, 'readwrite', (s) => s.put(state))
  await tx(INDEX_STORE, 'readwrite', (s) => s.put(meta))
}

export async function loadDynastyFromStorage(saveId: string): Promise<DynastyState | null> {
  try {
    const result = await tx<DynastyState | undefined>(SAVES_STORE, 'readonly', (s) => s.get(saveId))
    return result ?? null
  } catch {
    return null
  }
}

export async function deleteDynastyFromStorage(saveId: string): Promise<void> {
  await tx(SAVES_STORE, 'readwrite', (s) => s.delete(saveId))
  await tx(INDEX_STORE, 'readwrite', (s) => s.delete(saveId))
}
