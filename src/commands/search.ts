import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import * as p from '@clack/prompts';
import chalk from 'chalk';
import { readStore } from '../core/store.js';
import { isFzfAvailable, runFzf } from '../lib/fzf.js';
import { copyToClipboard } from '../lib/clipboard.js';
import { isShellIntegrationInstalled } from '../lib/shell-integration.js';
import { STATS_LOG_PATH } from '../lib/paths.js';
import { scoreShortcutsForDirectory, type ScoredShortcut } from '../core/stats.js';
import type { Shortcut } from '../core/types.js';
import { t } from '../lib/i18n.js';

export interface SearchOptions {
  /** 선택한 단축키를 바로 실행 */
  run?: boolean;
  /** 선택한 단축키의 명령을 클립보드에 복사 */
  copy?: boolean;
}

/**
 * ha 인자 없이 실행 시 호출되는 검색 진입점.
 *
 * 흐름:
 * 1. fzf 가능 → 인터랙티브 퍼지 검색
 * 2. fzf 불가 → Clack select 폴백 (단축키가 적을 때는 이걸로도 충분)
 * 3. 선택 후 → 기본은 정보 출력, --run 은 즉시 실행, --copy 는 클립보드 복사
 */
export async function runSearch(options: SearchOptions = {}): Promise<void> {
  const store = await readStore();

  if (store.shortcuts.length === 0) {
    await printOnboarding();
    return;
  }

  // 컨텍스트 점수 계산 — 현재 디렉토리에서 자주 쓴 게 위로 가도록
  const currentDir = process.cwd();
  const scores = await scoreShortcutsForDirectory(
    store.shortcuts.map((s) => s.name),
    currentDir,
  );

  const scoreMap = new Map(scores.map((s) => [s.name, s]));
  const ranked = [...store.shortcuts].sort((a, b) => {
    const aScore = scoreMap.get(a.name)?.score ?? 0;
    const bScore = scoreMap.get(b.name)?.score ?? 0;
    if (bScore !== aScore) return bScore - aScore;
    return a.name.localeCompare(b.name);
  });

  const selectedName = isFzfAvailable()
    ? await searchWithFzf(ranked, scoreMap)
    : await searchWithClack(ranked, scoreMap);

  if (!selectedName) {
    return;
  }

  const shortcut = store.shortcuts.find((s) => s.name === selectedName);
  if (!shortcut) return;

  if (options.run) {
    await runShortcutCommand(shortcut);
    return;
  }

  if (options.copy) {
    if (copyToClipboard(shortcut.command)) {
      console.log(chalk.green(`✓ ${t('search.copyDone', { name: shortcut.name })}`));
    } else {
      console.log(chalk.yellow(`  ${t('search.copyFailed')}`));
      printShortcutInfo(shortcut);
    }
    return;
  }

  printShortcutInfo(shortcut);
}

/**
 * --run: 선택한 단축키의 명령을 사용자 셸로 즉시 실행.
 *
 * 자식 셸에서 실행되므로 cd 류는 현재 셸에 반영 안 됨 — 검색→실행의 손타이핑을
 * 없애는 용도. 함수 wrapper(_halias_track)를 거치지 않으니 통계는 직접 기록.
 */
async function runShortcutCommand(s: Shortcut): Promise<void> {
  console.log(chalk.dim(`  $ ${summarizeCommand(s)}`));
  console.log();

  const shell = process.env.SHELL || '/bin/sh';
  const result = spawnSync(shell, ['-c', s.command], { stdio: 'inherit' });

  // 통계 기록 — aliases.sh 의 _halias_track 과 동일한 탭 구분 형식
  try {
    await fs.appendFile(
      STATS_LOG_PATH,
      `${Math.floor(Date.now() / 1000)}\t${s.name}\t${process.cwd()}\n`,
    );
  } catch {
    // 통계는 부가 기능 — 실패해도 조용히 넘어감
  }

  if (result.status !== null && result.status !== 0) {
    process.exitCode = result.status;
  }
}

/**
 * 빈 상태 온보딩 — 처음 설치한 사용자가 다음에 뭘 해야 하는지 안내.
 * 셸 통합 미설치면 install 단계를 강조.
 */
async function printOnboarding(): Promise<void> {
  const installed = await isShellIntegrationInstalled();

  console.log();
  console.log('  ' + chalk.bold(t('search.onboardTitle')));
  console.log();
  console.log('  1. ' + chalk.cyan('ha add') + chalk.dim(`  ${t('search.onboardAdd')}`));
  const installLine = '  2. ' + chalk.cyan('ha install') + chalk.dim(`  ${t('search.onboardInstall')}`);
  console.log(installed ? installLine : installLine + chalk.yellow(` ← ${t('search.onboardInstallMissing')}`));
  console.log('  3. ' + chalk.cyan('hareload') + chalk.dim(`  ${t('search.onboardReload')}`));
  console.log();
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
async function searchWithFzf(
  shortcuts: Shortcut[],
  scoreMap: Map<string, ScoredShortcut>,
): Promise<string | null> {
  const sanitize = (s: string) => s.replace(/[\t\n]/g, ' ');
  const maxName = Math.max(...shortcuts.map((s) => s.name.length), 8);

  const lines = shortcuts.map((s) => {
    const cmd = sanitize(summarizeCommand(s));
    const tagStr = s.tags.length > 0 ? `#${s.tags.join(',')}` : '';
    const desc = sanitize(s.description ?? '');
    const usage = formatUsageHint(scoreMap.get(s.name));

    return [s.name.padEnd(maxName), cmd.padEnd(40), tagStr.padEnd(12), usage, desc]
      .filter(Boolean)
      .join('  ')
      .trimEnd();
  });

  const result = await runFzf(lines.join('\n'), {
    prompt: t('search.fzfPrompt'),
    header: t('search.fzfHeader', { count: shortcuts.length }),
    // --no-sort 로 외부 정렬(점수순) 유지 — fzf 가 자체 정렬 못 하게.
    extraArgs: ['--no-sort'],
  });

  if (!result) return null;
  return result.trim().split(/\s+/)[0] ?? null;
}

/**
 * 사용 횟수를 검색 결과에 표시할 짧은 hint 로 변환.
 *
 * - 현재 디렉토리에서 쓴 게 있으면 → ★ N회
 * - 그 외 글로벌 사용만 있으면 → N회
 * - 안 쓰였으면 → 빈 문자열
 */
function formatUsageHint(scored: ScoredShortcut | undefined): string {
  if (!scored) return '';
  if (scored.contextCount > 0) {
    return t('search.usageCountContext', { count: scored.contextCount });
  }
  if (scored.globalCount > 0) {
    return t('search.usageCountGlobal', { count: scored.globalCount });
  }
  return '';
}

async function searchWithClack(
  shortcuts: Shortcut[],
  scoreMap: Map<string, ScoredShortcut>,
): Promise<string | null> {
  console.log(
    chalk.dim(t('search.clackFallbackHint')) +
      chalk.cyan('ha doctor') +
      chalk.dim(t('search.clackFallbackHint2')),
  );
  console.log();

  const selected = await p.select({
    message: t('search.clackSelectPrompt'),
    options: shortcuts.map((s) => {
      const usage = formatUsageHint(scoreMap.get(s.name));
      const cmd = summarizeCommand(s);
      return {
        value: s.name,
        label: s.name,
        hint: usage ? `${cmd}  ${chalk.dim(usage)}` : cmd,
      };
    }),
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
    console.log('  ' + chalk.dim(t('search.infoCommand')) + '  ' + s.command);
  } else {
    console.log('  ' + chalk.dim(t('search.infoFunctionBody')));
    s.command.split('\n').forEach((line) => {
      console.log('    ' + chalk.green(line));
    });
  }

  if (s.tags.length > 0) {
    console.log('  ' + chalk.dim(t('search.infoTags')) + '  ' + s.tags.join(', '));
  }

  console.log('  ' + chalk.dim(t('search.infoSource')) + '  ' + s.source);
  console.log();
  console.log(
    '  ' + chalk.dim(t('search.infoUsage')) + '  ' + chalk.cyan(s.name) + chalk.dim(` ${t('search.infoUsageHint')}`),
  );
  console.log();
}
