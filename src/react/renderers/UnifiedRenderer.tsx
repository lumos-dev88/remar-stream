/**
 * UnifiedRenderer - Single-tree renderer for both streaming and static modes
 *
 * [Core Design]
 * - Replaces the dual-tree (StreamingRenderer + StaticRenderer) architecture
 * - Both streaming and static modes use the same block-level rendering pipeline
 * - isStreaming=true: 逐 block 渲染 + 字符动画 + 不完整MD处理
 * - isStreaming=false: 同样 block 渲染 + 无动画（直接显示，无切换！）
 *
 * [Animation Architecture: Single RAF Loop + Direct DOM]
 * Animation is driven by useBlockAnimation's single RAF loop, which merges
 * timeline computation and DOM mutation into one callback. StreamdownBlock
 * registers its containerRef via registerContainer/unregisterContainer, and
 * the RAF loop directly manipulates className on spans — no per-block RAFs.
 */

import React, { useMemo, useCallback, memo } from 'react';
import { StreamdownBlock } from '../components/StreamdownBlock';
import { useRenderContext, useAnimationContext } from './context';
import { getRendererContainerClassName } from './styles';
import { usePluginCache } from './hooks/usePluginCache';
import { useMarkdownComponents } from './hooks/useMarkdownComponents';

export const UnifiedRenderer = memo(() => {
  const {
    blocks,
    className,
    isStreaming,
    SimpleStreamMermaid,
    remarkPlugins: externalRemarkPlugins = [],
  } = useRenderContext();

  const {
    animationActive,
    getBlockState,
    blockAnimationMeta,
    handleAnimationDoneRef,
    registerContainer,
    unregisterContainer,
  } = useAnimationContext();

  // Plugin cache — static mark-only plugin (no timeline dependency)
  const getRehypePlugins = usePluginCache();

  // Build components from plugin match rules
  const components = useMarkdownComponents({
    isStreaming,
    SimpleStreamMermaid,
  });

  const renderBlock = useCallback(
    (block: any, index: number) => {
      // During animation: respect queued/animating state
      if (animationActive) {
        const state = getBlockState(index);
        if (state === 'queued') return null;
      }

      // Skip pure whitespace blocks
      const trimmedContent = block.content.trim();
      if (trimmedContent.length === 0) return null;

      const animationMeta = blockAnimationMeta.get(index);
      const settled = animationActive ? (animationMeta?.settled ?? false) : true;

      // When animation is active: use rehype to mark per-char spans + Single RAF Loop
      // to drive per-character fade-in via direct DOM manipulation.
      // When animation is inactive: skip rehype entirely (no span.stream-char wrapping),
      // skip container registration — content renders directly via ReactMarkdown.
      // This eliminates 1000+ DOM nodes, querySelectorAll, and GPU composite layers
      // when animation is disabled (disableAnimation or !isStreaming).
      const plugins = animationActive ? getRehypePlugins(settled) : [];

      return (
        <StreamdownBlock
          key={block.key}
          components={components}
          rehypePlugins={plugins}
          remarkPlugins={externalRemarkPlugins}
          settled={settled}
          onAnimationDone={animationActive ? () => handleAnimationDoneRef.current?.(index) : undefined}
          blockType={block.blockType}
          isTypePending={block.isTypePending}
          blockIndex={index}
          registerContainer={animationActive ? registerContainer : undefined}
          unregisterContainer={animationActive ? unregisterContainer : undefined}
        >
          {block.content}
        </StreamdownBlock>
      );
    },
    [
      animationActive,
      getBlockState,
      blockAnimationMeta,
      getRehypePlugins,
      components,
      externalRemarkPlugins,
      handleAnimationDoneRef,
      registerContainer,
      unregisterContainer,
    ]
  );

  // Check if all blocks are settled
  const allSettled = useMemo(
    () => {
      if (!animationActive) return true;
      return blocks.every((block, index) => {
        if (block.content.trim().length === 0) return true;
        const meta = blockAnimationMeta.get(index);
        return meta?.settled ?? false;
      });
    },
    [blocks, blockAnimationMeta, animationActive]
  );

  const containerClassName = getRendererContainerClassName(
    'streaming',
    animationActive && !allSettled,
    allSettled,
    className
  );

  return (
    <div className={containerClassName}>
      {blocks.map(renderBlock)}
    </div>
  );
});

UnifiedRenderer.displayName = 'UnifiedRenderer';
