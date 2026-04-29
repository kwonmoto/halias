import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import chalk from 'chalk';
import * as p from '@clack/prompts';
import { ALIASES_OUTPUT } from '../lib/paths.js';
import { generateAliasesFile } from '../core/generator.js';
import { readStore } from '../core/store.js';

const HALIAS_MARKER = '# >>> halias shortcuts >>>';
const HALIAS_END_MARKER = '# <<< halias shortcuts <<<';

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
  p.outro(
    chalk.green('✓ 설치 완료. ') +
      chalk.dim(`새 터미널을 열거나 source ${rcFile} 로 적용하세요.`),
  );
}
