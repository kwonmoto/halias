import * as p from '@clack/prompts';
import chalk from 'chalk';
import { readStore } from '../core/store.js';
import { runList } from './list.js';
import { t } from '../lib/i18n.js';

/**
 * ha tags — 사용 중인 태그 목록 표시 + 태그별 필터링.
 *
 * 인자 없이 실행 시: 모든 태그 + 각 태그의 단축키 개수 표시.
 * TTY 환경이면 태그 선택 → ha list --tag <tag> 실행.
 * 인자 지정 시: ha list --tag <tag> 바로 실행.
 */
export async function runTags(tagArg?: string): Promise<void> {
  const store = await readStore();

  if (store.shortcuts.length === 0) {
    console.log(chalk.dim(t('tags.noShortcuts')));
    return;
  }

  // 태그 → 개수 맵 집계
  const tagMap = new Map<string, number>();
  for (const s of store.shortcuts) {
    for (const tag of s.tags) {
      tagMap.set(tag, (tagMap.get(tag) ?? 0) + 1);
    }
  }

  // 인자 지정 시 바로 필터 실행
  if (tagArg) {
    if (!tagMap.has(tagArg)) {
      console.log(chalk.red(t('tags.notFound', { tag: tagArg })));
      return;
    }
    await runList({ tag: tagArg });
    return;
  }

  if (tagMap.size === 0) {
    console.log();
    console.log(chalk.dim(`  ${t('tags.noTags')}`));
    console.log(chalk.dim(`  ${t('tags.noTagsHint')}`) + chalk.cyan('ha add') + chalk.dim(t('tags.noTagsHint2')));
    console.log();
    return;
  }

  // 태그 목록 표시 (사용 빈도 내림차순)
  const sorted = [...tagMap.entries()].sort((a, b) => b[1] - a[1]);
  const maxTagLen = Math.max(...sorted.map(([tag]) => tag.length), 4);

  console.log();
  console.log(chalk.bold(`  ${t('tags.header', { count: String(tagMap.size) })}`));
  console.log();

  for (const [tag, count] of sorted) {
    const tagStr = chalk.cyan(tag.padEnd(maxTagLen));
    const countStr = chalk.dim(t('tags.shortcutCount', { count: String(count) }));
    console.log(`    ${chalk.dim('·')} ${tagStr}  ${countStr}`);
  }
  console.log();

  // TTY에서는 인터랙티브 선택 제공
  if (!process.stdin.isTTY) return;

  const options = [
    ...sorted.map(([tag, count]) => ({
      value: tag,
      label: tag,
      hint: t('tags.shortcutCount', { count: String(count) }),
    })),
    { value: '__exit__', label: t('tags.exitOption'), hint: '' },
  ];

  const selected = await p.select({
    message: t('tags.selectPrompt'),
    options,
  });

  if (p.isCancel(selected) || selected === '__exit__') return;

  await runList({ tag: selected as string });
}
