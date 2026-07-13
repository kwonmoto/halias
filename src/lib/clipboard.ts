import { spawnSync } from 'node:child_process';

/**
 * OS별 클립보드 명령 후보. 앞에서부터 시도해 처음 성공하는 걸 사용.
 * - macOS: pbcopy (기본 탑재)
 * - Linux: wl-copy (Wayland) → xclip → xsel 순
 */
const CANDIDATES: string[][] =
  process.platform === 'darwin'
    ? [['pbcopy']]
    : [
        ['wl-copy'],
        ['xclip', '-selection', 'clipboard'],
        ['xsel', '--clipboard', '--input'],
      ];

/** 텍스트를 시스템 클립보드에 복사. 사용 가능한 도구가 없으면 false. */
export function copyToClipboard(text: string): boolean {
  for (const [cmd, ...args] of CANDIDATES) {
    if (!cmd) continue;
    const result = spawnSync(cmd, args, { input: text });
    if (result.status === 0) return true;
  }
  return false;
}
