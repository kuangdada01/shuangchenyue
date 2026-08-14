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
import panel from './PostDescriptionPanel.module.css';

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
    <div className={panel.editRight}>
      <div className={panel.user}>
        {user?.avatar ? (
          <img src={resolveMediaUrl(user.avatar) || user.avatar} alt="" className={panel.avatar} />
        ) : (
          <div className={panel.avatarPlaceholder}>{user?.username?.charAt(0).toUpperCase()}</div>
        )}
        <span className={panel.username}>{user?.username}</span>
      </div>
      <div className={panel.descWrapper}>
        <textarea
          ref={textareaRef}
          className={panel.textarea}
          value={description}
          onChange={e => setDescription(e.target.value)}
          maxLength={2000}
          autoFocus
        />
        <div className={panel.descFooter}>
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
          <span className={panel.charCount}>{description.length}/2000</span>
        </div>
      </div>
      <div className={panel.advanced}>
        <button className={panel.advancedToggle} onClick={() => setShowAdvanced(v => !v)}>
          <span>高级设置</span>
          {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {showAdvanced && (
          <div className={panel.advancedOptions}>
            <label className={panel.toggleLabel}>
              <span>关闭评论</span>
              <div className={`${panel.toggle} ${closeComments ? panel.on : ''}`} onClick={() => setCloseComments(v => !v)}>
                <div className={panel.toggleKnob} />
              </div>
            </label>
            <label className={panel.toggleLabel}>
              <span>置顶</span>
              <div className={`${panel.toggle} ${pinned ? panel.on : ''}`} onClick={() => setPinned(v => !v)}>
                <div className={panel.toggleKnob} />
              </div>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
