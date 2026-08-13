/**
 * ============================================================
 * 评论条目组件 (CommentItem)
 * ============================================================
 * 帖子详情中的单条评论（含回复标签、点赞、删除、回复、折叠操作）
 * 纯展示组件，状态与数据请求由 PostDetail 管理
 * ============================================================
 */

import { Heart, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Comment } from '../types';
import { formatAbsoluteTime, resolveMediaUrl } from '../utils';

interface CommentItemProps {
  comment: Comment;
  isReply: boolean;
  isCollapsed: boolean;
  hasReplies: boolean;
  replyCount: number;
  activeHighlighted: boolean;
  currentUserId: number | null | undefined;
  innerRef?: React.Ref<HTMLDivElement>;
  onProfileClick: (userId: number) => void;
  onReply: (comment: Comment) => void;
  onToggleReplies: (commentId: number) => void;
  onLike: (commentId: number) => void;
  onDelete: (commentId: number) => void;
}

export default function CommentItem({
  comment,
  isReply,
  isCollapsed,
  hasReplies,
  replyCount,
  activeHighlighted,
  currentUserId,
  innerRef,
  onProfileClick,
  onReply,
  onToggleReplies,
  onLike,
  onDelete,
}: CommentItemProps) {
  return (
    <div key={comment.id} id={`comment-${comment.id}`} className={`post-detail-comment ${isReply ? 'comment-reply-item' : ''}`}>
      <div className="post-detail-comment-avatar-link" onClick={() => onProfileClick(comment.user_id)} style={{ cursor: 'pointer' }}>
        {comment.avatar ? (
          <img src={resolveMediaUrl(comment.avatar) || ''} alt="" className="post-detail-comment-avatar" />
        ) : (
          <div className="post-detail-comment-avatar-placeholder">
            {comment.username.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div ref={innerRef} style={{ flex: 1 }} className={activeHighlighted ? 'comment-highlight' : ''}>
        <div className="post-detail-comment-content">
          <span className="post-detail-comment-username-link" onClick={() => onProfileClick(comment.user_id)} style={{ cursor: 'pointer' }}>{comment.username}</span>
          {isReply && comment.parent_username && (
            <span className="comment-reply-tag">@{comment.parent_username}</span>
          )}
          {comment.content}
        </div>
        <div className="comment-actions-row">
          <span className="post-detail-comment-time">{formatAbsoluteTime(comment.created_at)}</span>
          <button
            className="comment-reply-btn"
            onClick={() => onReply(comment)}
          >
            回复
          </button>
          {!isReply && hasReplies && (
            <button
              className="comment-collapse-btn"
              onClick={() => onToggleReplies(comment.id)}
            >
              {isCollapsed ? (
                <>
                  <ChevronDown size={14} />
                  <span>展开{replyCount}条回复</span>
                </>
              ) : (
                <>
                  <ChevronUp size={14} />
                  <span>收起回复</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        <button
          className={`comment-like-btn ${comment.liked ? 'liked' : ''}`}
          onClick={() => onLike(comment.id)}
        >
          <Heart size={14} fill={comment.liked ? '#ed4956' : 'none'} stroke={comment.liked ? '#ed4956' : 'currentColor'} />
          {comment.like_count > 0 && <span>{comment.like_count}</span>}
        </button>
        {comment.user_id === currentUserId && (
          <button
            className="comment-delete-btn"
            onClick={() => onDelete(comment.id)}
            title="删除评论"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
