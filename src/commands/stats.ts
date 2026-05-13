import * as p from '@clack/prompts';
import chalk from 'chalk';
import { aggregateStats } from '../core/stats.js';
import { readStore, writeStore } from '../core/store.js';
import { generateAliasesFile } from '../core/generator.js';
import type { Shortcut } from '../core/types.js';
import { t } from '../lib/i18n.js';

export interface StatsOptions {
  /** 안 쓰는 단축키 모드 */
  unused?: boolean;
  /** --unused 목록에서 바로 일괄 삭제 */
  clean?: boolean;
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
    if (options.clean) {
      await runClean(agg, store);
    } else {
      await printUnused(agg, store.shortcuts);
    }
    return;
  }

  if (store.shortcuts.length === 0) {
    console.log(chalk.dim(t('stats.noShortcuts')));
    return;
  }

  if (agg.totalCalls === 0) {
    console.log();
    console.log(chalk.dim(`  ${t('stats.noUsage')}`));
    console.log(
      chalk.dim(`  ${t('stats.noUsageHint')}`) +
        chalk.cyan('gs') +
        chalk.dim(t('stats.noUsageHint2')),
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
    ? t('stats.periodSince', { date: formatRelative(since) })
    : agg.firstSeen
      ? t('stats.periodFrom', { date: formatRelative(agg.firstSeen) })
      : t('stats.periodAll');
  console.log(chalk.bold(`  ${t('stats.header')}  ${chalk.dim(`(${periodLabel} · ${t('stats.periodTotal', { count: agg.totalCalls })})`)}`));
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
      ? chalk.dim(`  ${t('stats.lastUsed', { date: formatRelative(entry.lastUsed) })}`)
      : '';
    console.log(`  ${rank}  ${name}  ${count}  ${bar}${lastUsed}`);
  }
  console.log();
}

async function printUnused(
  agg: { byShortcut: { name: string; lastUsed: Date | null }[] },
  shortcuts: Shortcut[],
): Promise<void> {
  const usedMap = new Map(agg.byShortcut.map((e) => [e.name, e.lastUsed]));
  const neverUsed = shortcuts.filter((s) => !usedMap.has(s.name));

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const staleEntries = agg.byShortcut
    .filter((e) => e.lastUsed && e.lastUsed.getTime() < thirtyDaysAgo)
    .map((e) => ({
      shortcut: shortcuts.find((s) => s.name === e.name),
      lastUsed: e.lastUsed,
    }))
    .filter((e): e is { shortcut: Shortcut; lastUsed: Date } => e.shortcut !== undefined && e.lastUsed !== null);

  console.log();

  if (neverUsed.length === 0 && staleEntries.length === 0) {
    console.log(chalk.green(`  ✓ ${t('stats.allActive')}`));
    console.log();
    return;
  }

  const maxNameLen = Math.max(
    ...neverUsed.map((s) => s.name.length),
    ...staleEntries.map((e) => e.shortcut.name.length),
    4,
  );

  if (neverUsed.length > 0) {
    console.log(chalk.bold(`  ${t('stats.neverUsed', { count: neverUsed.length })}`));
    console.log();
    for (const s of neverUsed) {
      const name = chalk.yellow(s.name.padEnd(maxNameLen));
      const cmd = chalk.dim(truncate(s.command, 40));
      const created = chalk.dim(t('stats.neverUsedCreated', { date: formatRelative(new Date(s.createdAt)) }));
      console.log(`    ${chalk.dim('•')} ${name}  ${cmd}  ${created}`);
    }
    console.log();
  }

  if (staleEntries.length > 0) {
    console.log(chalk.bold(`  ${t('stats.stale', { count: staleEntries.length })}`));
    console.log();
    for (const e of staleEntries) {
      const name = chalk.yellow(e.shortcut.name.padEnd(maxNameLen));
      const cmd = chalk.dim(truncate(e.shortcut.command, 40));
      const last = chalk.dim(t('stats.staleLastUsed', { date: formatRelative(e.lastUsed) }));
      console.log(`    ${chalk.dim('•')} ${name}  ${cmd}  ${last}`);
    }
    console.log();
  }

  const total = neverUsed.length + staleEntries.length;
  console.log(
    chalk.dim(`  ${t('stats.cleanHint')}`) +
    chalk.cyan('ha rm <name>') +
    chalk.dim(t('stats.cleanHint2')) +
    chalk.cyan('ha unused --clean') +
    chalk.dim(t('stats.cleanHint3', { count: total })),
  );
  console.log();
}

/**
 * --unused --clean 모드: 안 쓰는 단축키를 체크박스로 선택해 일괄 삭제.
 */
async function runClean(
  agg: { byShortcut: { name: string; lastUsed: Date | null }[] },
  store: { shortcuts: Shortcut[]; version: 1 },
): Promise<void> {
  if (!process.stdin.isTTY) {
    console.log(chalk.yellow(`  ${t('stats.cleanNotTTY')}`));
    console.log(chalk.dim(`  ${t('stats.cleanNotTTYHint')}`) + chalk.cyan('ha unused --clean') + chalk.dim(t('stats.cleanNotTTYHint2')));
    return;
  }

  const usedMap = new Map(agg.byShortcut.map((e) => [e.name, e.lastUsed]));
  const neverUsed = store.shortcuts.filter((s) => !usedMap.has(s.name));

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const staleEntries = agg.byShortcut
    .filter((e) => e.lastUsed && e.lastUsed.getTime() < thirtyDaysAgo)
    .map((e) => ({
      shortcut: store.shortcuts.find((s) => s.name === e.name),
      lastUsed: e.lastUsed,
    }))
    .filter((e): e is { shortcut: Shortcut; lastUsed: Date } => e.shortcut !== undefined && e.lastUsed !== null);

  const candidates = [
    ...neverUsed.map((s) => ({ shortcut: s, reason: 'never' as const })),
    ...staleEntries.map((e) => ({ shortcut: e.shortcut, reason: 'stale' as const })),
  ];

  if (candidates.length === 0) {
    console.log();
    console.log(chalk.green(`  ✓ ${t('stats.cleanNoItems')}`));
    console.log();
    return;
  }

  console.log();
  p.intro(chalk.bgYellow.black(t('stats.cleanIntro')));

  const options = candidates.map((c) => ({
    value: c.shortcut.name,
    label: c.shortcut.name,
    hint: `${c.reason === 'never' ? t('stats.cleanNeverUsedHint') : t('stats.cleanStaleHint')}  ${truncate(c.shortcut.command, 35)}`,
  }));

  const selected = await p.multiselect({
    message: t('stats.cleanSelectPrompt'),
    options,
    required: false,
  });

  if (p.isCancel(selected)) {
    p.cancel(t('stats.cancelled'));
    return;
  }

  const names = selected as string[];
  if (names.length === 0) {
    p.outro(chalk.dim(t('stats.cleanNoneSelected')));
    return;
  }

  const confirm = await p.confirm({
    message: t('stats.cleanConfirm', { count: names.length }),
    initialValue: false,
  });

  if (p.isCancel(confirm) || !confirm) {
    p.cancel(t('stats.cancelled'));
    return;
  }

  const nameSet = new Set(names);
  store.shortcuts = store.shortcuts.filter((s) => !nameSet.has(s.name));
  await writeStore(store);
  await generateAliasesFile(store);

  p.outro(
    chalk.green(`✓ ${t('stats.cleanDone', { count: names.length })}`) +
      '\n\n  ' +
      chalk.dim(t('stats.cleanReloadHint')) +
      chalk.cyan(t('common.hareload')),
  );
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

  if (diffSec < 60) return t('stats.timeJustNow');
  if (diffMin < 60) return t('stats.timeMinutes', { n: diffMin });
  if (diffHour < 24) return t('stats.timeHours', { n: diffHour });
  if (diffDay < 30) return t('stats.timeDays', { n: diffDay });
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return t('stats.timeMonths', { n: diffMonth });
  return t('stats.timeYears', { n: Math.floor(diffMonth / 12) });
}

/** 문자열을 maxLen 이하로 자름. 초과 시 '…' 붙임. */
function truncate(str: string, maxLen: number): string {
  return str.length <= maxLen ? str : str.slice(0, maxLen - 1) + '…';
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
