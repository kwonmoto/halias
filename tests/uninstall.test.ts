import { describe, expect, it } from 'vitest';
import { stripHaliasBlocks } from '../src/commands/uninstall.js';

const RC = [
  'export PATH=/usr/bin',
  '# >>> halias shortcuts >>>',
  '[ -f "$HOME/.halias/generated/aliases.sh" ] && source "$HOME/.halias/generated/aliases.sh"',
  '# <<< halias shortcuts <<<',
  'alias myown="echo keep me"',
  '# halias completion',
  'source <(ha completion zsh)',
  'export EDITOR=vim',
].join('\n');

describe('stripHaliasBlocks', () => {
  it('removes the marker block and completion lines only', () => {
    const out = stripHaliasBlocks(RC);
    expect(out).not.toContain('halias shortcuts');
    expect(out).not.toContain('ha completion');
    expect(out).toContain('export PATH=/usr/bin');
    expect(out).toContain('alias myown="echo keep me"');
    expect(out).toContain('export EDITOR=vim');
  });

  it('is a no-op on files without halias content', () => {
    const rc = 'export PATH=/usr/bin\nalias g="git"';
    expect(stripHaliasBlocks(rc)).toBe(rc);
  });

  it('handles a completion marker without a following source line', () => {
    const rc = '# halias completion\nexport FOO=1';
    const out = stripHaliasBlocks(rc);
    expect(out).toContain('export FOO=1');
    expect(out).not.toContain('halias completion');
  });
});
