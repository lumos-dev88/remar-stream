/**
 * UnifiedRenderer - Single-tree renderer for both streaming and static modes
 *
 * [Core Design]
 * - Replaces the dual-tree (StreamingRenderer + StaticRenderer) architecture
 * - Both streaming and static modes use the same block-level rendering pipeline
 * - 块淡入只作用于首次渲染之后新出现的 block
 *   （历史/静态内容首次渲染不动画，流式新增的 block 淡入）
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
    SimpleStreamMermaid,
    remarkPlugins: externalRemarkPlugins = [],
  } = useRenderContext();

  const { animationActive } = useAnimationContext();

  // Blocks present on the first render (history, static content, a remounted list item)
  // are marked seen without animating; only blocks that appear afterwards fade in.
  // This makes the fade-in independent of any streaming flag.
  const seenKeysRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(false);
  const isFirstRender = !mountedRef.current;

  useEffect(() => {
    mountedRef.current = true;
  }, []);

  useEffect(() => {
    if (!animationActive) seenKeysRef.current.clear();
  }, [animationActive]);

  // Build components from plugin match rules
  const components = useMarkdownComponents({
    SimpleStreamMermaid,
  });

  const renderBlock = useCallback(
    (block: any) => {
      if (block.content.trim().length === 0) return null;
      const isNew = animationActive && !isFirstRender && !seenKeysRef.current.has(block.key);
      seenKeysRef.current.add(block.key);
      return (
        <StreamdownBlock
          key={block.key}
          components={components}
          remarkPlugins={externalRemarkPlugins}
          blockType={block.blockType}
          animate={isNew}
        >
          {block.content}
        </StreamdownBlock>
      );
    },
    [animationActive, isFirstRender, components, externalRemarkPlugins]
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
