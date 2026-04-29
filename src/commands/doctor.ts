import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import * as p from '@clack/prompts';
import chalk from 'chalk';
import { isFzfAvailable } from '../lib/fzf.js';
import { detectPackageManager, detectPlatform } from '../lib/platform.js';
import { detectSystemCommandConflict } from '../lib/system-commands.js';
import { readStore } from '../core/store.js';
import { ALIASES_OUTPUT } from '../lib/paths.js';

interface CheckResult {
  level: 'ok' | 'warn' | 'error' | 'info';
  message: string;
  detail?: string;
  fix?: string;
}

/**
 * ha doctor — 환경 종합 점검.
 *
 * 검사 항목:
 *   1. fzf 설치 여부 (퍼지 검색 품질)
 *   2. 셸 통합 설치 여부 (~/.zshrc 등에 source 라인)
 *   3. shortcuts.json 무결성 (parse 가능?)
 *   4. 위험한 단축키 — 시스템 명령어 덮어씌움 감지
 *   5. aliases.sh 와 shortcuts.json 동기화 상태
 */
export async function runDoctor(): Promise<void> {
  console.log();
  console.log(chalk.bold('halias 환경 점검'));
  console.log();

  const checks: CheckResult[] = [];

  checks.push(await checkFzf());
  checks.push(await checkShellIntegration());
  checks.push(await checkStoreIntegrity());
  checks.push(...(await checkDangerousShortcuts()));
  checks.push(await checkGeneratedFile());

  printChecks(checks);

  // fzf만 별도로 자동 설치 옵션 제공
  if (!isFzfAvailable()) {
    console.log();
    await offerFzfInstall();
  }
}

// ─── 개별 검사 함수들 ─────────────────────────────────────

async function checkFzf(): Promise<CheckResult> {
  if (isFzfAvailable()) {
    return { level: 'ok', message: 'fzf 설치됨' };
  }
  return {
    level: 'warn',
    message: 'fzf 미설치',
    detail: '퍼지 검색이 단순 선택 모드로 폴백됩니다.',
    fix: '아래에서 자동 설치를 진행하거나 수동으로 설치하세요.',
  };
}

async function checkShellIntegration(): Promise<CheckResult> {
  const home = os.homedir();
  const candidates = [
    path.join(home, '.zshrc'),
    path.join(home, '.bashrc'),
    path.join(home, '.bash_profile'),
  ];

  for (const file of candidates) {
    try {
      const content = await fs.readFile(file, 'utf-8');
      if (content.includes('# >>> halias shortcuts >>>')) {
        return {
          level: 'ok',
          message: `셸 통합 설치됨 (${path.basename(file)})`,
        };
      }
    } catch {
      // 파일 없음 — skip
    }
  }

  return {
    level: 'warn',
    message: '셸 통합 미설치',
    detail: '단축키가 셸에 등록되지 않아 사용할 수 없습니다.',
    fix: 'ha install 을 실행하세요.',
  };
}

async function checkStoreIntegrity(): Promise<CheckResult> {
  try {
    const store = await readStore();
    return {
      level: 'ok',
      message: `shortcuts.json 무결성 정상 (${store.shortcuts.length}개)`,
    };
  } catch (err) {
    return {
      level: 'error',
      message: 'shortcuts.json 손상',
      detail: err instanceof Error ? err.message : String(err),
      fix: '백업이 있다면 ha import 로 복구하세요. 없다면 직접 ~/.halias/shortcuts.json 을 점검해야 합니다.',
    };
  }
}

async function checkDangerousShortcuts(): Promise<CheckResult[]> {
  let store;
  try {
    store = await readStore();
  } catch {
    return []; // 무결성 검사에서 이미 다룸
  }

  const dangerous = store.shortcuts
    .map((s) => ({ name: s.name, conflict: detectSystemCommandConflict(s.name) }))
    .filter((x) => x.conflict.conflict);

  if (dangerous.length === 0) {
    return [{ level: 'ok', message: '위험한 단축키 없음' }];
  }

  return [
    {
      level: 'warn',
      message: `시스템 명령어를 덮어씌우는 단축키 ${dangerous.length}개`,
      detail: dangerous.map((d) => `  • ${chalk.yellow(d.name)}`).join('\n'),
      fix: '의도한 것이 아니라면 ha rm <name> 으로 삭제하세요.',
    },
  ];
}

async function checkGeneratedFile(): Promise<CheckResult> {
  try {
    await fs.access(ALIASES_OUTPUT);
    return { level: 'ok', message: 'aliases.sh 생성됨' };
  } catch {
    return {
      level: 'warn',
      message: 'aliases.sh 미생성',
      detail: '단축키를 추가했거나 ha install 후에는 자동 생성되어야 합니다.',
      fix: 'ha install 을 다시 실행하세요.',
    };
  }
}

// ─── 출력 ──────────────────────────────────────────────

function printChecks(checks: CheckResult[]): void {
  for (const check of checks) {
    const icon =
      check.level === 'ok'
        ? chalk.green('✓')
        : check.level === 'warn'
          ? chalk.yellow('!')
          : check.level === 'error'
            ? chalk.red('✗')
            : chalk.blue('ℹ');

    console.log(`  ${icon} ${check.message}`);
    if (check.detail) {
      check.detail.split('\n').forEach((line) => {
        console.log('    ' + chalk.dim(line));
      });
    }
    if (check.fix) {
      console.log('    ' + chalk.dim('→ ') + chalk.cyan(check.fix));
    }
  }
  console.log();

  // 요약
  const errors = checks.filter((c) => c.level === 'error').length;
  const warns = checks.filter((c) => c.level === 'warn').length;

  if (errors === 0 && warns === 0) {
    console.log(chalk.green('  모든 항목 정상.'));
  } else {
    const summary = [];
    if (errors > 0) summary.push(chalk.red(`오류 ${errors}개`));
    if (warns > 0) summary.push(chalk.yellow(`경고 ${warns}개`));
    console.log('  ' + summary.join(', ') + ' 발견');
  }
}

// ─── fzf 자동 설치 (기존 로직 유지) ─────────────────────

async function offerFzfInstall(): Promise<void> {
  const platform = detectPlatform();
  const pm = detectPackageManager();

  if (!pm) {
    console.log(chalk.bold('  fzf 설치 방법:'));
    if (platform === 'macos') {
      console.log('    ' + chalk.cyan('brew install fzf'));
    } else if (platform === 'linux') {
      console.log('    ' + chalk.cyan('sudo apt install fzf') + chalk.dim('  # Debian/Ubuntu'));
      console.log('    ' + chalk.cyan('sudo dnf install fzf') + chalk.dim('  # Fedora/RHEL'));
    } else if (platform === 'windows') {
      console.log('    ' + chalk.cyan('winget install fzf'));
    } else {
      console.log('    ' + chalk.dim('https://github.com/junegunn/fzf#installation'));
    }
    return;
  }

  const command = pm.install('fzf');
  console.log('  ' + chalk.dim(`감지된 패키지 매니저: ${pm.name}`));
  console.log('  ' + chalk.dim('실행할 명령어: ') + chalk.cyan(command));
  console.log();

  if (!pm.autoSafe) {
    console.log(
      chalk.dim('  ') +
        chalk.yellow('sudo 권한이 필요해 자동 실행하지 않습니다.') +
        chalk.dim(' 위 명령어를 직접 실행해주세요.'),
    );
    return;
  }

  const proceed = await p.confirm({
    message: '지금 자동으로 설치할까요?',
    initialValue: true,
  });

  if (p.isCancel(proceed) || !proceed) {
    console.log(chalk.dim('  취소되었습니다. 위 명령어를 직접 실행해주세요.'));
    return;
  }

  const spinner = p.spinner();
  spinner.start(`${pm.name}으로 fzf 설치 중`);
  try {
    execSync(command, { stdio: 'pipe' });
    spinner.stop(chalk.green('✓ fzf 설치 완료'));
  } catch (err) {
    spinner.stop(chalk.red('✗ 설치 실패'));
    console.log(
      chalk.dim('  오류: ') +
        (err instanceof Error ? err.message : String(err)),
    );
  }
}
