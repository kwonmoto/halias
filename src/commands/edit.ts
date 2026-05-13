import * as p from '@clack/prompts';
import chalk from 'chalk';
import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readStore, writeStore } from '../core/store.js';
import { generateAliasesFile } from '../core/generator.js';
import { ShortcutSchema, type Shortcut } from '../core/types.js';

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

  // 2. 폼 — 이름/종류/설명/태그 (command는 별도 처리)
  console.clear();
  p.intro(
    chalk.bgCyan.black(' halias · 단축키 편집 ') +
      chalk.dim(`  ${target.name}`),
  );

  const otherNames = new Set(
    store.shortcuts.filter((s) => s.name !== target!.name).map((s) => s.name),
  );

  const meta = (await p.group(
    {
      name: () =>
        p.text({
          message: '이름',
          initialValue: target!.name,
          validate: (value) => {
            if (!value) return '이름을 입력해주세요';
            if (otherNames.has(value)) return `이미 존재하는 다른 단축키: ${value}`;
            const parsed = ShortcutSchema.shape.name.safeParse(value);
            if (!parsed.success) return parsed.error.issues[0]?.message ?? '잘못된 형식';
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
  )) as MetaFormResult;

  // 3. command — alias는 인라인 입력, function은 $EDITOR
  const newCommand = meta.type === 'function'
    ? await editInEditor(target.command, target.name)
    : await editInline(target.command, meta.type);

  if (newCommand === null) {
    p.cancel('취소되었습니다.');
    return;
  }

  // 4. 변경 사항 요약
  const changes = diffShortcut(target, meta, newCommand);
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

  // 5. 저장
  const updated: Shortcut = {
    name: meta.name,
    type: meta.type,
    command: newCommand,
    description: meta.description || undefined,
    tags: meta.tags
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
 * alias 타입: Clack text 프롬프트로 한 줄 편집.
 * 취소 시 null 반환.
 */
async function editInline(current: string, _type: ShortcutType): Promise<string | null> {
  const result = await p.text({
    message: '실행할 명령어',
    initialValue: current,
    validate: (v) => (v ? undefined : '명령어를 입력해주세요'),
  });
  if (p.isCancel(result)) return null;
  return result as string;
}

/**
 * function 타입: $EDITOR(또는 $VISUAL)로 임시 파일 열어 편집.
 * 에디터 미설정 시 Clack text 폴백.
 * 취소(빈 파일 저장) 시 null 반환.
 */
async function editInEditor(current: string, shortcutName: string): Promise<string | null> {
  const editor = process.env['VISUAL'] ?? process.env['EDITOR'];

  if (!editor) {
    p.log.warn('$EDITOR 환경변수가 설정되지 않아 인라인 편집으로 전환합니다.');
    const result = await p.text({
      message: '함수 본문 ($1, $2 사용 가능)',
      initialValue: current,
      validate: (v) => (v ? undefined : '명령어를 입력해주세요'),
    });
    if (p.isCancel(result)) return null;
    return result as string;
  }

  // 임시 파일 생성
  const tmpDir = mkdtempSync(join(tmpdir(), 'halias-'));
  const tmpFile = join(tmpDir, `${shortcutName}.sh`);

  const header = `# halias: function body for '${shortcutName}'\n# 저장 후 에디터를 닫으면 반영됩니다. 빈 파일로 저장하면 취소됩니다.\n\n`;
  writeFileSync(tmpFile, header + current, 'utf8');

  const [bin, ...extraArgs] = resolveEditorArgs(editor);
  p.log.info(`${chalk.cyan(bin)} 로 열립니다…`);

  const result = spawnSync(bin, [...extraArgs, tmpFile], { stdio: 'inherit' });

  if (result.error) {
    p.log.error(`에디터 실행 실패: ${result.error.message}`);
    rmSync(tmpDir, { recursive: true, force: true });
    return null;
  }

  const raw = readFileSync(tmpFile, 'utf8');
  rmSync(tmpDir, { recursive: true, force: true });

  // 주석 헤더 제거 후 정리
  const body = raw
    .split('\n')
    .filter((line) => !line.startsWith('#'))
    .join('\n')
    .trim();

  if (!body) {
    p.log.warn('빈 내용으로 저장되었습니다. 취소합니다.');
    return null;
  }

  return body;
}

/**
 * $EDITOR 문자열을 [bin, ...args] 로 파싱하고,
 * GUI 에디터(code, subl, zed 등)에는 --wait 플래그를 자동 주입.
 * 사용자가 이미 --wait 을 넣었으면 중복 추가하지 않음.
 */
function resolveEditorArgs(editor: string): string[] {
  // 공백 분리 (예: "code --wait" → ["code", "--wait"])
  const parts = editor.trim().split(/\s+/);
  const bin = parts[0] ?? editor;
  const userArgs = parts.slice(1);

  // --wait 계열 플래그가 이미 있으면 그대로 사용
  const hasWait = userArgs.some((a) => a === '--wait' || a === '-w' || a === '--hold');
  if (hasWait) return [bin, ...userArgs];

  // GUI 에디터 바이너리명 기준으로 --wait 자동 주입
  const baseBin = bin.split('/').at(-1) ?? bin; // 경로 포함일 경우 basename
  const guiEditors: Record<string, string> = {
    code: '--wait',       // VSCode
    'code-insiders': '--wait',
    subl: '--wait',       // Sublime Text
    atom: '--wait',       // Atom
    mate: '--wait',       // TextMate
    zed: '--wait',        // Zed
    nova: '--wait',       // Nova
  };

  const waitFlag = guiEditors[baseBin];
  return waitFlag ? [bin, waitFlag, ...userArgs] : [bin, ...userArgs];
}

/**
 * 변경 사항을 사람이 읽기 좋은 형태로 요약.
 */
function diffShortcut(before: Shortcut, after: MetaFormResult, newCommand: string): string[] {
  const lines: string[] = [];
  const dim = chalk.dim;

  if (before.name !== after.name) {
    lines.push(`${dim('이름:')}  ${before.name} → ${chalk.cyan(after.name)}`);
  }
  if (before.type !== after.type) {
    lines.push(`${dim('종류:')}  ${before.type} → ${chalk.cyan(after.type)}`);
  }
  if (before.command !== newCommand) {
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
