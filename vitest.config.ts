import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // HOME 을 process.env 로 격리하므로 파일 간 공유 프로세스 금지
    pool: 'forks',
  },
});
