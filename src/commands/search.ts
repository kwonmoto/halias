import * as p from '@clack/prompts';
import chalk from 'chalk';
import { readStore } from '../core/store.js';
import { isFzfAvailable, runFzf } from '../lib/fzf.js';
import type { Shortcut } from '../core/types.js';

/**
 * ha 인자 없이 실행 시 호출되는 검색 진입점.
 *
 * 흐름:
 * 1. fzf 가능 → 인터랙티브 퍼지 검색
 * 2. fzf 불가 → Clack select 폴백 (단축키가 적을 때는 이걸로도 충분)
 * 3. 선택 후 → 정보 출력 (실행은 사용자에게 맡김)
 */
export async function runSearch(): Promise<void> {
  const store = await readStore();

  if (store.shortcuts.length === 0) {
    console.log(
      chalk.dim('등록된 단축키가 없습니다. ') +
        chalk.cyan("'ha add'") +
        chalk.dim(' 로 시작하세요.'),
    );
    return;
  }

  const selectedName = isFzfAvailable()
    ? await searchWithFzf(store.shortcuts)
    : await searchWithClack(store.shortcuts);

  if (!selectedName) {
    // 사용자가 취소 — 조용히 종료
    return;
  }

  const shortcut = store.shortcuts.find((s) => s.name === selectedName);
  if (!shortcut) return;

  printShortcutInfo(shortcut);
}

/**
 * 검색/리스트 표시용 명령어 한 줄 요약.
 * - alias: 그대로
 * - function: 개행 → 공백으로 압축, 너무 길면 자르기
 */
function summarizeCommand(s: Shortcut): string {
  if (s.type === 'alias') return s.command;
  const oneLine = s.command.replace(/\s*\n+\s*/g, ' ').trim();
  return oneLine.length > 80 ? oneLine.slice(0, 77) + '...' : oneLine;
}

/**
 * fzf로 검색.
 *
 * 표시 전략: 모든 정보를 한 줄에 — 이름 / 명령 / #태그 / 설명
 * 검색 전략: 라인 전체 (--with-nth, --nth 미지정 = fzf 기본값 = 모든 필드)
 *
 * 왜 모든 정보를 표시하는가:
 *   --with-nth=1 로 첫 컬럼만 표시하려 했는데, fzf 0.44.x 기준
 *   --with-nth가 검색 범위에도 영향을 줘서 이름 외엔 매치가 안 됨.
 *   navi 같은 도구들이 쓰는 표준 패턴인 "한 줄에 모든 정보"로 변경.
 */
async function searchWithFzf(shortcuts: Shortcut[]): Promise<string | null> {
  const sanitize = (s: string) => s.replace(/[\t\n]/g, ' ');

  // 가장 긴 이름에 맞춰 정렬 (최소 8칸)
  const maxName = Math.max(...shortcuts.map((s) => s.name.length), 8);

  const lines = shortcuts.map((s) => {
    const cmd = sanitize(summarizeCommand(s));
    const tagStr = s.tags.length > 0 ? `#${s.tags.join(',')}` : '';
    const desc = sanitize(s.description ?? '');

    return [s.name.padEnd(maxName), cmd.padEnd(40), tagStr, desc]
      .filter(Boolean)
      .join('  ')
      .trimEnd();
  });

  const result = await runFzf(lines.join('\n'), {
    prompt: 'halias❯ ',
    header: `단축키 ${shortcuts.length}개 · 이름/명령/태그/설명 모두 검색 · Esc 취소`,
  });

  if (!result) return null;

  // 첫 토큰이 이름 (이름은 영문/숫자/_ 만 허용되어 공백 포함 안 됨)
  return result.trim().split(/\s+/)[0] ?? null;
}

/**
 * fzf 없을 때의 폴백 — Clack select.
 * 검색은 못 하지만 화살표로 선택 가능.
 */
async function searchWithClack(shortcuts: Shortcut[]): Promise<string | null> {
  console.log(
    chalk.dim('ℹ fzf가 설치되어 있지 않아 단순 선택 모드로 실행합니다.\n  더 나은 검색을 원하시면: ') +
      chalk.cyan('ha doctor') +
      chalk.dim(' 로 설치 안내를 확인하세요.\n  취소하려면 Ctrl+C 를 누르세요.'),
  );
  console.log();

  const selected = await p.select({
    message: '단축키 선택',
    options: shortcuts.map((s) => ({
      value: s.name,
      label: s.name,
      hint: summarizeCommand(s),
    })),
  });

  if (p.isCancel(selected)) return null;
  return selected as string;
}

/**
 * 선택된 단축키 정보 출력.
 * - alias: 한 줄로 명령 표시
 * - function: 본문 전체를 코드 블록처럼 들여쓰기 + 색상
 */
function printShortcutInfo(s: Shortcut): void {
  console.log();
  console.log('  ' + chalk.bold.cyan(s.name));

  if (s.description) {
    console.log('  ' + chalk.dim(s.description));
  }

  console.log();

  if (s.type === 'alias') {
    console.log('  ' + chalk.dim('명령:') + '  ' + s.command);
  } else {
    console.log('  ' + chalk.dim('함수 본문:'));
    s.command.split('\n').forEach((line) => {
      console.log('    ' + chalk.green(line));
    });
  }

  if (s.tags.length > 0) {
    console.log('  ' + chalk.dim('태그:') + '  ' + s.tags.join(', '));
  }

  console.log('  ' + chalk.dim('출처:') + '  ' + s.source);
  console.log();
  console.log(
    '  ' + chalk.dim('사용:') + '  ' + chalk.cyan(s.name) + chalk.dim(' (셸에서 직접 입력)'),
  );
  console.log();
}
