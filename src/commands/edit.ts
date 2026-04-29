import * as p from '@clack/prompts';
import chalk from 'chalk';
import { readStore, writeStore } from '../core/store.js';
import { generateAliasesFile } from '../core/generator.js';
import { ShortcutSchema, type Shortcut } from '../core/types.js';

type ShortcutType = 'alias' | 'function';

interface EditFormResult {
  name: string;
  type: ShortcutType;
  command: string;
  description: string;
  tags: string;
}

/**
 * ha edit [name] — 기존 단축키 편집.
 *
 * - name 미지정 시 선택 화면
 * - 모든 필드의 기존 값을 폼 기본값으로 채움 (Clack의 initialValue/defaultValue)
 * - 이름 변경 시 다른 단축키와의 충돌 체크
 * - 저장 시 createdAt 유지, updatedAt 갱신
 */
export async function runEdit(name?: string): Promise<void> {
  const store = await readStore();

  if (store.shortcuts.length === 0) {
    console.log(
      chalk.dim('등록된 단축키가 없습니다. ') +
        chalk.cyan("'ha add'") +
        chalk.dim(' 로 시작하세요.'),
    );
    return;
  }

  // 1. 편집할 대상 결정
  let target: Shortcut | undefined;
  if (name) {
    target = store.shortcuts.find((s) => s.name === name);
    if (!target) {
      console.log(chalk.red(`단축키를 찾을 수 없습니다: ${name}`));
      return;
    }
  } else {
    const selected = await p.select({
      message: '편집할 단축키 선택',
      options: store.shortcuts.map((s) => ({
        value: s.name,
        label: s.name,
        hint: s.type === 'alias' ? s.command : '<function>',
      })),
    });
    if (p.isCancel(selected)) {
      p.cancel('취소되었습니다.');
      return;
    }
    target = store.shortcuts.find((s) => s.name === selected);
    if (!target) return;
  }

  // 2. 폼 — 기존 값을 기본값으로
  console.clear();
  p.intro(
    chalk.bgCyan.black(' halias · 단축키 편집 ') +
      chalk.dim(`  ${target.name}`),
  );

  // 다른 단축키들의 이름 (중복 체크용 — 자기 자신은 제외)
  const otherNames = new Set(
    store.shortcuts.filter((s) => s.name !== target!.name).map((s) => s.name),
  );

  const result = (await p.group(
    {
      name: () =>
        p.text({
          message: '이름',
          initialValue: target!.name,
          validate: (value) => {
            if (!value) return '이름을 입력해주세요';
            if (otherNames.has(value)) return `이미 존재하는 다른 단축키: ${value}`;
            const parsed = ShortcutSchema.shape.name.safeParse(value);
            if (!parsed.success) {
              return parsed.error.issues[0]?.message ?? '잘못된 형식';
            }
            return undefined;
          },
        }),

      type: () =>
        p.select({
          message: '종류',
          options: [
            { value: 'alias', label: 'alias', hint: '단순 명령어 치환' },
            { value: 'function', label: 'function', hint: '인자 가공 가능' },
          ] as const,
          initialValue: target!.type,
        }),

      command: ({ results }) =>
        p.text({
          message:
            results.type === 'alias'
              ? '실행할 명령어'
              : '함수 본문 ($1, $2 사용 가능)',
          initialValue: target!.command,
          validate: (v) => (v ? undefined : '명령어를 입력해주세요'),
        }),

      description: () =>
        p.text({
          message: '설명 (선택)',
          initialValue: target!.description ?? '',
          placeholder: '엔터로 건너뛰기',
        }),

      tags: () =>
        p.text({
          message: '태그 (쉼표 구분)',
          initialValue: target!.tags.join(', '),
          placeholder: 'git, daily',
        }),
    },
    {
      onCancel: () => {
        p.cancel('취소되었습니다.');
        process.exit(0);
      },
    },
  )) as EditFormResult;

  // 3. 변경 사항 요약 — 사용자에게 확인 받기 전에 무엇이 바뀌는지 명시
  const changes = diffShortcut(target, result);
  if (changes.length === 0) {
    p.outro(chalk.dim('변경된 내용이 없습니다.'));
    return;
  }

  p.note(changes.join('\n'), '변경 사항');

  const confirm = await p.confirm({
    message: '저장할까요?',
    initialValue: true,
  });

  if (p.isCancel(confirm) || !confirm) {
    p.cancel('취소되었습니다.');
    return;
  }

  // 4. 저장 — 기존 항목을 새 값으로 교체. createdAt은 유지.
  const updated: Shortcut = {
    name: result.name,
    type: result.type,
    command: result.command,
    description: result.description || undefined,
    tags: result.tags
      .split(',')
      .map((t) => t.trim())
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
    chalk.green(`✓ ${updated.name} 수정됨`) +
      '\n\n  ' +
      chalk.dim('현재 셸에 즉시 반영하려면: ') +
      chalk.cyan('hareload'),
  );
}

/**
 * 변경 사항을 사람이 읽기 좋은 형태로 요약.
 * 변경 없는 필드는 표시하지 않음.
 */
function diffShortcut(before: Shortcut, after: EditFormResult): string[] {
  const lines: string[] = [];
  const dim = chalk.dim;

  if (before.name !== after.name) {
    lines.push(`${dim('이름:')}  ${before.name} → ${chalk.cyan(after.name)}`);
  }
  if (before.type !== after.type) {
    lines.push(`${dim('종류:')}  ${before.type} → ${chalk.cyan(after.type)}`);
  }
  if (before.command !== after.command) {
    lines.push(`${dim('명령:')}  변경됨`);
  }
  const beforeDesc = before.description ?? '';
  if (beforeDesc !== after.description) {
    lines.push(`${dim('설명:')}  ${beforeDesc || '(없음)'} → ${after.description || '(없음)'}`);
  }
  const beforeTags = before.tags.join(', ');
  const afterTags = after.tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .join(', ');
  if (beforeTags !== afterTags) {
    lines.push(`${dim('태그:')}  ${beforeTags || '(없음)'} → ${afterTags || '(없음)'}`);
  }

  return lines;
}
