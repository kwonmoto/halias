import chalk from 'chalk';
import { readStore } from '../core/store.js';
import { readShellHistoryCommands } from '../lib/shell-history.js';

interface SuggestOptions {
  top?: string;
  min?: string;
}

interface Suggestion {
  command: string;
  count: number;
}

const IGNORED_COMMAND_RE = /^(?:cd|pwd|ls|ll|la|clear|exit|history|ha|halias)(?:\s|$)/;

export async function runSuggest(options: SuggestOptions = {}): Promise<void> {
  const topN = parsePositiveInt(options.top, 10);
  const minCount = parsePositiveInt(options.min, 3);

  const [store, historyCommands] = await Promise.all([
    readStore(),
    readShellHistoryCommands(1_000),
  ]);

  const existingCommands = new Set(store.shortcuts.map((shortcut) => normalizeCommand(shortcut.command)));
  const suggestions = collectSuggestions(historyCommands, existingCommands, minCount).slice(0, topN);

  console.log();

  if (suggestions.length === 0) {
    console.log(chalk.dim('  아직 추천할 반복 명령이 없습니다.'));
    console.log(chalk.dim('  긴 명령을 몇 번 더 사용한 뒤 ') + chalk.cyan('ha suggest') + chalk.dim(' 를 다시 실행해보세요.'));
    console.log();
    return;
  }

  const maxCount = Math.max(...suggestions.map((suggestion) => suggestion.count));
  const maxCountWidth = maxCount.toString().length;

  console.log(chalk.bold('  단축키 후보'));
  console.log(chalk.dim(`  최근 셸 history에서 ${minCount}회 이상 반복된 명령입니다.`));
  console.log();

  for (const [index, suggestion] of suggestions.entries()) {
    const rank = chalk.dim(`${(index + 1).toString().padStart(2)}.`);
    const count = chalk.yellow(`${suggestion.count.toString().padStart(maxCountWidth)}회`);
    console.log(`  ${rank}  ${count}  ${suggestion.command}`);
  }

  console.log();
  console.log(chalk.dim('  저장하려면: ') + chalk.cyan('ha add --last <name>') + chalk.dim(' 또는 ') + chalk.cyan('ha add'));
  console.log();
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
