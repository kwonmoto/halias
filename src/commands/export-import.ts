import fs from 'node:fs/promises';
import path from 'node:path';
import * as p from '@clack/prompts';
import chalk from 'chalk';
import { readStore, writeStore } from '../core/store.js';
import { generateAliasesFile } from '../core/generator.js';
import { StoreSchema, ShortcutSchema, type Shortcut } from '../core/types.js';

/**
 * ha export [path] — 단축키를 JSON 파일로 백업.
 * 경로 미지정 시 ./halias-backup-YYYY-MM-DD.json 으로 저장.
 */
export async function runExport(targetPath?: string): Promise<void> {
  const store = await readStore();

  const finalPath =
    targetPath ?? `./halias-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const absPath = path.resolve(finalPath);

  await fs.writeFile(absPath, JSON.stringify(store, null, 2), 'utf-8');

  console.log();
  console.log(chalk.green(`✓ ${store.shortcuts.length}개 단축키 백업됨`));
  console.log(chalk.dim(`  ${absPath}`));
  console.log();
}

interface ImportOptions {
  /** 'merge' (기본) — 기존 + 새 항목 합치기, 충돌 시 기존 유지
   *  'replace' — 기존을 모두 지우고 새로 채움 */
  strategy?: 'merge' | 'replace';
}

/**
 * ha import <path> — 백업된 JSON 파일에서 단축키 복원.
 *
 * 두 가지 전략:
 *   --strategy merge (기본):  기존 + 새 항목, 같은 이름이면 기존 유지
 *   --strategy replace:        기존을 모두 지우고 백업으로 갈아끼움
 *
 * 두 전략 모두 실행 전 사용자 확인 받음.
 */
export async function runImport(
  filePath: string,
  options: ImportOptions = {},
): Promise<void> {
  const strategy = options.strategy ?? 'merge';

  // 1. 백업 파일 읽기 + 검증
  const absPath = path.resolve(filePath);
  let imported;
  try {
    const raw = await fs.readFile(absPath, 'utf-8');
    const parsed = JSON.parse(raw);
    imported = StoreSchema.parse(parsed);
  } catch (err) {
    console.log(chalk.red('파일을 읽거나 파싱할 수 없습니다.'));
    console.log(chalk.dim(`  ${absPath}`));
    if (err instanceof Error) console.log(chalk.dim(`  ${err.message}`));
    return;
  }

  // 2. 현재 상태 확인
  const current = await readStore();

  // 3. 머지 시뮬레이션 — 사용자에게 영향 미리 보여주기
  console.log();
  console.log(chalk.bold('  Import 미리보기'));
  console.log();
  console.log(chalk.dim(`  현재: ${current.shortcuts.length}개`));
  console.log(chalk.dim(`  파일: ${imported.shortcuts.length}개`));
  console.log();

  let finalShortcuts: Shortcut[];

  if (strategy === 'replace') {
    finalShortcuts = imported.shortcuts;
    console.log(chalk.yellow('  ⚠ replace 전략: 기존 단축키를 모두 삭제하고 파일 내용으로 교체합니다.'));
    console.log(chalk.dim(`  결과: ${finalShortcuts.length}개`));
  } else {
    // merge — 기존 우선
    const currentNames = new Set(current.shortcuts.map((s) => s.name));
    const additions = imported.shortcuts.filter((s) => !currentNames.has(s.name));
    const skipped = imported.shortcuts.length - additions.length;

    finalShortcuts = [...current.shortcuts, ...additions];

    console.log(chalk.green(`  + 추가: ${additions.length}개`));
    if (additions.length > 0) {
      additions.slice(0, 5).forEach((s) => {
        console.log(chalk.dim(`    • ${s.name}`));
      });
      if (additions.length > 5) {
        console.log(chalk.dim(`    ... 그 외 ${additions.length - 5}개`));
      }
    }

    if (skipped > 0) {
      console.log(chalk.yellow(`  ↩ 건너뜀: ${skipped}개 (이미 같은 이름 존재)`));
    }
    console.log(chalk.dim(`  결과: ${finalShortcuts.length}개`));
  }
  console.log();

  // 4. 사용자 확인
  const confirmed = await p.confirm({
    message: '진행할까요?',
    initialValue: strategy === 'merge', // merge는 안전하니 default Y
  });

  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel('취소되었습니다.');
    return;
  }

  // 5. 저장 + aliases.sh 재생성
  const newStore = { version: 1 as const, shortcuts: finalShortcuts };
  await writeStore(newStore);
  await generateAliasesFile(newStore);

  console.log(
    chalk.green('✓ Import 완료. ') +
      chalk.dim('현재 셸에 즉시 반영하려면: ') +
      chalk.cyan('hareload'),
  );
}
