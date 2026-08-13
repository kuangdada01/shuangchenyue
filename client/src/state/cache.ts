/**
 * ============================================================
 * 交互状态缓存 hooks（基于 React Query 缓存，替代 4 个 Context）
 * ============================================================
 * 原 Follow/Like/Repost/Bookmark 四个 Context 本质是
 * "Map 缓存 + setState"，这里统一用 queryClient 缓存实现，
 * 对外保持与原 useFollow/useLike/useRepost/useBookmark 相同的
 * get/set 接口，组件行为完全不变。
 *
 * 后续（P3）可进一步演进为 useMutation 乐观更新，缓存层无需再动。
 */

import { useQueryClient } from '@tanstack/react-query';

// ============================================================
// 关注状态缓存
// ============================================================

const followKey = (userId: number) => ['cache', 'follow', userId] as const;

/** 关注状态缓存 hook（接口与原 useFollow 一致） */
export function useFollow() {
  const qc = useQueryClient();
  return {
    getFollowStatus: (userId: number): boolean | undefined =>
      qc.getQueryData<boolean>(followKey(userId)),
    setFollowStatus: (userId: number, isFollowing: boolean): void => {
      qc.setQueryData(followKey(userId), isFollowing);
    },
  };
}

// ============================================================
// 点赞缓存
// ============================================================

export interface LikeInfo {
  liked: boolean;
  likeCount: number;
}

const likeKey = (postId: number) => ['cache', 'like', postId] as const;

/** 点赞缓存 hook（接口与原 useLike 一致） */
export function useLike() {
  const qc = useQueryClient();
  return {
    getLikeInfo: (postId: number): LikeInfo | undefined =>
      qc.getQueryData<LikeInfo>(likeKey(postId)),
    setLikeInfo: (postId: number, liked: boolean, likeCount: number): void => {
      qc.setQueryData(likeKey(postId), { liked, likeCount });
    },
  };
}

// ============================================================
// 转发缓存
// ============================================================

const repostKey = (postId: number) => ['cache', 'repost', postId] as const;

/** 转发缓存 hook（接口与原 useRepost 一致） */
export function useRepost() {
  const qc = useQueryClient();
  return {
    getReposted: (postId: number): boolean | undefined =>
      qc.getQueryData<boolean>(repostKey(postId)),
    setReposted: (postId: number, reposted: boolean): void => {
      qc.setQueryData(repostKey(postId), reposted);
    },
  };
}

// ============================================================
// 收藏缓存
// ============================================================

const bookmarkKey = (postId: number) => ['cache', 'bookmark', postId] as const;

/** 收藏缓存 hook（接口与原 useBookmark 一致） */
export function useBookmark() {
  const qc = useQueryClient();
  return {
    getBookmarked: (postId: number): boolean | undefined =>
      qc.getQueryData<boolean>(bookmarkKey(postId)),
    setBookmarked: (postId: number, bookmarked: boolean): void => {
      qc.setQueryData(bookmarkKey(postId), bookmarked);
    },
  };
}
