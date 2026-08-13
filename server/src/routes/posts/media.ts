/**
 * ============================================================
 * 帖子路由（/api/posts）- 视频上传与临时文件管理
 * ============================================================
 */

import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { PATHS } from '../../config';
import { authMiddleware } from '../../middleware/auth';
import { asyncHandler, AppError } from '../../middleware/error';
import { safeDeleteFile, compressImage, withImages } from '../../utils';
import { ensurePlayableVideo } from '../../video';
import { createUploader, timestampFilename } from '../../lib/upload';
import * as postRepo from '../../repositories/post.repo';

const router = Router();

/** 图片压缩参数（封面最大1920px，质量80） */
const POST_IMAGE_MAX = 1920;

/** 允许的视频扩展名 */
const VIDEO_EXTS = ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.flv', '.wmv'];

/**
 * 视频上传中间件: 限制100MB
 * fileFilter 在白名单内才落盘，拒绝的文件不写入磁盘
 * 按字段区分: video 字段仅接受视频，cover 字段接受图片封面
 */
const videoUpload = createUploader({
  dir: PATHS.uploads,
  filename: timestampFilename('post'),
  maxSize: 100 * 1024 * 1024,
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.fieldname === 'cover') {
      const imageAllowed = /jpeg|jpg|png|gif|webp/;
      if (imageAllowed.test(ext) || file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('仅支持 jpg/png/gif/webp 格式的封面图片'));
      }
      return;
    }
    if (file.mimetype.startsWith('video/') || VIDEO_EXTS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('仅支持视频格式文件'));
    }
  },
});

/**
 * 临时视频存储: 选择视频后立即上传到 uploads/temp/ 用于预览（HTTP Range 播放），
 * 发布时再移动到 uploads/ 正式目录。部分浏览器/WebView 加载 blob: 视频会卡死，
 * HTTP URL 与信息流视频走同一套可靠的 Range 请求通道。
 */
const videoTempUpload = createUploader({
  dir: PATHS.uploadsTemp,
  filename: timestampFilename('temp'),
  maxSize: 100 * 1024 * 1024,
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.mimetype.startsWith('video/') || VIDEO_EXTS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('仅支持视频格式文件'));
    }
  },
});

/** 临时视频文件名白名单: temp-{时间戳}-{随机数}.{扩展名} */
const TEMP_VIDEO_NAME_RE = /^temp-\d+-\d+\.[a-zA-Z0-9]+$/;

/** 启动时清理超过 24 小时未发布的临时视频文件 */
(() => {
  try {
    const tempDir = PATHS.uploadsTemp;
    if (!fs.existsSync(tempDir)) return;
    const cutoff = Date.now() - 24 * 3600 * 1000;
    for (const name of fs.readdirSync(tempDir)) {
      const p = path.join(tempDir, name);
      try {
        const st = fs.statSync(p);
        if (st.isFile() && st.mtimeMs < cutoff) fs.unlinkSync(p);
      } catch { /* 忽略单个文件错误 */ }
    }
  } catch { /* 忽略 */ }
})();

/**
 * POST /api/posts/video-temp - 上传视频到临时目录（发布前预览）
 *
 * 认证: 必须
 * Content-Type: multipart/form-data
 *
 * 表单字段:
 * - video: 视频文件（100MB限制）
 *
 * 成功响应 (201): { url: '/uploads/temp/xxx.mp4' }
 */
router.post('/video-temp', authMiddleware, videoTempUpload.single('video'), asyncHandler(async (req: Request, res: Response) => {
  const videoFile = req.file;
  if (!videoFile) {
    throw new AppError(400, '请选择视频');
  }

  // 拒绝过小/被截断的视频文件（如云端文件只上传了文件头）
  if (videoFile.size < 1024) {
    safeDeleteFile(`/uploads/temp/${videoFile.filename}`, 'uploads');
    throw new AppError(400, '视频文件无效或不完整，请重新选择后再发布');
  }

  // 转码为浏览器通用格式（H.264 mp4），保证预览可播放
  const finalName = await ensurePlayableVideo(
    path.join(PATHS.uploadsTemp, videoFile.filename),
    videoFile.filename
  );

  res.status(201).json({ url: `/uploads/temp/${finalName}` });
}));

/**
 * DELETE /api/posts/video-temp - 删除临时视频（放弃发布时清理）
 *
 * 请求体: { url: '/uploads/temp/xxx.mp4' }
 */
router.delete('/video-temp', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const url = typeof req.body?.url === 'string' ? req.body.url : '';
  const name = path.basename(url);
  if (!TEMP_VIDEO_NAME_RE.test(name)) {
    throw new AppError(400, '无效的视频引用');
  }
  safeDeleteFile(`/uploads/temp/${name}`, 'uploads');
  res.json({ ok: true });
}));

/**
 * POST /api/posts/video - 创建视频帖子
 *
 * 认证: 必须
 * Content-Type: multipart/form-data
 *
 * 表单字段:
 * - video: 视频文件（100MB限制，未使用临时上传时）
 * - video_url: 临时视频路径（选择视频时已上传，发布时移动为正式文件）
 * - cover: 视频封面图片（可选）
 * - description: 描述（可选）
 * - close_comments: 是否关闭评论
 *
 * 成功响应 (201): 创建的帖子对象
 */
const videoFields = videoUpload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'cover', maxCount: 1 },
]);
router.post('/video', authMiddleware, videoFields, asyncHandler(async (req: Request, res: Response) => {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };
  const uploadedVideo = files?.video?.[0];
  const coverFile = files?.cover?.[0];
  const videoUrlField = typeof req.body.video_url === 'string' ? req.body.video_url.trim() : '';

  let videoUrl: string;

  if (videoUrlField) {
    // 使用选择视频时已上传的临时文件，移动到正式目录
    const name = path.basename(videoUrlField);
    if (!TEMP_VIDEO_NAME_RE.test(name)) {
      throw new AppError(400, '无效的视频引用');
    }
    const tempPath = path.join(PATHS.uploadsTemp, name);
    const finalPath = path.join(PATHS.uploads, name);
    if (!fs.existsSync(tempPath)) {
      throw new AppError(400, '视频已失效，请重新选择视频');
    }
    fs.renameSync(tempPath, finalPath);
    videoUrl = `/uploads/${name}`;
  } else {
    if (!uploadedVideo) {
      throw new AppError(400, '请选择视频');
    }

    // 二次验证视频文件类型（防御性检查，fileFilter 已拦截大部分非法文件）
    const videoExt = path.extname(uploadedVideo.originalname).toLowerCase();
    if (!uploadedVideo.mimetype.startsWith('video/') && !VIDEO_EXTS.includes(videoExt)) {
      // 删除已上传的文件
      safeDeleteFile(`/uploads/${uploadedVideo.filename}`, 'uploads');
      throw new AppError(400, '仅支持视频格式文件');
    }

    // 拒绝过小/被截断的视频文件（如云端文件只上传了文件头）
    if (uploadedVideo.size < 1024) {
      safeDeleteFile(`/uploads/${uploadedVideo.filename}`, 'uploads');
      if (coverFile) safeDeleteFile(`/uploads/${coverFile.filename}`, 'uploads');
      throw new AppError(400, '视频文件无效或不完整，请重新选择后再发布');
    }

    // 转码为浏览器通用格式（H.264 mp4）
    const finalVideoName = await ensurePlayableVideo(
      path.join(PATHS.uploads, uploadedVideo.filename),
      uploadedVideo.filename
    );
    videoUrl = `/uploads/${finalVideoName}`;
  }

  // 压缩封面图（如有）
  if (coverFile) {
    await compressImage(path.join(PATHS.uploads, coverFile.filename), { maxWidth: POST_IMAGE_MAX });
  }

  const videoCover = coverFile ? `/uploads/${coverFile.filename}` : null;
  const description = req.body.description || '';
  const closeComments = req.body.close_comments === '1' ? 1 : 0;
  const pinned = req.body.pinned === '1' ? 1 : 0;

  const post = postRepo.createVideoPost({
    userId: req.user!.id,
    videoUrl,
    videoCover,
    description,
    closeComments,
    pinned,
  });

  res.status(201).json(withImages(post));
}));

export default router;
