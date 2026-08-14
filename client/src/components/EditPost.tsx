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

import { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, X, ImagePlus } from 'lucide-react';
import EmojiPicker from './EmojiPicker';
import ConfirmDialog from './ui/ConfirmDialog';
import { useAuth } from '../context/AuthContext';
import { useEvent } from '../context/CreateContext';
import { showToast } from './ui/Toast';
import api from '../api';
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
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const overIndexRef = useRef<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragSrcIndex, setDragSrcIndex] = useState(-1);
  const [isPressing, setIsPressing] = useState(false);
  const [dragSize, setDragSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const dragRef = useRef<{
    index: number; startX: number; startY: number; offsetX: number; offsetY: number;
    currentX: number; currentY: number; active: boolean; timer: ReturnType<typeof setTimeout> | null;
  }>({ index: -1, startX: 0, startY: 0, offsetX: 0, offsetY: 0, currentX: 0, currentY: 0, active: false, timer: null });
  const gridItemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dragPortalRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const prevPositionsRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const animatingRef = useRef(false);

  useEffect(() => {
    if (editPost) {
      setDescription(editPost.description || '');
      setCloseComments(editPost.closeComments);
      setPinned(editPost.pinned);
      setImages(editPost.images.map(url => ({ url, isNew: false })));
      setCurrentImageIndex(0);
      // Video posts skip grid step, go directly to edit
      setStep(editPost.videoUrl ? 'edit' : 'grid');
    }
  }, [editPost]);

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

  // Update dragged item position to follow cursor
  const updateDraggedPosition = useCallback(() => {
    const d = dragRef.current;
    if (!d.active) return;
    const el = dragPortalRef.current;
    if (!el) return;
    el.style.left = `${d.currentX - d.offsetX}px`;
    el.style.top = `${d.currentY - d.offsetY}px`;
  }, []);

  // Virtual order: reorders non-dragged items
  const reorderedIndices = useMemo(() => {
    if (!isDragging || overIndex === null || dragSrcIndex < 0 || overIndex === dragSrcIndex) return [];
    const others = Array.from({ length: images.length }, (_, k) => k).filter(k => k !== dragSrcIndex);
    others.splice(overIndex, 0, dragSrcIndex);
    return others.filter(i => i !== dragSrcIndex);
  }, [isDragging, overIndex, dragSrcIndex, images.length]);

  // Save initial positions when drag starts
  useLayoutEffect(() => {
    if (!isDragging || dragSrcIndex < 0) return;
    const positions = new Map<number, { x: number; y: number }>();
    gridItemRefs.current.forEach((el, i) => {
      if (el && i !== dragSrcIndex) {
        const r = el.getBoundingClientRect();
        positions.set(i, { x: r.left, y: r.top });
      }
    });
    prevPositionsRef.current = positions;
  }, [isDragging, dragSrcIndex]);

  // FLIP animation
  useLayoutEffect(() => {
    if (!isDragging || reorderedIndices.length === 0) return;
    const prevPos = prevPositionsRef.current;
    const newPositions = new Map<number, { x: number; y: number }>();
    let hasTransform = false;

    reorderedIndices.forEach(i => {
      const el = gridItemRefs.current[i];
      if (!el) return;
      const r = el.getBoundingClientRect();
      newPositions.set(i, { x: r.left, y: r.top });
      const oldPos = prevPos.get(i);
      if (oldPos) {
        const dx = oldPos.x - r.left;
        const dy = oldPos.y - r.top;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          el.style.transition = 'none';
          el.style.transform = `translate(${dx}px, ${dy}px)`;
          hasTransform = true;
        }
      }
    });

    reorderedIndices.forEach(i => {
      const pos = newPositions.get(i);
      if (pos) prevPositionsRef.current.set(i, pos);
    });

    if (hasTransform) {
      animatingRef.current = true;
      requestAnimationFrame(() => {
        reorderedIndices.forEach(i => {
          const el = gridItemRefs.current[i];
          if (!el) return;
          el.style.transition = 'transform 0.25s ease';
          el.style.transform = '';
        });
        setTimeout(() => { animatingRef.current = false; }, 350);
      });
    }
  }, [reorderedIndices]);

  // Cleanup on drag end
  useEffect(() => {
    if (!isDragging) return;
    return () => {
      gridItemRefs.current.forEach(el => {
        if (el) {
          el.style.transform = '';
          el.style.transition = '';
        }
      });
      prevPositionsRef.current.clear();
    };
  }, [isDragging]);

  // 拖拽处理函数（Pointer Events 统一鼠标和触摸，避免 Android WebView touchend 丢失问题）
  const reorder = useCallback((from: number, to: number) => {
    setImages(prev => {
      const arr = [...prev];
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return arr;
    });
  }, []);

  const startDrag = useCallback((index: number) => {
    const el = gridItemRefs.current[index];
    if (!el) return;
    el.style.transform = '';
    const rect = el.getBoundingClientRect();
    const d = dragRef.current;
    d.offsetX = d.currentX - rect.left;
    d.offsetY = d.currentY - rect.top;
    d.active = true;
    setIsPressing(false);
    setDragSize({ w: rect.width, h: rect.height });
    setDragSrcIndex(index);
    setOverIndex(index);
    overIndexRef.current = index;
    setIsDragging(true);
    navigator.vibrate?.(50);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
  }, []);

  const handlePointerDown = (e: React.PointerEvent, index: number) => {
    if (isDragging) return;
    const d = dragRef.current;
    d.index = index;
    d.startX = e.clientX; d.startY = e.clientY;
    d.currentX = e.clientX; d.currentY = e.clientY;
    d.active = false;
    setIsPressing(true);
    d.timer = setTimeout(() => startDrag(index), 500);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (d.index < 0) return;
    if (!d.active) {
      if (Math.abs(e.clientX - d.startX) > 5 || Math.abs(e.clientY - d.startY) > 5) {
        if (d.timer) { clearTimeout(d.timer); d.timer = null; }
        d.index = -1; setIsPressing(false);
      }
      return;
    }
    if (e.clientX === d.currentX && e.clientY === d.currentY) return;
    d.currentX = e.clientX; d.currentY = e.clientY;
    updateDraggedPosition();
    if (animatingRef.current) return;
    let newOver = overIndex !== null ? overIndex : d.index;
    gridItemRefs.current.forEach((el, i) => {
      if (!el || i === d.index) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const hw = r.width * 0.3;
      const hh = r.height * 0.3;
      if (e.clientX >= cx - hw && e.clientX <= cx + hw && e.clientY >= cy - hh && e.clientY <= cy + hh) {
        newOver = i;
      }
    });
    if (newOver !== overIndex) {
      setOverIndex(newOver);
      overIndexRef.current = newOver;
    }
  };

  const finishDrag = useCallback(() => {
    const d = dragRef.current;
    if (d.timer) { clearTimeout(d.timer); d.timer = null; }
    const currentOver = overIndexRef.current;
    if (d.active && currentOver !== null && d.index !== currentOver) {
      reorder(d.index, currentOver);
    }
    d.index = -1; d.active = false;
    dragPortalRef.current = null;
    overIndexRef.current = null;
    setIsDragging(false); setOverIndex(null); setDragSrcIndex(-1); setIsPressing(false);
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }, [reorder]);

  const handlePointerUp = useCallback(() => {
    finishDrag();
  }, [finishDrag]);

  const handlePointerCancel = useCallback(() => {
    const d = dragRef.current;
    if (d.timer) { clearTimeout(d.timer); d.timer = null; }
    // 取消拖拽（如系统手势中断）：不重排，仅重置
    d.index = -1; d.active = false;
    dragPortalRef.current = null;
    overIndexRef.current = null;
    setIsDragging(false); setOverIndex(null); setDragSrcIndex(-1); setIsPressing(false);
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }, []);


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
    // 清理可能残留的拖拽状态（删除按钮不应触发拖拽，防御异常路径）
    if (dragRef.current.timer) { clearTimeout(dragRef.current.timer); dragRef.current.timer = null; }
    dragRef.current.index = -1; dragRef.current.active = false;
    setIsPressing(false); setIsDragging(false);
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
      await api.put(`/posts/${editPost.id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
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
    const displayOrder = reorderedIndices.length > 0 ? reorderedIndices : images.map((_, i) => i);
    return (
      <div
        ref={overlayRef}
        className={`${composer.overlay}${closing ? ` ${composer.closing}` : ''}`}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
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
                  const isBeingDragged = isDragging && i === dragSrcIndex;
                  return (
                    <div
                      key={`${img.url}-${i}`}
                      ref={el => { gridItemRefs.current[i] = el; }}
                      className={`${composer.gridItem}${isPressing && dragRef.current.index === i ? composer.pressing : ''}${isBeingDragged ? composer.draggingSource : ''}`}
                      onPointerDown={(e) => handlePointerDown(e, i)}
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

        {/* Dragged item — portal */}
        {isDragging && dragSrcIndex >= 0 && images[dragSrcIndex] && createPortal(
          <div
            ref={(el) => {
              dragPortalRef.current = el;
              if (el) {
                const d = dragRef.current;
                el.style.left = `${d.currentX - d.offsetX}px`;
                el.style.top = `${d.currentY - d.offsetY}px`;
              }
            }}
            className={composer.gridDragging}
            style={{ width: `${dragSize.w}px`, height: `${dragSize.h}px` }}
          >
            <img src={resolveMediaUrl(images[dragSrcIndex].url) || images[dragSrcIndex].url} alt="" draggable={false} />
          </div>,
          document.body
        )}

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
