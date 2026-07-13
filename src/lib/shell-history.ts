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
  // 멀티라인 명령은 내부 개행을 포함하므로 [\s\S] 로 개행까지 캡처
  const extended = line.match(/^: \d+:\d+;([\s\S]*)$/);
  if (extended) return extended[1]?.trim();
  return line.trim();
}

/**
 * zsh 히스토리의 멀티라인 명령 복원.
 *
 * zsh 는 여러 줄 명령을 각 줄 끝의 백슬래시(escaped newline)로 이어서 저장한다.
 * 물리적 줄 단위로 파싱하면 마지막 조각만 남으므로, 이어지는 줄을 다시 합친다.
 * (줄 끝 백슬래시가 홀수 개면 다음 줄로 이어짐 — 짝수는 리터럴 백슬래시)
 */
function joinZshContinuations(lines: string[]): string[] {
  const out: string[] = [];
  let acc: string | null = null;

  for (const line of lines) {
    const combined: string = acc === null ? line : `${acc}\n${line}`;
    const trailingBackslashes = line.match(/\\*$/)?.[0].length ?? 0;

    if (trailingBackslashes % 2 === 1) {
      // 이어짐 — 마커 역할의 마지막 백슬래시 제거하고 누적
      acc = combined.replace(/\\$/, '');
    } else {
      out.push(combined);
      acc = null;
    }
  }

  if (acc !== null) out.push(acc);
  return out;
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

  if (filePath.includes('zsh') || filePath.includes('zhistory')) {
    // 멀티라인 명령을 먼저 합친 뒤 파싱 (filter 는 합친 후에)
    const joined = joinZshContinuations(raw.split(/\r?\n/));
    return joined.map(parseZshHistoryLine).filter((command): command is string => Boolean(command));
  }

  return parseBashHistoryLines(raw.split(/\r?\n/).filter(Boolean));
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
