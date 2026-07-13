import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { beforeEach, describe, expect, it } from 'vitest';
import { generateAliasesFile } from '../src/core/generator.js';
import { HALIAS_HOME } from '../src/lib/paths.js';
import type { Shortcut, Store } from '../src/core/types.js';

function makeShortcut(name: string, command: string, extra: Partial<Shortcut> = {}): Shortcut {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    name,
    command,
    type: 'alias',
    tags: [],
    source: 'personal',
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}

async function generate(shortcuts: Shortcut[]): Promise<string> {
  const store: Store = { version: 1, shortcuts };
  const path = await generateAliasesFile(store);
  return fs.readFile(path, 'utf-8');
}

/** 생성된 aliases.sh 를 실제 bash 에서 source 하고 명령을 실행 */
function runInBash(aliasesPath: string, command: string): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync('bash', ['-c', `source '${aliasesPath}' && ${command}`], {
    encoding: 'utf-8',
  });
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

beforeEach(async () => {
  await fs.rm(HALIAS_HOME, { recursive: true, force: true });
});

describe('generateAliasesFile', () => {
  it('wraps every shortcut in an eval guard (isolation)', async () => {
    const content = await generate([makeShortcut('gs', 'git status')]);
    expect(content).toContain("eval '");
    expect(content).toContain('skipped broken shortcut');
  });

  it('forwards "$@" for simple alias commands', async () => {
    const content = await generate([makeShortcut('gs', 'git status')]);
    expect(content).toContain('git status "$@"');
  });

  it('omits "$@" when the command contains shell metacharacters', async () => {
    const content = await generate([makeShortcut('ll', 'ls -la | less')]);
    expect(content).toContain('ls -la | less');
    expect(content).not.toContain('less "$@"');
  });

  it('escapes single quotes in command bodies', async () => {
    const content = await generate([makeShortcut('say', `echo 'hello world'`)]);
    const path = `${HALIAS_HOME}/generated/aliases.sh`;
    const run = runInBash(path, 'say');
    expect(run.stdout.trim()).toBe('hello world');
  });

  it('flattens newlines in descriptions so they cannot escape comments', async () => {
    const content = await generate([
      makeShortcut('x', 'echo hi', { description: 'line1\nrm -rf /' }),
    ]);
    expect(content).toContain('# line1 rm -rf /');
    expect(content).not.toMatch(/^rm -rf \//m);
  });
});

describe('broken shortcut isolation (real bash)', () => {
  it('a syntax-broken shortcut does not break the others', async () => {
    await generate([
      makeShortcut('bad', 'if [ ; then echo hi', { type: 'function' }),
      makeShortcut('good', 'echo works'),
    ]);
    const path = `${HALIAS_HOME}/generated/aliases.sh`;
    const run = runInBash(path, 'good');
    expect(run.status).toBe(0);
    expect(run.stdout.trim()).toBe('works');
    expect(run.stderr).toContain('skipped broken shortcut bad');
  });

  it('hareload survives alongside a broken shortcut', async () => {
    await generate([makeShortcut('bad', '(((', { type: 'function' })]);
    const path = `${HALIAS_HOME}/generated/aliases.sh`;
    const run = runInBash(path, 'type hareload');
    expect(run.status).toBe(0);
  });
});

// zsh 는 CI(ubuntu) 기본 이미지에 없을 수 있어 있을 때만 실행
const hasZsh = spawnSync('zsh', ['--version']).status === 0;

describe.skipIf(!hasZsh)('broken shortcut isolation (real zsh)', () => {
  it('a syntax-broken shortcut does not break the others in zsh', async () => {
    await generate([
      makeShortcut('bad', 'if [ ; then echo hi', { type: 'function' }),
      makeShortcut('good', 'echo works'),
    ]);
    const path = `${HALIAS_HOME}/generated/aliases.sh`;
    const result = spawnSync('zsh', ['-f', '-c', `source '${path}' && good`], { encoding: 'utf-8' });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('works');
  });
});

describe('argComplete', () => {
  it('registers bash completion with a sanitized helper name', async () => {
    const content = await generate([
      makeShortcut('vault-dec', 'echo "$1"', { argComplete: "printf 'a\\nb\\n'" }),
    ]);
    expect(content).toContain('_halias_comp_vault_dec');
    expect(content).toContain('complete -F _halias_comp_vault_dec vault-dec');
    expect(content).toContain('compdef _halias_comp_vault_dec vault-dec');
  });

  it('produces working completion candidates in bash', async () => {
    await generate([
      makeShortcut('vd', 'echo "$1"', { argComplete: "printf 'alpha\\nbeta\\n'" }),
    ]);
    const path = `${HALIAS_HOME}/generated/aliases.sh`;
    const run = runInBash(
      path,
      `COMP_WORDS=(vd al); COMP_CWORD=1; _halias_comp_vd; echo "\${COMPREPLY[@]}"`,
    );
    expect(run.stdout.trim()).toBe('alpha');
  });

  it('omits completion block when argComplete is not set', async () => {
    const content = await generate([makeShortcut('gs', 'git status')]);
    expect(content).not.toContain('_halias_comp_');
  });
});
