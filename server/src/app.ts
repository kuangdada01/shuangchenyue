/**
 * ============================================================
 * Express 应用组装模块（app）
 * ============================================================
 * 组装中间件、路由与静态文件服务；与 index.ts 分离后可直接
 * 以 supertest 或注入依赖的方式测试，无需监听端口。
 */

import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import path from 'path';
import { env, PATHS } from './config';
import { corsMiddleware } from './middleware/cors';
import { errorHandler } from './middleware/error';

// ============================================================
// 路由模块导入
// ============================================================
import authRoutes from './routes/auth';             // 认证路由: /api/auth
import postRoutes from './routes/posts';            // 帖子路由: /api/posts
import userRoutes from './routes/users';            // 用户路由: /api/users
import messageRoutes from './routes/messages';      // 私信路由: /api/messages
import friendRoutes from './routes/friends';        // 好友路由: /api/friends
import notificationRoutes from './routes/notifications'; // 通知路由: /api/notifications
import adminRoutes from './routes/admin';           // 管理路由: /api/admin
import announcementRoutes from './routes/announcements'; // 公告路由: /api/announcements
import bookRoutes from './routes/books';            // 图书路由: /api/books
import musicRoutes from './routes/music';           // 音乐列表: /api/music
import eventRoutes from './routes/events';          // SSE 事件流: /api/events

export function createApp(): express.Express {
  const app = express();

  // 站点经 nginx 反向代理（请求均来自本机 127.0.0.1），
  // 信任 loopback 代理使 req.ip 正确解析 X-Forwarded-For，
  // 同时避免 express-rate-limit 因 X-Forwarded-For 头报错
  app.set('trust proxy', 'loopback');

  // ============================================================
  // 全局中间件配置
  // ============================================================

  /** CORS（语义与原手写中间件完全一致，见 middleware/cors.ts） */
  app.use(corsMiddleware);

  /** 安全响应头（helmet）
   * 注意: 站点当前通过 HTTP 提供服务（无 TLS），必须移除默认 CSP 中的
   * upgrade-insecure-requests，否则浏览器会把所有资源请求升级为 HTTPS
   * 导致资源加载失败、页面白屏。
   */
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'upgrade-insecure-requests': null,
        'script-src': ["'self'", "'sha256-v5bVaFQO+UhGE6aDcmlclP7lRfBTMRh+5BgGwwfhAuo='"],
        // blob: 用于视频封面/头像等本地文件预览（URL.createObjectURL），
        // 默认 CSP 仅允许 'self'，会拦截 blob 视频导致黑屏/无法解码
        'media-src': ["'self'", 'blob:'],
        'img-src': ["'self'", 'data:', 'blob:'],
      },
    },
  }));

  /** 请求日志（结构化 pino，生产 JSON / 开发可读） */
  app.use(pinoHttp({
    transport: env.NODE_ENV === 'production' ? undefined : {
      target: 'pino-pretty',
      options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
    },
  }));

  /** JSON 请求体解析（限制默认100kb） */
  app.use(express.json());

  /** URL 编码请求体解析（支持表单数据） */
  app.use(express.urlencoded({ extended: true }));

  /** 静态文件服务: /uploads 路径映射到 server/uploads 目录（缓存7天） */
  app.use('/uploads', express.static(PATHS.uploads, {
    maxAge: '7d',
    immutable: false,
  }));

  // ============================================================
  // API 路由注册
  // ============================================================

  app.use('/api/auth', authRoutes);                  // 认证: 注册、登录、获取当前用户
  app.use('/api/posts', postRoutes);                 // 帖子: CRUD、点赞、评论
  app.use('/api/users', userRoutes);                 // 用户: 资料、头像、私密图片
  app.use('/api/messages', messageRoutes);           // 私信: 会话列表、消息收发
  app.use('/api/friends', friendRoutes);             // 好友: 关注、搜索、推荐
  app.use('/api/notifications', notificationRoutes); // 通知: 评论/回复通知
  app.use('/api/admin', adminRoutes);                // 管理: 用户/帖子/公告管理
  app.use('/api/announcements', announcementRoutes); // 公告: 查看公告、标记已读
  app.use('/api/books', bookRoutes);                 // 图书: 书籍列表、详情、章节内容
  app.use('/api/music', musicRoutes);                // 音乐: 音乐文件列表
  app.use('/api/events', eventRoutes);               // SSE: 实时事件流

  // ============================================================
  // 健康检查端点
  // ============================================================

  /**
   * GET /api/health - 服务器健康检查
   * 用于监控服务是否正常运行
   */
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ============================================================
  // 生产环境静态文件服务
  // ============================================================

  /** 前端构建产物目录: client/dist */
  const clientDist = PATHS.clientDist;

  /** 判断是否为 Vite 构建的带哈希文件名（可长缓存，immutable） */
  const HASHED_ASSET_RE = /[a-zA-Z0-9_-]{8,}\.(js|css|woff2?|ttf|png|jpe?g|gif|svg|webp)$/;

  /**
   * 提供前端静态文件（HTML、CSS、JS、图片等）
   * - HTML: 不缓存，确保总是获取最新版本
   * - 带哈希的构建产物: 长缓存（1年，immutable）
   * - 其他（音乐、静态资源）: 缓存1小时
   */
  app.use(express.static(clientDist, {
    setHeaders: (res, path) => {
      if (path.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      } else if (HASHED_ASSET_RE.test(path)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }
    }
  }));

  /** 未知 API 路径返回 404 JSON（而不是 SPA 的 index.html） */
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: '接口不存在' });
  });

  /**
   * SPA 路由回退（Express 4 通配符语法）
   * 所有未匹配 API 的请求都返回 index.html
   * 由前端路由（react-router-dom）处理具体页面
   */
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });

  // ============================================================
  // 全局错误处理中间件
  // ============================================================

  /**
   * 统一错误处理（实现见 middleware/error.ts）
   * 捕获所有未处理的错误，对外不泄露内部实现细节
   */
  app.use(errorHandler);

  return app;
}
