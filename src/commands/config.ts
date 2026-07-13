import { execSync } from 'node:child_process';
import chalk from 'chalk';
import * as p from '@clack/prompts';
import {
  getConfiguredEditor,
  getConfiguredLang,
  saveConfiguredEditor,
  saveConfiguredLang,
} from '../core/config.js';
import { t } from '../lib/i18n.js';

const SUPPORTED_LANGS = ['en', 'ko'] as const;
type Lang = (typeof SUPPORTED_LANGS)[number];

/**
 * ha config lang [en|ko] — UI 언어 설정.
 *
 *   ha config lang ko   → 한국어로 변경
 *   ha config lang en   → 영어로 변경 (기본값)
 *   ha config lang      → 현재 설정 확인
 */
export async function runConfigLang(value?: string): Promise<void> {
  if (!value) {
    const current = getConfiguredLang() ?? 'en';
    console.log();
    console.log(`  ${chalk.dim('lang')}  ${chalk.cyan(current)}`);
    console.log(chalk.dim(`  ${t('config.langHint')}`));
    console.log();
    return;
  }

  if (!(SUPPORTED_LANGS as readonly string[]).includes(value)) {
    console.log(chalk.red(t('config.langInvalid', { value, langs: SUPPORTED_LANGS.join(' | ') })));
    return;
  }

  saveConfiguredLang(value as Lang);
  p.log.success(t('config.langSaved', { lang: chalk.cyan(value) }));
  console.log(chalk.dim(`  ${t('config.langRestart')}`));
}

/**
 * ha config editor [value] — 함수 본문 편집에 쓸 에디터 설정.
 *
 *   ha config editor          → 현재 설정 확인
 *   ha config editor code     → VSCode 로 변경
 *   ha config editor /usr/local/bin/hx  → 경로 직접 지정
 *
 * 저장/감지 로직은 core/config + lib/editor 에 이미 있고, 여기선 CLI 노출만.
 */
export async function runConfigEditor(value?: string): Promise<void> {
  if (!value) {
    const current = getConfiguredEditor();
    console.log();
    console.log(`  ${chalk.dim('editor')}  ${current ? chalk.cyan(current) : chalk.dim(t('config.editorNotSet'))}`);
    console.log(chalk.dim(`  ${t('config.editorHint')}`));
    console.log();
    return;
  }

  // 존재 여부는 경고만 — PATH 밖 경로나 아직 설치 전 에디터일 수 있으니 저장은 진행
  const binary = value.split(/\s+/)[0] ?? value;
  let found = false;
  try {
    execSync(`command -v ${JSON.stringify(binary)}`, { shell: '/bin/sh', stdio: 'pipe' });
    found = true;
  } catch {
    found = false;
  }

  saveConfiguredEditor(value);
  p.log.success(t('config.editorSaved', { editor: chalk.cyan(value) }));
  if (!found) {
    console.log(chalk.yellow(`  ${t('config.editorNotFoundWarn', { editor: binary })}`));
  }
}
