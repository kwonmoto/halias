import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { readLastShellCommand, readShellHistoryCommands } from '../src/lib/shell-history.js';

let histFile: string;

beforeEach(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'halias-hist-'));
  histFile = path.join(dir, '.zsh_history'); // 파일명에 'zsh' 포함 → zsh 파서 경로
  process.env.HISTFILE = histFile;
  process.env.SHELL = '/bin/zsh';
});

describe('zsh history parsing', () => {
  it('parses extended-format entries', async () => {
    await fs.writeFile(histFile, ': 1700000000:0;git status\n: 1700000001:0;ls\n');
    const commands = await readShellHistoryCommands();
    expect(commands).toEqual(['git status', 'ls']);
  });

  it('reconstructs multi-line commands (backslash continuation)', async () => {
    await fs.writeFile(
      histFile,
      [': 1700000000:0;docker run \\', '  --rm \\', '  alpine echo hi', ': 1700000001:0;ls'].join('\n') + '\n',
    );
    const commands = await readShellHistoryCommands();
    expect(commands).toHaveLength(2);
    expect(commands[0]).toContain('docker run');
    expect(commands[0]).toContain('alpine echo hi');
  });

  it('treats an even number of trailing backslashes as literal', async () => {
    await fs.writeFile(histFile, ': 1700000000:0;echo foo\\\\\n: 1700000001:0;ls\n');
    const commands = await readShellHistoryCommands();
    expect(commands).toHaveLength(2);
  });

  it('dedupes consecutive identical commands', async () => {
    await fs.writeFile(histFile, ': 1:0;ls\n: 2:0;ls\n: 3:0;pwd\n');
    const commands = await readShellHistoryCommands();
    expect(commands).toEqual(['ls', 'pwd']);
  });
});

describe('readLastShellCommand', () => {
  it('skips ha/halias invocations', async () => {
    await fs.writeFile(histFile, ': 1:0;git status\n: 2:0;ha add --last\n: 3:0;halias list\n');
    expect(await readLastShellCommand()).toBe('git status');
  });

  it('returns undefined when history is empty', async () => {
    await fs.writeFile(histFile, '');
    expect(await readLastShellCommand()).toBeUndefined();
  });
});
