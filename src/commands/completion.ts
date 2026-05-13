import chalk from 'chalk';

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
    console.error(chalk.red(`지원하지 않는 셸: ${target}. zsh 또는 bash 를 지정하세요.`));
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
    'add:새 단축키 추가'
    'edit:단축키 편집'
    'rename:이름 변경'
    'list:목록 보기'
    'ls:목록 보기'
    'rm:단축키 삭제'
    'remove:단축키 삭제'
    'search:퍼지 검색'
    'stats:사용 통계'
    'unused:미사용 단축키'
    'suggest:단축키 후보 추천'
    'export:백업'
    'import:복원'
    'install:셸 통합 설치'
    'doctor:환경 점검'
    'completion:자동완성 스크립트 출력'
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
          _arguments '--sort[정렬]:mode:(name recent usage)' '--tag[태그 필터]:tag:($(  _ha_tags))'
          ;;
        stats)
          _arguments '--top[top N]:n:' '--since[기간]:period:' '--unused[미사용만]' '--clean[일괄 삭제]'
          ;;
        suggest)
          _arguments '--top[top N]:n:' '--min[최소 반복 횟수]:n:' '--save[선택해서 저장]'
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
