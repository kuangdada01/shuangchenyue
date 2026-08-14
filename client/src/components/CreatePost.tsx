/**
 * ============================================================
 * 创建帖子组件 (CreatePost)
 * ============================================================
 * 创建帖子的3步流程模态框
 *
 * 步骤:
 * 1. 选择媒体: 选择图片（最多9张）或视频
 * 2. 视频封面: 从视频截取或上传自定义封面（仅视频帖子）
 * 3. 编辑分享: 添加描述、高级设置（关闭评论）
 *
 * 特性:
 * - 图片拖拽排序（按下即拖，实时重排）
 * - 视频封面截取（滑动时间轴选择帧）
 * - 放弃确认对话框
 * - 关闭动画效果
 * ============================================================
 */

import { useState, useRef, useEffect } from 'react';
import { ImagePlus, Video, X, ChevronDown, ChevronUp } from 'lucide-react';
import EmojiPicker from './EmojiPicker';
import ConfirmDialog from './ui/ConfirmDialog';
import { useAuth } from '../context/AuthContext';
import { useEvent } from '../context/CreateContext';
import { events } from '../state/events';
import { showToast } from './ui/Toast';
import { useImageGridDrag } from '../hooks/useImageGridDrag';
import api from '../api';
import { resolveMediaUrl } from '../utils';
import styles from './CreatePost.module.css';
import composer from './post/PostComposer.module.css';
import panel from './post/PostDescriptionPanel.module.css';

export default function CreatePost() {
  const { user } = useAuth();
  const { closeCreate } = useEvent();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 步骤: 1 = 选择媒体, 2 = 视频封面, 3 = 编辑分享
  const [step, setStep] = useState(1);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [videoCoverFile, setVideoCoverFile] = useState<File | null>(null);
  const [videoCoverPreview, setVideoCoverPreview] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [coverTime, setCoverTime] = useState(0);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [closeComments, setCloseComments] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [closing, setClosing] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // 图片拖拽排序（按下即拖，实时重排；见 hooks/useImageGridDrag）
  const { dragIndex, gridRefs, handlers: dragHandlers } = useImageGridDrag(setImagePreviews);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const remaining = 9 - imageFiles.length;
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

    // 选择照片时清除视频状态
    if (videoFile) {
      handleRemoveVideo();
    }

    setImageFiles(prev => [...prev, ...validFiles]);
    validFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => setImagePreviews(prev => [...prev, reader.result as string]);
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleRemoveImage = (index: number) => {
    setImageFiles(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 检查视频大小 (100MB)
    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(1);
      showToast(`视频大小 ${sizeMB}MB，超过100MB限制`);
      e.target.value = '';
      return;
    }

    // 选择视频时清除照片状态
    if (imageFiles.length > 0) {
      setImageFiles([]);
      setImagePreviews([]);
    }

    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoPreview(url);
    setVideoCoverFile(null);
    setVideoCoverPreview(null);
    setCoverTime(0);
    setStep(2); // 自动跳转到封面编辑
    e.target.value = '';
  };

  const handleRemoveVideo = () => {
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    if (videoCoverPreview) URL.revokeObjectURL(videoCoverPreview);
    setVideoFile(null);
    setVideoPreview(null);
    setVideoCoverFile(null);
    setVideoCoverPreview(null);
    setCoverTime(0);
  };

  // 从视频中截取指定时间的帧
  const extractFrame = (time: number) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    video.currentTime = time;
    video.onseeked = () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const file = new File([blob], 'cover.jpg', { type: 'image/jpeg' });
        if (videoCoverPreview) URL.revokeObjectURL(videoCoverPreview);
        setVideoCoverFile(file);
        setVideoCoverPreview(URL.createObjectURL(file));
      }, 'image/jpeg', 0.9);
    };
  };

  const handleCoverTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCoverTime(time);
    extractFrame(time);
  };

  const handleCoverFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (videoCoverPreview) URL.revokeObjectURL(videoCoverPreview);
    setVideoCoverFile(file);
    setVideoCoverPreview(URL.createObjectURL(file));
    e.target.value = '';
  };

  const handleVideoLoaded = () => {
    const video = videoRef.current;
    if (!video) return;
    setVideoDuration(video.duration);
    // 自动截取第一帧作为默认封面
    extractFrame(0);
  };

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => {
      closeCreate();
    }, 200);
  };

  const handleDiscard = () => {
    if (hasContent) { setShowDiscardConfirm(true); }
    else handleClose();
  };

  const confirmDiscard = () => {
    setImageFiles([]); setImagePreviews([]); handleRemoveVideo(); setDescription(''); setCurrentImageIndex(0); setStep(1);
    setShowDiscardConfirm(false); handleClose();
  };

  const hasContent = imageFiles.length > 0 || videoFile !== null;

  // 打开时推入历史记录，让返回键可以触发放弃操作
  useEffect(() => {
    window.history.pushState(null, '', window.location.href);
  }, []);

  // Android 返回键：触发放弃操作
  // 使用 capture phase + stopPropagation 阻止 HomePage 的 popstate 处理器
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      e.stopPropagation(); // 阻止 HomePage 的 capture handler
      if (showDiscardConfirm) {
        setShowDiscardConfirm(false);
      } else {
        handleDiscard();
      }
    };
    window.addEventListener('popstate', handlePopState, true); // capture phase
    return () => window.removeEventListener('popstate', handlePopState, true);
  }, [showDiscardConfirm, hasContent]);

  // ESC 键关闭（有内容时弹出放弃确认）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showDiscardConfirm) {
          setShowDiscardConfirm(false);
        } else {
          handleDiscard();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showDiscardConfirm, hasContent]);

  const handleContinue = () => {
    if (videoFile) setStep(2); // 视频跳转封面编辑
    else if (imageFiles.length > 0) { setCurrentImageIndex(0); setStep(3); } // 图片跳转描述编辑
  };
  const handleBack = () => {
    if (step === 2) setStep(1); // 从封面返回媒体选择
    else if (step === 3) setStep(videoFile ? 2 : 1); // 从描述返回
  };

  const handleSubmit = async () => {
    if (!hasContent || submitting) return;
    setSubmitting(true);
    try {
      if (videoFile) {
        const formData = new FormData();
        formData.append('video', videoFile);
        if (videoCoverFile) formData.append('cover', videoCoverFile);
        formData.append('description', description);
        if (closeComments) formData.append('close_comments', '1');
        if (pinned) formData.append('pinned', '1');
        await api.post('/posts/video', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      } else {
        const formData = new FormData();
        imageFiles.forEach(file => formData.append('images', file));
        formData.append('description', description);
        if (closeComments) formData.append('close_comments', '1');
        if (pinned) formData.append('pinned', '1');
        await api.post('/posts', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      showToast('分享成功！');
      events.emit('post:created'); // 通知首页刷新
      handleClose();
    } catch (err: any) {
      const msg = err.response?.data?.error || '发布失败';
      showToast(msg);
    } finally { setSubmitting(false); }
  };

  const renderGrid = () => {
    const displayOrder = imagePreviews.map((_, i) => i);
    return (
      <div className={composer.gridWrapper}>
        <div className={composer.grid}>
          {displayOrder.map((i) => {
            const src = imagePreviews[i];
            return (
              <div
                key={imagePreviews[i]}
                ref={el => { gridRefs.current[i] = el; }}
                className={[
                  composer.gridItem,
                  i === dragIndex ? (composer.dragging || '') : '',
                ].filter(Boolean).join(' ')}
                onPointerDown={(e) => dragHandlers.onPointerDown(e, i)}
              >
                <img src={src} alt={`图片 ${i + 1}`} draggable={false} />
                <span className={composer.gridIndex}>{i + 1}</span>
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
          {imageFiles.length < 9 && (
            <div className={composer.gridAdd} onClick={() => fileInputRef.current?.click()}>
              <ImagePlus size={28} />
            </div>
          )}
        </div>
      </div>
    );
  };

  // 步骤 1: 选择媒体
  if (step === 1) {
    return (
      <div
        className={`${composer.overlay}${closing ? ` ${composer.closing}` : ''}`}
        onPointerMove={dragHandlers.onPointerMove}
        onPointerUp={dragHandlers.onPointerUp}
        onPointerCancel={dragHandlers.onPointerCancel}
      >
        <div className={`${composer.dialog}${closing ? ` ${composer.closing}` : ''}`}>
          <div className={composer.overlayHeader}>
            <button className={`${composer.overlayBtn} ${composer.danger}`} data-back onClick={handleDiscard}>放弃</button>
            <span className={composer.overlayTitle}>选择照片/视频</span>
            <button className={`${composer.overlayBtn} ${composer.primary}`} onClick={handleContinue} disabled={!hasContent}>继续</button>
          </div>
          <div className={composer.overlayBody}>
            {imagePreviews.length > 0 ? (
              renderGrid()
            ) : (
              <div className={styles.uploadArea}>
                <div className={styles.uploadBtns}>
                  <button className={styles.uploadBtn} onClick={() => fileInputRef.current?.click()}>
                    <ImagePlus size={20} />
                    选择照片
                  </button>
                  <button className={styles.uploadBtn} onClick={() => videoInputRef.current?.click()}>
                    <Video size={20} />
                    选择视频
                  </button>
                </div>
                <div className={styles.uploadHint}>照片最多9张，视频支持 mp4、mov</div>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/gif,image/webp" multiple style={{ display: 'none' }} onChange={handleFileSelect} />
            <input ref={videoInputRef} type="file" accept="video/mp4,video/quicktime" style={{ display: 'none' }} onChange={handleVideoSelect} />
          </div>
        </div>

        {showDiscardConfirm && (
          <ConfirmDialog
            message="确定要放弃此次分享吗？"
            onConfirm={confirmDiscard}
            onCancel={() => setShowDiscardConfirm(false)}
          />
        )}
      </div>
    );
  }

  // 步骤 2: 视频封面编辑
  if (step === 2 && videoFile) {
    return (
      <div className={`${composer.overlay}${closing ? ` ${composer.closing}` : ''}`}>
        <div className={`${composer.dialog}${closing ? ` ${composer.closing}` : ''}`}>
          <div className={composer.overlayHeader}>
            <button className={composer.overlayBtn} data-back onClick={handleBack}>后退</button>
            <span className={composer.overlayTitle}>选择封面</span>
            <button className={`${composer.overlayBtn} ${composer.primary}`} onClick={() => setStep(3)}>下一步</button>
          </div>
          <div className={styles.coverLayout}>
            <div className={styles.coverLeft}>
              <div className={styles.coverPreview}>
                <video
                  ref={videoRef}
                  src={videoPreview || undefined}
                  onLoadedMetadata={handleVideoLoaded}
                  className={styles.coverVideo}
                  controls
                />
              </div>
            </div>
            <div className={styles.coverRight}>
              <div className={styles.coverSection}>
                <div className={styles.coverSectionTitle}>上传封面图片</div>
                <button
                  className={styles.uploadBtn}
                  onClick={() => coverInputRef.current?.click()}
                  style={{ width: '100%' }}
                >
                  <ImagePlus size={18} />
                  从电脑选择
                </button>
                {videoCoverPreview && (
                  <img src={videoCoverPreview} alt="封面预览" className={styles.coverImage} />
                )}
                <input ref={coverInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/gif,image/webp" style={{ display: 'none' }} onChange={handleCoverFileSelect} />
              </div>
              <div className={styles.coverSection}>
                <div className={styles.coverSectionTitle}>或从视频截取</div>
                <canvas ref={canvasRef} style={{ display: 'none' }} />
                <div className={styles.coverSliderRow}>
                  <input
                    type="range"
                    min="0"
                    max={videoDuration || 1}
                    step="0.1"
                    value={coverTime}
                    onChange={handleCoverTimeChange}
                    className={styles.coverSlider}
                  />
                  <span className={styles.coverTime}>{coverTime.toFixed(1)}s</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {showDiscardConfirm && (
          <ConfirmDialog
            message="确定要放弃此次分享吗？"
            onConfirm={confirmDiscard}
            onCancel={() => setShowDiscardConfirm(false)}
          />
        )}
      </div>
    );
  }

  // 步骤 3: 编辑分享
  return (
    <div className={`${composer.overlay}${closing ? ` ${composer.closing}` : ''}`}>
      <div className={`${composer.dialog}${closing ? ` ${composer.closing}` : ''}`}>
        <div className={composer.overlayHeader}>
          <button className={composer.overlayBtn} data-back onClick={handleBack}>后退</button>
          <span className={composer.overlayTitle}>编辑</span>
          <button className={`${composer.overlayBtn} ${composer.primary}`} onClick={handleSubmit} disabled={submitting}>
          {submitting ? '发布中...' : '分享'}
        </button>
      </div>
      <div className={composer.editLayout}>
        <div className={composer.editLeft}>
          <div className={composer.editImageWrapper}>
            {videoPreview ? (
              <video src={videoPreview} controls className={composer.editVideo} />
            ) : (
              <>
                <img src={imagePreviews[currentImageIndex] ?? imagePreviews[0]} alt="" className={composer.editImage} />
                {imagePreviews.length > 1 && (
                  <>
                    {currentImageIndex > 0 && (
                      <button
                        className={`${composer.editNav} ${composer.editPrev}`}
                        onClick={() => setCurrentImageIndex(prev => prev - 1)}
                        aria-label="上一张"
                      >
                        ‹
                      </button>
                    )}
                    {currentImageIndex < imagePreviews.length - 1 && (
                      <button
                        className={`${composer.editNav} ${composer.editNext}`}
                        onClick={() => setCurrentImageIndex(prev => prev + 1)}
                        aria-label="下一张"
                      >
                        ›
                      </button>
                    )}
                    <div className={composer.editDots}>
                      {imagePreviews.map((_, i) => (
                        <span
                          key={i}
                          className={`${composer.editDot} ${i === currentImageIndex ? composer.active : ''}`}
                          onClick={() => setCurrentImageIndex(i)}
                        />
                      ))}
                    </div>
                  </>
                )}
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
    </div>
  );
}
