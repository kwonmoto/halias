import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import chalk from 'chalk';
import * as p from '@clack/prompts';
import { HALIAS_HOME } from '../lib/paths.js';
import { t } from '../lib/i18n.js';

const HALIAS_MARKER = '# >>> halias shortcuts >>>';
const HALIAS_END_MARKER = '# <<< halias shortcuts <<<';
const HALIAS_COMPLETION_MARKER = '# halias completion';

/**
 * rc 파일 내용에서 halias 마커 블록과 completion 라인을 제거.
 * install.ts 가 넣는 두 블록과 대칭.
 */
export function stripHaliasBlocks(content: string): string {
  const lines = content.split('\n');
  const out: string[] = [];
  let insideBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();

    if (trimmed === HALIAS_MARKER) { insideBlock = true; continue; }
    if (trimmed === HALIAS_END_MARKER) { insideBlock = false; continue; }
    if (insideBlock) continue;

    if (trimmed === HALIAS_COMPLETION_MARKER) {
      // 바로 다음 줄이 completion source 라인이면 함께 제거
      if ((lines[i + 1] ?? '').includes('ha completion')) i++;
      continue;
    }

    out.push(line);
  }

  return out.join('\n');
}

/**
 * ha uninstall — ~/.zshrc / .bashrc 등에서 halias 셸 통합을 제거.
 *
 * install 의 대칭 명령. 마커 블록으로 식별해 정확히 그 부분만 지운다.
 * 사용자 데이터(~/.halias)는 물어본 뒤에만 삭제.
 */
export async function runUninstall(): Promise<void> {
  if (!process.stdin.isTTY) {
    console.log(chalk.yellow(`  ${t('uninstall.notTTY')}`));
    return;
  }

  p.intro(chalk.bgCyan.black(t('uninstall.intro')));

  const home = os.homedir();
  const candidates = [
    path.join(home, '.zshrc'),
    path.join(home, '.bashrc'),
    path.join(home, '.bash_profile'),
  ];

  const affected: string[] = [];
  for (const file of candidates) {
    let content: string;
    try {
      content = await fs.readFile(file, 'utf-8');
    } catch {
      continue;
    }
    if (content.includes(HALIAS_MARKER) || content.includes(HALIAS_COMPLETION_MARKER)) {
      affected.push(file);
    }
  }

  if (affected.length === 0) {
    p.outro(chalk.dim(t('uninstall.notInstalled')));
    return;
  }

  const confirmed = await p.confirm({
    message: t('uninstall.confirm', {
      files: affected.map((f) => path.basename(f)).join(', '),
    }),
    initialValue: false,
  });

  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel(t('uninstall.cancelled'));
    return;
  }

  for (const file of affected) {
    const content = await fs.readFile(file, 'utf-8');
    await fs.writeFile(file, stripHaliasBlocks(content), 'utf-8');
    p.log.success(t('uninstall.removed', { file: path.basename(file) }));
  }

  // 사용자 데이터 삭제는 명시적 동의를 받은 경우에만
  const purge = await p.confirm({
    message: t('uninstall.purgeConfirm'),
    initialValue: false,
  });

  if (!p.isCancel(purge) && purge) {
    await fs.rm(HALIAS_HOME, { recursive: true, force: true });
    p.log.success(t('uninstall.purged'));
  } else {
    p.log.info(t('uninstall.dataKept'));
  }

  p.outro(chalk.dim(t('uninstall.outro')));
}
