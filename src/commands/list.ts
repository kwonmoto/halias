import chalk from 'chalk';
import { readStore } from '../core/store.js';
import { aggregateStats } from '../core/stats.js';
import type { Shortcut } from '../core/types.js';
import { t } from '../lib/i18n.js';

export type SortMode = 'name' | 'recent' | 'usage';

export interface ListOptions {
  sort?: SortMode;
  tag?: string;
}

/**
 * ha list — 등록된 단축키 목록.
 *
 * 정렬 옵션:
 *   --sort name    이름 사전순 (기본)
 *   --sort recent  최근 추가/수정순
 *   --sort usage   사용 빈도순 (stats.log 기반)
 */
export async function runList(options: ListOptions = {}): Promise<void> {
  const store = await readStore();

  const sort: SortMode = options.sort ?? 'name';

  // 태그 필터
  const filtered = options.tag
    ? store.shortcuts.filter((s) => s.tags.includes(options.tag!))
    : store.shortcuts;

  if (filtered.length === 0) {
    if (options.tag) {
      console.log(chalk.dim(t('list.noShortcutsTagged', { tag: options.tag })));
    } else {
      console.log(chalk.dim(t('list.noShortcuts')));
    }
    return;
  }

  let usageMap: Map<string, number> | null = null;
  if (sort === 'usage') {
    const agg = await aggregateStats();
    usageMap = new Map(agg.byShortcut.map((e) => [e.name, e.count]));
  }

  const sorted = sortShortcuts(filtered, sort, usageMap);

  const sortLbl = sortLabel(sort);
  const headerCount = options.tag
    ? `${filtered.length}${chalk.dim(` (${t('list.headerWithTag', { count: '', tag: options.tag, sort: sortLbl }).replace('{count}', '').trim()}`)}`
    : `${store.shortcuts.length}${chalk.dim(` (${sortLbl})`)}`;

  // Simpler header construction
  const countStr = options.tag ? String(filtered.length) : String(store.shortcuts.length);
  const headerSuffix = options.tag
    ? chalk.dim(`(태그: ${options.tag} · ${sortLbl})`)
    : chalk.dim(`(${sortLbl})`);

  console.log();
  console.log(chalk.bold(`  ${t('list.header', { count: countStr })} ${headerSuffix}`));
  console.log();

  const maxName = Math.max(...sorted.map((s) => s.name.length));

  for (const s of sorted) {
    const name = chalk.cyan(s.name.padEnd(maxName));
    const type = chalk.dim(s.type.padEnd(8));
    const cmd = s.type === 'alias' ? s.command : chalk.italic(t('list.functionLabel'));
    const tags = s.tags.length > 0 ? chalk.dim(` [${s.tags.join(', ')}]`) : '';

    let suffix = tags;
    if (sort === 'usage' && usageMap) {
      const count = usageMap.get(s.name) ?? 0;
      suffix += chalk.dim(`  · ${t('list.usageCount', { count })}`);
    }

    console.log(`  ${name}  ${type}  ${cmd}${suffix}`);
  }
  console.log();
}

function sortShortcuts(
  shortcuts: Shortcut[],
  mode: SortMode,
  usageMap: Map<string, number> | null,
): Shortcut[] {
  const sorted = [...shortcuts];

  switch (mode) {
    case 'name':
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'recent':
      // updatedAt이 더 최근인 것이 위로
      sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      break;
    case 'usage':
      sorted.sort((a, b) => {
        const aCount = usageMap?.get(a.name) ?? 0;
        const bCount = usageMap?.get(b.name) ?? 0;
        if (aCount !== bCount) return bCount - aCount;
        return a.name.localeCompare(b.name); // tiebreaker
      });
      break;
  }

  return sorted;
}

function sortLabel(mode: SortMode): string {
  const labels: Record<SortMode, string> = {
    name: t('list.sortName'),
    recent: t('list.sortRecent'),
    usage: t('list.sortUsage'),
  };
  return labels[mode];
}
