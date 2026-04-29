import fs from 'node:fs/promises';
import path from 'node:path';
import { EMPTY_STORE, type Shortcut, type Store, StoreSchema } from './types.js';
import { HALIAS_HOME, STORE_PATH } from '../lib/paths.js';

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

export async function removeShortcut(name: string): Promise<boolean> {
  const store = await readStore();
  const before = store.shortcuts.length;
  store.shortcuts = store.shortcuts.filter((s) => s.name !== name);
  if (store.shortcuts.length === before) return false;
  await writeStore(store);
  return true;
}
