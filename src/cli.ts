#!/usr/bin/env node
/**
 * halias — shortcut manager
 *
 * 두 가지 진입점이 동일 동작 (package.json의 bin 매핑):
 *   halias add     # 정식 이름
 *   ha add         # 일상 사용용 단축
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { initLocale, t } from './lib/i18n.js';

// package.json 에서 버전을 읽어 단일 소스화 (하드코딩 시 릴리즈마다 어긋남)
const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf-8'),
) as { version: string };
import { runAdd, runAddNonInteractive } from './commands/add.js';
import { runList } from './commands/list.js';
import { runInstall } from './commands/install.js';
import { runRemove } from './commands/remove.js';
import { runSearch } from './commands/search.js';
import { runDoctor } from './commands/doctor.js';
import { runStats } from './commands/stats.js';
import { runEdit } from './commands/edit.js';
import { runExport, runImport } from './commands/export-import.js';
import { runRestore } from './commands/restore.js';
import { runUninstall } from './commands/uninstall.js';
import { runSuggest } from './commands/suggest.js';
import { runRename } from './commands/rename.js';
import { runCompletion } from './commands/completion.js';
import { runTags } from './commands/tags.js';
import { runImportRc } from './commands/import-rc.js';
import { runConfigLang, runConfigEditor } from './commands/config.js';

initLocale();

const program = new Command();

program
  .name('halias')
  .description(t('cli.description'))
  .version(pkg.version);

// 디폴트 액션: 'ha' 만 입력 시 퍼지 검색. --run / --copy 는 선택 후 동작 변경.
program
  .option('--run', t('cli.searchOptRun'))
  .option('--copy', t('cli.searchOptCopy'));
program.action(async () => {
  const opts = program.opts<{ run?: boolean; copy?: boolean }>();
  await runSearch({ run: opts.run, copy: opts.copy });
});

program
  .command('search')
  .alias('s')
  .description(t('cli.search'))
  .option('--run', t('cli.searchOptRun'))
  .option('--copy', t('cli.searchOptCopy'))
  .action(async (options: { run?: boolean; copy?: boolean }) => {
    await runSearch(options);
  });

program
  .command('add [name] [command...]')
  .description(t('cli.add'))
  .option('--last', t('cli.addOptLast'))
  .option('--type <type>', t('cli.addOptType'), 'alias')
  .option('--desc <text>', t('cli.addOptDesc'))
  .option('--tags <tags>', t('cli.addOptTags'))
  .option('--force', t('cli.addOptForce'))
  .action(async (
    name: string | undefined,
    commandParts: string[],
    options: { last?: boolean; type?: string; desc?: string; tags?: string; force?: boolean },
  ) => {
    // 이름 + 명령이 함께 오면 비대화형, 아니면 기존 대화형 플로우
    if (name && commandParts.length > 0) {
      await runAddNonInteractive(name, commandParts, options);
    } else {
      await runAdd({ name, last: options.last });
    }
  });

program
  .command('edit [name]')
  .description(t('cli.edit'))
  .action(async (name?: string) => {
    await runEdit(name);
  });

program
  .command('list')
  .alias('ls')
  .description(t('cli.list'))
  .option('--sort <mode>', t('cli.listOptSort'), 'name')
  .option('--tag <tag>', t('cli.listOptTag'))
  .action(async (options: { sort?: 'name' | 'recent' | 'usage'; tag?: string }) => {
    await runList(options);
  });

program
  .command('rm [name]')
  .alias('remove')
  .description(t('cli.rm'))
  .action(async (name?: string) => {
    await runRemove(name);
  });

program
  .command('install')
  .description(t('cli.install'))
  .action(async () => {
    await runInstall();
  });

program
  .command('doctor')
  .description(t('cli.doctor'))
  .action(async () => {
    await runDoctor();
  });

program
  .command('uninstall')
  .description(t('cli.uninstall'))
  .action(async () => {
    await runUninstall();
  });

program
  .command('stats')
  .description(t('cli.stats'))
  .option('--top <n>', t('cli.statsOptTop'), '10')
  .option('--since <period>', t('cli.statsOptSince'))
  .option('--unused', t('cli.statsOptUnused'))
  .option('--clean', t('cli.statsOptClean'))
  .action(async (options: { top?: string; since?: string; unused?: boolean; clean?: boolean }) => {
    await runStats(options);
  });

program
  .command('unused')
  .description(t('cli.unused'))
  .option('--clean', t('cli.unusedOptClean'))
  .action(async (options: { clean?: boolean }) => {
    await runStats({ unused: true, clean: options.clean });
  });

program
  .command('rename [old] [new]')
  .description(t('cli.rename'))
  .action(async (oldName?: string, newName?: string) => {
    await runRename(oldName, newName);
  });

program
  .command('suggest')
  .description(t('cli.suggest'))
  .option('--top <n>', t('cli.suggestOptTop'), '10')
  .option('--min <n>', t('cli.suggestOptMin'), '3')
  .option('--save', t('cli.suggestOptSave'))
  .action(async (options: { top?: string; min?: string; save?: boolean }) => {
    await runSuggest(options);
  });

program
  .command('export [path]')
  .description(t('cli.export'))
  .action(async (targetPath?: string) => {
    await runExport(targetPath);
  });

program
  .command('import <path>')
  .description(t('cli.import'))
  .option('--strategy <mode>', t('cli.importOptStrategy'), 'merge')
  .action(async (filePath: string, options: { strategy?: 'merge' | 'replace' }) => {
    await runImport(filePath, options);
  });

program
  .command('restore')
  .description(t('cli.restore'))
  .action(async () => {
    await runRestore();
  });

program
  .command('tags [tag]')
  .description(t('cli.tags'))
  .action(async (tag?: string) => {
    await runTags(tag);
  });

program
  .command('config')
  .description(t('cli.config'))
  .addCommand(
    new Command('lang')
      .description(t('cli.configLang'))
      .argument('[value]', t('cli.configLangArg'))
      .action(async (value?: string) => {
        await runConfigLang(value);
      })
  )
  .addCommand(
    new Command('editor')
      .description(t('cli.configEditor'))
      .argument('[value]', t('cli.configEditorArg'))
      .action(async (value?: string) => {
        await runConfigEditor(value);
      })
  );

program
  .command('import-rc [file]')
  .description(t('cli.importRc'))
  .action(async (file?: string) => {
    await runImportRc(file);
  });

program
  .command('completion [shell]')
  .description(t('cli.completion'))
  .action((shell?: string) => {
    runCompletion(shell);
  });

program.parseAsync().catch((err) => {
  console.error(chalk.red(t('cli.error')) + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
