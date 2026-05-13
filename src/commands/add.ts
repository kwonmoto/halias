import * as p from '@clack/prompts';
import chalk from 'chalk';
import { addShortcut, readStore } from '../core/store.js';
import { generateAliasesFile } from '../core/generator.js';
import { ShortcutSchema, type Shortcut } from '../core/types.js';
import { readLastShellCommand } from '../lib/shell-history.js';
import { detectSystemCommandConflict } from '../lib/system-commands.js';
import { editFunctionBody } from '../lib/editor.js';
import { t } from '../lib/i18n.js';

type ShortcutType = 'alias' | 'function';

interface AddOptions {
  name?: string;
  last?: boolean;
}

interface AddMetaResult {
  name: string;
  type: ShortcutType;
  description: string;
  tags: string;
}

/**
 * halias add — 대화형 단축키 추가
 *
 * 이 명령어가 halias의 첫인상이자 핵심 UX.
 * 4단계로 부담 없이 입력받고, 마지막에 미리보기로 안심시킨다.
 */
export async function runAdd(options: AddOptions = {}): Promise<void> {
  console.clear();
  p.intro(chalk.bgCyan.black(options.last ? t('add.introLast') : t('add.intro')));

  const store = await readStore();
  const existingNames = new Set(store.shortcuts.map((s) => s.name));

  if (options.last) {
    const lastCommand = await readLastShellCommand();
    if (!lastCommand) {
      p.cancel(t('add.lastNotFound'));
      return;
    }

    await runAddFromCommand(options.name, lastCommand, t('add.lastCommandNote'), existingNames);
    return;
  }

  const meta = (await p.group(
    {
      name: () =>
        p.text({
          message: t('add.namePrompt'),
          placeholder: t('add.namePlaceholder'),
          validate: (value) => validateShortcutName(value, existingNames),
        }),

      type: () =>
        p.select({
          message: t('add.typePrompt'),
          options: [
            {
              value: 'alias',
              label: t('add.typeAliasLabel'),
              hint: t('add.typeAliasHint'),
            },
            {
              value: 'function',
              label: t('add.typeFunctionLabel'),
              hint: t('add.typeFunctionHint'),
            },
          ] as const,
          initialValue: 'alias',
        }),

      description: () =>
        p.text({
          message: t('add.descPrompt'),
          placeholder: t('add.descPlaceholder'),
        }),

      tags: () =>
        p.text({
          message: t('add.tagsPrompt'),
          placeholder: t('add.tagsPlaceholder'),
        }),
    },
    {
      onCancel: () => {
        p.cancel(t('add.cancelled'));
        process.exit(0);
      },
    },
  )) as AddMetaResult;

  // command — alias는 인라인, function은 $EDITOR
  let command: string;
  if (meta.type === 'function') {
    const body = await editFunctionBody('', meta.name);
    if (body === null) {
      p.cancel(t('add.cancelled'));
      return;
    }
    command = body;
  } else {
    const input = await p.text({
      message: t('add.commandPrompt'),
      placeholder: t('add.commandPlaceholder'),
      validate: (v) => (v ? undefined : t('add.commandRequired')),
    });
    if (p.isCancel(input)) {
      p.cancel(t('add.cancelled'));
      return;
    }
    command = input as string;
  }

  const now = new Date().toISOString();
  const shortcut: Shortcut = {
    name: meta.name,
    command,
    type: meta.type,
    description: meta.description || undefined,
    tags: (meta.tags ?? '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    source: 'personal',
    createdAt: now,
    updatedAt: now,
  };

  await confirmAndSaveShortcut(shortcut);
}

export async function runAddFromCommand(
  name: string | undefined,
  command: string,
  noteTitle = t('add.lastCommandNote'),
  existingNames?: Set<string>,
): Promise<void> {
  const names = existingNames ?? new Set((await readStore()).shortcuts.map((shortcut) => shortcut.name));

  p.note(command, noteTitle);

  let shortcutName = name;
  if (shortcutName) {
    const nameError = validateShortcutName(shortcutName, names);
    if (nameError) {
      throw new Error(nameError);
    }
  } else {
    const promptedName = await p.text({
      message: t('add.saveNamePrompt'),
      placeholder: t('add.saveNamePlaceholder'),
      validate: (value) => validateShortcutName(value, names),
    });

    if (p.isCancel(promptedName)) {
      p.cancel(t('add.cancelled'));
      return;
    }

    shortcutName = promptedName;
  }

  const description = await p.text({
    message: t('add.descPrompt'),
    placeholder: t('add.descPlaceholder'),
  });

  if (p.isCancel(description)) {
    p.cancel(t('add.cancelled'));
    return;
  }

  const tags = await p.text({
    message: t('add.tagsPrompt'),
    placeholder: t('add.tagsPlaceholder'),
  });

  if (p.isCancel(tags)) {
    p.cancel(t('add.cancelled'));
    return;
  }

  const now = new Date().toISOString();
  const shortcut: Shortcut = {
    name: shortcutName,
    command,
    type: 'alias',
    description: description || undefined,
    tags: tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    source: 'personal',
    createdAt: now,
    updatedAt: now,
  };

  await confirmAndSaveShortcut(shortcut);
}

function validateShortcutName(value: string | undefined, existingNames: Set<string>): string | undefined {
  if (!value) return t('add.validateEmpty');
  if (existingNames.has(value)) return t('add.validateDuplicate', { name: value });
  const parsed = ShortcutSchema.shape.name.safeParse(value);
  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? t('add.validateBadFormat');
  }
  return undefined;
}

async function confirmAndSaveShortcut(shortcut: Shortcut): Promise<void> {
  // 미리보기로 사용자에게 어떻게 생성될지 보여주기
  const preview =
    shortcut.type === 'alias'
      ? `${shortcut.name}() {\n  _halias_track "${shortcut.name}"\n  ${shortcut.command} "$@"\n}`
      : `${shortcut.name}() {\n  _halias_track "${shortcut.name}"\n${shortcut.command
          .split('\n')
          .map((l) => `  ${l}`)
          .join('\n')}\n}`;

  p.note(preview, t('add.previewNote'));

  // 시스템 명령어와 충돌하는지 — 진행은 가능하되 명시적 경고
  const systemConflict = detectSystemCommandConflict(shortcut.name);
  if (systemConflict.conflict) {
    p.note(
      chalk.yellow('⚠ ') + (systemConflict.reason ?? '') +
        '\n\n' +
        chalk.dim(t('add.conflictWarning')),
      t('add.conflictNote'),
    );

    const proceedAnyway = await p.confirm({
      message: t('add.conflictConfirm'),
      initialValue: false,
    });

    if (p.isCancel(proceedAnyway) || !proceedAnyway) {
      p.cancel(t('add.cancelled'));
      return;
    }
  }

  const confirm = await p.confirm({
    message: t('add.saveConfirm'),
    initialValue: true,
  });

  if (p.isCancel(confirm) || !confirm) {
    p.cancel(t('add.cancelled'));
    return;
  }

  const spinner = p.spinner();
  spinner.start(t('add.saving'));
  await addShortcut(shortcut);
  const updated = await readStore();
  await generateAliasesFile(updated);
  spinner.stop(t('add.saved'));

  // halias install 후에는 hareload가 셸에 등록되어 있으므로
  // 사용자는 그것 한 단어만 기억하면 됨.
  p.outro(
    chalk.green(`✓ ${shortcut.name} ${t('add.outroDone')}`) +
      '\n\n  ' +
      chalk.dim(t('add.outroReloadHint')) +
      chalk.cyan(t('common.hareload')) +
      '\n  ' +
      chalk.dim(t('add.outroNewTermHint')),
  );
}
