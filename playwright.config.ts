/**
 * Playwright E2E 冒烟测试配置
 * - webServer: 构建全部包并在 3200 端口启动编译产物（独立端口，不打扰开发服务）
 * - 仅执行公开只读流程，不写入数据库
 */

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3200',
    locale: 'zh-CN',
  },
  webServer: {
    command: 'npm run build && node server/dist/index.js',
    url: 'http://localhost:3200/api/health',
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      PORT: '3200',
      NODE_ENV: 'test',
    },
  },
});
