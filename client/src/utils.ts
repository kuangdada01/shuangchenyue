/**
 * ============================================================
 * 前端共享工具函数
 * ============================================================
 */

export { resolveMediaUrl } from './config';

/**
 * 解析服务端时间字符串为 Date
 * - 新格式: ISO-8601 UTC（带 Z 或时区偏移，P1 迁移后新数据格式）
 * - 旧格式: 'YYYY-MM-DD HH:MM:SS'（UTC 无后缀），补 Z 解析
 * 服务端两种格式可能并存（旧数据），统一在此兼容。
 */
export function parseDbTime(dateStr: string): Date {
  if (!dateStr) return new Date();
  if (dateStr.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(dateStr)) return new Date(dateStr);
  return new Date(dateStr + 'Z');
}

/**
 * 格式化时间为相对时间（刚刚、x分钟前、x小时前等）
 * 用于帖子卡片等需要显示相对时间的场景
 *
 * @param dateStr - 服务端时间字符串
 * @returns 相对时间字符串
 */
export function formatRelativeTime(dateStr: string): string {
  const date = parseDbTime(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays < 7) return `${diffDays}天前`;
  return date.toLocaleDateString();
}

/**
 * 格式化时间为绝对时间（日期 + 时间）
 * 用于帖子详情等需要显示具体时间的场景
 *
 * @param dateStr - ISO 格式的日期字符串
 * @returns 格式化后的日期时间字符串
 */
export function formatAbsoluteTime(dateStr: string): string {
  const date = parseDbTime(dateStr);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * 格式化时间为简短格式（仅时间）
 * 用于消息列表等需要显示简短时间的场景
 *
 * @param dateStr - ISO 格式的日期字符串
 * @returns 格式化后的时间字符串
 */
export function formatShortTime(dateStr: string): string {
  const date = parseDbTime(dateStr);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * 格式化聊天时间分隔符（微信风格）
 * - 今天: "14:30"
 * - 昨天: "昨天 14:30"
 * - 本周内: "星期一 14:30"
 * - 今年内: "6月29日 14:30"
 * - 跨年: "2025年6月29日 14:30"
 *
 * @param dateStr - ISO 格式的日期字符串
 * @returns 格式化后的时间分隔符字符串
 */
export function formatTimeSeparator(dateStr: string): string {
  const date = parseDbTime(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((today.getTime() - msgDate.getTime()) / 86400000);

  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (diffDays === 0) return time;
  if (diffDays === 1) return `昨天 ${time}`;
  if (diffDays < 7) {
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    return `${weekdays[date.getDay()]} ${time}`;
  }
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
  }
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
}

/**
 * 格式化最后消息时间（智能显示）
 * 今天显示时间，昨天显示"昨天"，7天内显示星期，其他显示日期
 *
 * @param dateStr - ISO 格式的日期字符串
 * @returns 智能格式化的时间字符串
 */
export function formatLastMessageTime(dateStr: string): string {
  const date = parseDbTime(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);

  if (diffDays === 0) return formatShortTime(dateStr);
  if (diffDays === 1) return '昨天';
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString();
}