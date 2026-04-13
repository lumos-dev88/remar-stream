import React, { memo } from 'react';
import IncrementalRenderer from '../core/IncrementalRenderer';
import type { IncrementalRendererProps } from '../core/types';
import '../styles/index.scss';

export type RemarTheme = 'light' | 'dark';

export interface RemarMarkdownProps extends IncrementalRendererProps {
  className?: string;
  theme?: RemarTheme;
}

export const RemarMarkdown = memo<RemarMarkdownProps>((props) => {
  const { className, theme = 'light', content, isStreaming, ...rest } = props;

  return (
    <div
      className={`remar-md ${className || ''}`}
      data-theme={theme === 'dark' ? 'dark' : undefined}
    >
      <IncrementalRenderer {...rest} content={content} isStreaming={isStreaming} />
    </div>
  );
});

