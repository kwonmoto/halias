import { describe, expect, it } from 'vitest';
import { parseRcFile } from '../src/commands/import-rc.js';

describe('parseRcFile — aliases', () => {
  it('parses double- and single-quoted aliases', () => {
    const entries = parseRcFile(`alias g="git status"\nalias gp='git push'`);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ name: 'g', command: 'git status', type: 'alias' });
    expect(entries[1]).toMatchObject({ name: 'gp', command: 'git push' });
  });

  it('parses unquoted single-token values', () => {
    const entries = parseRcFile('alias ll=ls');
    expect(entries[0]).toMatchObject({ name: 'll', command: 'ls' });
  });

  it('allows trailing comments', () => {
    const entries = parseRcFile('alias g="git status"  # version control\nalias la=ls # list');
    expect(entries).toHaveLength(2);
    expect(entries[0]?.command).toBe('git status');
    expect(entries[1]?.command).toBe('ls');
  });

  it('skips comments, blanks, and non-alias lines', () => {
    const entries = parseRcFile('# comment\n\nexport PATH=/x\nsource ~/.env\nalias g="git"');
    expect(entries).toHaveLength(1);
  });

  it('skips the halias-managed block', () => {
    const entries = parseRcFile(
      [
        'alias keep="echo keep"',
        '# >>> halias shortcuts >>>',
        'alias inside="should not import"',
        '# <<< halias shortcuts <<<',
      ].join('\n'),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]?.name).toBe('keep');
  });
});

describe('parseRcFile — single-line functions', () => {
  it('parses NAME() { body; } form', () => {
    const entries = parseRcFile('mkcd() { mkdir -p "$1" && cd "$1"; }');
    expect(entries[0]).toMatchObject({
      name: 'mkcd',
      type: 'function',
      command: 'mkdir -p "$1" && cd "$1"',
    });
  });

  it('parses the function keyword form', () => {
    const entries = parseRcFile('function greet() { echo hi }');
    expect(entries[0]).toMatchObject({ name: 'greet', command: 'echo hi' });
  });

  it('skips halias-generated functions (contain _halias_track)', () => {
    const entries = parseRcFile('gs() { _halias_track "gs"; git status; }');
    expect(entries).toHaveLength(0);
  });
});
