/**
 * Fullscreenable - Generic fullscreen overlay component using React Portal
 *
 * Renders fullscreen content to document.body via createPortal,
 * breaking free from any parent container constraints (transform, iframe, etc.).
 *
 * Features:
 * - Portal rendering to document.body
 * - Theme inheritance: copies data-theme from nearest .remar-md/.remar-container
 * - Body scroll lock (reference-counted for nested usage)
 * - ESC key to close
 * - Click backdrop to close
 * - Event bubbling control (content clicks don't close overlay)
 * - Accessibility: role="dialog", aria-modal, focus trap
 * - Enter/exit transition animation
 * - Dark theme support via [data-theme='dark']
 */

'use client';

import React, { memo, useEffect, useCallback, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import './Fullscreenable.scss';

// ===== Types =====

export interface FullscreenableProps {
  /** Whether the fullscreen overlay is open */
  open: boolean;
  /** Callback to close the overlay */
  onClose: () => void;
  /** Content to render inside the fullscreen overlay */
  children: React.ReactNode;
  /** Optional overlay class name */
  className?: string;
  /** Optional content wrapper class name */
  contentClassName?: string;
  /** Whether clicking the backdrop closes the overlay (default: true) */
  closeOnBackdropClick?: boolean;
  /** Whether pressing ESC closes the overlay (default: true) */
  closeOnEsc?: boolean;
  /** Accessible label for the dialog */
  ariaLabel?: string;
  /** z-index for the overlay (default: 9999) */
  zIndex?: number;
  /** Whether to show enter/exit animation (default: true) */
  animate?: boolean;
}

// ===== Helpers =====

/**
 * Find the nearest remar container (.remar-md or .remar-container)
 * and extract its data-theme attribute.
 */
function detectTheme(): string | null {
  const host = document.querySelector('.remar-md, .remar-container');
  return host?.getAttribute('data-theme') ?? null;
}

// ===== Component =====

export const Fullscreenable = memo<FullscreenableProps>(({
  open,
  onClose,
  children,
  className,
  contentClassName,
  closeOnBackdropClick = true,
  closeOnEsc = true,
  ariaLabel = 'Fullscreen preview',
  zIndex = 9999,
  animate = true,
}) => {
  const { lock, unlock } = useBodyScrollLock();
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [theme, setTheme] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Ensure portal target is available (SSR safety)
  useEffect(() => {
    setMounted(true);
  }, []);

  // Detect theme from nearest remar container when opening
  useEffect(() => {
    if (open) {
      setTheme(detectTheme());
    }
  }, [open]);

  // Handle open/close with animation
  useEffect(() => {
    if (open) {
      lock();
      // Trigger enter animation on next frame
      requestAnimationFrame(() => {
        setVisible(true);
      });
    } else {
      setVisible(false);
      // Wait for exit animation before unmounting
      const timer = setTimeout(() => {
        unlock();
      }, animate ? 200 : 0);
      return () => clearTimeout(timer);
    }

    return () => {
      // Cleanup on unmount
      unlock();
    };
  }, [open, lock, unlock, animate]);

  // ESC key handler
  useEffect(() => {
    if (!open || !closeOnEsc) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, closeOnEsc, onClose]);

  // Backdrop click handler
  const handleBackdropClick = useCallback(() => {
    if (closeOnBackdropClick) {
      onClose();
    }
  }, [closeOnBackdropClick, onClose]);

  // Stop content clicks from propagating to backdrop
  const handleContentClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  // Don't render anything on server or before mount
  if (!mounted || !open) return null;

  const animClass = animate
    ? visible ? 'remar-fs--enter-active' : 'remar-fs--enter'
    : 'remar-fs--no-animate';

  const overlay = (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      className={`remar-container remar-fs ${animClass} ${className ?? ''}`}
      style={{ zIndex }}
      {...(theme ? { 'data-theme': theme } : {})}
      onClick={handleBackdropClick}
    >
      {/* Close button — stopPropagation to prevent triggering backdrop click */}
      <button
        className="remar-fs__close"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Close fullscreen"
        type="button"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* Content */}
      <div
        className={`remar-fs__content ${animate ? 'remar-fs__content--animate' : ''} ${contentClassName ?? ''}`}
        onClick={handleContentClick}
      >
        {children}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
});

Fullscreenable.displayName = 'Fullscreenable';

export default Fullscreenable;
