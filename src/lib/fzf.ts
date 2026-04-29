import { spawn, execSync } from 'node:child_process';

/**
 * 시스템에 fzf가 설치되어 있는지 확인.
 * which 명령은 zsh/bash/sh 모두에서 동작.
 */
export function isFzfAvailable(): boolean {
  try {
    execSync('which fzf', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export interface FzfOptions {
  /** 프롬프트 표시 (예: 'halias> ') */
  prompt?: string;
  /** 상단 헤더 한 줄 */
  header?: string;
  /** 입력 필드 구분자 (탭 권장) — withNth/nth 사용 시 필요 */
  delimiter?: string;
  /** 표시할 필드 인덱스 (1-based, 예: '1' = 첫 컬럼만 표시).
   *  ⚠️ fzf는 with-nth가 검색 범위에도 영향을 줍니다 — 검색 범위 제한이 필요하면
   *  표시할 컬럼만 명시하세요. */
  withNth?: string;
  /** 검색 대상 필드 (예: '1,2,3' = 1,2,3번 컬럼 모두 검색) */
  nth?: string;
}

/**
 * fzf를 자식 프로세스로 실행하고 사용자 선택값을 반환.
 *
 * - 사용자가 Esc/Ctrl+C 로 취소 → null 반환 (exit code 130)
 * - 일반 종료 → 선택된 줄 반환
 *
 * stdio 처리에 주의: stderr는 inherit해야 fzf가 터미널을 정상적으로 그림.
 */
export async function runFzf(
  input: string,
  options: FzfOptions = {},
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const args: string[] = [
      '--ansi',
      '--height=40%',
      '--reverse',
      '--border=rounded',
      '--info=inline',
    ];

    if (options.prompt) args.push('--prompt', options.prompt);
    if (options.header) args.push('--header', options.header);
    if (options.delimiter) args.push('--delimiter', options.delimiter);
    if (options.withNth) args.push('--with-nth', options.withNth);
    if (options.nth) args.push('--nth', options.nth);

    const proc = spawn('fzf', args, {
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    let output = '';
    proc.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });

    proc.on('error', (err) => reject(err));

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(output.trimEnd());
      } else if (code === 130 || code === 1) {
        // 130: Ctrl+C / Esc, 1: no match
        resolve(null);
      } else {
        reject(new Error(`fzf exited with code ${code}`));
      }
    });

    proc.stdin.write(input);
    proc.stdin.end();
  });
}
