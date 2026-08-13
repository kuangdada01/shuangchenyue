/**
 * ============================================================
 * 首页信息流取数 Hook（usePostsFeed）
 * ============================================================
 * 基于 React Query：
 * - staleTime: Infinity —— 等价于原模块级 cachedPosts 的
 *   "切换页面不重载"语义（缓存常驻 queryClient）
 * - 下拉刷新 / 帖子创建后通过 refetch() 主动刷新
 * - 点赞/评论数变化通过 setQueryData 就地更新，避免整页重载
 */

import { useQuery } from '@tanstack/react-query';
import api from '../api';
import type { Post } from '../types';

export const postsFeedKey = ['posts', 'feed'] as const;

export function usePostsFeed() {
  return useQuery({
    queryKey: postsFeedKey,
    queryFn: async () => {
      const res = await api.get(`/posts`, { params: { page: 1, limit: 20 }, timeout: 10000 });
      return res.data.posts as Post[];
    },
    staleTime: Infinity,
  });
}
