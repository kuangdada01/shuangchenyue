/**
 * ============================================================
 * SSE 事件流路由 (/api/events)
 * ============================================================
 * 通过 token 查询参数认证（EventSource 无法自定义请求头）
 * 推送事件: message（新私信）、notification（新通知）、announcement（新公告）
 */

import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { subscribe } from '../sse';
import { JWT_SECRET } from '../middleware/auth';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const token = req.query.token as string | undefined;
  if (!token) {
    res.status(401).json({ error: '未提供 token' });
    return;
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: number };
    subscribe(decoded.id, res);
  } catch {
    res.status(401).json({ error: '无效 token' });
  }
});

export default router;
