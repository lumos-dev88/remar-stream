/**
 * UnifiedRenderer - Single-tree renderer for both streaming and static modes
 *
 * [Core Design]
 * - Replaces the dual-tree (StreamingRenderer + StaticRenderer) architecture
 * - Both streaming and static modes use the same block-level rendering pipeline
 * - isStreaming=true: 逐 block 渲染 + 字符动画 + 不完整MD处理
 * - isStreaming=false: 同样 block 渲染 + 无动画（直接显示，无切换！）
 */

import React, { useMemo, useCallback, memo, useRef, useEffect } from 'react';
import { StreamdownBlock } from '../components/StreamdownBlock';
import { useRenderContext, useAnimationContext } from './context';
import { getRendererContainerClassName } from './styles';
import { useMarkdownComponents } from './hooks/useMarkdownComponents';

export const UnifiedRenderer = memo(() => {
  const {
    blocks,
    className,
    isStreaming,
    SimpleStreamMermaid,
    remarkPlugins: externalRemarkPlugins = [],
  } = useRenderContext();

  const { animationActive } = useAnimationContext();

  const seenKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!animationActive) seenKeysRef.current.clear();
  }, [animationActive]);

  // Build components from plugin match rules
  const components = useMarkdownComponents({
    isStreaming,
    SimpleStreamMermaid,
  });

  const renderBlock = useCallback(
    (block: any) => {
      if (block.content.trim().length === 0) return null;
      const isNew = animationActive && !seenKeysRef.current.has(block.key);
      if (isNew) seenKeysRef.current.add(block.key);
      return (
        <StreamdownBlock
          key={block.key}
          components={components}
          remarkPlugins={externalRemarkPlugins}
          blockType={block.blockType}
          isTypePending={block.isTypePending}
          animate={isNew}
        >
          {block.content}
        </StreamdownBlock>
      );
    },
    [animationActive, components, externalRemarkPlugins]
  );

  const containerClassName = getRendererContainerClassName(
    'streaming',
    animationActive,
    false,
    className
  );

  return (
    <div className={containerClassName}>
      {blocks.map(renderBlock)}
    </div>
  );
});

UnifiedRenderer.displayName = 'UnifiedRenderer';
