import * as p from '@clack/prompts';
import chalk from 'chalk';
import { addShortcut, readStore } from '../core/store.js';
import { generateAliasesFile } from '../core/generator.js';
import { ShortcutSchema, type Shortcut } from '../core/types.js';
import { readLastShellCommand } from '../lib/shell-history.js';
import { detectSystemCommandConflict } from '../lib/system-commands.js';

type ShortcutType = 'alias' | 'function';

interface AddOptions {
  name?: string;
  last?: boolean;
}

interface AddFormResult {
  name: string;
  type: ShortcutType;
  command: string;
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
  p.intro(chalk.bgCyan.black(options.last ? ' halias · 직전 명령 저장 ' : ' halias · 새 단축키 추가 '));

  const store = await readStore();
  const existingNames = new Set(store.shortcuts.map((s) => s.name));

  if (options.last) {
    const lastCommand = await readLastShellCommand();
    if (!lastCommand) {
      p.cancel('직전에 실행한 명령을 찾지 못했습니다. 셸 history 설정을 확인해주세요.');
      return;
    }

    await runAddFromLastCommand(options.name, lastCommand, existingNames);
    return;
  }

  const result = (await p.group(
    {
      name: () =>
        p.text({
          message: '단축키 이름은? (예: gs, mkcd)',
          placeholder: 'gs',
          validate: (value) => validateShortcutName(value, existingNames),
        }),

      type: () =>
        p.select({
          message: '어떤 종류인가요?',
          options: [
            {
              value: 'alias',
              label: 'alias',
              hint: '단순 명령어 치환 (예: gs → git status)',
            },
            {
              value: 'function',
              label: 'function',
              hint: '인자 가공 가능 ($1, $2 사용)',
            },
          ] as const,
          initialValue: 'alias',
        }),

      command: ({ results }) => {
        return p.text({
          message:
            results.type === 'alias'
              ? '실행할 명령어는? (예: git status)'
              : '함수 본문은? ($1, $2 등 인자 사용 가능)',
          placeholder:
            results.type === 'alias' ? 'git status' : 'mkdir -p "$1" && cd "$1"',
          validate: (v) => (v ? undefined : '명령어를 입력해주세요'),
        });
      },

      description: () =>
        p.text({
          message: '설명 (선택)',
          placeholder: '엔터로 건너뛰기',
        }),

      tags: () =>
        p.text({
          message: '태그 (쉼표로 구분, 선택)',
          placeholder: 'git, daily',
        }),
    },
    {
      onCancel: () => {
        p.cancel('취소되었습니다.');
        process.exit(0);
      },
    },
  )) as AddFormResult;

  const now = new Date().toISOString();
  const shortcut: Shortcut = {
    name: result.name,
    command: result.command,
    type: result.type,
    description: result.description || undefined,
    tags: (result.tags ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    source: 'personal',
    createdAt: now,
    updatedAt: now,
  };

  await confirmAndSaveShortcut(shortcut);
}

async function runAddFromLastCommand(
  name: string | undefined,
  command: string,
  existingNames: Set<string>,
): Promise<void> {
  p.note(command, '직전에 실행한 명령');

  let shortcutName = name;
  if (shortcutName) {
    const nameError = validateShortcutName(shortcutName, existingNames);
    if (nameError) {
      throw new Error(nameError);
    }
  } else {
    const promptedName = await p.text({
      message: '이 명령을 어떤 이름으로 저장할까요?',
      placeholder: 'dlog',
      validate: (value) => validateShortcutName(value, existingNames),
    });

    if (p.isCancel(promptedName)) {
      p.cancel('취소되었습니다.');
      return;
    }

    shortcutName = promptedName;
  }

  const description = await p.text({
    message: '설명 (선택)',
    placeholder: '엔터로 건너뛰기',
  });

  if (p.isCancel(description)) {
    p.cancel('취소되었습니다.');
    return;
  }

  const tags = await p.text({
    message: '태그 (쉼표로 구분, 선택)',
    placeholder: 'docker, logs',
  });

  if (p.isCancel(tags)) {
    p.cancel('취소되었습니다.');
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
      .map((t) => t.trim())
      .filter(Boolean),
    source: 'personal',
    createdAt: now,
    updatedAt: now,
  };

  await confirmAndSaveShortcut(shortcut);
}

function validateShortcutName(value: string | undefined, existingNames: Set<string>): string | undefined {
  if (!value) return '이름을 입력해주세요';
  if (existingNames.has(value)) return `이미 존재합니다: ${value}`;
  const parsed = ShortcutSchema.shape.name.safeParse(value);
  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? '잘못된 형식';
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

  p.note(preview, '셸에 등록될 함수');

  // 시스템 명령어와 충돌하는지 — 진행은 가능하되 명시적 경고
  const systemConflict = detectSystemCommandConflict(shortcut.name);
  if (systemConflict.conflict) {
    p.note(
      chalk.yellow('⚠ ') + (systemConflict.reason ?? '') +
        '\n\n' +
        chalk.dim('정말 의도한 것이라면 진행해도 됩니다 (예: 시스템 git을 감싼 wrapper 등).'),
      '시스템 명령어 충돌',
    );

    const proceedAnyway = await p.confirm({
      message: '그래도 등록할까요?',
      initialValue: false,
    });

    if (p.isCancel(proceedAnyway) || !proceedAnyway) {
      p.cancel('취소되었습니다.');
      return;
    }
  }

  const confirm = await p.confirm({
    message: '저장할까요?',
    initialValue: true,
  });

  if (p.isCancel(confirm) || !confirm) {
    p.cancel('취소되었습니다.');
    return;
  }

  const spinner = p.spinner();
  spinner.start('저장 중');
  await addShortcut(shortcut);
  const updated = await readStore();
  await generateAliasesFile(updated);
  spinner.stop('저장 완료');

  // halias install 후에는 hareload가 셸에 등록되어 있으므로
  // 사용자는 그것 한 단어만 기억하면 됨.
  p.outro(
    chalk.green(`✓ ${shortcut.name} 추가됨`) +
      '\n\n  ' +
      chalk.dim('지금 바로 사용하려면:  ') +
      chalk.cyan('hareload') +
      '\n  ' +
      chalk.dim('또는 새 터미널을 열면 자동 적용됩니다.'),
  );
}
