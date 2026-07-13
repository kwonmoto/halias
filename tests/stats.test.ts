import fs from 'node:fs/promises';
import { beforeEach, describe, expect, it } from 'vitest';
import { aggregateStats, aggregateByDirectory, scoreShortcutsForDirectory } from '../src/core/stats.js';
import { HALIAS_HOME, STATS_LOG_PATH } from '../src/lib/paths.js';

async function writeLog(lines: string[]): Promise<void> {
  await fs.mkdir(HALIAS_HOME, { recursive: true });
  await fs.writeFile(STATS_LOG_PATH, lines.join('\n') + '\n', 'utf-8');
}

beforeEach(async () => {
  await fs.rm(HALIAS_HOME, { recursive: true, force: true });
});

describe('aggregateStats', () => {
  it('returns empty aggregation when log is missing', async () => {
    const agg = await aggregateStats();
    expect(agg.totalCalls).toBe(0);
    expect(agg.byShortcut).toEqual([]);
  });

  it('counts new-format (tab) entries', async () => {
    await writeLog([
      '1700000000\tgs\t/home/u/proj',
      '1700000001\tgs\t/home/u/proj',
      '1700000002\tgp\t/home/u/proj',
    ]);
    const agg = await aggregateStats();
    expect(agg.totalCalls).toBe(3);
    expect(agg.byShortcut[0]).toMatchObject({ name: 'gs', count: 2 });
  });

  it('counts old-format (space) entries toward global frequency', async () => {
    await writeLog(['1700000000 gs', '1700000001\tgs\t/d']);
    const agg = await aggregateStats();
    expect(agg.byShortcut[0]).toMatchObject({ name: 'gs', count: 2 });
  });

  it('silently skips malformed lines', async () => {
    await writeLog(['not-a-timestamp\tgs\t/d', 'garbage', '', '1700000000\tgs\t/d']);
    const agg = await aggregateStats();
    expect(agg.totalCalls).toBe(1);
  });

  it('applies the since filter', async () => {
    await writeLog(['1000000000\told\t/d', '1700000000\tnew\t/d']);
    const agg = await aggregateStats({ since: new Date(1500000000 * 1000) });
    expect(agg.totalCalls).toBe(1);
    expect(agg.byShortcut[0]?.name).toBe('new');
  });
});

describe('aggregateByDirectory', () => {
  it('groups usage by directory, sorted by total desc', async () => {
    await writeLog([
      '1700000001\tdev\t/work/app',
      '1700000002\tdev\t/work/app',
      '1700000003\tgs\t/work/app',
      '1700000004\tgs\t/side/api',
    ]);
    const dirs = await aggregateByDirectory();
    expect(dirs).toHaveLength(2);
    expect(dirs[0]).toMatchObject({ directory: '/work/app', total: 3 });
    expect(dirs[0]?.byShortcut[0]).toMatchObject({ name: 'dev', count: 2 });
    expect(dirs[1]).toMatchObject({ directory: '/side/api', total: 1 });
  });

  it('excludes old-format entries without directory info', async () => {
    await writeLog(['1700000000 gs', '1700000001\tgs\t/d']);
    const dirs = await aggregateByDirectory();
    expect(dirs).toHaveLength(1);
    expect(dirs[0]?.total).toBe(1);
  });

  it('applies the since filter', async () => {
    await writeLog(['1000000000\tgs\t/old', '1700000000\tgs\t/new']);
    const dirs = await aggregateByDirectory({ since: new Date(1500000000 * 1000) });
    expect(dirs).toHaveLength(1);
    expect(dirs[0]?.directory).toBe('/new');
  });

  it('returns empty when there is no log', async () => {
    expect(await aggregateByDirectory()).toEqual([]);
  });
});

describe('scoreShortcutsForDirectory', () => {
  it('ranks current-directory usage above global frequency', async () => {
    await writeLog([
      // dev: 여기서 2번 / gs: 딴 데서 5번
      '1700000001\tdev\t/here',
      '1700000002\tdev\t/here',
      '1700000003\tgs\t/elsewhere',
      '1700000004\tgs\t/elsewhere',
      '1700000005\tgs\t/elsewhere',
      '1700000006\tgs\t/elsewhere',
      '1700000007\tgs\t/elsewhere',
    ]);
    const scored = await scoreShortcutsForDirectory(['dev', 'gs'], '/here');
    expect(scored[0]?.name).toBe('dev'); // α=10 컨텍스트 가중
    expect(scored[0]?.contextCount).toBe(2);
    expect(scored[1]).toMatchObject({ name: 'gs', globalCount: 5, contextCount: 0 });
  });

  it('preserves directories that contain tab characters', async () => {
    await writeLog(['1700000000\tgs\t/weird\tdir/name']);
    const scored = await scoreShortcutsForDirectory(['gs'], '/weird\tdir/name');
    expect(scored[0]?.contextCount).toBe(1);
  });

  it('includes never-used shortcuts with score 0', async () => {
    await writeLog(['1700000000\tgs\t/d']);
    const scored = await scoreShortcutsForDirectory(['gs', 'unused'], '/d');
    expect(scored.find((s) => s.name === 'unused')).toMatchObject({ score: 0 });
  });

  it('ignores entries for deleted shortcuts', async () => {
    await writeLog(['1700000000\tdeleted\t/d']);
    const scored = await scoreShortcutsForDirectory(['gs'], '/d');
    expect(scored).toHaveLength(1);
    expect(scored[0]?.globalCount).toBe(0);
  });
});
