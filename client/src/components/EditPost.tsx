/**
 * ============================================================
 * 编辑帖子组件 (EditPost)
 * ============================================================
 * 编辑已有帖子的模态框
 *
 * 功能:
 * - 图片增删、拖拽排序（与 CreatePost 相同的拖拽逻辑）
 * - 修改帖子描述
 * - 开关评论功能
 * - 高级设置折叠面板
 * ============================================================
 */

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp, X, ImagePlus } from 'lucide-react';
import { useImageGridDrag } from '../hooks/useImageGridDrag';
import EmojiPicker from './EmojiPicker';
import ConfirmDialog from './ui/ConfirmDialog';
import { useAuth } from '../context/AuthContext';
import { useEvent, type EditPostData } from '../context/CreateContext';
import { showToast } from './ui/Toast';
import { updatePost } from '../api/posts';
import { resolveMediaUrl } from '../utils';
import composer from './post/PostComposer.module.css';
import panel from './post/PostDescriptionPanel.module.css';

interface ImageItem {
  url: string;
  isNew: boolean;
  file?: File;
}

export default function EditPost() {
  const { user } = useAuth();
  const { editPost, closeEdit, onEditSave } = useEvent();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Edit state
  const [description, setDescription] = useState('');
  const [closeComments, setCloseComments] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Image management - unified array
  const [images, setImages] = useState<ImageItem[]>([]);

  // Drag state for 9-grid
  const [step, setStep] = useState<'grid' | 'edit'>('grid');

  // 图片拖拽排序（按下即拖，实时重排；见 hooks/useImageGridDrag）
  const { dragIndex, gridRefs, handlers: dragHandlers } = useImageGridDrag(setImages);

  // 打开新帖子时同步编辑状态：改为渲染期调整（prev 值存 state 的官方模式），
  // 替代 useEffect 内同步 setState（react-hooks/set-state-in-effect），行为一致
  const [prevEditPost, setPrevEditPost] = useState<EditPostData | null>(null);
  if (editPost && editPost !== prevEditPost) {
    setPrevEditPost(editPost);
    setDescription(editPost.description || '');
    setCloseComments(editPost.closeComments);
    setPinned(editPost.pinned);
    setImages(editPost.images.map(url => ({ url, isNew: false })));
    setCurrentImageIndex(0);
    // Video posts skip grid step, go directly to edit
    setStep(editPost.videoUrl ? 'edit' : 'grid');
  }

  // 进入编辑步骤时光标定位到文字末尾
  useEffect(() => {
    if (step === 'edit' && textareaRef.current) {
      const timer = setTimeout(() => {
        if (textareaRef.current) {
          const len = textareaRef.current.value.length;
          textareaRef.current.setSelectionRange(len, len);
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [step]);

  const handleAddImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const remaining = 9 - images.length;
    const toAdd = files.slice(0, remaining);
    if (toAdd.length === 0) return;

    // 检查文件大小 (10MB)
    const maxSize = 10 * 1024 * 1024;
    const validFiles = toAdd.filter(file => {
      if (file.size > maxSize) {
        showToast(`"${file.name}" 超过10MB限制`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;
    const newItems: ImageItem[] = [];
    validFiles.forEach(file => {
      const url = URL.createObjectURL(file);
      newItems.push({ url, isNew: true, file });
    });
    setImages(prev => [...prev, ...newItems]);
    e.target.value = '';
  };

  const handleRemoveImage = (index: number) => {
    setImages(prev => {
      const item = prev[index];
      if (item.isNew) {
        URL.revokeObjectURL(item.url);
      }
      return prev.filter((_, i) => i !== index);
    });
    if (currentImageIndex >= images.length - 1) {
      setCurrentImageIndex(Math.max(0, images.length - 2));
    }
  };

  const handleClose = () => {
    if (hasChanges) {
      setShowDiscardConfirm(true);
    } else {
      doClose();
    }
  };

  const doClose = () => {
    setClosing(true);
    setTimeout(() => closeEdit(), 200);
  };

  const hasChanges = description !== (editPost?.description || '') ||
    closeComments !== editPost?.closeComments ||
    pinned !== editPost?.pinned ||
    images.some(img => img.isNew) ||
    images.length !== (editPost?.images.length || 0);

  const handleSubmit = async () => {
    if (submitting || !editPost) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('description', description);
      formData.append('keepImages', JSON.stringify(images.filter(img => !img.isNew).map(img => img.url)));
      if (closeComments) formData.append('close_comments', '1');
      if (pinned) formData.append('pinned', '1');
      images.filter(img => img.isNew && img.file).forEach(img => formData.append('images', img.file!));
      // updatePost 使用 timeout: 0（新增图片最多9×10MB，慢速网络可能超过全局15s超时，
      // 超时会导致"保存失败"误报，但服务端实际已保存）
      await updatePost(editPost.id, formData);
      showToast('编辑成功！');
      doClose();
      onEditSave?.();
    } catch (err: any) {
      const msg = err.response?.data?.error || '保存失败';
      showToast(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!editPost) return null;

  // Step 1: Grid view for image management
  if (step === 'grid') {
    const displayOrder = images.map((_, i) => i);
    return (
      <div
        className={`${composer.overlay}${closing ? ` ${composer.closing}` : ''}`}
        onPointerMove={dragHandlers.onPointerMove}
        onPointerUp={dragHandlers.onPointerUp}
        onPointerCancel={dragHandlers.onPointerCancel}
      >
        <div className={`${composer.dialog}${closing ? ` ${composer.closing}` : ''}`}>
          <div className={composer.overlayHeader}>
            <button className={`${composer.overlayBtn} ${composer.danger}`} onClick={handleClose}>取消</button>
            <span className={composer.overlayTitle}>编辑图片</span>
            <button className={`${composer.overlayBtn} ${composer.primary}`} onClick={() => {
              if (images.length === 0) {
                showToast('请至少保留一张图片');
                return;
              }
              setStep('edit');
            }}>
              下一步
            </button>
          </div>
          <div className={composer.overlayBody}>
            <div className={composer.gridWrapper}>
              <div className={composer.grid}>
                {displayOrder.map((i) => {
                  const img = images[i];
                  return (
                    <div
                      key={`${img.url}-${i}`}
                      ref={el => { gridRefs.current[i] = el; }}
                      className={[
                        composer.gridItem,
                        i === dragIndex ? (composer.dragging || '') : '',
                      ].filter(Boolean).join(' ')}
                      onPointerDown={(e) => dragHandlers.onPointerDown(e, i)}
                    >
                      <img src={resolveMediaUrl(img.url) || img.url} alt={`图片 ${i + 1}`} draggable={false} />
                      <span className={composer.gridIndex}>{i + 1}</span>
                      {img.isNew && <span className={composer.gridNewBadge}>新</span>}
                      <button
                        className={composer.gridDeleteBtn}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); handleRemoveImage(i); }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
                {images.length < 9 && (
                  <div className={composer.gridAdd} onClick={() => fileInputRef.current?.click()}>
                    <ImagePlus size={28} />
                  </div>
                )}
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/gif,image/webp" multiple style={{ display: 'none' }} onChange={handleAddImages} />
          </div>
        </div>

        {showDiscardConfirm && (
          <ConfirmDialog
            message="确定要放弃编辑吗？"
            onConfirm={doClose}
            onCancel={() => setShowDiscardConfirm(false)}
          />
        )}
      </div>
    );
  }

  // Step 2: Edit description
  return (
    <div className={`${composer.overlay}${closing ? ` ${composer.closing}` : ''}`}>
      <div className={`${composer.dialog}${closing ? ` ${composer.closing}` : ''}`}>
        <div className={composer.overlayHeader}>
          <button className={`${composer.overlayBtn} ${composer.danger}`} onClick={() => editPost?.videoUrl ? handleClose() : setStep('grid')}>后退</button>
          <span className={composer.overlayTitle}>编辑帖子</span>
          <button className={`${composer.overlayBtn} ${composer.primary}`} onClick={handleSubmit} disabled={submitting}>
            {submitting ? '保存中...' : '完成'}
          </button>
        </div>
        <div className={composer.editLayout}>
          <div className={composer.editLeft}>
            <div className={composer.editImageWrapper}>
              {editPost?.videoUrl ? (
                <video src={editPost.videoUrl} controls className={composer.editVideo} />
              ) : (
                <img src={resolveMediaUrl(images[currentImageIndex]?.url) || images[currentImageIndex]?.url} alt="" className={composer.editImage} />
              )}
              {!editPost?.videoUrl && images.length > 1 && (
                <>
                  {currentImageIndex > 0 && (
                    <button
                      className={`${composer.editNav} ${composer.editPrev}`}
                      onClick={() => setCurrentImageIndex(prev => prev - 1)}
                    >
                      ‹
                    </button>
                  )}
                  {currentImageIndex < images.length - 1 && (
                    <button
                      className={`${composer.editNav} ${composer.editNext}`}
                      onClick={() => setCurrentImageIndex(prev => prev + 1)}
                    >
                      ›
                    </button>
                  )}
                  <div className={composer.editDots}>
                    {images.map((_, i) => (
                      <span
                        key={i}
                        className={`${composer.editDot} ${i === currentImageIndex ? composer.active : ''}`}
                        onClick={() => setCurrentImageIndex(i)}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
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
        </div>
      </div>

      {showDiscardConfirm && (
        <ConfirmDialog
          message="确定要放弃编辑吗？"
          onConfirm={doClose}
          onCancel={() => setShowDiscardConfirm(false)}
        />
      )}
    </div>
  );
}
