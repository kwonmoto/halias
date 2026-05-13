import * as p from '@clack/prompts';
import chalk from 'chalk';
import { runAddFromCommand } from './add.js';
import { readStore } from '../core/store.js';
import { readShellHistoryCommands } from '../lib/shell-history.js';
import { t } from '../lib/i18n.js';

interface SuggestOptions {
  top?: string;
  min?: string;
  save?: boolean;
}

interface Suggestion {
  command: string;
  count: number;
}

const IGNORED_COMMAND_RE = /^(?:cd|pwd|ls|ll|la|clear|exit|history|ha|halias)(?:\s|$)/;
const SETUP_NOISE_RE = [
  /^source\s+.*\/shellIntegration-[^/]*\.(?:zsh|bash|sh)$/,
  /^source\s+.*\/\.venv\/bin\/activate$/,
  /^source\s+.*\/venv\/bin\/activate$/,
  /^eval\s+["']?\$\(/,
  /^export\s+[A-Z_][A-Z0-9_]*=/,
  /^unset\s+[A-Z_][A-Z0-9_]*(?:\s|$)/,
];

export async function runSuggest(options: SuggestOptions = {}): Promise<void> {
  const topN = parsePositiveInt(options.top, 10);
  const minCount = parsePositiveInt(options.min, 3);

  const [store, historyCommands] = await Promise.all([
    readStore(),
    readShellHistoryCommands(1_000),
  ]);

  const existingCommands = new Set(store.shortcuts.map((shortcut) => normalizeCommand(shortcut.command)));
  const suggestions = collectSuggestions(historyCommands, existingCommands, minCount).slice(0, topN);

  if (options.save) {
    await selectAndSaveSuggestion(suggestions, minCount);
    return;
  }

  console.log();

  if (suggestions.length === 0) {
    console.log(chalk.dim(`  ${t('suggest.noSuggestions')}`));
    console.log(chalk.dim(`  ${t('suggest.noSuggestionsHint')}`) + chalk.cyan('ha suggest') + chalk.dim(t('suggest.noSuggestionsHint2')));
    console.log();
    return;
  }

  const maxCount = Math.max(...suggestions.map((suggestion) => suggestion.count));
  const maxCountWidth = maxCount.toString().length;

  console.log(chalk.bold(`  ${t('suggest.header')}`));
  console.log(chalk.dim(`  ${t('suggest.subHeader', { min: minCount })}`));
  console.log();

  for (const [index, suggestion] of suggestions.entries()) {
    const rank = chalk.dim(`${(index + 1).toString().padStart(2)}.`);
    const count = chalk.yellow(`${suggestion.count.toString().padStart(maxCountWidth)}회`);
    console.log(`  ${rank}  ${count}  ${suggestion.command}`);
  }

  console.log();
  console.log(chalk.dim(`  ${t('suggest.saveHint')}`) + chalk.cyan('ha suggest --save'));
  console.log();
}

async function selectAndSaveSuggestion(suggestions: Suggestion[], minCount: number): Promise<void> {
  console.clear();
  p.intro(chalk.bgCyan.black(t('suggest.intro')));

  if (suggestions.length === 0) {
    p.cancel(t('suggest.noSuggestionsForSave', { min: minCount }));
    return;
  }

  const selected = await p.select({
    message: t('suggest.selectPrompt'),
    options: suggestions.map((suggestion) => ({
      value: suggestion.command,
      label: suggestion.command,
      hint: `${suggestion.count}회`,
    })),
  });

  if (p.isCancel(selected)) {
    p.cancel(t('suggest.cancelled'));
    return;
  }

  await runAddFromCommand(undefined, String(selected), t('add.selectedCommandNote'));
}

function collectSuggestions(
  historyCommands: string[],
  existingCommands: Set<string>,
  minCount: number,
): Suggestion[] {
  const counts = new Map<string, number>();

  for (const command of historyCommands) {
    const normalized = normalizeCommand(command);
    if (!isSuggestableCommand(normalized, existingCommands)) continue;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count >= minCount)
    .map(([command, count]) => ({ command, count }))
    .sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count;
      return a.command.localeCompare(b.command);
    });
}

function isSuggestableCommand(command: string, existingCommands: Set<string>): boolean {
  if (command.length < 8) return false;
  if (IGNORED_COMMAND_RE.test(command)) return false;
  if (SETUP_NOISE_RE.some((pattern) => pattern.test(command))) return false;
  if (existingCommands.has(command)) return false;
  return true;
}

function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, ' ');
}

function parsePositiveInt(input: string | undefined, fallback: number): number {
  if (!input) return fallback;
  const parsed = Number.parseInt(input, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}
