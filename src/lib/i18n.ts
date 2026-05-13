import { ko } from '../locales/ko.js';
import { en } from '../locales/en.js';
import { getConfiguredLang } from '../core/config.js';

let messages: typeof ko = ko;

/**
 * Initialise the locale.
 * Priority: HALIAS_LANG env var → config.json lang field → 'ko' default.
 * Call once at startup (in cli.ts before parseAsync).
 */
export function initLocale(): void {
  const lang = process.env['HALIAS_LANG'] ?? getConfiguredLang() ?? 'ko';
  messages = lang === 'en' ? en : ko;
}

/**
 * Look up a message by dot-notation key and interpolate optional variables.
 *
 * Example:
 *   t('add.validateDuplicate', { name: 'gs' })
 *   → "이미 존재합니다: gs"  (ko)
 *   → "Already exists: gs"  (en)
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const parts = key.split('.');
  let current: unknown = messages;

  for (const part of parts) {
    if (typeof current !== 'object' || current === null) return key;
    current = (current as Record<string, unknown>)[part];
  }

  if (typeof current !== 'string') return key;

  if (!vars) return current;

  return Object.entries(vars).reduce<string>(
    (msg, [k, v]) => msg.replaceAll(`{${k}}`, String(v)),
    current,
  );
}
