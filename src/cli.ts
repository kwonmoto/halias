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
import { initLocale, t } from './lib/i18n.js';
import { runAdd } from './commands/add.js';
import { runList } from './commands/list.js';
import { runInstall } from './commands/install.js';
import { runRemove } from './commands/remove.js';
import { runSearch } from './commands/search.js';
import { runDoctor } from './commands/doctor.js';
import { runStats } from './commands/stats.js';
import { runEdit } from './commands/edit.js';
import { runExport, runImport } from './commands/export-import.js';
import { runSuggest } from './commands/suggest.js';
import { runRename } from './commands/rename.js';
import { runCompletion } from './commands/completion.js';
import { runTags } from './commands/tags.js';
import { runImportRc } from './commands/import-rc.js';
import { runConfigLang } from './commands/config.js';

initLocale();

const program = new Command();

program
  .name('halias')
  .description(t('cli.description'))
  .version('0.2.0');

// 디폴트 액션: 'ha' 만 입력 시 퍼지 검색.
program.action(async () => {
  await runSearch();
});

program
  .command('search')
  .alias('s')
  .description(t('cli.search'))
  .action(async () => {
    await runSearch();
  });

program
  .command('add [name]')
  .description(t('cli.add'))
  .option('--last', t('cli.addOptLast'))
  .action(async (name: string | undefined, options: { last?: boolean }) => {
    await runAdd({ name, last: options.last });
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
