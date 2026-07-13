import fs from 'node:fs/promises';
import path from 'node:path';
import { EMPTY_STORE, type Shortcut, type Store, StoreSchema } from './types.js';
import { HALIAS_HOME, STORE_PATH, STORE_BACKUP_PATH } from '../lib/paths.js';

async function ensureHome(): Promise<void> {
  await fs.mkdir(HALIAS_HOME, { recursive: true });
}

// ─── 프로세스 간 잠금 ─────────────────────────────────────
// 두 셸에서 동시에 ha add 하면 read-modify-write 가 겹쳐 한쪽이 유실됨 (lost update).
// mkdir 는 모든 플랫폼에서 원자적이므로 락 디렉토리로 임계 구역을 보호한다.

const LOCK_PATH = `${STORE_PATH}.lock`;
const LOCK_STALE_MS = 10_000; // 이보다 오래된 락은 죽은 프로세스의 잔재로 간주
const LOCK_RETRY_MS = 25;
const LOCK_TIMEOUT_MS = 3_000;

async function acquireLock(): Promise<void> {
  await ensureHome();
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  for (;;) {
    try {
      await fs.mkdir(LOCK_PATH);
      return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;

      // 죽은 프로세스가 남긴 stale 락이면 제거 후 재시도
      try {
        const stat = await fs.stat(LOCK_PATH);
        if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
          await fs.rm(LOCK_PATH, { recursive: true, force: true });
          continue;
        }
      } catch {
        continue; // 락이 그 사이 풀림 — 재시도
      }

      if (Date.now() > deadline) {
        throw new Error(`halias store is locked (${LOCK_PATH}). Another process may be writing.`);
      }
      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
    }
  }
}

async function releaseLock(): Promise<void> {
  await fs.rm(LOCK_PATH, { recursive: true, force: true }).catch(() => {});
}

/**
 * 락 안에서 read → 변환 → write 를 원자적으로 수행.
 *
 * 모든 store 쓰기는 이 함수를 거쳐야 함 — 프롬프트 등으로 시간이 지난 뒤 저장해도
 * 락 안에서 **최신 상태를 다시 읽고** 변환을 적용하므로 동시 편집이 유실되지 않는다.
 * mutator 는 새 Store 를 반환 (기존 객체 mutate 금지).
 */
export async function mutateStore(mutator: (store: Store) => Store): Promise<Store> {
  await acquireLock();
  try {
    const current = await readStore();
    const next = mutator(current);
    await writeStore(next);
    return next;
  } finally {
    await releaseLock();
  }
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
  await mutateStore((store) => {
    if (store.shortcuts.some((s) => s.name === shortcut.name)) {
      throw new Error(`Shortcut already exists: ${shortcut.name}`);
    }
    return { ...store, shortcuts: [...store.shortcuts, shortcut] };
  });
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
  return mutateStore(() => store);
}

export async function removeShortcut(name: string): Promise<boolean> {
  let removed = false;
  await mutateStore((store) => {
    const filtered = store.shortcuts.filter((s) => s.name !== name);
    removed = filtered.length !== store.shortcuts.length;
    return { ...store, shortcuts: filtered };
  });
  return removed;
}
