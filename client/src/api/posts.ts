/**
 * ============================================================
 * 类型化 API 层 - 帖子/评论（/api/posts）
 * ============================================================
 * 集中定义端点与参数类型，替代散落各处的字符串 URL 拼接。
 */

import api from '../api';
import type { Post, Comment, PaginatedResponse } from '../types';

export interface PostListResponse {
  posts: Post[];
  total: number;
  page: number;
  totalPages: number;
}

/** 信息流列表 */
export function listPosts(page = 1, limit = 20): Promise<PostListResponse> {
  return api.get(`/posts`, { params: { page, limit } }).then(r => r.data);
}

/** 搜索帖子 */
export function searchPosts(q: string, page = 1, limit = 20): Promise<PostListResponse> {
  return api.get('/posts/search', { params: { q, page, limit } }).then(r => r.data);
}

/** 帖子详情（含评论） */
export function getPost(postId: number): Promise<{ post: Post; comments: Comment[] }> {
  return api.get(`/posts/${postId}`).then(r => r.data);
}

/** 收藏列表 */
export function myBookmarks(): Promise<{ posts: Post[] }> {
  return api.get('/posts/bookmarks/me').then(r => r.data);
}

/** 转发列表 */
export function myReposts(): Promise<{ posts: Post[] }> {
  return api.get('/posts/reposts/me').then(r => r.data);
}

/**
 * 创建图文帖子（multipart）
 * timeout: 0 — 图片最多9张×10MB，慢速网络上传可能超过全局15s超时；
 * 超时会让客户端误报失败，而服务端仍在处理并可能已入库（"发布失败但已发出"）。
 */
export function createImagePost(formData: FormData): Promise<Post> {
  return api.post('/posts', formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 0 }).then(r => r.data);
}

/** 创建视频帖子（multipart） */
export function createVideoPost(formData: FormData): Promise<Post> {
  return api.post('/posts/video', formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 0 }).then(r => r.data);
}

/** 上传临时视频（发布前预览） */
export function uploadTempVideo(formData: FormData): Promise<{ url: string }> {
  return api.post('/posts/video-temp', formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 0 }).then(r => r.data);
}

/** 删除临时视频 */
export function deleteTempVideo(url: string): Promise<unknown> {
  return api.delete('/posts/video-temp', { data: { url } }).then(r => r.data);
}

/** 编辑帖子（multipart，新增图片可能达9×10MB，同样禁用超时避免误报失败） */
export function updatePost(postId: number, formData: FormData): Promise<Post> {
  return api.put(`/posts/${postId}`, formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 0 }).then(r => r.data);
}

/** 删除帖子 */
export function deletePost(postId: number): Promise<unknown> {
  return api.delete(`/posts/${postId}`).then(r => r.data);
}

/** 点赞 */
export function likePost(postId: number): Promise<{ liked: boolean; like_count: number }> {
  return api.post(`/posts/${postId}/like`).then(r => r.data);
}

/** 取消点赞 */
export function unlikePost(postId: number): Promise<{ liked: boolean; like_count: number }> {
  return api.delete(`/posts/${postId}/like`).then(r => r.data);
}

/** 分享 */
export function sharePost(postId: number): Promise<{ share_count: number; shared: boolean }> {
  return api.post(`/posts/${postId}/share`).then(r => r.data);
}

/** 收藏 */
export function bookmarkPost(postId: number): Promise<{ bookmarked: boolean }> {
  return api.post(`/posts/${postId}/bookmark`).then(r => r.data);
}

/** 取消收藏 */
export function unbookmarkPost(postId: number): Promise<{ bookmarked: boolean }> {
  return api.delete(`/posts/${postId}/bookmark`).then(r => r.data);
}

/** 转发 */
export function repostPost(postId: number): Promise<{ reposted: boolean; repost_count: number }> {
  return api.post(`/posts/${postId}/repost`).then(r => r.data);
}

/** 取消转发 */
export function unrepostPost(postId: number): Promise<{ reposted: boolean; repost_count: number }> {
  return api.delete(`/posts/${postId}/repost`).then(r => r.data);
}

/** 评论列表 */
export function listComments(postId: number): Promise<{ comments: Comment[] }> {
  return api.get(`/posts/${postId}/comments`).then(r => r.data);
}

/** 发表评论 */
export function createComment(postId: number, body: { content: string; parentId?: number | null }): Promise<Comment> {
  return api.post(`/posts/${postId}/comments`, body).then(r => r.data);
}

/** 删除评论 */
export function deleteComment(commentId: number): Promise<{ message: string }> {
  return api.delete(`/posts/comments/${commentId}`).then(r => r.data);
}

/** 点赞评论 */
export function likeComment(commentId: number): Promise<{ liked: boolean; like_count: number }> {
  return api.post(`/posts/comments/${commentId}/like`).then(r => r.data);
}

/** 取消评论点赞 */
export function unlikeComment(commentId: number): Promise<{ liked: boolean; like_count: number }> {
  return api.delete(`/posts/comments/${commentId}/like`).then(r => r.data);
}

// PaginatedResponse 引用保持向后兼容
export type { PaginatedResponse };
