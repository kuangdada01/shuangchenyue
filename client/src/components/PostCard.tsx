/**
 * ============================================================
 * 帖子卡片组件 (PostCard)
 * ============================================================
 * 用于首页信息流中展示单个帖子
 *
 * 功能:
 * - 图片轮播（帖子完全可见时自动播放3秒切换，不可见时显示封面）
 * - 视频预加载（帖子完全可见时封面显示2.5秒后自动播放）
 * - 点赞/取消点赞（乐观更新UI）
 * - 关注/取消关注用户
 * - 分享链接复制
 * - 点击打开帖子详情
 * ============================================================
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Share2, Repeat2 } from 'lucide-react';
import RepostCheck from './icons/RepostCheck';
import api from '../api';
import { Post } from '../types';
import { useAuth } from '../context/AuthContext';
import { useFollow, useLike, useRepost } from '../state/cache';
import { useFollowUser } from '../hooks/useFollowUser';
import { useLikePost } from '../hooks/useLikePost';
import { useRepostPost } from '../hooks/useRepostPost';
import { showToast } from './ui/Toast';
import { formatRelativeTime, resolveMediaUrl } from '../utils';
import Avatar from './ui/Avatar';
import styles from './PostCard.module.css';

interface PostCardProps {
  post: Post;
  onLikeToggle?: () => void;
  onPostClick?: (postId: number) => void;
  onProfileClick?: (userId: number) => void;
  onLikeChange?: (postId: number, liked: boolean, likeCount: number) => void;
}

export default function PostCard({ post, onLikeToggle, onPostClick, onProfileClick, onLikeChange }: PostCardProps) {
  const { user, openLoginPrompt } = useAuth();
  const { getFollowStatus, setFollowStatus } = useFollow();
  const { requireLogin, follow, unfollow, notifyChanged } = useFollowUser();
  const { getLikeInfo } = useLike();
  const { getReposted } = useRepost();
  // 点赞/转发：交互逻辑统一由 hooks 提供（与 PostDetail 共用同一实现）
  const { liked, setLiked, likeCount, setLikeCount, toggle: toggleLike } = useLikePost(post.id, {
    onToggle: onLikeToggle,
    onChange: onLikeChange,
  });
  const { reposted, setReposted, repostCount, setRepostCount, toggle: toggleRepost } = useRepostPost(post.id);
  const [showTooltip, setShowTooltip] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isFullyVisible, setIsFullyVisible] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const heartRef = useRef<SVGSVGElement>(null);
  const navigate = useNavigate();

  const images = (() => {
    if (post.images && post.images.length > 0) return post.images;
    // Fallback: image_url might be JSON string or single URL
    try {
      const parsed = JSON.parse(post.image_url);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {}
    return [post.image_url];
  })();

  // Intersection Observer: 检测帖子是否完全可见
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsFullyVisible(entry.isIntersecting && entry.intersectionRatio >= 0.95);
      },
      { threshold: [0.95] }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 帖子不可见时重置到封面
  useEffect(() => {
    if (!isFullyVisible && images.length > 1) {
      setCurrentImageIndex(0);
      if (scrollRef.current) {
        scrollRef.current.scrollTo({ left: 0, behavior: 'instant' });
      }
    }
  }, [isFullyVisible, images.length]);

  // 视频：帖子完全可见时加载，数据就绪后播放（避免播放图标闪烁）
  useEffect(() => {
    if (!post.video_url || !isFullyVisible) {
      setVideoReady(false);
      return;
    }
    const video = videoRef.current;
    if (!video) return;

    video.muted = true;

    const onReady = () => {
      setVideoReady(true);
      video.play().catch(() => {});
    };

    video.addEventListener('loadeddata', onReady);
    video.load();

    return () => {
      video.removeEventListener('loadeddata', onReady);
      video.pause();
      setVideoReady(false);
    };
  }, [post.video_url, isFullyVisible]);

  useEffect(() => {
    if (user && post.user_id !== user.id) {
      const cached = getFollowStatus(post.user_id);
      if (cached !== undefined) {
        setIsFollowing(cached);
      } else {
        api.get(`/friends/status/${post.user_id}`).then(res => {
          setIsFollowing(res.data.is_following);
          setFollowStatus(post.user_id, res.data.is_following);
        }).catch(() => {});
      }
    }
  }, [post.user_id, user, getFollowStatus, setFollowStatus]);

  useEffect(() => {
    const cached = getLikeInfo(post.id);
    if (cached) {
      setLiked(cached.liked);
      setLikeCount(cached.likeCount);
    } else {
      setLiked(!!post.liked);
      setLikeCount(post.like_count);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  useEffect(() => {
    const cached = getReposted(post.id);
    if (cached !== undefined) {
      setReposted(cached);
    } else {
      setReposted(!!post.reposted);
    }
    setRepostCount(post.repost_count || 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  // 直接操作 SVG DOM，绕过 React 渲染
  useEffect(() => {
    const svg = heartRef.current;
    if (!svg) return;
    const path = svg.querySelector('path');
    if (!path) return;
    const c = liked ? '#ed4956' : 'none';
    const s = liked ? '#ed4956' : 'currentColor';
    path.setAttribute('fill', c);
    path.setAttribute('stroke', s);
    svg.setAttribute('fill', c);
    svg.setAttribute('stroke', s);
    // 强制重绘
    void svg.getBoundingClientRect();
  }, [liked]);

  // Auto-play carousel: 仅帖子完全可见且未悬停暂停时播放
  useEffect(() => {
    if (images.length <= 1 || isPaused || !isFullyVisible) return;
    const timer = setInterval(() => {
      setCurrentImageIndex(prev => {
        const next = (prev + 1) % images.length;
        if (scrollRef.current) {
          const width = scrollRef.current.clientWidth;
          scrollRef.current.scrollTo({ left: width * next, behavior: 'smooth' });
        }
        return next;
      });
    }, 3000);
    return () => clearInterval(timer);
  }, [images.length, isPaused, isFullyVisible]);

  const handleFollow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!requireLogin()) return;
    try {
      if (isFollowing) {
        await unfollow(post.user_id);
        setIsFollowing(false);
        showToast('o(TヘTo)取消关注成功！');
      } else {
        await follow(post.user_id);
        setIsFollowing(true);
        showToast('ヾ(≧▽≦*)o关注成功！');
      }
      notifyChanged(post.user_id);
    } catch {
      showToast('操作失败');
    }
  };

  const handleShare = async () => {
    if (!user) { openLoginPrompt(); return; }
    const url = `${window.location.origin}/post/${post.id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // HTTP 环境降级：用 textarea 复制
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setShowTooltip(true);
    setTimeout(() => setShowTooltip(false), 1500);
  };

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const scrollLeft = scrollRef.current.scrollLeft;
    const width = scrollRef.current.clientWidth;
    setCurrentImageIndex(Math.round(scrollLeft / width));
  };

  return (
    <div className={styles.card} ref={cardRef}>
      <div className={styles.header}>
        <div onClick={() => onProfileClick ? onProfileClick(post.user_id) : navigate(`/profile/${post.user_id}`)} style={{ cursor: 'pointer' }}>
          <Avatar src={post.avatar} username={post.username} size={40} className={styles.avatar} />
        </div>
        <span className={styles.username} onClick={() => onProfileClick ? onProfileClick(post.user_id) : navigate(`/profile/${post.user_id}`)} style={{ cursor: 'pointer' }}>
          {post.username}
        </span>
        <span className={styles.timeDot}>•</span>
        <span className={styles.timeInline}>{formatRelativeTime(post.created_at)}</span>
        {user && post.user_id !== user.id && !isFollowing && (
          <button
            className={styles.followBtn}
            onClick={handleFollow}
          >
            关注
          </button>
        )}
      </div>

      <div
        className={styles.imageWrapper}
        onClick={() => onPostClick ? onPostClick(post.id) : navigate(`/post/${post.id}`, { state: { from: 'home' } })}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        {post.video_url ? (
          <div className={styles.videoWrapper}>
            <video ref={videoRef} src={resolveMediaUrl(post.video_url) || undefined} muted playsInline preload="auto" className={styles.video} style={{ opacity: videoReady ? 1 : 0 }} />
            {!videoReady && (
              <img src={resolveMediaUrl(post.video_cover) || undefined} alt="" className={styles.videoCover} />
            )}
          </div>
        ) : (
          <>
            <div className={styles.imageCarousel} ref={scrollRef} onScroll={handleScroll}>
              {images.map((url, i) => (
                <img key={i} src={resolveMediaUrl(url) || url} alt={post.title} className={styles.image} />
              ))}
            </div>
            {images.length > 1 && (
              <div className={styles.imageDots}>
                {images.map((_, i) => (
                  <span key={i} className={`${styles.imageDot} ${i === currentImageIndex ? styles.active : ''}`} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className={styles.actions}>
        <button className={`${styles.actionBtn} ${liked ? styles.liked : ''}`} onClick={toggleLike} aria-label={liked ? '取消点赞' : '点赞'}>
          <svg ref={heartRef} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" fill="none" stroke="currentColor" /></svg>
          {likeCount > 0 && <span className={styles.actionCount}>{likeCount}</span>}
        </button>
        <button className={styles.actionBtn} onClick={() => {
          if (!user) { openLoginPrompt(); return; }
          if (onPostClick) {
            onPostClick(post.id);
          } else {
            navigate(`/post/${post.id}`);
          }
        }} aria-label="评论">
          <MessageCircle size={24} />
          {post.comment_count > 0 && <span className={styles.actionCount}>{post.comment_count}</span>}
        </button>
        <button className={`${styles.actionBtn} ${reposted ? styles.reposted : ''}`} onClick={toggleRepost} aria-label={reposted ? '取消转发' : '转发'}>
          {reposted ? <RepostCheck size={25} strokeWidth={1.8} /> : <Repeat2 size={25} strokeWidth={1.8} />}
          {repostCount > 0 && <span className={styles.actionCount}>{repostCount}</span>}
        </button>
        <button className={`${styles.actionBtn} ${styles.shareTooltip}`} onClick={handleShare} aria-label="分享">
          <Share2 size={24} />
          {showTooltip && <span className={styles.shareTooltipText}>已复制链接</span>}
        </button>
      </div>

      {post.description && (
        <div className={styles.caption}>
          <span className={styles.captionUsername}>{post.username}</span>
          {post.description}
        </div>
      )}
    </div>
  );
}
