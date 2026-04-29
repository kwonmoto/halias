import { execSync } from 'node:child_process';
import os from 'node:os';

export type Platform = 'macos' | 'linux' | 'windows' | 'unknown';

export interface PackageManager {
  name: string;
  /** 설치 명령 (예: 'brew install fzf') */
  install: (pkg: string) => string;
  /** sudo 권한이 필요한지 */
  needsSudo: boolean;
  /** CLI가 사용자 동의 후 자동 실행해도 안전한지 (sudo 없는 사용자 영역만 안전) */
  autoSafe: boolean;
}

export function detectPlatform(): Platform {
  switch (process.platform) {
    case 'darwin':
      return 'macos';
    case 'linux':
      return 'linux';
    case 'win32':
      return 'windows';
    default:
      return 'unknown';
  }
}

function commandExists(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * 현재 시스템에서 사용 가능한 첫 번째 패키지 매니저 반환.
 * - macOS: brew 우선
 * - Linux: apt → dnf → pacman 순으로 시도
 * - Windows: winget → scoop 순
 *
 * autoSafe가 true인 매니저만 사용자 동의 후 자동 실행 후보가 됨.
 */
export function detectPackageManager(): PackageManager | null {
  const platform = detectPlatform();

  if (platform === 'macos' && commandExists('brew')) {
    return {
      name: 'Homebrew',
      install: (pkg) => `brew install ${pkg}`,
      needsSudo: false,
      autoSafe: true,
    };
  }

  if (platform === 'linux') {
    if (commandExists('apt')) {
      return {
        name: 'apt',
        install: (pkg) => `sudo apt install -y ${pkg}`,
        needsSudo: true,
        autoSafe: false,
      };
    }
    if (commandExists('dnf')) {
      return {
        name: 'dnf',
        install: (pkg) => `sudo dnf install -y ${pkg}`,
        needsSudo: true,
        autoSafe: false,
      };
    }
    if (commandExists('pacman')) {
      return {
        name: 'pacman',
        install: (pkg) => `sudo pacman -S --noconfirm ${pkg}`,
        needsSudo: true,
        autoSafe: false,
      };
    }
  }

  if (platform === 'windows') {
    if (commandExists('winget')) {
      return {
        name: 'winget',
        install: (pkg) => `winget install ${pkg}`,
        needsSudo: false,
        autoSafe: true,
      };
    }
    if (commandExists('scoop')) {
      return {
        name: 'scoop',
        install: (pkg) => `scoop install ${pkg}`,
        needsSudo: false,
        autoSafe: true,
      };
    }
  }

  return null;
}
