import chalk from 'chalk';
import { readStore } from '../core/store.js';
import { aggregateStats } from '../core/stats.js';
import type { Shortcut } from '../core/types.js';

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
      console.log(chalk.dim(`태그 '${options.tag}'에 해당하는 단축키가 없습니다.`));
    } else {
      console.log(
        chalk.dim('등록된 단축키가 없습니다. ') +
          chalk.cyan("'ha add'") +
          chalk.dim('로 시작하세요.'),
      );
    }
    return;
  }

  let usageMap: Map<string, number> | null = null;
  if (sort === 'usage') {
    const agg = await aggregateStats();
    usageMap = new Map(agg.byShortcut.map((e) => [e.name, e.count]));
  }

  const sorted = sortShortcuts(filtered, sort, usageMap);

  const headerCount = options.tag
    ? `${filtered.length}개 ${chalk.dim(`(태그: ${options.tag} · ${sortLabel(sort)})`)}`
    : `${store.shortcuts.length}개 ${chalk.dim(`(${sortLabel(sort)})`)}`;

  console.log();
  console.log(chalk.bold(`  단축키 ${headerCount}`));
  console.log();

  const maxName = Math.max(...sorted.map((s) => s.name.length));

  for (const s of sorted) {
    const name = chalk.cyan(s.name.padEnd(maxName));
    const type = chalk.dim(s.type.padEnd(8));
    const cmd = s.type === 'alias' ? s.command : chalk.italic('<function>');
    const tags = s.tags.length > 0 ? chalk.dim(` [${s.tags.join(', ')}]`) : '';

    let suffix = tags;
    if (sort === 'usage' && usageMap) {
      const count = usageMap.get(s.name) ?? 0;
      suffix += chalk.dim(`  · ${count}회 사용`);
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
  return { name: '이름순', recent: '최근 변경순', usage: '사용 빈도순' }[mode];
}
