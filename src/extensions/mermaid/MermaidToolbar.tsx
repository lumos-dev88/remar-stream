/**
 * MermaidToolbar - Diagram toolbar component
 *
 * Features:
 * - Download SVG/PNG (diagram mode)
 * - Zoom in/out/fit (diagram mode)
 * - View source code / Back to diagram
 * - Copy code (source mode)
 * - Fullscreen toggle
 */

'use client';

import React, { useState, useCallback } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Download,
  ZoomIn,
  ZoomOut,
  Maximize,
  Minimize,
  Code,
  Shrink,
  Copy,
  Check,
  X,
} from 'lucide-react';

interface ToolbarButtonProps {
  icon: LucideIcon;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  active?: boolean;
  size?: number;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({
  icon: Icon,
  onClick,
  title,
  disabled = false,
  active = false,
  size = 16,
}) => (
  <button
    className={`remar-mermaid-toolbar-btn ${active ? 'active' : ''}`}
    onClick={onClick}
    disabled={disabled}
    title={title}
  >
    <Icon size={size} />
  </button>
);

interface MermaidToolbarProps {
  /** SVG content for download */
  svgContent: string;
  /** Raw mermaid code */
  mermaidCode: string;
  /** Current zoom level */
  zoom: number;
  /** Whether in fullscreen mode */
  isFullscreen: boolean;
  /** Whether source code panel is open */
  isCodeOpen: boolean;
  /** Zoom in handler */
  onZoomIn: () => void;
  /** Zoom out handler */
  onZoomOut: () => void;
  /** Fit to container handler */
  onFit: () => void;
  /** Fullscreen toggle handler */
  onFullscreenToggle: () => void;
  /** Source code toggle handler */
  onCodeToggle: () => void;
}

export const MermaidToolbar: React.FC<MermaidToolbarProps> = ({
  svgContent,
  mermaidCode,
  zoom,
  isFullscreen,
  isCodeOpen,
  onZoomIn,
  onZoomOut,
  onFit,
  onFullscreenToggle,
  onCodeToggle,
}) => {
  const [showCopied, setShowCopied] = useState(false);

  /** Download SVG file */
  const handleDownloadSvg = useCallback(() => {
    if (!svgContent) return;

    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `diagram-${Date.now()}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [svgContent]);

  /** Copy code to clipboard */
  const handleCopyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(mermaidCode);
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    } catch {
      // Ignore copy errors
    }
  }, [mermaidCode]);

  return (
    <div className="remar-mermaid-toolbar">
      {isCodeOpen ? (
        // Source code mode: show title + copy + close
        <>
          <div className="remar-mermaid-toolbar-group">
            <span className="remar-mermaid-toolbar-title">Source</span>
          </div>
          <div className="remar-mermaid-toolbar-group">
            <ToolbarButton
              icon={showCopied ? Check : Copy}
              onClick={handleCopyCode}
              title="Copy code"
            />
            <ToolbarButton
              icon={X}
              onClick={onCodeToggle}
              title="Back to diagram"
            />
          </div>
        </>
      ) : (
        // Diagram mode: zoom controls + actions
        <>
          {/* Left: Zoom controls */}
          <div className="remar-mermaid-toolbar-group">
            <ToolbarButton
              icon={ZoomOut}
              onClick={onZoomOut}
              title="Zoom out"
              disabled={zoom <= 0.5}
            />
            <span className="remar-mermaid-toolbar-zoom">{Math.round(zoom * 100)}%</span>
            <ToolbarButton
              icon={ZoomIn}
              onClick={onZoomIn}
              title="Zoom in"
              disabled={zoom >= 3}
            />
            <ToolbarButton
              icon={Shrink}
              onClick={onFit}
              title="Fit to window"
            />
          </div>

          {/* Right: Actions */}
          <div className="remar-mermaid-toolbar-group">
            <ToolbarButton
              icon={Code}
              onClick={onCodeToggle}
              title="View code"
              active={isCodeOpen}
            />
            <ToolbarButton
              icon={Download}
              onClick={handleDownloadSvg}
              title="Download SVG"
              disabled={!svgContent}
            />
            <ToolbarButton
              icon={isFullscreen ? Minimize : Maximize}
              onClick={onFullscreenToggle}
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            />
          </div>
        </>
      )}

    </div>
  );
};

export default MermaidToolbar;
