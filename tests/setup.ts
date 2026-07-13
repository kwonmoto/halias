import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';

/**
 * 테스트 전역 셋업 — HOME 을 임시 디렉토리로 격리.
 *
 * paths.ts 가 모듈 로드 시점에 os.homedir() 를 읽으므로, 테스트 파일이
 * import 되기 전(이 파일)에 HOME 을 바꿔야 실제 ~/.halias 를 건드리지 않는다.
 * POSIX 에서 os.homedir() 는 process.env.HOME 을 우선 사용.
 */
const testHome = mkdtempSync(path.join(os.tmpdir(), 'halias-test-'));
process.env.HOME = testHome;

afterAll(() => {
  rmSync(testHome, { recursive: true, force: true });
});
