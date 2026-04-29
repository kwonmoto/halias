import os from 'node:os';
import path from 'node:path';

export const HALIAS_HOME = path.join(os.homedir(), '.halias');
export const STORE_PATH = path.join(HALIAS_HOME, 'shortcuts.json');
export const STATS_LOG_PATH = path.join(HALIAS_HOME, 'stats.log');
export const GENERATED_DIR = path.join(HALIAS_HOME, 'generated');
export const ALIASES_OUTPUT = path.join(GENERATED_DIR, 'aliases.sh');
