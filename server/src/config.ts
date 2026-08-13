/**
 * ============================================================
 * 服务端配置模块（环境变量校验 + 统一路径常量）
 * ============================================================
 * - 用 zod 在启动时校验环境变量，配置错误立即失败（fail fast）
 * - PATHS 集中管理所有磁盘路径，杜绝散落的
 *   path.join(__dirname, '..', '..', ...) 拼接（src/dist 路径差异是已知坑）
 *
 * 注意: 本模块必须在 dotenv.config() 之后首次被 import（index.ts 已保证）。
 */

import path from 'path';
import { z } from 'zod';

/** 环境变量 schema（宽松默认值 + 生产关键项由 middleware/auth.ts 单独强校验） */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  JWT_SECRET: z.string().optional(),
  ALLOWED_ORIGINS: z.string().optional(),
  ADMIN_EMAIL: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  FFMPEG_PATH: z.string().optional(),
  FFPROBE_PATH: z.string().optional(),
});

/** 校验并导出环境变量（启动时执行一次） */
export const env = envSchema.parse(process.env);

// ============================================================
// 路径常量
// ============================================================

/** server 目录（本文件位于 src/config.ts，'..' 即 server 根；编译到 dist/ 后同理） */
export const SERVER_ROOT = path.join(__dirname, '..');

export const PATHS = {
  /** 上传文件根目录: server/uploads */
  uploads: path.join(SERVER_ROOT, 'uploads'),
  /** 临时视频目录: server/uploads/temp（发布前预览） */
  uploadsTemp: path.join(SERVER_ROOT, 'uploads', 'temp'),
  /** 头像目录: server/uploads/avatars */
  avatars: path.join(SERVER_ROOT, 'uploads', 'avatars'),
  /** 图书数据目录: server/books */
  books: path.join(SERVER_ROOT, 'books'),
  /** 数据库文件: server/mimo.db */
  db: path.join(SERVER_ROOT, 'mimo.db'),
  /** 前端构建产物目录: client/dist */
  clientDist: path.join(SERVER_ROOT, '..', 'client', 'dist'),
  /** 音乐目录: client/public/music */
  music: path.join(SERVER_ROOT, '..', 'client', 'public', 'music'),
  /** .env 文件位置: 项目根目录 */
  envFile: path.join(SERVER_ROOT, '..', '.env'),
} as const;
