import chalk from 'chalk';
import * as p from '@clack/prompts';
import { readStore, removeShortcut } from '../core/store.js';
import { generateAliasesFile } from '../core/generator.js';
import { aggregateStats } from '../core/stats.js';
import { t } from '../lib/i18n.js';

const FREQUENT_THRESHOLD = 5; // 5회 이상 쓴 것은 "자주 쓰는" 것으로 간주

export async function runRemove(name: string | undefined): Promise<void> {
  const store = await readStore();

  if (store.shortcuts.length === 0) {
    console.log(chalk.dim(t('remove.noShortcuts')));
    return;
  }

  // 사용 빈도 정보를 미리 가져와서 모든 흐름에서 사용
  const agg = await aggregateStats();
  const usageMap = new Map(agg.byShortcut.map((e) => [e.name, e.count]));

  let target = name;
  if (!target) {
    const selected = await p.select({
      message: t('remove.selectPrompt'),
      options: store.shortcuts.map((s) => {
        const count = usageMap.get(s.name) ?? 0;
        const cmdHint = s.type === 'alias' ? s.command : t('common.functionLabel');
        const usageHint = count > 0
          ? `  · ${t('remove.usageHint', { count })}`
          : `  · ${t('remove.unusedHint')}`;
        return {
          value: s.name,
          label: s.name,
          hint: cmdHint + chalk.dim(usageHint),
        };
      }),
    });
    if (p.isCancel(selected)) {
      p.cancel(t('remove.cancelled'));
      return;
    }
    target = selected as string;
  }

  // 존재 여부 확인 (직접 이름 입력한 경우)
  const shortcut = store.shortcuts.find((s) => s.name === target);
  if (!shortcut) {
    console.log(chalk.red(t('remove.notFound', { name: target })));
    return;
  }

  // 자주 쓰는 단축키면 추가 확인
  const count = usageMap.get(target) ?? 0;
  if (count >= FREQUENT_THRESHOLD) {
    const confirmed = await p.confirm({
      message:
        chalk.yellow(t('remove.frequentWarning', { name: target, count })) +
        '\n  ' +
        chalk.dim(t('remove.frequentConfirm')),
      initialValue: false,
    });

    if (p.isCancel(confirmed) || !confirmed) {
      p.cancel(t('remove.cancelledDelete'));
      return;
    }
  }

  const removed = await removeShortcut(target);
  if (!removed) {
    console.log(chalk.red(t('remove.deleteFailed', { name: target })));
    return;
  }
  const updated = await readStore();
  await generateAliasesFile(updated);

  const usageInfo = count > 0 ? chalk.dim(` ${t('remove.usageCount', { count })}`) : '';
  console.log(chalk.green(`✓ ${t('remove.deleted', { name: target })}`) + usageInfo);
}
