import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import chalk from 'chalk';
import * as p from '@clack/prompts';
import { ALIASES_OUTPUT } from '../lib/paths.js';
import { generateAliasesFile } from '../core/generator.js';
import { readStore } from '../core/store.js';
import { completionSourceLine, type Shell } from './completion.js';

const HALIAS_MARKER = '# >>> halias shortcuts >>>';
const HALIAS_END_MARKER = '# <<< halias shortcuts <<<';
const HALIAS_COMPLETION_MARKER = '# halias completion';

function detectRcFile(): string {
  const shell = process.env.SHELL ?? '';
  const home = os.homedir();
  if (shell.includes('zsh')) return path.join(home, '.zshrc');
  if (shell.includes('bash')) {
    // macOS는 .bash_profile, Linux는 .bashrc
    return path.join(home, process.platform === 'darwin' ? '.bash_profile' : '.bashrc');
  }
  return path.join(home, '.zshrc'); // fallback
}

export async function runInstall(): Promise<void> {
  const rcFile = detectRcFile();
  p.intro(chalk.bgCyan.black(' halias · 셸 통합 '));

  // 우선 generated/aliases.sh 가 존재하도록 한 번 생성
  const store = await readStore();
  await generateAliasesFile(store);

  let rcContent = '';
  try {
    rcContent = await fs.readFile(rcFile, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  if (rcContent.includes(HALIAS_MARKER)) {
    p.outro(chalk.dim(`이미 ${rcFile} 에 설치되어 있습니다.`));
    return;
  }

  const block = [
    '',
    HALIAS_MARKER,
    `[ -f "${ALIASES_OUTPUT}" ] && source "${ALIASES_OUTPUT}"`,
    HALIAS_END_MARKER,
    '',
  ].join('\n');

  const confirm = await p.confirm({
    message: `${rcFile} 에 다음을 추가합니다. 진행할까요?\n${chalk.dim(block.trim())}`,
    initialValue: true,
  });

  if (p.isCancel(confirm) || !confirm) {
    p.cancel('취소되었습니다.');
    return;
  }

  await fs.appendFile(rcFile, block, 'utf-8');
  p.log.success('셸 통합 설치 완료.');

  // completion 설정
  const rcContentAfter = await fs.readFile(rcFile, 'utf-8');
  if (!rcContentAfter.includes(HALIAS_COMPLETION_MARKER)) {
    const shell = rcFile.includes('zsh') ? 'zsh' : 'bash';
    const completionConfirm = await p.confirm({
      message: `셸 자동완성도 설정할까요? (${chalk.cyan(`ha <tab>`)} 으로 명령어·단축키 완성)`,
      initialValue: true,
    });

    if (!p.isCancel(completionConfirm) && completionConfirm) {
      const completionBlock = `\n${HALIAS_COMPLETION_MARKER}\n${completionSourceLine(shell as Shell)}\n`;
      await fs.appendFile(rcFile, completionBlock, 'utf-8');
      p.log.success('자동완성 설정 완료.');
    }
  }

  p.outro(chalk.dim(`새 터미널을 열거나 source ${rcFile} 로 적용하세요.`));
}
