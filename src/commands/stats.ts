import chalk from 'chalk';
import { aggregateStats } from '../core/stats.js';
import { readStore } from '../core/store.js';

export interface StatsOptions {
  /** 안 쓰는 단축키 모드 */
  unused?: boolean;
  /** 최근 N일만 집계 (예: '7d' → 최근 7일) */
  since?: string;
  /** top N (기본 10) */
  top?: string;
}

/**
 * ha stats — 단축키 사용 통계 표시.
 *
 * 모드:
 *   ha stats              → 전체 기간 top 10 + 요약
 *   ha stats --top 20     → top 20
 *   ha stats --since 7d   → 최근 7일만
 *   ha stats --unused     → 한 번도 안 쓴 단축키 + 30일 이상 미사용
 */
export async function runStats(options: StatsOptions = {}): Promise<void> {
  const since = parseSince(options.since);
  const topN = parseInt(options.top ?? '10', 10);

  const [agg, store] = await Promise.all([aggregateStats({ since }), readStore()]);

  if (options.unused) {
    printUnused(agg, store);
    return;
  }

  if (store.shortcuts.length === 0) {
    console.log(chalk.dim('등록된 단축키가 없습니다.'));
    return;
  }

  if (agg.totalCalls === 0) {
    console.log();
    console.log(chalk.dim('  아직 사용 기록이 없습니다.'));
    console.log(
      chalk.dim('  단축키를 사용하면 자동으로 기록됩니다 (예: ') +
        chalk.cyan('gs') +
        chalk.dim(' 입력 시).'),
    );
    console.log();
    return;
  }

  printTop(agg, topN, since);
}

function printTop(
  agg: { byShortcut: { name: string; count: number; lastUsed: Date | null }[]; totalCalls: number; firstSeen: Date | null },
  topN: number,
  since: Date | undefined,
): void {
  console.log();
  const periodLabel = since
    ? `${formatRelative(since)} 이후`
    : agg.firstSeen
      ? `${formatRelative(agg.firstSeen)}부터`
      : '전체 기간';
  console.log(chalk.bold(`  사용 통계  ${chalk.dim(`(${periodLabel} · 총 ${agg.totalCalls}회)`)}`));
  console.log();

  const top = agg.byShortcut.slice(0, topN);
  const maxCount = top[0]?.count ?? 1;
  const maxName = Math.max(...top.map((e) => e.name.length), 4);

  for (const [i, entry] of top.entries()) {
    const rank = chalk.dim(`${(i + 1).toString().padStart(2)}.`);
    const name = chalk.cyan(entry.name.padEnd(maxName));
    const count = chalk.bold(entry.count.toString().padStart(5));
    const bar = renderBar(entry.count, maxCount, 20);
    const lastUsed = entry.lastUsed
      ? chalk.dim(`  마지막: ${formatRelative(entry.lastUsed)}`)
      : '';
    console.log(`  ${rank}  ${name}  ${count}  ${bar}${lastUsed}`);
  }
  console.log();
}

function printUnused(
  agg: { byShortcut: { name: string; lastUsed: Date | null }[] },
  store: { shortcuts: { name: string }[] },
): void {
  const usedNames = new Set(agg.byShortcut.map((e) => e.name));
  const neverUsed = store.shortcuts.filter((s) => !usedNames.has(s.name));

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const staleEntries = agg.byShortcut.filter(
    (e) => e.lastUsed && e.lastUsed.getTime() < thirtyDaysAgo,
  );

  console.log();

  if (neverUsed.length === 0 && staleEntries.length === 0) {
    console.log(chalk.green('  ✓ 모든 단축키가 활발히 사용되고 있습니다.'));
    console.log();
    return;
  }

  if (neverUsed.length > 0) {
    console.log(chalk.bold(`  한 번도 안 쓴 단축키 (${neverUsed.length}개)`));
    console.log();
    for (const s of neverUsed) {
      console.log('    ' + chalk.dim('•') + ' ' + chalk.yellow(s.name));
    }
    console.log();
  }

  if (staleEntries.length > 0) {
    console.log(chalk.bold(`  30일 이상 미사용 (${staleEntries.length}개)`));
    console.log();
    for (const e of staleEntries) {
      const ago = e.lastUsed ? formatRelative(e.lastUsed) : '알 수 없음';
      console.log('    ' + chalk.dim('•') + ' ' + chalk.yellow(e.name) + chalk.dim(`  (마지막: ${ago})`));
    }
    console.log();
  }

  console.log(chalk.dim('  정리하려면: ') + chalk.cyan('ha rm <name>'));
  console.log();
}

/**
 * 사용 횟수를 막대 그래프로 표시 (가장 많이 쓴 것 = max width).
 * 시각적으로 분포를 빠르게 파악 가능.
 */
function renderBar(value: number, max: number, width: number): string {
  const filled = Math.max(1, Math.round((value / max) * width));
  return chalk.cyan('▇'.repeat(filled));
}

/**
 * Date를 "3일 전", "2시간 전" 같은 상대 시간으로 표시.
 */
function formatRelative(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  if (diffDay < 30) return `${diffDay}일 전`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}개월 전`;
  return `${Math.floor(diffMonth / 12)}년 전`;
}

/**
 * "7d", "24h", "30m" 같은 형식을 Date(현재 - 기간)로 변환.
 * 형식 어긋나면 undefined 반환 (필터 미적용).
 */
function parseSince(input: string | undefined): Date | undefined {
  if (!input) return undefined;
  const match = input.match(/^(\d+)([dhm])$/);
  if (!match) return undefined;
  const [, numStr, unit] = match;
  const num = parseInt(numStr ?? '0', 10);
  const multipliers = { m: 60_000, h: 3_600_000, d: 86_400_000 } as const;
  const ms = num * multipliers[unit as keyof typeof multipliers];
  return new Date(Date.now() - ms);
}
