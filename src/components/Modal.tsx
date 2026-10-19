import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export function Modal({
  open,
  onClose,
  children,
  className = '',
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  labelledBy?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="modal-root" role="presentation">
      <button type="button" className="modal-backdrop" onClick={onClose} aria-label="关闭" />
      <div className={`modal-panel ${className}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="关闭弹窗">
          <X size={18} />
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}
