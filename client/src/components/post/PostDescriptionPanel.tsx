/**
 * ============================================================
 * 帖子描述面板 (PostDescriptionPanel)
 * ============================================================
 * 创建/编辑帖子的右侧"编辑分享"面板（描述、表情、字数、
 * 高级设置：关闭评论/置顶），CreatePost 与 EditPost 共用。
 */

import { RefObject } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import type { User } from '../../types';
import { resolveMediaUrl } from '../../utils';
import EmojiPicker from '../EmojiPicker';

interface PostDescriptionPanelProps {
  user: User | null;
  description: string;
  setDescription: React.Dispatch<React.SetStateAction<string>>;
  closeComments: boolean;
  setCloseComments: React.Dispatch<React.SetStateAction<boolean>>;
  pinned: boolean;
  setPinned: React.Dispatch<React.SetStateAction<boolean>>;
  showAdvanced: boolean;
  setShowAdvanced: React.Dispatch<React.SetStateAction<boolean>>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

export default function PostDescriptionPanel({
  user, description, setDescription,
  closeComments, setCloseComments, pinned, setPinned,
  showAdvanced, setShowAdvanced, textareaRef,
}: PostDescriptionPanelProps) {
  return (
    <div className="create-edit-right">
      <div className="create-edit-user">
        {user?.avatar ? (
          <img src={resolveMediaUrl(user.avatar) || user.avatar} alt="" className="create-edit-avatar" />
        ) : (
          <div className="create-edit-avatar-placeholder">{user?.username?.charAt(0).toUpperCase()}</div>
        )}
        <span className="create-edit-username">{user?.username}</span>
      </div>
      <div className="create-edit-desc-wrapper">
        <textarea
          ref={textareaRef}
          className="create-edit-textarea"
          value={description}
          onChange={e => setDescription(e.target.value)}
          maxLength={2000}
          autoFocus
        />
        <div className="create-edit-desc-footer">
          <EmojiPicker
            onSelect={(emoji) => setDescription(prev => prev + emoji)}
            onSelected={() => {
              if (textareaRef.current) {
                textareaRef.current.focus();
                const len = textareaRef.current.value.length;
                textareaRef.current.setSelectionRange(len, len);
              }
            }}
            onOpen={() => textareaRef.current?.blur()}
            onClose={() => textareaRef.current?.focus()}
          />
          <span className="create-edit-char-count">{description.length}/2000</span>
        </div>
      </div>
      <div className="create-edit-advanced">
        <button className="create-edit-advanced-toggle" onClick={() => setShowAdvanced(v => !v)}>
          <span>高级设置</span>
          {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {showAdvanced && (
          <div className="create-edit-advanced-options">
            <label className="create-edit-toggle-label">
              <span>关闭评论</span>
              <div className={`create-edit-toggle ${closeComments ? 'on' : ''}`} onClick={() => setCloseComments(v => !v)}>
                <div className="create-edit-toggle-knob" />
              </div>
            </label>
            <label className="create-edit-toggle-label">
              <span>置顶</span>
              <div className={`create-edit-toggle ${pinned ? 'on' : ''}`} onClick={() => setPinned(v => !v)}>
                <div className="create-edit-toggle-knob" />
              </div>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
