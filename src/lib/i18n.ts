import { ko } from '../locales/ko.js';
import { en } from '../locales/en.js';
import { getConfiguredLang } from '../core/config.js';

let messages: typeof ko = en;

/**
 * Initialise the locale.
 * Priority: config.json lang field → 'en' default.
 * Call once at startup (in cli.ts before parseAsync).
 */
export function initLocale(): void {
  const lang = getConfiguredLang() ?? 'en';
  messages = lang === 'ko' ? ko : en;
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
