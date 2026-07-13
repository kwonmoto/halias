import { z } from 'zod';

/**
 * Shortcut 단일 항목 스키마
 *
 * - alias: 단순 명령어 치환 (인자는 $@로 그대로 전달)
 * - function: 인자 가공이 필요한 셸 함수 본문
 */
export const ShortcutSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z_][a-zA-Z0-9_-]*$/, '셸 이름 규칙: 영문/숫자/_/-  첫 글자는 영문 또는 _'),
  command: z.string().min(1),
  type: z.enum(['alias', 'function']),
  description: z.string().optional(),
  /** 인자 완성 후보를 stdout 으로 출력하는 셸 명령 (한 줄에 하나).
   *  설정 시 aliases.sh 에 이 단축키용 탭 완성이 함께 등록됨. ha edit 로 설정. */
  argComplete: z.string().optional(),
  tags: z.array(z.string()).default([]),
  source: z.enum(['personal', 'team']).default('personal'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Shortcut = z.infer<typeof ShortcutSchema>;

export const StoreSchema = z.object({
  version: z.literal(1),
  shortcuts: z.array(ShortcutSchema),
});

export type Store = z.infer<typeof StoreSchema>;

export const EMPTY_STORE: Store = {
  version: 1,
  shortcuts: [],
};
