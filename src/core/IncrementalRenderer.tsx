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
import type { IncrementalRendererProps, BlockInfo } from './types';
import { FADE_DURATION, DEFAULT_CHAR_DELAY } from './types';

const IncrementalRenderer = memo<IncrementalRendererProps>(({
  content,
  isStreaming: externalIsStreaming = false,
  className,
  disableAnimation = false,
  viewportBlockRange,
  SimpleStreamMermaid,
}) => {
  const generatedId = useId();

  // Persistent key map to ensure block keys remain stable across re-mounts
  const blockKeyMapRef = useRef<Map<string, string>>(new Map());

  // Instance-isolated backtick accumulation state
  const backtickStateRef = useRef<AccumulationState | undefined>(undefined);

  // Smooth streaming handles character-level visual scheduling
  const smoothedContent = useSmoothStreamContent(content, {
    enabled: externalIsStreaming,
    disableAnimation,
  });

  const safeContent = typeof content === 'string' ? content : '';

  // Streaming mode: use smoothed content; Static mode: use raw content
  const effectiveContent = externalIsStreaming
    ? smoothedContent
    : (disableAnimation ? smoothedContent : safeContent);

  // Parse blocks directly from smoothedContent — no useDeferredValue.
  // smoothedContent already limits update frequency via CPS, so additional
  // deferral only causes desync between visible content and block parsing.
  const blocksContent = externalIsStreaming ? smoothedContent : effectiveContent;

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
    timelineRefs,
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
  return (
    <UnifiedRenderer
      blocks={parsedBlocks}
      className={className}
      isStreaming={externalIsStreaming}
      disableAnimation={disableAnimation}
      getBlockState={getBlockState}
      blockAnimationMeta={blockAnimationMeta}
      timelineRefs={timelineRefs}
      charDelay={DEFAULT_CHAR_DELAY}
      handleAnimationDoneRef={handleAnimationDoneRef}
      SimpleStreamMermaid={SimpleStreamMermaid}
      remarkPlugins={remarkPlugins}
    />
  );
});

IncrementalRenderer.displayName = 'IncrementalRenderer';

export default IncrementalRenderer;
