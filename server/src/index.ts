/**
 * ============================================================
 * MIMO 服务器入口文件
 * ============================================================
 * 仅负责 bootstrap:
 * 1. 加载 .env
 * 2. 创建 Express 应用（app.ts 组装中间件与路由）
 * 3. 启动 HTTP 服务器（默认端口 3000）
 */

import dotenv from 'dotenv';
import path from 'path';

// 加载 .env 文件（从项目根目录）
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { env } from './config';
import { createApp } from './app';

const PORT = env.PORT;
const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`Mimo server running on http://localhost:${PORT}`);
});

// 大视频上传 + ffmpeg 转码可能耗时较长，禁用请求超时（Node 默认 5 分钟）
server.requestTimeout = 0;
server.headersTimeout = 0;
