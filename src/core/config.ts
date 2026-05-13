import { readFileSync, writeFileSync } from 'node:fs';
import { CONFIG_PATH } from '../lib/paths.js';

interface HaliasConfig {
  /** 함수 본문 편집에 사용할 에디터 바이너리 (예: 'code', 'vim') */
  editor?: string;
}

function readConfig(): HaliasConfig {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as HaliasConfig;
  } catch {
    return {};
  }
}

function writeConfig(config: HaliasConfig): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

export function getConfiguredEditor(): string | undefined {
  return readConfig().editor;
}

export function saveConfiguredEditor(editor: string): void {
  const config = readConfig();
  writeConfig({ ...config, editor });
}
