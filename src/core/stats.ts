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
 * 로그 1줄을 파싱한 결과.
 * directory 가 null = 옛 형식 (v0.1.x 이전 데이터)
 */
interface RawEntry {
  ts: number;        // ms
  name: string;
  directory: string | null;
}

/**
 * stats.log 1줄 파싱.
 *
 * 두 가지 형식 지원:
 * - 새 형식 (v0.2+):  "<timestamp>\t<name>\t<directory>"
 * - 옛 형식 (v0.1.x): "<timestamp> <name>"   ← 공백 구분
 *
 * 잘못된 라인은 null 반환 (silently skip).
 */
function parseLine(line: string): RawEntry | null {
  if (!line) return null;

  // 새 형식 우선 시도 (탭이 있으면 새 형식)
  if (line.includes('\t')) {
    const [tsStr, name, ...rest] = line.split('\t');
    const ts = parseInt(tsStr ?? '', 10);
    if (!Number.isFinite(ts) || !name) return null;
    const directory = rest[0] ?? null;
    return { ts: ts * 1000, name, directory };
  }

  // 옛 형식 fallback — 공백 구분
  const spaceIdx = line.indexOf(' ');
  if (spaceIdx < 0) return null;
  const ts = parseInt(line.slice(0, spaceIdx), 10);
  const name = line.slice(spaceIdx + 1).trim();
  if (!Number.isFinite(ts) || !name) return null;
  return { ts: ts * 1000, name, directory: null };
}

/**
 * stats.log 의 모든 엔트리를 파싱해서 반환 (필터/집계 전 raw).
 * 다른 분석 함수의 공통 입력.
 */
async function readEntries(options: { since?: Date } = {}): Promise<RawEntry[]> {
  const sinceMs = options.since?.getTime() ?? 0;

  let raw = '';
  try {
    raw = await fs.readFile(STATS_LOG_PATH, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }

  const entries: RawEntry[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const parsed = parseLine(line);
    if (!parsed) continue;
    if (parsed.ts < sinceMs) continue;
    entries.push(parsed);
  }
  return entries;
}

/**
 * stats.log 를 단축키별로 집계.
 * 기존 ha stats / ha rm / ha list --sort usage 가 의존하는 함수.
 * 디렉토리 정보는 무시하고 글로벌 빈도만 계산.
 */
export async function aggregateStats(options: { since?: Date } = {}): Promise<StatsAggregation> {
  const entries = await readEntries(options);

  if (entries.length === 0) {
    return { byShortcut: [], totalCalls: 0, firstSeen: null };
  }

  const counts = new Map<string, { count: number; lastTs: number }>();
  let firstSeenMs = Infinity;

  for (const entry of entries) {
    if (entry.ts < firstSeenMs) firstSeenMs = entry.ts;

    const existing = counts.get(entry.name);
    if (existing) {
      existing.count++;
      if (entry.ts > existing.lastTs) existing.lastTs = entry.ts;
    } else {
      counts.set(entry.name, { count: 1, lastTs: entry.ts });
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
    totalCalls: entries.length,
    firstSeen: firstSeenMs === Infinity ? null : new Date(firstSeenMs),
  };
}

/**
 * 컨텍스트 인식 검색 결과 점수.
 *
 * score = α × (현재 디렉토리에서 쓴 횟수) + β × (전체 빈도)
 *
 * α=10, β=1 이면 현재 디렉토리 1번 사용이 글로벌 10번과 동급.
 * 즉 "이 폴더에서 진짜로 쓴 게 확실히 위로" 정책.
 */
export interface ContextScoring {
  /** 현재 디렉토리 가중치 (default 10) */
  alpha?: number;
  /** 글로벌 빈도 가중치 (default 1) */
  beta?: number;
}

export interface ScoredShortcut {
  name: string;
  score: number;
  /** 현재 디렉토리에서 쓴 횟수 */
  contextCount: number;
  /** 전체 사용 횟수 */
  globalCount: number;
}

/**
 * 현재 디렉토리 컨텍스트 기반으로 단축키들을 점수 매김.
 *
 * shortcutNames 에 있는 모든 단축키를 점수와 함께 반환 (사용 0회인 것 포함).
 * 그래야 한 번도 안 쓴 단축키도 검색에 잡힘 — 0점이지만 결과에는 포함됨.
 */
export async function scoreShortcutsForDirectory(
  shortcutNames: string[],
  currentDir: string,
  scoring: ContextScoring = {},
): Promise<ScoredShortcut[]> {
  const alpha = scoring.alpha ?? 10;
  const beta = scoring.beta ?? 1;

  const entries = await readEntries();

  // 단축키별로 두 카운트 동시 계산
  const stats = new Map<string, { context: number; global: number }>();
  for (const name of shortcutNames) {
    stats.set(name, { context: 0, global: 0 });
  }

  for (const entry of entries) {
    const s = stats.get(entry.name);
    if (!s) continue; // 삭제된 단축키 — 무시
    s.global++;
    // directory 가 null (옛 형식) 인 라인은 컨텍스트 점수에 반영 안 함
    if (entry.directory === currentDir) {
      s.context++;
    }
  }

  return Array.from(stats.entries())
    .map(([name, { context, global }]) => ({
      name,
      contextCount: context,
      globalCount: global,
      score: alpha * context + beta * global,
    }))
    .sort((a, b) => {
      // 점수 동률이면 글로벌 빈도, 또 동률이면 이름순
      if (b.score !== a.score) return b.score - a.score;
      if (b.globalCount !== a.globalCount) return b.globalCount - a.globalCount;
      return a.name.localeCompare(b.name);
    });
}