import fs from 'node:fs/promises';
import path from 'node:path';
import { EMPTY_STORE, type Shortcut, type Store, StoreSchema } from './types.js';
import { HALIAS_HOME, STORE_PATH, STORE_BACKUP_PATH } from '../lib/paths.js';

async function ensureHome(): Promise<void> {
  await fs.mkdir(HALIAS_HOME, { recursive: true });
}

export async function readStore(): Promise<Store> {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return StoreSchema.parse(parsed);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return EMPTY_STORE;
    }
    throw err;
  }
}

export async function writeStore(store: Store): Promise<void> {
  await ensureHome();
  StoreSchema.parse(store); // 저장 전 검증
  // 원자적 쓰기: temp 파일에 먼저 쓰고 rename
  const tmp = `${STORE_PATH}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), 'utf-8');
  await fs.rename(tmp, STORE_PATH);
}

export async function findShortcut(name: string): Promise<Shortcut | undefined> {
  const store = await readStore();
  return store.shortcuts.find((s) => s.name === name);
}

export async function addShortcut(shortcut: Shortcut): Promise<void> {
  const store = await readStore();
  if (store.shortcuts.some((s) => s.name === shortcut.name)) {
    throw new Error(`이미 존재하는 단축키: ${shortcut.name}`);
  }
  store.shortcuts.push(shortcut);
  await writeStore(store);
}

/**
 * 파괴적 작업(import replace, unused --clean 등) 직전에 현재 shortcuts.json 을
 * shortcuts.json.bak 으로 복사해 둔다. `ha restore` 로 되돌릴 수 있음.
 *
 * store 파일이 아직 없으면 백업 없이 false 반환.
 */
export async function backupStore(): Promise<boolean> {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf-8');
    await ensureHome();
    // 원자적 쓰기 — 백업 도중 죽어도 이전 .bak 이 깨지지 않게
    const tmp = `${STORE_BACKUP_PATH}.tmp`;
    await fs.writeFile(tmp, raw, 'utf-8');
    await fs.rename(tmp, STORE_BACKUP_PATH);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
}

/** 백업 파일(shortcuts.json.bak) 존재 여부. */
export async function hasBackup(): Promise<boolean> {
  try {
    await fs.access(STORE_BACKUP_PATH);
    return true;
  } catch {
    return false;
  }
}

/**
 * shortcuts.json.bak 을 읽어 검증 후 현재 store 로 되돌린다.
 * 되돌린 store 를 반환.
 */
export async function restoreFromBackup(): Promise<Store> {
  const raw = await fs.readFile(STORE_BACKUP_PATH, 'utf-8');
  const parsed = JSON.parse(raw);
  const store = StoreSchema.parse(parsed);
  await writeStore(store);
  return store;
}

export async function removeShortcut(name: string): Promise<boolean> {
  const store = await readStore();
  const before = store.shortcuts.length;
  store.shortcuts = store.shortcuts.filter((s) => s.name !== name);
  if (store.shortcuts.length === before) return false;
  await writeStore(store);
  return true;
}
