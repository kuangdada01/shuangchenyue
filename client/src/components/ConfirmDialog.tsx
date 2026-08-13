/**
 * ============================================================
 * 确认对话框组件 (ConfirmDialog)
 * ============================================================
 * 通用确认弹窗，支持 ESC 键关闭和动画效果
 *
 * 使用方式:
 * <ConfirmDialog
 *   message="确定要删除吗？"
 *   onConfirm={() => deleteItem()}
 *   onCancel={() => setShow(false)}
 * />
 * ============================================================
 */

import { useEffect, useState, useCallback } from 'react';

interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ message, onConfirm, onCancel }: ConfirmDialogProps) {
  const [closing, setClosing] = useState(false);

  const handleClose = useCallback((action: 'confirm' | 'cancel') => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => {
      action === 'confirm' ? onConfirm() : onCancel();
    }, 200);
  }, [closing, onConfirm, onCancel]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose('cancel');
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [handleClose]);

  return (
    <div className={`confirm-overlay${closing ? ' closing' : ''}`} onClick={e => { e.stopPropagation(); handleClose('cancel'); }}>
      <div className={`confirm-modal${closing ? ' closing' : ''}`} onClick={e => e.stopPropagation()}>
        <p className="confirm-modal-message">{message}</p>
        <div className="confirm-modal-actions">
          <button className="confirm-btn-cancel" onClick={() => handleClose('cancel')}>取消</button>
          <button className="confirm-btn-confirm" onClick={() => handleClose('confirm')}>确定</button>
        </div>
      </div>
    </div>
  );
}
