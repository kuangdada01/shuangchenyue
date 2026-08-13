/**
 * ============================================================
 * 视频转码工具
 * ============================================================
 * 发布视频时自动转码为浏览器/WebView 通用格式（H.264 + AAC 的 mp4）
 * - 已是 H.264 mp4: 直接跳过
 * - HEVC MOV 等格式: 用 ffmpeg 转码为 H.264 mp4 并替换原文件
 * - ffmpeg 未安装或转码失败: 保留原文件，不阻塞发布流程
 * ============================================================
 */

import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { env } from './config';

const execFileAsync = promisify(execFile);

/** ffmpeg/ffprobe 路径（可通过环境变量覆盖，默认从 PATH 查找） */
const FFMPEG = env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = env.FFPROBE_PATH || 'ffprobe';

/**
 * 探测视频编码格式，返回视频流 codec_name（如 h264/hevc），
 * 探测失败（ffprobe 未安装或文件异常）返回 null
 */
export async function probeVideoCodec(filePath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(FFPROBE, [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name',
      '-of', 'json',
      filePath,
    ], { timeout: 30000 });
    const data = JSON.parse(stdout);
    return data?.streams?.[0]?.codec_name ?? null;
  } catch {
    return null;
  }
}

/**
 * 确保视频为浏览器通用格式（H.264 + AAC 的 mp4）
 *
 * @param filePath - 上传后的视频完整路径
 * @param originalName - 上传时的原始文件名（含扩展名）
 * @returns 最终文件名（转码后可能变为 .mp4）
 */
export async function ensurePlayableVideo(filePath: string, originalName: string): Promise<string> {
  const ext = path.extname(originalName).toLowerCase();
  const codec = await probeVideoCodec(filePath);
  // 无法探测（如服务器未安装 ffprobe）或已是 H.264 mp4，保持原样
  if (codec === null || (codec === 'h264' && ext === '.mp4')) return originalName;

  const dir = path.dirname(filePath);
  const base = originalName.slice(0, originalName.length - ext.length);
  const finalName = `${base}.mp4`;
  const outPath = path.join(dir, finalName);
  // 输入输出同名时（.mp4 但非 H.264），先用中间文件名避免 ffmpeg 覆盖输入
  const actualOut = outPath === filePath ? `${filePath}.enc.mp4` : outPath;

  try {
    await execFileAsync(FFMPEG, [
      '-y',
      '-i', filePath,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-max_muxing_queue_size', '1024',
      actualOut,
    ], { timeout: 10 * 60 * 1000 });
    if (actualOut !== filePath) {
      fs.unlinkSync(filePath);
    }
    if (actualOut !== outPath) {
      fs.renameSync(actualOut, outPath);
    }
    console.log(`视频转码完成: ${originalName} -> ${finalName}`);
    return finalName;
  } catch (err) {
    console.error(`视频转码失败，保留原文件: ${originalName}`, err);
    try { if (fs.existsSync(actualOut)) fs.unlinkSync(actualOut); } catch { /* 忽略 */ }
    return originalName;
  }
}
