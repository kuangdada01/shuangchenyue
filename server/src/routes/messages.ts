/**
 * ============================================================
 * 私信路由模块 (/api/messages)
 * ============================================================
 * 处理用户之间的私信功能
 *
 * API 端点:
 * - GET    /api/messages/conversations    - 获取会话列表（含最后消息、未读数）
 * - PUT    /api/messages/read             - 标记所有消息为已读
 * - GET    /api/messages/:userId          - 获取与某用户的消息历史
 * - POST   /api/messages                  - 发送消息（文字或图片）
 * - DELETE /api/messages/single/:id       - 撤回单条消息（仅发送者）
 * - DELETE /api/messages/:userId          - 清除与某用户的所有消息
 * ============================================================
 */

import { Router, Request, Response } from 'express';
import path from 'path';
import { PATHS } from '../config';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/error';
import { safeDeleteFile, compressImage } from '../utils';
import { validateBody } from '../validate';
import { notifyUser } from '../sse';
import { sendMessageSchema } from '@shuangchenyue/shared';
import { createUploader, messageFilename } from '../lib/upload';
import * as messageRepo from '../repositories/message.repo';
import * as friendRepo from '../repositories/friend.repo';

const router = Router();

/** 消息图片上传中间件: 限制10MB，仅允许图片 */
const upload = createUploader({
  dir: PATHS.uploads,
  filename: messageFilename,
  maxSize: 10 * 1024 * 1024,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('只能上传图片'));
  },
});

// ============================================================
// 会话端点
// ============================================================

/**
 * GET /api/messages/conversations - 获取会话列表
 *
 * 认证: 必须
 *
 * 返回当前用户的所有对话，按最后消息时间倒序
 * 每个会话包含: 对方用户信息、最后一条消息、未读消息数
 */
router.get('/conversations', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const conversations = messageRepo.listConversations(userId);
  res.json({ conversations });
}));

// ============================================================
// 标记全部已读端点
// ============================================================

/**
 * PUT /api/messages/read - 标记所有消息为已读
 *
 * 认证: 必须
 *
 * 将当前用户收到的所有未读消息标记为已读
 */
router.put('/read', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  messageRepo.markAllRead(userId);
  res.json({ success: true });
}));

// ============================================================
// 消息历史端点
// ============================================================

/**
 * GET /api/messages/:userId - 获取与某用户的消息历史（游标分页）
 *
 * 认证: 必须
 *
 * 查询参数:
 * - limit: 每页数量（默认50，最大100）
 * - before_id: 游标（返回比该消息ID更早的消息，用于向上翻页）
 *
 * 自动将对方发送的未读消息标记为已读
 * 返回按时间正序排列的消息列表 + has_more（是否还有更早的消息）
 */
router.get('/:userId', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const currentUserId = req.user!.id;
  const otherUserId = parseInt(req.params.userId as string);
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 100);
  const beforeId = req.query.before_id ? parseInt(req.query.before_id as string) : undefined;

  const { messages, has_more } = messageRepo.listMessageHistory(currentUserId, otherUserId, limit, beforeId);

  res.json({ messages, has_more });
}));

// ============================================================
// 发送消息端点
// ============================================================

/**
 * POST /api/messages - 发送消息
 *
 * 认证: 必须
 * Content-Type: multipart/form-data
 *
 * 表单字段:
 * - receiverId: 接收者ID
 * - content: 文字内容（可选）
 * - image: 图片文件（可选，10MB限制）
 *
 * 验证:
 * - 不能给自己发消息
 * - 文字和图片至少有一个
 * - 接收者必须存在
 */
router.post('/', authMiddleware, upload.single('image'), validateBody(sendMessageSchema), asyncHandler(async (req: Request, res: Response) => {
  const { receiverId, content, quotedMessageId } = req.body;
  const senderId = req.user!.id;
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

  // 压缩消息图片
  if (req.file) {
    await compressImage(path.join(PATHS.uploads, req.file.filename), { maxWidth: 1280 });
  }

  if ((!content || !content.trim()) && !imageUrl) {
    if (req.file) safeDeleteFile(`/uploads/${req.file.filename}`);
    throw new AppError(400, '请输入消息内容或发送图片');
  }

  if (receiverId === senderId) {
    if (req.file) safeDeleteFile(`/uploads/${req.file.filename}`);
    throw new AppError(400, '不能给自己发消息');
  }

  // 验证接收者存在
  const receiver = friendRepo.userExists(receiverId);
  if (!receiver) {
    if (req.file) safeDeleteFile(`/uploads/${req.file.filename}`);
    throw new AppError(404, '接收人不存在');
  }

  // 验证引用消息存在且属于当前对话
  let quotedId: number | null = null;
  if (quotedMessageId) {
    if (messageRepo.isValidQuotedMessage(quotedMessageId, senderId, receiverId)) {
      quotedId = quotedMessageId;
    }
  }

  const message = messageRepo.insertMessage({
    senderId,
    receiverId,
    content: (content || '').trim(),
    imageUrl,
    quotedMessageId: quotedId,
  });

  res.status(201).json(message);

  // 实时推送：通知接收者和发送者（其他端会话列表实时更新）
  const eventData = { from: senderId, to: receiverId };
  notifyUser(receiverId, 'message', eventData);
  notifyUser(senderId, 'message', eventData);
}));

// ============================================================
// 撤回单条消息端点
// ============================================================

/**
 * DELETE /api/messages/single/:id - 撤回单条消息
 *
 * 认证: 必须
 *
 * 仅消息发送者可以撤回自己的消息
 * 撤回后删除该消息记录
 */
router.delete('/single/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const messageId = parseInt(req.params.id as string);

  const message = messageRepo.getMessageSender(messageId);
  if (!message) {
    throw new AppError(404, '消息不存在');
  }

  if (message.sender_id !== userId) {
    throw new AppError(403, '只能撤回自己发送的消息');
  }

  messageRepo.deleteMessage(messageId);
  res.json({ message: '消息已撤回' });
}));

// ============================================================
// 清除消息端点
// ============================================================

/**
 * DELETE /api/messages/:userId - 清除与某用户的所有消息
 *
 * 认证: 必须
 *
 * 删除双方之间的所有消息记录
 * 注意: 不删除磁盘上的图片文件
 */
router.delete('/:userId', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const currentUserId = req.user!.id;
  const otherUserId = parseInt(req.params.userId as string);

  messageRepo.clearConversation(currentUserId, otherUserId);

  res.json({ message: '消息已清除' });
}));

export default router;
