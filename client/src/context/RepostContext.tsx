/**
 * ============================================================
 * 转发状态上下文 (RepostContext)
 * ============================================================
 * 缓存帖子的转发状态，避免重复请求后端
 *
 * 功能:
 * 1. 缓存 Map<postId, reposted> 转发信息
 * 2. 提供查询和更新转发状态的方法
 * 3. 多个组件（PostCard、PostDetail）共享同一缓存
 *
 * 使用方式:
 * - 在 App.tsx 中用 <RepostProvider> 包裹应用
 * - 在组件中调用 useRepost() 获取方法
 * ============================================================
 */

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

/** 转发上下文类型定义 */
interface RepostContextType {
  getReposted: (postId: number) => boolean | undefined;  // 获取转发状态（undefined=未缓存）
  setReposted: (postId: number, reposted: boolean) => void; // 设置/更新转发状态
}

const RepostContext = createContext<RepostContextType | undefined>(undefined);

/**
 * 转发上下文提供者组件
 *
 * 使用 Map 缓存转发状态，避免每个帖子卡片都请求后端
 */
export function RepostProvider({ children }: { children: ReactNode }) {
  const [repostMap, setRepostMap] = useState<Map<number, boolean>>(new Map());

  /** 获取指定帖子的转发状态 */
  const getReposted = useCallback((postId: number) => {
    return repostMap.get(postId);
  }, [repostMap]);

  /** 设置/更新指定帖子的转发状态 */
  const setReposted = useCallback((postId: number, reposted: boolean) => {
    setRepostMap(prev => {
      const next = new Map(prev);
      next.set(postId, reposted);
      return next;
    });
  }, []);

  return (
    <RepostContext.Provider value={{ getReposted, setReposted }}>
      {children}
    </RepostContext.Provider>
  );
}

/**
 * 转发上下文 Hook
 *
 * @returns 转发状态的查询和更新方法
 */
export function useRepost() {
  const context = useContext(RepostContext);
  if (!context) {
    throw new Error('useRepost must be used within a RepostProvider');
  }
  return context;
}