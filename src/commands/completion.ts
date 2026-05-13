import chalk from 'chalk';
import { t } from '../lib/i18n.js';

export type Shell = 'zsh' | 'bash';

/**
 * ha completion <shell> — 자동완성 스크립트 출력.
 *
 * 사용법:
 *   ha completion zsh   → zsh 완성 스크립트 stdout 출력
 *   ha completion bash  → bash 완성 스크립트 stdout 출력
 *
 * .zshrc / .bashrc 에는 ha install 이 자동으로 추가.
 * 수동 설정 시: source <(ha completion zsh)
 */
export function runCompletion(shell: string | undefined): void {
  const target = (shell ?? detectShell()) as Shell;

  if (target === 'zsh') {
    process.stdout.write(zshScript());
  } else if (target === 'bash') {
    process.stdout.write(bashScript());
  } else {
    console.error(chalk.red(t('completion.unsupportedShell', { shell: target })));
    process.exit(1);
  }
}

function detectShell(): string {
  const shell = process.env['SHELL'] ?? '';
  if (shell.includes('zsh')) return 'zsh';
  if (shell.includes('bash')) return 'bash';
  return 'zsh'; // fallback
}

/** completion 설정을 .zshrc / .bashrc 에 추가할 한 줄 */
export function completionSourceLine(shell: Shell): string {
  return `source <(ha completion ${shell})`;
}

// ─── zsh ────────────────────────────────────────────────────────────────────

function zshScript(): string {
  return `
_ha_shortcuts() {
  local store="$HOME/.halias/shortcuts.json"
  if [[ -f "$store" ]]; then
    node -e "
      const d = JSON.parse(require('fs').readFileSync('$HOME/.halias/shortcuts.json','utf8'));
      process.stdout.write(d.shortcuts.map(s=>s.name).join(' '));
    " 2>/dev/null
  fi
}

_ha_tags() {
  local store="$HOME/.halias/shortcuts.json"
  if [[ -f "$store" ]]; then
    node -e "
      const d = JSON.parse(require('fs').readFileSync('$HOME/.halias/shortcuts.json','utf8'));
      const tags = [...new Set(d.shortcuts.flatMap(s=>s.tags))];
      process.stdout.write(tags.join(' '));
    " 2>/dev/null
  fi
}

_ha() {
  local commands=(
    'add:${t('completion.cmdAdd')}'
    'edit:${t('completion.cmdEdit')}'
    'rename:${t('completion.cmdRename')}'
    'list:${t('completion.cmdList')}'
    'ls:${t('completion.cmdList')}'
    'rm:${t('completion.cmdRm')}'
    'remove:${t('completion.cmdRm')}'
    'search:${t('completion.cmdSearch')}'
    'stats:${t('completion.cmdStats')}'
    'unused:${t('completion.cmdUnused')}'
    'suggest:${t('completion.cmdSuggest')}'
    'export:${t('completion.cmdExport')}'
    'import:${t('completion.cmdImport')}'
    'tags:${t('completion.cmdTags')}'
    'install:${t('completion.cmdInstall')}'
    'doctor:${t('completion.cmdDoctor')}'
    'config:${t('completion.cmdConfig')}'
    'import-rc:${t('completion.cmdImportRc')}'
    'completion:${t('completion.cmdCompletion')}'
  )

  local shortcuts
  local tags

  case $CURRENT in
    2)
      _describe 'command' commands
      ;;
    3)
      case $words[2] in
        edit|rm|remove|rename)
          shortcuts=($(_ha_shortcuts))
          _describe 'shortcut' shortcuts
          ;;
        list|ls)
          _arguments '--sort[${t('completion.optSort')}]:mode:(name recent usage)' '--tag[${t('completion.optTag')}]:tag:($(  _ha_tags))'
          ;;
        stats)
          _arguments '--top[top N]:n:' '--since[${t('completion.optSince')}]:period:' '--unused[${t('completion.optUnused')}]' '--clean[${t('completion.optClean')}]'
          ;;
        suggest)
          _arguments '--top[top N]:n:' '--min[${t('completion.optMin')}]:n:' '--save[${t('completion.optSave')}]'
          ;;
        completion)
          _describe 'shell' '(zsh bash)'
          ;;
        import)
          _files
          ;;
      esac
      ;;
  esac
}

compdef _ha ha halias
`.trimStart();
}

// ─── bash ───────────────────────────────────────────────────────────────────

function bashScript(): string {
  return `
_ha_shortcuts() {
  local store="$HOME/.halias/shortcuts.json"
  if [[ -f "$store" ]]; then
    node -e "
      const d = JSON.parse(require('fs').readFileSync('$HOME/.halias/shortcuts.json','utf8'));
      process.stdout.write(d.shortcuts.map(s=>s.name).join(' '));
    " 2>/dev/null
  fi
}

_ha() {
  local commands="add edit rename list ls rm remove search stats unused suggest export import install doctor completion"
  local shortcut_cmds="edit rm remove rename"
  local cur prev
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  if [[ $COMP_CWORD -eq 1 ]]; then
    COMPREPLY=($(compgen -W "$commands" -- "$cur"))
    return
  fi

  case "$prev" in
    edit|rm|remove|rename)
      local shortcuts
      shortcuts=$(_ha_shortcuts)
      COMPREPLY=($(compgen -W "$shortcuts" -- "$cur"))
      ;;
    completion)
      COMPREPLY=($(compgen -W "zsh bash" -- "$cur"))
      ;;
    import)
      COMPREPLY=($(compgen -f -- "$cur"))
      ;;
  esac
}

complete -F _ha ha halias
`.trimStart();
}
