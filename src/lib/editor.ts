import * as p from '@clack/prompts';
import chalk from 'chalk';
import { spawnSync, execSync } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getConfiguredEditor, saveConfiguredEditor } from '../core/config.js';
import { t } from './i18n.js';

/**
 * function 타입 본문을 에디터로 편집.
 *
 * 에디터 우선순위:
 *   1. $VISUAL / $EDITOR 환경변수
 *   2. ~/.halias/config.json 에 저장된 선택
 *   3. 시스템에 설치된 에디터 자동 감지 → 선택 프롬프트 (결과 저장)
 *   4. 아무것도 없으면 인라인 폴백
 *
 * 취소(빈 파일 저장) 시 null 반환.
 */
export async function editFunctionBody(
  current: string,
  shortcutName: string,
): Promise<string | null> {
  const envEditor = process.env['VISUAL'] ?? process.env['EDITOR'];
  const configEditor = getConfiguredEditor();
  const editor = envEditor ?? configEditor ?? (await pickEditor());

  if (!editor) {
    p.log.warn(t('editor.noEditorFallback'));
    const result = await p.text({
      message: t('editor.inlineBodyPrompt'),
      initialValue: current,
      validate: (v) => (v ? undefined : t('editor.inlineBodyRequired')),
    });
    if (p.isCancel(result)) return null;
    return result as string;
  }

  if (!envEditor && !configEditor) {
    saveConfiguredEditor(editor);
    p.log.success(t('editor.savedEditor', { editor: chalk.cyan(editor) }));
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'halias-'));
  const tmpFile = join(tmpDir, `${shortcutName}.sh`);

  const header = `# halias: function body for '${shortcutName}'\n# 저장 후 에디터를 닫으면 반영됩니다. 빈 파일로 저장하면 취소됩니다.\n\n`;
  writeFileSync(tmpFile, header + current, 'utf8');

  const [bin, ...extraArgs] = resolveEditorArgs(editor);
  p.log.info(`${chalk.cyan(bin)} ${t('editor.opening')}`);

  const result = spawnSync(bin, [...extraArgs, tmpFile], { stdio: 'inherit' });

  if (result.error) {
    p.log.error(t('editor.openFailed', { message: result.error.message }));
    rmSync(tmpDir, { recursive: true, force: true });
    return null;
  }

  const raw = readFileSync(tmpFile, 'utf8');
  rmSync(tmpDir, { recursive: true, force: true });

  const body = raw
    .split('\n')
    .filter((line) => !line.startsWith('#'))
    .join('\n')
    .trim();

  if (!body) {
    p.log.warn(t('editor.emptySaved'));
    return null;
  }

  return body;
}

/** 시스템에 설치된 에디터 목록을 감지해 선택하게 함. 취소 또는 비TTY 시 undefined. */
async function pickEditor(): Promise<string | undefined> {
  if (!process.stdin.isTTY) return undefined;

  const candidates = [
    { bin: 'code', label: 'VSCode' },
    { bin: 'zed',  label: 'Zed' },
    { bin: 'subl', label: 'Sublime Text' },
    { bin: 'nvim', label: 'Neovim' },
    { bin: 'vim',  label: 'Vim' },
    { bin: 'nano', label: 'nano' },
  ];

  const available = candidates.filter(({ bin }) => {
    try {
      execSync(`command -v ${bin}`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  });

  if (available.length === 0) return undefined;

  const options = [
    ...available.map(({ bin, label }) => ({ value: bin, label, hint: bin })),
    { value: '__custom__', label: t('editor.customInput'), hint: '' },
  ];

  const selected = await p.select({
    message: t('editor.selectPrompt'),
    options,
  });

  if (p.isCancel(selected)) return undefined;

  if (selected === '__custom__') {
    const custom = await p.text({
      message: t('editor.customInputPrompt'),
      placeholder: t('editor.customInputPlaceholder'),
      validate: (v) => (v ? undefined : t('editor.customInputRequired')),
    });
    if (p.isCancel(custom)) return undefined;
    return custom as string;
  }

  return selected as string;
}

/**
 * $EDITOR 문자열을 [bin, ...args] 로 파싱하고,
 * GUI 에디터(code, subl, zed 등)에는 --wait 플래그를 자동 주입.
 */
export function resolveEditorArgs(editor: string): string[] {
  const parts = editor.trim().split(/\s+/);
  const bin = parts[0] ?? editor;
  const userArgs = parts.slice(1);

  const hasWait = userArgs.some((a) => a === '--wait' || a === '-w' || a === '--hold');
  if (hasWait) return [bin, ...userArgs];

  const baseBin = bin.split('/').at(-1) ?? bin;
  const guiEditors: Record<string, string> = {
    code: '--wait',
    'code-insiders': '--wait',
    subl: '--wait',
    atom: '--wait',
    mate: '--wait',
    zed: '--wait',
    nova: '--wait',
  };

  const waitFlag = guiEditors[baseBin];
  return waitFlag ? [bin, waitFlag, ...userArgs] : [bin, ...userArgs];
}
