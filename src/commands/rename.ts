import * as p from '@clack/prompts';
import chalk from 'chalk';
import { readStore, writeStore } from '../core/store.js';
import { generateAliasesFile } from '../core/generator.js';
import { ShortcutSchema } from '../core/types.js';

/**
 * ha rename <old> <new> — 단축키 이름만 빠르게 변경.
 *
 * 전체 편집 폼 없이 이름 하나만 바꾸는 단축 경로.
 * old/new 미지정 시 각각 프롬프트로 입력받음.
 */
export async function runRename(oldName?: string, newName?: string): Promise<void> {
  const store = await readStore();

  if (store.shortcuts.length === 0) {
    console.log(chalk.dim('등록된 단축키가 없습니다.'));
    return;
  }

  // old name — 미지정 시 선택
  let from = oldName;
  if (!from) {
    const selected = await p.select({
      message: '이름을 바꿀 단축키 선택',
      options: store.shortcuts.map((s) => ({
        value: s.name,
        label: s.name,
        hint: s.type === 'alias' ? s.command : '<function>',
      })),
    });
    if (p.isCancel(selected)) {
      p.cancel('취소되었습니다.');
      return;
    }
    from = selected as string;
  }

  const target = store.shortcuts.find((s) => s.name === from);
  if (!target) {
    console.log(chalk.red(`단축키를 찾을 수 없습니다: ${from}`));
    return;
  }

  // new name — 미지정 시 입력
  let to = newName;
  if (!to) {
    const otherNames = new Set(store.shortcuts.filter((s) => s.name !== from).map((s) => s.name));
    const input = await p.text({
      message: `새 이름 (현재: ${chalk.cyan(from)})`,
      validate: (v) => {
        if (!v) return '이름을 입력해주세요';
        if (v === from) return '현재 이름과 같습니다';
        if (otherNames.has(v)) return `이미 존재하는 단축키: ${v}`;
        const parsed = ShortcutSchema.shape.name.safeParse(v);
        if (!parsed.success) return parsed.error.issues[0]?.message ?? '잘못된 형식';
        return undefined;
      },
    });
    if (p.isCancel(input)) {
      p.cancel('취소되었습니다.');
      return;
    }
    to = input as string;
  } else {
    // 인자로 받은 경우 검증
    const otherNames = new Set(store.shortcuts.filter((s) => s.name !== from).map((s) => s.name));
    if (to === from) {
      console.log(chalk.yellow('현재 이름과 같습니다.'));
      return;
    }
    if (otherNames.has(to)) {
      console.log(chalk.red(`이미 존재하는 단축키: ${to}`));
      return;
    }
    const parsed = ShortcutSchema.shape.name.safeParse(to);
    if (!parsed.success) {
      console.log(chalk.red(parsed.error.issues[0]?.message ?? '잘못된 이름 형식'));
      return;
    }
  }

  store.shortcuts = store.shortcuts.map((s) =>
    s.name === from ? { ...s, name: to as string, updatedAt: new Date().toISOString() } : s,
  );
  await writeStore(store);
  await generateAliasesFile(store);

  console.log(chalk.green(`✓ ${from} → ${to}`));
  console.log('  ' + chalk.dim('현재 셸에 즉시 반영하려면: ') + chalk.cyan('hareload'));
}
