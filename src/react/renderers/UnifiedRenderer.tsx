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
  /** Per-block timeline refs, updated every RAF frame (retained for debug/external use) */
  timelineRefs: Map<number, React.MutableRefObject<number>>;
  /** Register a block's containerRef for Single RAF Loop DOM animation */
  registerContainer: (index: number, ref: React.RefObject<HTMLElement | null>) => void;
  /** Unregister a block's containerRef */
  unregisterContainer: (index: number) => void;
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
  registerContainer,
  unregisterContainer,
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
