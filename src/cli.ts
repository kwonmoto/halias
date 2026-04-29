#!/usr/bin/env node
/**
 * halias — shortcut manager
 *
 * 두 가지 진입점이 동일 동작 (package.json의 bin 매핑):
 *   halias add     # 정식 이름
 *   ha add         # 일상 사용용 단축
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { runAdd } from './commands/add.js';
import { runList } from './commands/list.js';
import { runInstall } from './commands/install.js';
import { runRemove } from './commands/remove.js';
import { runSearch } from './commands/search.js';
import { runDoctor } from './commands/doctor.js';
import { runStats } from './commands/stats.js';
import { runEdit } from './commands/edit.js';
import { runExport, runImport } from './commands/export-import.js';

const program = new Command();

program
  .name('halias')
  .description('Shortcut manager for your terminal — manage aliases, share with team, track usage.')
  .version('0.1.0');

// 디폴트 액션: 'ha' 만 입력 시 퍼지 검색.
// commander는 서브 명령이 매치되지 않을 때 이 action을 실행함.
program.action(async () => {
  await runSearch();
});

// 'ha search' 도 명시적으로 제공 (스크립트나 별칭에서 명확히 호출하고 싶을 때)
program
  .command('search')
  .alias('s')
  .description('단축키 퍼지 검색 (인자 없이 ha 만 쳐도 동일)')
  .action(async () => {
    await runSearch();
  });

program
  .command('add')
  .description('새 단축키를 대화형으로 추가')
  .action(async () => {
    await runAdd();
  });

program
  .command('edit [name]')
  .description('기존 단축키 편집 (이름 생략 시 선택 화면)')
  .action(async (name?: string) => {
    await runEdit(name);
  });

program
  .command('list')
  .alias('ls')
  .description('등록된 단축키 목록 보기')
  .option('--sort <mode>', '정렬: name | recent | usage', 'name')
  .action(async (options: { sort?: 'name' | 'recent' | 'usage' }) => {
    await runList(options);
  });

program
  .command('rm [name]')
  .alias('remove')
  .description('단축키 삭제 (이름 생략 시 선택 화면)')
  .action(async (name?: string) => {
    await runRemove(name);
  });

program
  .command('install')
  .description('~/.zshrc 에 halias 셸 통합 추가')
  .action(async () => {
    await runInstall();
  });

program
  .command('doctor')
  .description('환경 점검 — fzf 설치 여부 등')
  .action(async () => {
    await runDoctor();
  });

program
  .command('stats')
  .description('단축키 사용 통계 (top N, 안 쓰는 것, 기간 필터)')
  .option('--top <n>', 'top N개 표시 (기본 10)', '10')
  .option('--since <period>', "기간 필터 (예: '7d', '24h', '30m')")
  .option('--unused', '한 번도 안 쓴/오래 안 쓴 단축키만 표시')
  .action(async (options: { top?: string; since?: string; unused?: boolean }) => {
    await runStats(options);
  });

program
  .command('export [path]')
  .description('단축키를 JSON 파일로 백업 (경로 미지정 시 ./halias-backup-YYYY-MM-DD.json)')
  .action(async (targetPath?: string) => {
    await runExport(targetPath);
  });

program
  .command('import <path>')
  .description('백업 파일에서 복원')
  .option('--strategy <mode>', "전략: 'merge' (기본) | 'replace'", 'merge')
  .action(async (filePath: string, options: { strategy?: 'merge' | 'replace' }) => {
    await runImport(filePath, options);
  });

program.parseAsync().catch((err) => {
  console.error(chalk.red('오류: ') + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
