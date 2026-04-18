/**
 * UnifiedRenderer - Single-tree renderer for both streaming and static modes
 *
 * [Core Design]
 * - Replaces the dual-tree (StreamingRenderer + StaticRenderer) architecture
 * - Both streaming and static modes use the same block-level rendering pipeline
 * - isStreaming=true: 逐 block 渲染 + 字符动画 + 不完整MD处理
 * - isStreaming=false: 同样 block 渲染 + 无动画（直接显示，无切换！）
 *
 * [Animation Architecture: RAF + Direct DOM]
 * Animation is driven by useStreamAnimator (RAF loop + direct DOM className manipulation),
 * completely bypassing React's render cycle. This solves the "animation freezes for
 * content-stable blocks" bug that occurred when rehype computed animation-delay.
 *
 * [Per-block Timeline]
 * Each block uses its own timelineRef from useBlockAnimation, updated every RAF frame.
 * useStreamAnimator reads the ref to determine which characters to reveal.
 */

import React, { useMemo, useCallback, memo } from 'react';
import type { Pluggable } from 'unified';
import { StreamdownBlock } from '../components/StreamdownBlock';

import type { BlockInfo, BlockAnimationMeta } from '../../core/types';
import { FADE_DURATION, DEFAULT_CHAR_DELAY } from '../../core/types';
import { getRendererContainerClassName } from './styles';
import { usePluginCache } from './hooks/usePluginCache';
import { useMarkdownComponents } from './hooks/useMarkdownComponents';

interface UnifiedRendererProps {
  blocks: BlockInfo[];
  className?: string;
  /** Whether content is still streaming */
  isStreaming: boolean;
  /** Whether animation is disabled (e.g., user preference) */
  disableAnimation?: boolean;
  getBlockState: (index: number) => any;
  blockAnimationMeta: Map<number, BlockAnimationMeta>;
  /** Per-block timeline refs, updated every RAF frame */
  timelineRefs: Map<number, React.RefObject<number>>;
  charDelay: number;
  handleAnimationDoneRef: React.MutableRefObject<((index: number) => void) | undefined>;
  SimpleStreamMermaid?: React.ComponentType<{ children: string }>;
  /** Remark plugins from PluginRegistry */
  remarkPlugins?: Pluggable[];
}

export const UnifiedRenderer = memo<UnifiedRendererProps>(({
  blocks,
  className,
  isStreaming,
  disableAnimation = false,
  getBlockState,
  blockAnimationMeta,
  timelineRefs,
  charDelay,
  handleAnimationDoneRef,
  SimpleStreamMermaid,
  remarkPlugins: externalRemarkPlugins = [],
}) => {
  // Whether animation is active (streaming + not disabled)
  const animationActive = isStreaming && !disableAnimation;

  // Plugin cache — static mark-only plugin (no timeline dependency)
  const getRehypePlugins = usePluginCache();

  // Build components from plugin match rules
  const components = useMarkdownComponents({
    isStreaming,
    SimpleStreamMermaid,
  });

  const renderBlock = useCallback(
    (block: BlockInfo, index: number) => {
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

      // Always apply rehype plugin to maintain DOM structure (span.stream-char).
      // When animation is inactive: settled=true → useStreamAnimator immediately
      // reveals all chars via RAF. When animation is active: settled=false →
      // useStreamAnimator drives per-character animation.
      // Never pass [] — that would strip all span.stream-char, causing a flash.
      const plugins = getRehypePlugins(settled);

      // Per-block timeline ref for useStreamAnimator
      const timelineRef = timelineRefs.get(index);

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
          timelineRef={timelineRef}
          charDelay={charDelay}
          fadeDuration={FADE_DURATION}
        >
          {block.content}
        </StreamdownBlock>
      );
    },
    [
      animationActive,
      getBlockState,
      blockAnimationMeta,
      timelineRefs,
      getRehypePlugins,
      components,
      externalRemarkPlugins,
      handleAnimationDoneRef,
      charDelay,
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
