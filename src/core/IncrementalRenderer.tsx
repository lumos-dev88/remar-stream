/**
 * IncrementalRenderer - Incremental renderer
 *
 * [Architecture]
 * - Single-tree architecture: UnifiedRenderer handles both streaming and static modes
 * - Streaming mode: block-level rendering + character-level animation
 * - Static mode: same block-level rendering, no animation (zero switch!)
 * - Smooth streaming: useSmoothStreamContent controls character output pacing
 *
 * [Why no useDeferredValue / useTransition?]
 * Previous architecture used three delay layers: CPS smoothing → useDeferredValue →
 * startTransition. These layers desynchronized, causing blocks to be in 'queued' state
 * (returning null) while their content was already visible — leading to layout jumps
 * and out-of-order rendering. Now only CPS smoothing remains, which is sufficient for
 * INP optimization since it already limits update frequency to ~45 chars/frame.
 */

'use client';

import { memo, useId, useMemo, useRef, useEffect } from 'react';
import { parseMarkdownIntoBlocks } from './lib/parseBlocks';
import type { AccumulationState } from './lib/accumulateBackticks';
import { useSmoothStreamContent } from './hooks/useSmoothStreamContent';
import { useBlockAnimation } from './hooks/useBlockAnimation';
import { getRegistry } from './plugin-registry';
import { UnifiedRenderer } from '../react/renderers/UnifiedRenderer';
import { RenderProvider, AnimationProvider } from '../react/renderers/context';
import type { IncrementalRendererProps, BlockInfo } from './types';
import { FADE_DURATION, DEFAULT_CHAR_DELAY } from './types';


const IncrementalRenderer = memo<IncrementalRendererProps>(({
  content,
  isStreaming: externalIsStreaming = false,
  className,
  disableAnimation = false,
  SimpleStreamMermaid,
  onStatsUpdate,
}) => {
  const generatedId = useId();

  // Persistent key map to ensure block keys remain stable across re-mounts
  const blockKeyMapRef = useRef<Map<string, string>>(new Map());

  // Instance-isolated backtick accumulation state
  const backtickStateRef = useRef<AccumulationState | undefined>(undefined);

  // Smooth streaming handles character-level visual scheduling (CPS buffering)
  const smoothedContent = useSmoothStreamContent(content, {
    enabled: externalIsStreaming,
    onStatsUpdate,
  });



  // Use smoothedContent while streaming AND during drain (when smoothedContent
  // is still catching up to content). Once drain completes, smoothedContent
  // === content, so it naturally converges.
  // Using content directly when isStreaming=false would bypass the drain
  // and render all content at once, defeating the fast-lane drain.
  const effectiveContent = smoothedContent;

  // Parse blocks from effectiveContent — always go through the smoothed pipeline
  const blocksContent = effectiveContent;

  const { parsedBlocks, backtickState } = useMemo(() => {
    const { blocks: rawBlocks, backtickState } = parseMarkdownIntoBlocks(blocksContent, {
      gfm: true,
      isStreaming: externalIsStreaming,
      _backtickState: backtickStateRef.current,
    });

    const mapped = rawBlocks.map((block, index) => {
      const positionKey = `${block.startOffset}-${index}`;

      if (!blockKeyMapRef.current.has(positionKey)) {
        blockKeyMapRef.current.set(positionKey, `${generatedId}-${positionKey}`);
      }

      return {
        content: block.content,
        startOffset: block.startOffset,
        blockType: block.blockType,
        isTypePending: block.isTypePending,
        key: blockKeyMapRef.current.get(positionKey)!,
      };
    });

    return { parsedBlocks: mapped, backtickState };
  }, [blocksContent, generatedId, externalIsStreaming]);



  // Persist backtick state to ref after committed render
  useEffect(() => {
    backtickStateRef.current = backtickState;
  }, [backtickState]);

  // Manage block animation state
  const {
    blockAnimationMeta,
    getBlockState,
    completeBlock,
  } = useBlockAnimation(parsedBlocks, {
    isStreaming: externalIsStreaming,
    disableAnimation,
    charDelay: DEFAULT_CHAR_DELAY,
    fadeDuration: FADE_DURATION,
  });

  // Animation completion callback — stable ref
  const completeBlockRef = useRef(completeBlock);
  completeBlockRef.current = completeBlock;
  const handleAnimationDoneRef = useRef<(index: number) => void>();
  handleAnimationDoneRef.current = (index: number) => completeBlockRef.current(index);

  // Aggregate remark plugins from plugin registry
  const registry = getRegistry();
  const remarkPlugins = useMemo(() => {
    return registry.getRemarkPlugins();
  }, [registry.version]);

  // Single-tree: UnifiedRenderer handles all modes
  const animationActive = externalIsStreaming && !disableAnimation;

  // Memoize context values to prevent unnecessary re-renders of all consumers
  const renderValue = useMemo(() => ({
    blocks: parsedBlocks,
    className,
    isStreaming: externalIsStreaming,
    SimpleStreamMermaid,
    remarkPlugins,
  }), [parsedBlocks, className, externalIsStreaming, SimpleStreamMermaid, remarkPlugins]);

  const animationValue = useMemo(() => ({
    animationActive,
    getBlockState,
    blockAnimationMeta,
    handleAnimationDoneRef,
  }), [animationActive, getBlockState, blockAnimationMeta, handleAnimationDoneRef]);

  return (
    <RenderProvider value={renderValue}>
      <AnimationProvider value={animationValue}>
        <UnifiedRenderer />
      </AnimationProvider>
    </RenderProvider>
  );
});

IncrementalRenderer.displayName = 'IncrementalRenderer';

export default IncrementalRenderer;
