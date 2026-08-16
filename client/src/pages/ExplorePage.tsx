/**
 * ============================================================
 * 搜索页 (SearchPage / ExplorePage)
 * ============================================================
 * 帖子搜索和浏览页面
 *
 * 功能:
 * - 顶部居中大搜索框（支持关键词搜索帖子标题/描述）
 * - 下方以缩略图网格展示所有帖子（3-4列自适应）
 * - 点击缩略图弹出帖子详情模态框（复用 PostDetail 组件）
 * - 支持加载更多分页
 * ============================================================
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Heart, MessageCircle, Layers, Play } from 'lucide-react';
import api from '../api';
import PostDetail from '../components/PostDetail';
import { Post } from '../types';
import styles from './ExplorePage.module.css';

export default function ExplorePage() {
  const [keyword, setKeyword] = useState('');
  const [posts, setPosts] = useState<Post[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const [overlayPostId, setOverlayPostId] = useState<number | null>(null);

  const loadMoreRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingRef = useRef(false);

  // 加载帖子（首页全部 or 搜索结果）
  const loadPosts = useCallback(async (pageNum: number, query: string, append: boolean) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);

    try {
      const endpoint = query.trim()
        ? `/posts/search?q=${encodeURIComponent(query.trim())}&page=${pageNum}&limit=20`
        : `/posts?page=${pageNum}&limit=20`;

      const res = await api.get(endpoint);
      const newPosts: Post[] = res.data.posts || [];

      setPosts(prev => append ? [...prev, ...newPosts] : newPosts);
      setHasMore(pageNum < res.data.totalPages);
      setTotalResults(res.data.total || 0);
      setPage(pageNum);
    } catch {} finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  // 初始加载（延迟一帧执行：loadPosts 的同步前缀会 setState，
  // effect 内同步调用会触发 react-hooks/set-state-in-effect）
  useEffect(() => {
    const timer = setTimeout(() => loadPosts(1, '', false), 0);
    return () => clearTimeout(timer);
  }, [loadPosts]);

  // 搜索防抖
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      if (keyword.trim()) {
        setSearched(true);
        loadPosts(1, keyword, false);
      } else {
        setSearched(false);
        loadPosts(1, '', false);
      }
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [keyword, loadPosts]);

  // IntersectionObserver 自动加载更多
  useEffect(() => {
    if (!loadMoreRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          loadPosts(page + 1, keyword, true);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, page, keyword, loadPosts]);

  const handleClear = () => {
    setKeyword('');
    setSearched(false);
  };

  const handlePostChange = (postId: number, liked: boolean, likeCount: number) => {
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, liked: liked ? 1 : 0, like_count: likeCount } : p));
  };

  const handleCommentChange = (postId: number, commentCount: number) => {
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, comment_count: commentCount } : p));
  };

  const getThumbnail = (post: Post): string => {
    if (post.video_cover) return post.video_cover;
    if (post.images && post.images.length > 0) return post.images[0];
    try {
      const parsed = JSON.parse(post.image_url);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed[0];
    } catch {}
    return post.image_url;
  };

  const getMultiImageCount = (post: Post): number => {
    if (post.images && post.images.length > 0) return post.images.length;
    try {
      const parsed = JSON.parse(post.image_url);
      if (Array.isArray(parsed)) return parsed.length;
    } catch {}
    return 0;
  };

  return (
    <div className={styles.page}>
      {/* 搜索框 */}
      <div className={styles.boxWrapper}>
        <div className={styles.inputContainer}>
          <span className={styles.inputIcon}>
            <Search size={20} />
          </span>
          <input
            className={styles.input}
            placeholder="搜索"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
          />
          {keyword && (
            <button className={styles.clearBtn} onClick={handleClear}>
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* 搜索结果信息 */}
      {searched && (
        <div className={styles.resultInfo}>
          找到 {totalResults} 个相关帖子
        </div>
      )}

      {/* 帖子网格 */}
      {posts.length > 0 ? (
        <>
          <div className={styles.grid}>
            {posts.map(post => {
              const thumbnail = getThumbnail(post);
              const multiCount = getMultiImageCount(post);
              return (
                <div
                  key={post.id}
                  className={styles.gridItem}
                  onClick={() => setOverlayPostId(post.id)}
                >
                  <img src={thumbnail} alt={post.title || post.description || ''} loading="lazy" />

                  {/* 视频标识 */}
                  {post.video_url && (
                    <span className={styles.videoBadge}>
                      <Play size={12} fill="white" />
                      视频
                    </span>
                  )}

                  {/* 多图标识 */}
                  {!post.video_url && multiCount > 1 && (
                    <span className={styles.multiBadge}>
                      <Layers size={20} />
                    </span>
                  )}

                  {/* Hover 叠加层 */}
                  <div className={styles.gridOverlay}>
                    <span className={styles.gridStat}>
                      <Heart size={18} fill="white" />
                      {post.like_count}
                    </span>
                    <span className={styles.gridStat}>
                      <MessageCircle size={18} fill="white" />
                      {post.comment_count}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 加载更多触发器 */}
          {hasMore && (
            <div ref={loadMoreRef} className={styles.loadMore}>
              {loading && <span style={{ color: 'var(--text-secondary)' }}>加载中...</span>}
            </div>
          )}
        </>
      ) : loading ? (
        <div className={styles.loading}>加载中...</div>
      ) : (
        <div className={styles.empty}>
          <Search size={48} className={styles.emptyIcon} />
          <div className={styles.emptyText}>
            {searched ? '未找到相关帖子' : '暂无帖子'}
          </div>
          {searched && (
            <div className={styles.emptyHint}>试试其他关键词</div>
          )}
        </div>
      )}

      {/* 帖子详情模态框 */}
      {overlayPostId && (
        <PostDetail
          postId={overlayPostId}
          onClose={() => setOverlayPostId(null)}
          onLikeChange={handlePostChange}
          onCommentChange={handleCommentChange}
        />
      )}
    </div>
  );
}
