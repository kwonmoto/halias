import fs from 'node:fs/promises';
import { STATS_LOG_PATH } from '../lib/paths.js';

export interface StatsEntry {
  name: string;
  count: number;
  lastUsed: Date | null;
}

export interface StatsAggregation {
  /** 단축키별 사용 횟수 + 마지막 사용 시각 (count desc 정렬) */
  byShortcut: StatsEntry[];
  /** 전체 호출 횟수 */
  totalCalls: number;
  /** 로그 시작 시점 (가장 오래된 엔트리) */
  firstSeen: Date | null;
}

/**
 * stats.log 의 모든 엔트리를 읽어서 집계.
 *
 * 로그 포맷: `<unix_timestamp> <name>\n`
 * 잘못된 라인은 silently skip — 사용자 영역의 단순 append-only 로그라 견고하게.
 *
 * since 옵션으로 특정 시점 이후로 필터링 가능 (예: 최근 7일).
 */
export async function aggregateStats(options: { since?: Date } = {}): Promise<StatsAggregation> {
  const sinceMs = options.since?.getTime() ?? 0;
  let raw = '';

  try {
    raw = await fs.readFile(STATS_LOG_PATH, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { byShortcut: [], totalCalls: 0, firstSeen: null };
    }
    throw err;
  }

  const counts = new Map<string, { count: number; lastTs: number }>();
  let totalCalls = 0;
  let firstSeenMs = Infinity;

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;

    // "<timestamp> <name>" — 첫 공백 기준 분리 (name에 공백 없으니 안전)
    const spaceIdx = line.indexOf(' ');
    if (spaceIdx < 0) continue;

    const tsStr = line.slice(0, spaceIdx);
    const name = line.slice(spaceIdx + 1).trim();
    const ts = parseInt(tsStr, 10);

    if (!Number.isFinite(ts) || !name) continue;

    const tsMs = ts * 1000;
    if (tsMs < sinceMs) continue;

    if (tsMs < firstSeenMs) firstSeenMs = tsMs;
    totalCalls++;

    const existing = counts.get(name);
    if (existing) {
      existing.count++;
      if (tsMs > existing.lastTs) existing.lastTs = tsMs;
    } else {
      counts.set(name, { count: 1, lastTs: tsMs });
    }
  }

  const byShortcut: StatsEntry[] = Array.from(counts.entries())
    .map(([name, { count, lastTs }]) => ({
      name,
      count,
      lastUsed: new Date(lastTs),
    }))
    .sort((a, b) => b.count - a.count);

  return {
    byShortcut,
    totalCalls,
    firstSeen: firstSeenMs === Infinity ? null : new Date(firstSeenMs),
  };
}
