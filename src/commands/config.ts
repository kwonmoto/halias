import chalk from 'chalk';
import * as p from '@clack/prompts';
import { getConfiguredLang, saveConfiguredLang } from '../core/config.js';
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
