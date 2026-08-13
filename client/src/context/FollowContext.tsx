/**
 * ============================================================
 * 关注状态上下文 (FollowContext)
 * ============================================================
 * 缓存用户的关注状态，避免重复请求后端
 *
 * 功能:
 * 1. 缓存 Map<userId, isFollowing> 关注状态
 * 2. 提供查询和更新关注状态的方法
 * 3. 多个组件共享同一缓存，减少 API 请求
 *
 * 使用方式:
 * - 在 App.tsx 中用 <FollowProvider> 包裹应用
 * - 在组件中调用 useFollow() 获取方法
 * ============================================================
 */

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

/** 关注上下文类型定义 */
interface FollowContextType {
  getFollowStatus: (userId: number) => boolean | undefined;  // 获取关注状态（undefined=未缓存）
  setFollowStatus: (userId: number, isFollowing: boolean) => void; // 设置/更新关注状态
}

const FollowContext = createContext<FollowContextType | undefined>(undefined);

/**
 * 关注上下文提供者组件
 *
 * 使用 Map 缓存关注状态，避免每个帖子卡片都请求后端
 */
export function FollowProvider({ children }: { children: ReactNode }) {
  const [followMap, setFollowMap] = useState<Map<number, boolean>>(new Map());

  /** 获取指定用户的关注状态 */
  const getFollowStatus = useCallback((userId: number) => {
    return followMap.get(userId);
  }, [followMap]);

  /** 设置/更新指定用户的关注状态 */
  const setFollowStatus = useCallback((userId: number, isFollowing: boolean) => {
    setFollowMap(prev => {
      const next = new Map(prev);
      next.set(userId, isFollowing);
      return next;
    });
  }, []);

  return (
    <FollowContext.Provider value={{ getFollowStatus, setFollowStatus }}>
      {children}
    </FollowContext.Provider>
  );
}

/**
 * 关注上下文 Hook
 *
 * @returns 关注状态的查询和更新方法
 */
export function useFollow() {
  const context = useContext(FollowContext);
  if (!context) {
    throw new Error('useFollow must be used within a FollowProvider');
  }
  return context;
}