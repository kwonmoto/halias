import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as p from '@clack/prompts';
import chalk from 'chalk';
import { readStore, addShortcut } from '../core/store.js';
import { generateAliasesFile } from '../core/generator.js';
import type { Shortcut } from '../core/types.js';
import { t } from '../lib/i18n.js';

interface ParsedEntry {
  name: string;
  command: string;
  type: 'alias' | 'function';
  line: number;
}

/**
 * ha import-rc [file] — 셸 rc 파일에서 alias / 단순 function 을 읽어 halias 로 가져옴.
 *
 * 파싱 대상:
 *   alias NAME="COMMAND"
 *   alias NAME='COMMAND'
 *   NAME() { BODY; }   (한 줄 함수)
 *   function NAME() { BODY; }  (한 줄 함수)
 *
 * 멀티라인 함수는 본문이 복잡해 파싱 생략 — 한 줄 형태만 지원.
 */
export async function runImportRc(filePath?: string): Promise<void> {
  const rcFile = filePath ?? detectRcFile();

  p.intro(chalk.bgCyan.black(t('importRc.intro')));
  p.log.info(chalk.dim(`${t('importRc.reading')} ${chalk.cyan(rcFile)}`));

  let content: string;
  try {
    content = await fs.readFile(rcFile, 'utf-8');
  } catch {
    p.log.error(t('importRc.readError', { file: rcFile }));
    return;
  }

  const parsed = parseRcFile(content);

  if (parsed.length === 0) {
    p.outro(chalk.dim(t('importRc.noneFound')));
    return;
  }

  const store = await readStore();
  const existingNames = new Set(store.shortcuts.map((s) => s.name));

  // 이미 halias 에 있는 항목 분리
  const newEntries = parsed.filter((e) => !existingNames.has(e.name));
  const alreadyImported = parsed.filter((e) => existingNames.has(e.name));

  console.log();
  console.log(chalk.bold(`  ${t('importRc.foundHeader', { count: String(parsed.length) })}`));
  if (alreadyImported.length > 0) {
    console.log(chalk.dim(`  ${t('importRc.alreadyExists', { count: String(alreadyImported.length) })}`));
  }
  console.log();

  if (newEntries.length === 0) {
    p.outro(chalk.dim(t('importRc.allAlreadyImported')));
    return;
  }

  if (!process.stdin.isTTY) {
    console.log(chalk.yellow(`  ${t('importRc.notTTY')}`));
    return;
  }

  const options = newEntries.map((e) => ({
    value: e.name,
    label: e.name,
    hint: `${e.type.padEnd(8)} ${truncate(e.command, 50)}`,
  }));

  const selected = await p.multiselect({
    message: t('importRc.selectPrompt'),
    options,
    required: false,
  });

  if (p.isCancel(selected)) {
    p.cancel(t('importRc.cancelled'));
    return;
  }

  const names = selected as string[];
  if (names.length === 0) {
    p.outro(chalk.dim(t('importRc.noneSelected')));
    return;
  }

  const confirm = await p.confirm({
    message: t('importRc.confirmPrompt', { count: String(names.length) }),
    initialValue: true,
  });

  if (p.isCancel(confirm) || !confirm) {
    p.cancel(t('importRc.cancelled'));
    return;
  }

  const selectedEntries = newEntries.filter((e) => names.includes(e.name));
  const now = new Date().toISOString();
  let saved = 0;

  for (const entry of selectedEntries) {
    const shortcut: Shortcut = {
      name: entry.name,
      command: entry.command,
      type: entry.type,
      tags: [],
      source: 'personal',
      createdAt: now,
      updatedAt: now,
    };
    await addShortcut(shortcut);
    saved++;
  }

  const updatedStore = await readStore();
  await generateAliasesFile(updatedStore);

  p.outro(
    chalk.green(`✓ ${t('importRc.done', { count: String(saved) })}`) +
      '\n\n  ' +
      chalk.dim(t('importRc.reloadHint')) +
      chalk.cyan(t('common.hareload')),
  );
}

/** ~/.zshrc 또는 ~/.bash_profile 등 rc 파일 자동 감지 */
function detectRcFile(): string {
  const shell = process.env.SHELL ?? '';
  const home = os.homedir();
  if (shell.includes('zsh')) return path.join(home, '.zshrc');
  if (shell.includes('bash')) {
    return path.join(home, process.platform === 'darwin' ? '.bash_profile' : '.bashrc');
  }
  return path.join(home, '.zshrc');
}

/**
 * rc 파일 내용을 파싱해서 alias / 한 줄 function 목록 반환.
 *
 * 파싱 규칙:
 *   alias NAME="..." / alias NAME='...'
 *   NAME() { ...; }  (한 줄, 선택적 function 키워드)
 */
function parseRcFile(content: string): ParsedEntry[] {
  const results: ParsedEntry[] = [];
  const lines = content.split('\n');

  // halias 마커 블록 내부는 건너뜀
  let insideHaliasBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const line = raw.trim();

    if (line.startsWith('# >>> halias')) { insideHaliasBlock = true; continue; }
    if (line.startsWith('# <<< halias')) { insideHaliasBlock = false; continue; }
    if (insideHaliasBlock) continue;
    if (line.startsWith('#') || line === '') continue;

    const aliasEntry = parseAliasLine(line, i + 1);
    if (aliasEntry) { results.push(aliasEntry); continue; }

    const fnEntry = parseSingleLineFn(line, i + 1);
    if (fnEntry) results.push(fnEntry);
  }

  return results;
}

/** `alias NAME="COMMAND"` 파싱 */
function parseAliasLine(line: string, lineNum: number): ParsedEntry | null {
  // alias NAME="VALUE" or alias NAME='VALUE'
  const m = line.match(/^alias\s+([A-Za-z_][A-Za-z0-9_-]*)=(['"])(.*)\2\s*$/);
  if (!m) return null;
  const [, name, , command] = m;
  if (!name || !command) return null;
  return { name, command, type: 'alias', line: lineNum };
}

/**
 * 한 줄 function 파싱:
 *   NAME() { BODY; }
 *   function NAME() { BODY; }
 *   NAME() { BODY }
 */
function parseSingleLineFn(line: string, lineNum: number): ParsedEntry | null {
  // function NAME() { ... } 또는 NAME() { ... }
  const m = line.match(/^(?:function\s+)?([A-Za-z_][A-Za-z0-9_-]*)\s*\(\s*\)\s*\{(.+)\}\s*$/);
  if (!m) return null;
  const [, name, bodyRaw] = m;
  if (!name || !bodyRaw) return null;

  // _halias_track 이 있는 함수는 이미 halias 생성 함수 — 건너뜀
  if (bodyRaw.includes('_halias_track')) return null;

  const body = bodyRaw
    .trim()
    .replace(/;\s*$/, '')  // 마지막 세미콜론 제거
    .trim();

  if (!body) return null;
  return { name, command: body, type: 'function', line: lineNum };
}

function truncate(str: string, max: number): string {
  return str.length <= max ? str : str.slice(0, max - 1) + '…';
}
