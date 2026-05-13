import * as p from '@clack/prompts';
import chalk from 'chalk';
import { readStore, writeStore } from '../core/store.js';
import { generateAliasesFile } from '../core/generator.js';
import { ShortcutSchema, type Shortcut } from '../core/types.js';
import { editFunctionBody } from '../lib/editor.js';
import { t } from '../lib/i18n.js';

type ShortcutType = 'alias' | 'function';

interface MetaFormResult {
  name: string;
  type: ShortcutType;
  description: string;
  tags: string;
}

/**
 * ha edit [name] — 기존 단축키 편집.
 *
 * - name 미지정 시 선택 화면
 * - 모든 필드의 기존 값을 폼 기본값으로 채움
 * - function 타입은 $EDITOR(또는 $VISUAL)로 본문 편집
 * - 이름 변경 시 다른 단축키와의 충돌 체크
 * - 저장 시 createdAt 유지, updatedAt 갱신
 */
export async function runEdit(name?: string): Promise<void> {
  const store = await readStore();

  if (store.shortcuts.length === 0) {
    console.log(
      chalk.dim(t('edit.noShortcuts')),
    );
    return;
  }

  // 1. 편집할 대상 결정
  let target: Shortcut | undefined;
  if (name) {
    target = store.shortcuts.find((s) => s.name === name);
    if (!target) {
      console.log(chalk.red(t('edit.notFound', { name })));
      return;
    }
  } else {
    const selected = await p.select({
      message: t('edit.selectPrompt'),
      options: store.shortcuts.map((s) => ({
        value: s.name,
        label: s.name,
        hint: s.type === 'alias' ? s.command : t('common.functionLabel'),
      })),
    });
    if (p.isCancel(selected)) {
      p.cancel(t('edit.cancelled'));
      return;
    }
    target = store.shortcuts.find((s) => s.name === selected);
    if (!target) return;
  }

  // 2. 폼 — 이름/종류/설명/태그 (command는 별도 처리)
  console.clear();
  p.intro(
    chalk.bgCyan.black(t('edit.intro')) +
      chalk.dim(`  ${target.name}`),
  );

  const otherNames = new Set(
    store.shortcuts.filter((s) => s.name !== target!.name).map((s) => s.name),
  );

  const meta = (await p.group(
    {
      name: () =>
        p.text({
          message: t('edit.nameField'),
          initialValue: target!.name,
          validate: (value) => {
            if (!value) return t('edit.validateEmpty');
            if (otherNames.has(value)) return t('edit.validateDuplicate', { name: value });
            const parsed = ShortcutSchema.shape.name.safeParse(value);
            if (!parsed.success) return parsed.error.issues[0]?.message ?? t('edit.validateBadFormat');
            return undefined;
          },
        }),

      type: () =>
        p.select({
          message: t('edit.typeField'),
          options: [
            { value: 'alias', label: 'alias', hint: t('edit.typeAliasHint') },
            { value: 'function', label: 'function', hint: t('edit.typeFunctionHint') },
          ] as const,
          initialValue: target!.type,
        }),

      description: () =>
        p.text({
          message: t('edit.descField'),
          initialValue: target!.description ?? '',
          placeholder: t('edit.descPlaceholder'),
        }),

      tags: () =>
        p.text({
          message: t('edit.tagsField'),
          initialValue: target!.tags.join(', '),
          placeholder: t('edit.tagsPlaceholder'),
        }),
    },
    {
      onCancel: () => {
        p.cancel(t('edit.cancelled'));
        process.exit(0);
      },
    },
  )) as MetaFormResult;

  // 3. command — alias는 인라인 입력, function은 $EDITOR
  const newCommand = meta.type === 'function'
    ? await editFunctionBody(target.command, target.name)
    : await editInline(target.command, meta.type);

  if (newCommand === null) {
    p.cancel(t('edit.cancelled'));
    return;
  }

  // 4. 변경 사항 요약
  const changes = diffShortcut(target, meta, newCommand);
  if (changes.length === 0) {
    p.outro(chalk.dim(t('edit.noChanges')));
    return;
  }

  p.note(changes.join('\n'), t('edit.changesNote'));

  const confirm = await p.confirm({
    message: t('edit.saveConfirm'),
    initialValue: true,
  });

  if (p.isCancel(confirm) || !confirm) {
    p.cancel(t('edit.cancelled'));
    return;
  }

  // 5. 저장
  const updated: Shortcut = {
    name: meta.name,
    type: meta.type,
    command: newCommand,
    description: meta.description || undefined,
    tags: meta.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    source: target.source,
    createdAt: target.createdAt,
    updatedAt: new Date().toISOString(),
  };

  store.shortcuts = store.shortcuts.map((s) =>
    s.name === target!.name ? updated : s,
  );
  await writeStore(store);
  await generateAliasesFile(store);

  p.outro(
    chalk.green(`✓ ${updated.name} ${t('edit.outroDone')}`) +
      '\n\n  ' +
      chalk.dim(t('edit.outroReloadHint')) +
      chalk.cyan(t('common.hareload')),
  );
}

/**
 * alias 타입: Clack text 프롬프트로 한 줄 편집.
 * 취소 시 null 반환.
 */
async function editInline(current: string, _type: ShortcutType): Promise<string | null> {
  const result = await p.text({
    message: t('edit.commandField'),
    initialValue: current,
    validate: (v) => (v ? undefined : t('edit.commandRequired')),
  });
  if (p.isCancel(result)) return null;
  return result as string;
}

/**
 * 변경 사항을 사람이 읽기 좋은 형태로 요약.
 */
function diffShortcut(before: Shortcut, after: MetaFormResult, newCommand: string): string[] {
  const lines: string[] = [];
  const dim = chalk.dim;

  if (before.name !== after.name) {
    lines.push(`${dim(t('edit.diffName'))}  ${before.name} → ${chalk.cyan(after.name)}`);
  }
  if (before.type !== after.type) {
    lines.push(`${dim(t('edit.diffType'))}  ${before.type} → ${chalk.cyan(after.type)}`);
  }
  if (before.command !== newCommand) {
    lines.push(`${dim(t('edit.diffCommand'))}  ${t('edit.diffCommandChanged')}`);
  }
  const beforeDesc = before.description ?? '';
  if (beforeDesc !== after.description) {
    lines.push(`${dim(t('edit.diffDesc'))}  ${beforeDesc || t('edit.diffDescEmpty')} → ${after.description || t('edit.diffDescEmpty')}`);
  }
  const beforeTags = before.tags.join(', ');
  const afterTags = after.tags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .join(', ');
  if (beforeTags !== afterTags) {
    lines.push(`${dim(t('edit.diffTags'))}  ${beforeTags || t('edit.diffTagsEmpty')} → ${afterTags || t('edit.diffTagsEmpty')}`);
  }

  return lines;
}
