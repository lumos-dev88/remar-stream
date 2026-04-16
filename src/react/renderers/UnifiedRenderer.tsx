/**
 * UnifiedRenderer - Single-tree renderer for both streaming and static modes
 *
 * [Core Design]
 * - Replaces the dual-tree (StreamingRenderer + StaticRenderer) architecture
 * - Both streaming and static modes use the same block-level rendering pipeline
 * - isStreaming=true: 逐 block 渲染 + 字符动画 + 不完整MD处理
 * - isStreaming=false: 同样 block 渲染 + 无动画（直接显示，无切换！）
 *
 * [Why Single Tree]
 * - Zero flicker: no DOM replacement when streaming ends (blocks naturally settle)
 * - ~1x CPU: only one tree renders (vs ~2x with dual-tree)
 * - Simpler code: no freezing/unfreezing/CSS patches/visibility management
 * - Industry standard: Vercel Streamdown, ChatGPT-Next-Web, lobe-chat all use single-tree
 *
 * [Per-block Timeline]
 * Each block uses its own timelineElapsedMs from blockAnimationMeta, not a shared
 * global timeline store. This prevents the "timeline override" bug where a later
 * block's smaller timeline value overwrites an earlier block's progress.
 */

import React, { useMemo, useCallback, memo } from 'react';
import type { Pluggable } from 'unified';
import { StreamdownBlock } from '../components/StreamdownBlock';

import type { BlockInfo, BlockAnimationMeta } from '../../core/types';
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
  charDelay,
  handleAnimationDoneRef,
  SimpleStreamMermaid,
  remarkPlugins: externalRemarkPlugins = [],
}) => {
  // Whether animation is active (streaming + not disabled)
  const animationActive = isStreaming && !disableAnimation;

  // Plugin cache — each block gets its own timelineElapsedMs from blockAnimationMeta
  const getRehypePlugins = usePluginCache({ charDelay });

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

      // When animation is inactive: all blocks are immediately settled
      const plugins = animationActive ? getRehypePlugins(animationMeta) : [];
      const settled = animationActive ? (animationMeta?.settled ?? false) : true;

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
