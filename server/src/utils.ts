/**
 * ============================================================
 * 服务端共享工具函数
 * ============================================================
 */

import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { SERVER_ROOT } from './config';

/**
 * 解析帖子图片URL（JSON字符串 → 数组）
 * 兼容旧格式（单个URL字符串）和新格式（JSON数组）
 *
 * @param imageUrl - 数据库中存储的 image_url 字段
 * @returns 图片URL数组
 */
export function parseImageUrls(imageUrl: string): string[] {
  try {
    const parsed = JSON.parse(imageUrl);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    return [imageUrl];
  } catch {
    return [imageUrl];
  }
}

/**
 * 为帖子对象添加 images 数组字段
 * 不修改原对象，返回新对象
 *
 * @param post - 数据库查询返回的帖子对象
 * @returns 添加了 images 字段的新对象
 */
export function withImages<T extends { image_url: string }>(post: T | null): (T & { images: string[] }) | null {
  if (!post) return null;
  return { ...post, images: parseImageUrls(post.image_url) };
}

/**
 * Multer 图片文件过滤器
 * 仅允许 jpg/png/gif/webp 格式
 */
export function imageFileFilter(_req: Express.Request, file: Express.Multer.File, cb: (error: Error | null, acceptFile?: boolean) => void) {
  const allowed = /jpeg|jpg|png|gif|webp/;
  const ext = allowed.test(path.extname(file.originalname).toLowerCase());
  const mime = allowed.test(file.mimetype);
  if (ext && mime) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (jpg, png, gif, webp) are allowed'));
  }
}

/**
 * 压缩/限制尺寸图片（原地覆盖）
 * - 按 EXIF 自动旋转
 * - 最长边限制 maxWidth（不放大原图）
 * - JPEG/WebP/PNG 重编码压缩；GIF 动图跳过（保留动画）
 * 失败时不影响原文件（非致命错误）
 */
export async function compressImage(
  filePath: string,
  options: { maxWidth?: number; quality?: number } = {}
): Promise<void> {
  const { maxWidth = 1920, quality = 80 } = options;
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.gif') return;

  try {
    const tmpPath = `${filePath}.tmp-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    let pipeline = sharp(filePath).rotate().resize({ width: maxWidth, withoutEnlargement: true });
    if (ext === '.png') {
      pipeline = pipeline.png({ quality, compressionLevel: 9 });
    } else if (ext === '.webp') {
      pipeline = pipeline.webp({ quality });
    } else {
      pipeline = pipeline.jpeg({ quality, mozjpeg: true });
    }
    await pipeline.toFile(tmpPath);
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    console.error(`压缩图片失败 ${filePath}:`, err);
  }
}

/**
 * 安全删除上传的文件
 * 验证文件路径在允许的目录内，防止路径遍历攻击
 *
 * @param fileUrl - 文件的相对路径（如 /uploads/image.jpg）
 * @param allowedSubdir - 允许的子目录（如 'uploads' 或 'uploads/avatars'）
 * @returns 是否成功删除
 */
export function safeDeleteFile(fileUrl: string, allowedSubdir: string = 'uploads'): boolean {
  try {
    // 构建完整路径（去掉开头的 /，否则 path.join 会当作绝对路径）
    // 基准目录固定为 server 根（PATHS 基于 __dirname，tsx 开发与 dist 编译产物行为一致）
    const relativeUrl = fileUrl.startsWith('/') ? fileUrl.slice(1) : fileUrl;
    const fullPath = path.join(SERVER_ROOT, relativeUrl);

    // 规范化路径，防止 ../ 遍历
    const normalizedPath = path.normalize(fullPath);
    const uploadsDir = path.join(SERVER_ROOT, allowedSubdir);

    // 验证路径是否在允许的目录内
    if (!normalizedPath.startsWith(uploadsDir)) {
      console.warn(`Path traversal attempt blocked: ${fileUrl}`);
      return false;
    }

    // 检查文件是否存在并删除
    if (fs.existsSync(normalizedPath)) {
      fs.unlinkSync(normalizedPath);
      return true;
    }
    return false;
  } catch (err) {
    console.error(`Failed to delete file ${fileUrl}:`, err);
    return false;
  }
}
