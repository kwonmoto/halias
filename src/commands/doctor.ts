import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import * as p from '@clack/prompts';
import chalk from 'chalk';
import { isFzfAvailable } from '../lib/fzf.js';
import { detectPackageManager, detectPlatform } from '../lib/platform.js';
import { inspectShellHistory } from '../lib/shell-history.js';
import { detectSystemCommandConflict } from '../lib/system-commands.js';
import { readStore } from '../core/store.js';
import { ALIASES_OUTPUT } from '../lib/paths.js';
import { t } from '../lib/i18n.js';

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
 *   6. 셸 history 접근 가능 여부 (ha add --last / ha suggest)
 */
export async function runDoctor(): Promise<void> {
  console.log();
  console.log(chalk.bold(t('doctor.title')));
  console.log();

  const checks: CheckResult[] = [];

  checks.push(await checkFzf());
  checks.push(await checkShellIntegration());
  checks.push(await checkShellHistory());
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
    return { level: 'ok', message: t('doctor.fzfOk') };
  }
  return {
    level: 'warn',
    message: t('doctor.fzfWarn'),
    detail: t('doctor.fzfWarnDetail'),
    fix: t('doctor.fzfWarnFix'),
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
          message: t('doctor.shellIntegrationOk', { file: path.basename(file) }),
        };
      }
    } catch {
      // 파일 없음 — skip
    }
  }

  return {
    level: 'warn',
    message: t('doctor.shellIntegrationWarn'),
    detail: t('doctor.shellIntegrationWarnDetail'),
    fix: t('doctor.shellIntegrationWarnFix'),
  };
}

async function checkShellHistory(): Promise<CheckResult> {
  const diagnostics = await inspectShellHistory(1_000);
  const readable = diagnostics.files.filter((file) => file.readable);

  if (readable.length === 0) {
    const attempted = diagnostics.files.length > 0
      ? diagnostics.files.map((file) => `  • ${file.path}`).join('\n')
      : t('doctor.shellHistoryNoCandidates');

    return {
      level: 'warn',
      message: t('doctor.shellHistoryNoFile'),
      detail: attempted,
      fix: t('doctor.shellHistoryNoFileFix'),
    };
  }

  if (diagnostics.commands.length === 0) {
    return {
      level: 'warn',
      message: t('doctor.shellHistoryEmpty'),
      detail: readable.map((file) => `  • ${path.basename(file.path)} 읽음 (0개)`).join('\n'),
      fix: t('doctor.shellHistoryEmptyFix'),
    };
  }

  const detail = readable
    .map((file) => `  • ${path.basename(file.path)}: ${file.commandCount}개`)
    .join('\n');

  return {
    level: 'ok',
    message: t('doctor.shellHistoryOk', { count: diagnostics.commands.length }),
    detail,
  };
}

async function checkStoreIntegrity(): Promise<CheckResult> {
  try {
    const store = await readStore();
    return {
      level: 'ok',
      message: t('doctor.storeOk', { count: store.shortcuts.length }),
    };
  } catch (err) {
    return {
      level: 'error',
      message: t('doctor.storeError'),
      detail: err instanceof Error ? err.message : String(err),
      fix: t('doctor.storeErrorFix'),
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
    return [{ level: 'ok', message: t('doctor.dangerousNone') }];
  }

  return [
    {
      level: 'warn',
      message: t('doctor.dangerousFound', { count: dangerous.length }),
      detail: dangerous.map((d) => `  • ${chalk.yellow(d.name)}`).join('\n'),
      fix: t('doctor.dangerousFoundFix'),
    },
  ];
}

async function checkGeneratedFile(): Promise<CheckResult> {
  try {
    await fs.access(ALIASES_OUTPUT);
    return { level: 'ok', message: t('doctor.aliasesOk') };
  } catch {
    return {
      level: 'warn',
      message: t('doctor.aliasesWarn'),
      detail: t('doctor.aliasesWarnDetail'),
      fix: t('doctor.aliasesWarnFix'),
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
    console.log(chalk.green(`  ${t('doctor.summaryOk')}`));
  } else {
    const summary = [];
    if (errors > 0) summary.push(chalk.red(t('doctor.summaryErrors', { count: errors })));
    if (warns > 0) summary.push(chalk.yellow(t('doctor.summaryWarnings', { count: warns })));
    console.log('  ' + summary.join(', ') + ' 발견');
  }
}

// ─── fzf 자동 설치 (기존 로직 유지) ─────────────────────

async function offerFzfInstall(): Promise<void> {
  const platform = detectPlatform();
  const pm = detectPackageManager();

  if (!pm) {
    console.log(chalk.bold(`  ${t('doctor.fzfInstallTitle')}`));
    if (platform === 'macos') {
      console.log('    ' + chalk.cyan(t('doctor.fzfBrewCmd')));
    } else if (platform === 'linux') {
      console.log('    ' + chalk.cyan(t('doctor.fzfAptCmd')) + chalk.dim(`  # ${t('doctor.fzfAptHint')}`));
      console.log('    ' + chalk.cyan(t('doctor.fzfDnfCmd')) + chalk.dim(`  # ${t('doctor.fzfDnfHint')}`));
    } else if (platform === 'windows') {
      console.log('    ' + chalk.cyan(t('doctor.fzfWingetCmd')));
    } else {
      console.log('    ' + chalk.dim(t('doctor.fzfManualUrl')));
    }
    return;
  }

  const command = pm.install('fzf');
  console.log('  ' + chalk.dim(t('doctor.fzfDetectedPm', { pm: pm.name })));
  console.log('  ' + chalk.dim(t('doctor.fzfRunCmd')) + chalk.cyan(command));
  console.log();

  if (!pm.autoSafe) {
    console.log(
      chalk.dim('  ') +
        chalk.yellow(t('doctor.fzfSudoRequired')) +
        chalk.dim(t('doctor.fzfSudoRequiredHint')),
    );
    return;
  }

  const proceed = await p.confirm({
    message: t('doctor.fzfInstallConfirm'),
    initialValue: true,
  });

  if (p.isCancel(proceed) || !proceed) {
    console.log(chalk.dim(`  ${t('doctor.fzfInstallCancelled')}`));
    return;
  }

  const spinner = p.spinner();
  spinner.start(t('doctor.fzfInstallingWith', { pm: pm.name }));
  try {
    execSync(command, { stdio: 'pipe' });
    spinner.stop(chalk.green(t('doctor.fzfInstallDone')));
  } catch (err) {
    spinner.stop(chalk.red(t('doctor.fzfInstallFailed')));
    console.log(
      chalk.dim(`  ${t('doctor.fzfInstallError')}`) +
        (err instanceof Error ? err.message : String(err)),
    );
  }
}
