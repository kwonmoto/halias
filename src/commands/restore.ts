import * as p from '@clack/prompts';
import chalk from 'chalk';
import { hasBackup, restoreFromBackup, readStore } from '../core/store.js';
import { generateAliasesFile } from '../core/generator.js';
import { t } from '../lib/i18n.js';

/**
 * ha restore — 마지막 자동 백업(shortcuts.json.bak)으로 되돌린다.
 *
 * import --strategy replace / unused --clean 같은 파괴적 작업 직전에
 * 자동 저장된 백업을 복원. 되돌린 뒤 aliases.sh 재생성.
 */
export async function runRestore(): Promise<void> {
  if (!(await hasBackup())) {
    console.log();
    console.log(chalk.yellow(`  ${t('restore.noBackup')}`));
    console.log(chalk.dim(`  ${t('restore.noBackupHint')}`));
    console.log();
    return;
  }

  if (!process.stdin.isTTY) {
    console.log(chalk.yellow(`  ${t('restore.notTTY')}`));
    return;
  }

  const current = await readStore();

  const confirmed = await p.confirm({
    message: t('restore.confirm', { count: current.shortcuts.length }),
    initialValue: false,
  });

  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel(t('restore.cancelled'));
    return;
  }

  const restored = await restoreFromBackup();
  await generateAliasesFile(restored);

  console.log(
    chalk.green(`✓ ${t('restore.done', { count: restored.shortcuts.length })}`) +
      chalk.dim(t('restore.doneHint')) +
      chalk.cyan(t('common.hareload')),
  );
}
