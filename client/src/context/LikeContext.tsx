/**
 * ============================================================
 * 点赞状态上下文 (LikeContext)
 * ============================================================
 * 缓存帖子的点赞状态，避免重复请求后端
 *
 * 功能:
 * 1. 缓存 Map<postId, {liked, likeCount}> 点赞信息
 * 2. 提供查询和更新点赞状态的方法
 * 3. 多个组件（PostCard、PostDetail）共享同一缓存
 *
 * 使用方式:
 * - 在 App.tsx 中用 <LikeProvider> 包裹应用
 * - 在组件中调用 useLike() 获取方法
 * ============================================================
 */

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

/** 点赞信息数据 */
interface LikeInfo {
  liked: boolean;      // 当前用户是否已点赞
  likeCount: number;   // 总点赞数
}

/** 点赞上下文类型定义 */
interface LikeContextType {
  getLikeInfo: (postId: number) => LikeInfo | undefined;  // 获取点赞信息（undefined=未缓存）
  setLikeInfo: (postId: number, liked: boolean, likeCount: number) => void; // 设置/更新点赞信息
}

const LikeContext = createContext<LikeContextType | undefined>(undefined);

/**
 * 点赞上下文提供者组件
 *
 * 使用 Map 缓存点赞状态，避免每个帖子卡片都请求后端
 */
export function LikeProvider({ children }: { children: ReactNode }) {
  const [likeMap, setLikeMap] = useState<Map<number, LikeInfo>>(new Map());

  /** 获取指定帖子的点赞信息 */
  const getLikeInfo = useCallback((postId: number) => {
    return likeMap.get(postId);
  }, [likeMap]);

  /** 设置/更新指定帖子的点赞信息 */
  const setLikeInfo = useCallback((postId: number, liked: boolean, likeCount: number) => {
    setLikeMap(prev => {
      const next = new Map(prev);
      next.set(postId, { liked, likeCount });
      return next;
    });
  }, []);

  return (
    <LikeContext.Provider value={{ getLikeInfo, setLikeInfo }}>
      {children}
    </LikeContext.Provider>
  );
}

/**
 * 点赞上下文 Hook
 *
 * @returns 点赞信息的查询和更新方法
 */
export function useLike() {
  const context = useContext(LikeContext);
  if (!context) {
    throw new Error('useLike must be used within a LikeProvider');
  }
  return context;
}