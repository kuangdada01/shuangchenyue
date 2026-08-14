/**
 * ============================================================
 * 帖子详情组件 (PostDetail)
 * ============================================================
 * 帖子详情模态框，显示完整帖子内容和评论
 *
 * 功能:
 * - 图片展示（轮播、左右切换、缩放查看）
 * - 视频播放（自动播放带声音）
 * - 嵌套评论（支持回复、折叠/展开、高亮跳转）
 * - 评论点赞/删除
 * - 帖子点赞/关注/分享
 * - 关闭动画效果
 * ============================================================
 */

import { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';

import { X, MessageCircle, Share2, Send, Trash2, ChevronLeft, Pencil, Bookmark, Repeat2 } from 'lucide-react';
import RepostCheck from './icons/RepostCheck';
import EmojiPicker from './EmojiPicker';
import CommentItem from './CommentItem';
import PostMedia from './post/PostMedia';

const LazyProfileOverlay = lazy(() => import('./ProfileOverlay'));
import ConfirmDialog from './ui/ConfirmDialog';
import api from '../api';
import { Post, Comment } from '../types';
import { computeInitialCollapsedIds, buildVisibleComments } from '../lib/comments';
import { useAuth } from '../context/AuthContext';
import { useFollow, useLike, useBookmark, useRepost } from '../state/cache';
import { useFollowUser } from '../hooks/useFollowUser';
import { useLikePost } from '../hooks/useLikePost';
import { useRepostPost } from '../hooks/useRepostPost';
import { useBookmarkPost } from '../hooks/useBookmarkPost';
import { useEvent } from '../context/CreateContext';
import { useMusic } from '../context/MusicContext';
import { showToast } from './ui/Toast';
import { resolveMediaUrl } from '../utils';
import {
  setActiveNestedOverlay, getActiveNestedOverlay, consumeBackDispatch, beginBackDispatch,
} from '../state/nestedOverlay';
import styles from './PostDetail.module.css';



interface PostDetailProps {
  postId: number;
  onClose?: () => void;
  onLikeChange?: (postId: number, liked: boolean, likeCount: number) => void;
  onCommentChange?: (postId: number, commentCount: number) => void;
  highlightCommentId?: number | null;
  noAnimation?: boolean;
}

export default function PostDetail({ postId, onClose, onLikeChange, onCommentChange, highlightCommentId, noAnimation }: PostDetailProps) {
  const { user, openLoginPrompt } = useAuth();
  const { getFollowStatus, setFollowStatus } = useFollow();
  const { getLikeInfo } = useLike();
  const { getBookmarked } = useBookmark();
  const { openEdit } = useEvent();
  const { isPlaying: isMusicPlaying, pause: pauseMusic, play: playMusic } = useMusic();
  const musicWasPlayingRef = useRef(false);
  const navigate = useNavigate();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<{ id: number; username: string } | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [shareCount, setShareCount] = useState(0);
  const [alreadyShared, setAlreadyShared] = useState(false);
  const { getReposted } = useRepost();
  const { requireLogin, follow, unfollow } = useFollowUser();
  const { liked, setLiked, likeCount, setLikeCount, toggle: toggleLike } = useLikePost(postId, { onChange: onLikeChange });
  const { reposted, setReposted, repostCount, setRepostCount, toggle: toggleRepost } = useRepostPost(postId);
  const { bookmarked, setBookmarked, toggle: toggleBookmark } = useBookmarkPost(postId);
  const [submitting, setSubmitting] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [closing, setClosing] = useState(false);
  const [collapsedReplies, setCollapsedReplies] = useState<Set<number>>(new Set());
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [profileUserId, setProfileUserId] = useState<number | null>(null);
  const [showDeletePostConfirm, setShowDeletePostConfirm] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const highlightRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const detailVideoRef = useRef<HTMLVideoElement>(null);
  const heartRef = useRef<SVGSVGElement>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);

  const [loadError, setLoadError] = useState(false);
  const [activeHighlightId, setActiveHighlightId] = useState<number | null>(null);

  // 检测是否为嵌套 PostDetail（在另一个 PostDetail 的 ProfileOverlay 内部）
  const isNestedRef = useRef(false);
  // 注册/注销嵌套 PostDetail 实例，供外层 PostDetail 的返回键处理使用
  useEffect(() => {
    // 挂载后检测：当前 overlay 是否在另一个 PostDetail overlay 内部
    requestAnimationFrame(() => {
      if (overlayRef.current) {
        const parentOverlay = overlayRef.current.parentElement?.closest(`.${styles.overlay}`);
        if (parentOverlay) {
          isNestedRef.current = true;
          setActiveNestedOverlay(overlayRef.current);
        }
      }
    });
    return () => {
      if (isNestedRef.current) {
        setActiveNestedOverlay(null);
      }
    };
  }, []);

  // 加载评论，全部折叠，若有高亮评论ID则展开其祖先
  useEffect(() => {
    setLoadError(false);
    setActiveHighlightId(null);
    api.get(`/posts/${postId}`).then(async res => {
      setPost(res.data.post);
      setComments(res.data.comments);
      const cachedLike = getLikeInfo(postId);
      if (cachedLike) {
        setLiked(cachedLike.liked);
        setLikeCount(cachedLike.likeCount);
      } else {
        setLiked(!!res.data.post.liked);
        setLikeCount(res.data.post.like_count);
      }
      setShareCount(res.data.post.share_count || 0);
      setAlreadyShared(!!res.data.post.shared);
      const cachedBookmark = getBookmarked(postId);
      if (cachedBookmark !== undefined) {
        setBookmarked(cachedBookmark);
      } else {
        setBookmarked(!!res.data.post.bookmarked);
      }
      const cachedRepost = getReposted(postId);
      if (cachedRepost !== undefined) {
        setReposted(cachedRepost);
      } else {
        setReposted(!!res.data.post.reposted);
      }
      setRepostCount(res.data.post.repost_count || 0);
      if (user && res.data.post.user_id !== user.id) {
        const cached = getFollowStatus(res.data.post.user_id);
        if (cached !== undefined) {
          setIsFollowing(cached);
        } else {
          try {
            const statusRes = await api.get(`/friends/status/${res.data.post.user_id}`);
            setIsFollowing(statusRes.data.is_following);
            setFollowStatus(res.data.post.user_id, statusRes.data.is_following);
          } catch {}
        }
      }
      // 默认折叠所有回复线程；若有高亮评论ID则展开其祖先使目标可见
      setCollapsedReplies(computeInitialCollapsedIds(res.data.comments, highlightCommentId));

      // 重新渲染后滚动 + 高亮
      if (highlightCommentId) {
        const targetId = Number(highlightCommentId);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const el = document.getElementById(`comment-${targetId}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setActiveHighlightId(targetId);
          });
        });
      }
    }).catch(() => {
      setLoadError(true);
    });
  }, [postId, user, getFollowStatus, setFollowStatus]);

  // 帖子加载时自动播放带声音的视频，并暂停音乐
  useEffect(() => {
    if (!post?.video_url) return;
    const timer = setTimeout(() => {
      if (detailVideoRef.current) {
        // 记录音乐是否正在播放，关闭时恢复
        musicWasPlayingRef.current = isMusicPlaying;
        if (isMusicPlaying) {
          pauseMusic();
        }
        detailVideoRef.current.muted = false;
        detailVideoRef.current.volume = 0.8;
        detailVideoRef.current.play().catch(() => {});
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [post?.video_url]);

  // 直接操作 SVG DOM
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
    void svg.getBoundingClientRect();
  }, [liked]);

  const handleComment = async () => {
    if (!user) { openLoginPrompt(); return; }
    if (!newComment.trim() || submitting || post?.close_comments) return;
    setSubmitting(true);
    try {
      const res = await api.post(`/posts/${postId}/comments`, {
        content: newComment,
        parentId: replyingTo?.id || null,
      });
      setComments(prev => {
        const updated = [...prev, res.data];
        onCommentChange?.(postId, updated.length);
        return updated;
      });
      setNewComment('');
      setReplyingTo(null);
      setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (err: any) {
      if (err.response?.status === 403) {
        showToast('此帖子已关闭评论');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = (commentId: number) => {
    setDeleteTargetId(commentId);
  };

  const handleDeletePost = async () => {
    if (!post) return;
    try {
      await api.delete(`/posts/${post.id}`);
      showToast('帖子已删除');
      handleClose();
    } catch {}
    setShowDeletePostConfirm(false);
  };

  const confirmDeleteComment = async () => {
    if (deleteTargetId === null) return;
    try {
      await api.delete(`/posts/comments/${deleteTargetId}`);
      setComments(prev => {
        const updated = prev.filter(c => c.id !== deleteTargetId && c.parent_id !== deleteTargetId);
        onCommentChange?.(postId, updated.length);
        return updated;
      });
      showToast('评论已删除');
    } catch {}
    setDeleteTargetId(null);
  };

  const handleCommentLike = async (commentId: number) => {
    if (!user) { openLoginPrompt(); return; }
    const comment = comments.find(c => c.id === commentId);
    if (!comment) return;

    const wasLiked = !!comment.liked;
    const prevCount = comment.like_count;

    setComments(prev => prev.map(c =>
      c.id === commentId
        ? { ...c, liked: wasLiked ? 0 : 1, like_count: wasLiked ? prevCount - 1 : prevCount + 1 }
        : c
    ));

    try {
      if (wasLiked) {
        await api.delete(`/posts/comments/${commentId}/like`);
      } else {
        await api.post(`/posts/comments/${commentId}/like`);
      }
    } catch {
      setComments(prev => prev.map(c =>
        c.id === commentId
          ? { ...c, liked: wasLiked ? 1 : 0, like_count: prevCount }
          : c
      ));
    }
  };

  const handleFollow = async () => {
    if (!requireLogin()) return;
    if (!post) return;
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
    } catch {
      showToast('操作失败');
    }
  };

  const handleShare = async () => {
    if (!user) { openLoginPrompt(); return; }
    const url = `${window.location.origin}/post/${postId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setShowTooltip(true);
    setTimeout(() => setShowTooltip(false), 1500);
    if (!alreadyShared && user) {
      try {
        const res = await api.post(`/posts/${postId}/share`);
        setShareCount(res.data.share_count);
        setAlreadyShared(true);
      } catch {}
    }
  };

  const handleClose = () => {
    setClosing(true);
    // 恢复音乐播放
    if (musicWasPlayingRef.current) {
      playMusic();
    }
    setTimeout(() => {
      if (onClose) {
        onClose();
      } else {
        // 判断是否可以从历史记录返回（非刷新场景）
        if (window.history.length > 1) {
          navigate(-1);
        } else {
          navigate('/', { replace: true });
        }
      }
    }, 200);
  };

  const handleNavigate = (path: string) => {
    // 提取 /profile/:id 中的 userId
    const match = path.match(/\/profile\/(\d+)/);
    if (match) {
      setProfileUserId(parseInt(match[1]));
    }
  };

  // 安卓硬件返回键：优先关闭上层覆盖，再关闭帖子详情
  useEffect(() => {
    const handler = () => {
      // 嵌套 PostDetail（在 ProfileOverlay 内部）：跳过处理，由外层 PostDetail 管理
      if (isNestedRef.current) return;

      // 防重入：如果正在处理嵌套 PostDetail 的关闭，消费一次性标志后跳过
      if (!consumeBackDispatch()) return;

      // 如果有嵌套的 PostDetail（如从个人主页打开的帖子），先关闭其所在的 ProfileOverlay
      const nested = getActiveNestedOverlay();
      if (nested) {
        beginBackDispatch();
        const profileOverlay = nested.closest('.profile-overlay');
        if (profileOverlay) {
          const backBtn = profileOverlay.querySelector('[data-back]') as HTMLElement;
          if (backBtn) { backBtn.click(); return; }
        }
      }

      // 如果当前 PostDetail 内部有自己的 ProfileOverlay 打开，先关闭它
      if (overlayRef.current) {
        const profileOverlay = overlayRef.current.querySelector('.profile-overlay');
        if (profileOverlay) {
          const backBtn = profileOverlay.querySelector('[data-back]') as HTMLElement;
          if (backBtn) { backBtn.click(); return; }
        }
      }
      handleClose();
    };
    window.addEventListener('backbutton', handler);
    return () => window.removeEventListener('backbutton', handler);
  }, [onClose]);

  // 锁定 body 滚动 + 阻止滚轮穿透到背景页面（仅允许评论区内部滚动）
  const wheelHandlerRef = useRef<((e: WheelEvent) => void) | null>(null);

  useEffect(() => {
    // 不锁定 body 滚动（保持滚动条始终可见）；仅拦截滚轮防止穿透滚动背景

    // 用 document 级别的 capture 阶段监听 wheel 事件
    // 在浏览器处理滚动默认动作之前拦截，确保 e.preventDefault() 有效
    const handleWheel = (e: WheelEvent) => {
      // Allow scrolling inside the emoji panel
      if ((e.target as HTMLElement).closest('[data-emoji-panel]')) return;
      // Allow scrolling inside the scrollable comments container
      const commentsEl = document.querySelector(`.${styles.comments}`);
      if (commentsEl && commentsEl.contains(e.target as Node)) {
        const el = commentsEl as HTMLElement;
        const atTop = el.scrollTop <= 0 && e.deltaY < 0;
        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1 && e.deltaY > 0;
        if (!atTop && !atBottom) return; // let comments scroll normally
      }
      // Prevent all other wheel events from scrolling the background page
      e.preventDefault();
    };

    wheelHandlerRef.current = handleWheel;
    document.addEventListener('wheel', handleWheel, { passive: false, capture: true });

    return () => {
      if (wheelHandlerRef.current) {
        document.removeEventListener('wheel', wheelHandlerRef.current, { capture: true });
        wheelHandlerRef.current = null;
      }
    };
  }, []);

  // ESC 键关闭（缩放时先退出缩放）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (zoomed) {
          setZoomed(false);
        } else {
          handleClose();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [zoomed, closing]);

  // Android 返回键：监听 popstate 关闭 overlay
  useEffect(() => {
    const handlePopState = () => {
      // 如果有嵌套的 PostDetail（如从个人主页打开的帖子），让嵌套层处理
      if (getActiveNestedOverlay()) return;
      if (!closing) {
        handleClose();
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [closing, onClose]);

  const toggleReplies = (commentId: number) => {
    setCollapsedReplies(prev => {
      const next = new Set(prev);
      if (next.has(commentId)) {
        next.delete(commentId);
      } else {
        next.add(commentId);
      }
      return next;
    });
  };

  if (loadError) {
    return (
      <div ref={overlayRef} className={`${styles.overlay} ${closing ? styles.closing : ''}`} onClick={handleClose}>
        <div className={styles.container} onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
            <p style={{ fontSize: 16, marginBottom: 12 }}>该帖子已被删除</p>
            <button onClick={handleClose} style={{ padding: '8px 24px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>关闭</button>
          </div>
        </div>
      </div>
    );
  }

  if (!post) return null;

  const images = (() => {
    if (post.images && post.images.length > 0) return post.images;
    try {
      const parsed = JSON.parse(post.image_url);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {}
    return [post.image_url];
  })();

  const overlayClass = `${styles.overlay} ${closing ? styles.closing : ''} ${noAnimation ? styles.noAnimation : ''}`;
  const containerClass = `${styles.container} ${closing ? styles.closing : ''} ${noAnimation ? styles.noAnimation : ''}`;

  return (
    <div ref={overlayRef} className={overlayClass} onClick={handleClose}>
      <button className={styles.close} data-back onClick={handleClose} aria-label="关闭">
        <X size={28} />
      </button>
      <div className={containerClass} onClick={e => e.stopPropagation()}>
        <div className={styles.mobileHeader}>
          <button className={styles.backBtn} data-back onClick={handleClose} aria-label="返回">
            <ChevronLeft size={24} />
          </button>
          <div className={styles.mobileUser} onClick={() => handleNavigate(`/profile/${post.user_id}`)}>
            {post.avatar ? (
              <img src={resolveMediaUrl(post.avatar) || ''} alt="" className={styles.avatar} />
            ) : (
              <div className={styles.avatarPlaceholder}>
                {post.username.charAt(0).toUpperCase()}
              </div>
            )}
            <span className={styles.username}>{post.username}</span>
          </div>
          {user && post.user_id === user.id && (
            <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
              <button
                className={styles.editBtn}
                onClick={() => {
                  handleClose();
                  setTimeout(() => {
                    openEdit({
                      id: post.id,
                      description: post.description || '',
                      images: post.images || [post.image_url],
                      closeComments: !!post.close_comments,
                      pinned: !!post.pinned,
                      videoUrl: post.video_url || null,
                      videoCover: post.video_cover || null,
                    });
                  }, 250);
                }}
                title="编辑帖子"
              >
                <Pencil size={18} />
              </button>
              <button
                className={styles.editBtn}
                onClick={() => setShowDeletePostConfirm(true)}
                title="删除帖子"
              >
                <Trash2 size={18} />
              </button>
            </div>
          )}
        </div>
        <PostMedia
          post={post}
          images={images}
          detailVideoRef={detailVideoRef}
          currentImageIndex={currentImageIndex}
          setCurrentImageIndex={setCurrentImageIndex}
          isPaused={isPaused}
          setIsPaused={setIsPaused}
          zoomed={zoomed}
          setZoomed={setZoomed}
        />
        <div className={styles.info}>
          <div className={styles.header}>
            <div className={styles.userLink} onClick={() => handleNavigate(`/profile/${post.user_id}`)} style={{ cursor: 'pointer' }}>
              {post.avatar ? (
                <img src={resolveMediaUrl(post.avatar) || ''} alt="" className={styles.avatar} />
              ) : (
                <div className={styles.avatarPlaceholder}>
                  {post.username.charAt(0).toUpperCase()}
                </div>
              )}
              <span className={styles.username}>{post.username}</span>
            </div>
            {user && post.user_id !== user.id && !isFollowing && (
              <>
                <span className={styles.dot}>•</span>
                <button
                  className={styles.followBtn}
                  onClick={handleFollow}
                >
                  关注
                </button>
              </>
            )}
          </div>

          <div className={styles.comments}>
            {post.description && (
              <div className={styles.comment}>
                {post.avatar ? (
                  <img src={resolveMediaUrl(post.avatar) || ''} alt="" className={styles.commentAvatar} />
                ) : (
                  <div className={styles.commentAvatarPlaceholder}>
                    {post.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className={styles.commentContent}>
                    <span className={styles.commentUsername}>{post.username}</span>
                    {post.description}
                  </div>
                </div>
              </div>
            )}
            {(() => {
              return buildVisibleComments(comments, collapsedReplies).map(item => {
                if (!item) return null;
                const { comment, isReply, isCollapsed, hasReplies, replyCount } = item;
                const activeHighlighted = activeHighlightId === comment.id;

                return (
                  <CommentItem
                    key={comment.id}
                    comment={comment}
                    isReply={isReply}
                    isCollapsed={isCollapsed}
                    hasReplies={hasReplies}
                    replyCount={replyCount}
                    activeHighlighted={activeHighlighted}
                    currentUserId={user?.id}
                    innerRef={activeHighlighted ? highlightRef : undefined}
                    onProfileClick={(id) => handleNavigate(`/profile/${id}`)}
                    onReply={(c) => {
                      if (!user) { openLoginPrompt(); return; }
                      setReplyingTo({ id: c.id, username: c.username });
                      commentInputRef.current?.focus();
                    }}
                    onToggleReplies={toggleReplies}
                    onLike={handleCommentLike}
                    onDelete={handleDeleteComment}
                  />
                );
              });
            })()}
            <div ref={commentsEndRef} />
          </div>

          <div className={styles.actions}>
            <button className={`${styles.actionBtn} ${liked ? styles.liked : ''}`} onClick={toggleLike} aria-label={liked ? '取消点赞' : '点赞'}>
              <svg ref={heartRef} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" fill="none" stroke="currentColor" /></svg>
              <span className={styles.actionCount}>{likeCount}</span>
            </button>
            <button
              className={styles.actionBtn}
              onClick={() => {
                if (!user) { openLoginPrompt(); return; }
                commentInputRef.current?.focus();
              }}
              aria-label="评论"
            >
              <MessageCircle size={24} />
              <span className={styles.actionCount}>{comments.length}</span>
            </button>
            <button className={`${styles.actionBtn} ${reposted ? styles.reposted : ''}`} onClick={toggleRepost} aria-label={reposted ? '取消转发' : '转发'}>
              {reposted ? <RepostCheck size={28} /> : <Repeat2 size={28} />}
              {repostCount > 0 && <span className={styles.actionCount}>{repostCount}</span>}
            </button>
            <button className={`${styles.actionBtn} ${styles.shareTooltip}`} onClick={handleShare} aria-label="分享">
              <Share2 size={24} />
              {shareCount > 0 && <span className={styles.actionCount}>{shareCount}</span>}
              {showTooltip && <span className={styles.shareTooltipText}>已复制链接</span>}
            </button>
            <button className={`${styles.actionBtn} ${styles.bookmarkBtn} ${bookmarked ? styles.bookmarked : ''}`} onClick={toggleBookmark} aria-label={bookmarked ? '取消收藏' : '收藏'}>
              <Bookmark size={24} fill={bookmarked ? 'currentColor' : 'none'} />
            </button>
          </div>

          {post.close_comments ? (
            <div className={styles.commentsDisabled}>
              此帖子已关闭评论
            </div>
          ) : (
            <>
              {replyingTo && (
                <div className={styles.replyingToBar}>
                  回复 @{replyingTo.username}
                  <button onClick={() => setReplyingTo(null)}>取消</button>
                </div>
              )}
              <div
                className={styles.inputWrapper}
                onClick={() => { if (!user) openLoginPrompt(); }}
              >
                <EmojiPicker
                  onSelect={(emoji) => setNewComment(prev => prev + emoji)}
                  onOpen={() => {
                    if (!user) { openLoginPrompt(); return; }
                  }}
                  onClose={() => {
                  }}
                />
                <input
                  ref={commentInputRef}
                  className={`${styles.input}${!user ? ` ${styles.inputLocked}` : ''}`}
                  placeholder={user ? (replyingTo ? `回复 @${replyingTo.username}...` : '添加评论...') : '登录后即可评论'}
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleComment()}
                  onFocus={() => { if (!user) openLoginPrompt(); }}
                  readOnly={!user}
                />
                <button
                  className={styles.submit}
                  onClick={handleComment}
                  disabled={!user || !newComment.trim() || submitting}
                  aria-label="发送评论"
                >
                  <Send size={20} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {deleteTargetId !== null && (
        <ConfirmDialog
          message="确定要删除这条评论吗？"
          onConfirm={confirmDeleteComment}
          onCancel={() => setDeleteTargetId(null)}
        />
      )}

      {showDeletePostConfirm && (
        <ConfirmDialog
          message="确定要删除这篇帖子吗？"
          onConfirm={handleDeletePost}
          onCancel={() => setShowDeletePostConfirm(false)}
        />
      )}

      {profileUserId && (
        <Suspense fallback={null}>
          <LazyProfileOverlay
            userId={profileUserId}
            onClose={() => setProfileUserId(null)}
          />
        </Suspense>
      )}
    </div>
  );
}