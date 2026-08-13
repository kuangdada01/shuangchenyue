/**
 * ============================================================
 * 收藏状态上下文 (BookmarkContext)
 * ============================================================
 * 缓存帖子的收藏状态，避免重复请求后端
 *
 * 功能:
 * 1. 缓存 Map<postId, bookmarked> 收藏信息
 * 2. 提供查询和更新收藏状态的方法
 * 3. 多个组件（PostDetail）共享同一缓存
 *
 * 使用方式:
 * - 在 App.tsx 中用 <BookmarkProvider> 包裹应用
 * - 在组件中调用 useBookmark() 获取方法
 * ============================================================
 */

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

/** 收藏上下文类型定义 */
interface BookmarkContextType {
  getBookmarked: (postId: number) => boolean | undefined;  // 获取收藏状态（undefined=未缓存）
  setBookmarked: (postId: number, bookmarked: boolean) => void; // 设置/更新收藏状态
}

const BookmarkContext = createContext<BookmarkContextType | undefined>(undefined);

/**
 * 收藏上下文提供者组件
 *
 * 使用 Map 缓存收藏状态，避免每个帖子卡片都请求后端
 */
export function BookmarkProvider({ children }: { children: ReactNode }) {
  const [bookmarkMap, setBookmarkMap] = useState<Map<number, boolean>>(new Map());

  /** 获取指定帖子的收藏状态 */
  const getBookmarked = useCallback((postId: number) => {
    return bookmarkMap.get(postId);
  }, [bookmarkMap]);

  /** 设置/更新指定帖子的收藏状态 */
  const setBookmarked = useCallback((postId: number, bookmarked: boolean) => {
    setBookmarkMap(prev => {
      const next = new Map(prev);
      next.set(postId, bookmarked);
      return next;
    });
  }, []);

  return (
    <BookmarkContext.Provider value={{ getBookmarked, setBookmarked }}>
      {children}
    </BookmarkContext.Provider>
  );
}

/**
 * 收藏上下文 Hook
 *
 * @returns 收藏状态的查询和更新方法
 */
export function useBookmark() {
  const context = useContext(BookmarkContext);
  if (!context) {
    throw new Error('useBookmark must be used within a BookmarkProvider');
  }
  return context;
}