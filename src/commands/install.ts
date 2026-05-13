import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import chalk from 'chalk';
import * as p from '@clack/prompts';
import { ALIASES_OUTPUT } from '../lib/paths.js';
import { generateAliasesFile } from '../core/generator.js';
import { readStore } from '../core/store.js';
import { getConfiguredLang, saveConfiguredLang } from '../core/config.js';
import { completionSourceLine, type Shell } from './completion.js';
import { t } from '../lib/i18n.js';

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
  p.intro(chalk.bgCyan.black(t('install.intro')));

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
    p.outro(chalk.dim(t('install.alreadyInstalled', { file: rcFile })));
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
    message: t('install.confirmAdd', { file: rcFile }) + chalk.dim(block.trim()),
    initialValue: true,
  });

  if (p.isCancel(confirm) || !confirm) {
    p.cancel(t('install.cancelled'));
    return;
  }

  await fs.appendFile(rcFile, block, 'utf-8');
  p.log.success(t('install.done'));

  // completion 설정
  const rcContentAfter = await fs.readFile(rcFile, 'utf-8');
  if (!rcContentAfter.includes(HALIAS_COMPLETION_MARKER)) {
    const shell = rcFile.includes('zsh') ? 'zsh' : 'bash';
    const completionConfirm = await p.confirm({
      message: t('install.completionConfirm', { hint: `ha <tab>` }),
      initialValue: true,
    });

    if (!p.isCancel(completionConfirm) && completionConfirm) {
      const completionBlock = `\n${HALIAS_COMPLETION_MARKER}\n${completionSourceLine(shell as Shell)}\n`;
      await fs.appendFile(rcFile, completionBlock, 'utf-8');
      p.log.success(t('install.completionDone'));
    }
  }

  // 언어 설정 (아직 설정 안 된 경우만)
  if (!getConfiguredLang()) {
    const langConfirm = await p.select({
      message: t('install.langPrompt'),
      options: [
        { value: 'en', label: 'English', hint: 'default' },
        { value: 'ko', label: '한국어 (Korean)' },
      ],
      initialValue: 'en',
    });

    if (!p.isCancel(langConfirm) && langConfirm !== 'en') {
      saveConfiguredLang(langConfirm as string);
      p.log.success(t('install.langSaved', { lang: chalk.cyan(langConfirm as string) }));
    }
  }

  p.outro(chalk.dim(t('install.outroHint', { file: rcFile })));
}
