import React, { memo, useEffect, useRef } from 'react';
import IncrementalRenderer from '../core/IncrementalRenderer';
import type { IncrementalRendererProps } from '../core/types';
import '../styles/index.scss';

export type RemarTheme = 'light' | 'dark';

export interface RemarMarkdownProps extends IncrementalRendererProps {
  className?: string;
  theme?: RemarTheme;
  /** Callback invoked when the root container height changes */
  onHeightChange?: (height: number) => void;
}

export const RemarMarkdown = memo<RemarMarkdownProps>((props) => {
  const { className, theme = 'light', content, isStreaming, onHeightChange, ...rest } = props;
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!onHeightChange || !rootRef.current) return;

    const el = rootRef.current;
    let rafId: number;
    let lastHeight = -1;

    const observer = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h === undefined || h === lastHeight) return;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        lastHeight = h;
        onHeightChange(h);
      });
    });

    observer.observe(el);
    return () => { observer.disconnect(); cancelAnimationFrame(rafId); };
  }, [onHeightChange]);

  return (
    <div
      ref={rootRef}
      className={`remar-md ${className || ''}`}
      data-theme={theme === 'dark' ? 'dark' : undefined}
    >
      <IncrementalRenderer {...rest} content={content} isStreaming={isStreaming} />
    </div>
  );
});

