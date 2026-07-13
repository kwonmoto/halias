import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** .zshrc 등에 들어가는 halias 관리 블록의 시작 마커. 절대 변경 금지 (CLAUDE.md 참고). */
export const HALIAS_MARKER = '# >>> halias shortcuts >>>';

const RC_CANDIDATES = ['.zshrc', '.bashrc', '.bash_profile'];

/** 셸 통합(ha install)이 설치되어 있는지 — rc 파일에서 마커 존재 확인. */
export async function isShellIntegrationInstalled(): Promise<boolean> {
  const home = os.homedir();
  for (const file of RC_CANDIDATES) {
    try {
      const content = await fs.readFile(path.join(home, file), 'utf-8');
      if (content.includes(HALIAS_MARKER)) return true;
    } catch {
      // 파일 없음 — skip
    }
  }
  return false;
}
