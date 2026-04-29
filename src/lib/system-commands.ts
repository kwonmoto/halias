import { execSync } from 'node:child_process';

/**
 * 절대로 덮어씌우면 안 되는 핵심 명령어들.
 * (which 결과와 무관하게 hard-block)
 */
const CRITICAL_COMMANDS = new Set([
  'cd', 'ls', 'rm', 'mv', 'cp', 'mkdir', 'rmdir', 'pwd',
  'echo', 'cat', 'grep', 'find', 'sed', 'awk',
  'sudo', 'su', 'chmod', 'chown',
  'git', 'npm', 'node', 'python', 'pip',
  'kill', 'ps', 'top',
  'ssh', 'scp', 'curl', 'wget',
  'export', 'source', 'alias', 'unalias',
  'exit', 'logout',
]);

/**
 * 셸 빌트인이거나 시스템 명령어인지 검사.
 * 우선순위:
 *   1. CRITICAL_COMMANDS 에 있는지 (hard list)
 *   2. `command -v` 로 실제 시스템에 존재하는지 (PATH 검색 + 빌트인)
 *
 * 빌트인 검사 정확도가 셸별로 다를 수 있어 1번을 fallback으로 둠.
 */
export function detectSystemCommandConflict(name: string): {
  conflict: boolean;
  reason?: string;
} {
  if (CRITICAL_COMMANDS.has(name)) {
    return {
      conflict: true,
      reason: `'${name}' 은(는) 자주 쓰는 시스템 명령어입니다. 덮어씌우면 시스템 동작이 망가질 수 있어요.`,
    };
  }

  try {
    // command -v 는 모든 POSIX 셸에서 동작. PATH + alias + builtin 모두 검색.
    const result = execSync(`command -v ${shellEscape(name)} 2>/dev/null`, {
      encoding: 'utf-8',
      shell: '/bin/sh',
    }).trim();

    if (result) {
      return {
        conflict: true,
        reason: `'${name}' 이름의 명령어가 이미 시스템에 존재합니다 (${result}). halias 단축키로 등록하면 이를 덮어씁니다.`,
      };
    }
  } catch {
    // command -v exits with non-zero when not found — that's fine.
  }

  return { conflict: false };
}

/**
 * 사용자 입력을 셸 단일 인자로 안전하게 감싸기.
 * 단축키 이름은 [a-zA-Z_][a-zA-Z0-9_]* 패턴이라 사실 안전하지만,
 * 방어적 코딩으로 escape 처리.
 */
function shellEscape(s: string): string {
  // 영숫자/_/-/. 만 있으면 그대로, 아니면 single-quote로 감싸기
  if (/^[a-zA-Z0-9_./-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, "'\\''")}'`;
}
