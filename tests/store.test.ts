import fs from 'node:fs/promises';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addShortcut,
  backupStore,
  hasBackup,
  mutateStore,
  readStore,
  removeShortcut,
  restoreFromBackup,
  writeStore,
} from '../src/core/store.js';
import { HALIAS_HOME, STORE_PATH } from '../src/lib/paths.js';
import type { Shortcut } from '../src/core/types.js';

function makeShortcut(name: string, command = 'echo hi'): Shortcut {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    name,
    command,
    type: 'alias',
    tags: [],
    source: 'personal',
    createdAt: now,
    updatedAt: now,
  };
}

beforeEach(async () => {
  await fs.rm(HALIAS_HOME, { recursive: true, force: true });
});

describe('readStore / writeStore', () => {
  it('returns empty store when file is missing', async () => {
    const store = await readStore();
    expect(store.shortcuts).toEqual([]);
    expect(store.version).toBe(1);
  });

  it('round-trips a store through disk', async () => {
    await writeStore({ version: 1, shortcuts: [makeShortcut('gs', 'git status')] });
    const store = await readStore();
    expect(store.shortcuts).toHaveLength(1);
    expect(store.shortcuts[0]?.name).toBe('gs');
  });

  it('rejects invalid data via zod on write', async () => {
    // @ts-expect-error 잘못된 스키마 의도적 전달
    await expect(writeStore({ version: 1, shortcuts: [{ name: 'x' }] })).rejects.toThrow();
  });

  it('throws (not empty) when the file is corrupted', async () => {
    await fs.mkdir(HALIAS_HOME, { recursive: true });
    await fs.writeFile(STORE_PATH, '{ not json', 'utf-8');
    await expect(readStore()).rejects.toThrow();
  });
});

describe('addShortcut / removeShortcut', () => {
  it('adds and removes a shortcut', async () => {
    await addShortcut(makeShortcut('gs'));
    expect((await readStore()).shortcuts).toHaveLength(1);

    expect(await removeShortcut('gs')).toBe(true);
    expect((await readStore()).shortcuts).toHaveLength(0);
  });

  it('rejects duplicate names', async () => {
    await addShortcut(makeShortcut('gs'));
    await expect(addShortcut(makeShortcut('gs'))).rejects.toThrow(/already exists/i);
  });

  it('returns false when removing a missing shortcut', async () => {
    expect(await removeShortcut('nope')).toBe(false);
  });
});

describe('backup / restore', () => {
  it('reports no backup initially', async () => {
    expect(await hasBackup()).toBe(false);
  });

  it('backs up and restores the previous state', async () => {
    await writeStore({ version: 1, shortcuts: [makeShortcut('gs'), makeShortcut('gp')] });
    expect(await backupStore()).toBe(true);

    await writeStore({ version: 1, shortcuts: [] });
    expect((await readStore()).shortcuts).toHaveLength(0);

    const restored = await restoreFromBackup();
    expect(restored.shortcuts.map((s) => s.name).sort()).toEqual(['gp', 'gs']);
  });

  it('returns false when there is nothing to back up', async () => {
    expect(await backupStore()).toBe(false);
  });
});

describe('mutateStore concurrency', () => {
  it('does not lose updates under concurrent mutation', async () => {
    // 락이 없으면 read-modify-write 가 겹쳐 일부가 유실됨
    const N = 20;
    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        mutateStore((s) => ({ ...s, shortcuts: [...s.shortcuts, makeShortcut(`sc${i}`)] })),
      ),
    );
    expect((await readStore()).shortcuts).toHaveLength(N);
  });

  it('releases the lock after a mutator throws', async () => {
    await expect(
      mutateStore(() => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    // 락이 남아 있으면 다음 mutate 가 3초 타임아웃으로 실패함
    await mutateStore((s) => ({ ...s, shortcuts: [...s.shortcuts, makeShortcut('after')] }));
    expect((await readStore()).shortcuts).toHaveLength(1);
  });
});
