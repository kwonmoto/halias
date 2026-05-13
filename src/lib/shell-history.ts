import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const HALIAS_COMMAND_RE = /^(?:ha|halias)(?:\s+|$)/;

export interface ShellHistoryDiagnostics {
  files: {
    path: string;
    readable: boolean;
    commandCount: number;
    error?: string;
  }[];
  commands: string[];
}

function expandHome(filePath: string): string {
  if (filePath === '~') return os.homedir();
  if (filePath.startsWith('~/')) return path.join(os.homedir(), filePath.slice(2));
  return filePath;
}

function parseZshHistoryLine(line: string): string | undefined {
  const extended = line.match(/^: \d+:\d+;(.*)$/);
  if (extended) return extended[1]?.trim();
  return line.trim();
}

function parseBashHistoryLines(lines: string[]): string[] {
  const commands: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || /^#\d+$/.test(trimmed)) continue;
    commands.push(trimmed);
  }

  return commands;
}

function defaultHistoryFiles(): string[] {
  const files: string[] = [];

  if (process.env.HISTFILE) {
    files.push(expandHome(process.env.HISTFILE));
  }

  const shell = process.env.SHELL ?? '';
  if (shell.includes('zsh')) {
    files.push(path.join(os.homedir(), '.zsh_history'));
    files.push(path.join(os.homedir(), '.zhistory'));
  } else if (shell.includes('bash')) {
    files.push(path.join(os.homedir(), '.bash_history'));
  } else {
    files.push(path.join(os.homedir(), '.zsh_history'));
    files.push(path.join(os.homedir(), '.bash_history'));
  }

  return [...new Set(files)];
}

async function readCommandsFromHistoryFile(filePath: string): Promise<string[]> {
  const raw = await fs.readFile(filePath, 'utf-8');
  const lines = raw.split(/\r?\n/).filter(Boolean);

  if (filePath.includes('zsh') || filePath.includes('zhistory')) {
    return lines.map(parseZshHistoryLine).filter((command): command is string => Boolean(command));
  }

  return parseBashHistoryLines(lines);
}

export async function readLastShellCommand(): Promise<string | undefined> {
  const commands = await readShellHistoryCommands();

  for (let i = commands.length - 1; i >= 0; i -= 1) {
    const command = commands[i];
    if (!command || HALIAS_COMMAND_RE.test(command)) continue;
    return command;
  }

  return undefined;
}

export async function readShellHistoryCommands(limit = 500): Promise<string[]> {
  const diagnostics = await inspectShellHistory(limit);
  return diagnostics.commands;
}

export async function inspectShellHistory(limit = 500): Promise<ShellHistoryDiagnostics> {
  const files: ShellHistoryDiagnostics['files'] = [];
  const allCommands: string[] = [];

  for (const filePath of defaultHistoryFiles()) {
    try {
      const commands = await readCommandsFromHistoryFile(filePath);
      files.push({
        path: filePath,
        readable: true,
        commandCount: commands.length,
      });
      allCommands.push(...commands);
    } catch (err) {
      files.push({
        path: filePath,
        readable: false,
        commandCount: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const dedupedConsecutive = allCommands.filter((command, index) => command !== allCommands[index - 1]);
  return {
    files,
    commands: dedupedConsecutive.slice(-limit),
  };
}
