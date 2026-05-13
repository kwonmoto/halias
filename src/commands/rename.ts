import * as p from '@clack/prompts';
import chalk from 'chalk';
import { readStore, writeStore } from '../core/store.js';
import { generateAliasesFile } from '../core/generator.js';
import { ShortcutSchema } from '../core/types.js';
import { t } from '../lib/i18n.js';

/**
 * ha rename <old> <new> — 단축키 이름만 빠르게 변경.
 *
 * 전체 편집 폼 없이 이름 하나만 바꾸는 단축 경로.
 * old/new 미지정 시 각각 프롬프트로 입력받음.
 */
export async function runRename(oldName?: string, newName?: string): Promise<void> {
  const store = await readStore();

  if (store.shortcuts.length === 0) {
    console.log(chalk.dim(t('rename.noShortcuts')));
    return;
  }

  // old name — 미지정 시 선택
  let from = oldName;
  if (!from) {
    const selected = await p.select({
      message: t('rename.selectPrompt'),
      options: store.shortcuts.map((s) => ({
        value: s.name,
        label: s.name,
        hint: s.type === 'alias' ? s.command : t('common.functionLabel'),
      })),
    });
    if (p.isCancel(selected)) {
      p.cancel(t('rename.cancelled'));
      return;
    }
    from = selected as string;
  }

  const target = store.shortcuts.find((s) => s.name === from);
  if (!target) {
    console.log(chalk.red(t('rename.notFound', { name: from })));
    return;
  }

  // new name — 미지정 시 입력
  let to = newName;
  if (!to) {
    const otherNames = new Set(store.shortcuts.filter((s) => s.name !== from).map((s) => s.name));
    const input = await p.text({
      message: t('rename.newNamePrompt', { name: chalk.cyan(from) }),
      validate: (v) => {
        if (!v) return t('rename.sameNameError');
        if (v === from) return t('rename.sameNameError');
        if (otherNames.has(v)) return t('rename.duplicateError', { name: v });
        const parsed = ShortcutSchema.shape.name.safeParse(v);
        if (!parsed.success) return parsed.error.issues[0]?.message ?? t('rename.badFormatError');
        return undefined;
      },
    });
    if (p.isCancel(input)) {
      p.cancel(t('rename.cancelled'));
      return;
    }
    to = input as string;
  } else {
    // 인자로 받은 경우 검증
    const otherNames = new Set(store.shortcuts.filter((s) => s.name !== from).map((s) => s.name));
    if (to === from) {
      console.log(chalk.yellow(t('rename.sameName')));
      return;
    }
    if (otherNames.has(to)) {
      console.log(chalk.red(t('rename.duplicate', { name: to })));
      return;
    }
    const parsed = ShortcutSchema.shape.name.safeParse(to);
    if (!parsed.success) {
      console.log(chalk.red(parsed.error.issues[0]?.message ?? t('rename.badFormatError')));
      return;
    }
  }

  store.shortcuts = store.shortcuts.map((s) =>
    s.name === from ? { ...s, name: to as string, updatedAt: new Date().toISOString() } : s,
  );
  await writeStore(store);
  await generateAliasesFile(store);

  console.log(chalk.green(`✓ ${t('rename.done', { from, to })}`));
  console.log('  ' + chalk.dim(t('rename.reloadHint')) + chalk.cyan(t('common.hareload')));
}
