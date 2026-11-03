/**
 * IncrementalRenderer - Incremental renderer
 *
 * [Architecture]
 * - Single-tree architecture: UnifiedRenderer handles both streaming and static modes
 * - Streaming mode: block-level rendering + character-level animation
 * - Static mode: same block-level rendering, no animation (zero switch!)
 * - No pacing layer: useSmoothStreamContent only trims orphaned syntax and runs remend;
 *   chunks render as they arrive (the former CPS smoothing was removed, see bench/flicker)
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
import { useSmoothStreamContent } from './hooks/useSmoothStreamContent';
import { getRegistry } from './plugin-registry';
import { UnifiedRenderer } from '../react/renderers/UnifiedRenderer';
import { RenderProvider, AnimationProvider } from '../react/renderers/context';
import type { IncrementalRendererProps, BlockInfo } from './types';


const IncrementalRenderer = memo<IncrementalRendererProps>(({
  content,
  className,
  disableAnimation = false,
  SimpleStreamMermaid,
}) => {
  const generatedId = useId();

  // Persistent key map to ensure block keys remain stable across re-mounts
  const blockKeyMapRef = useRef<Map<string, string>>(new Map());

  // Prepares streamed content (trim orphaned syntax + remend); no character pacing
  const smoothedContent = useSmoothStreamContent(content);



  // Parse blocks from the prepared content (same path for streaming and static)
  const blocksContent = smoothedContent;

  const parsedBlocks = useMemo(() => {
    const { blocks: rawBlocks } = parseMarkdownIntoBlocks(blocksContent, { gfm: true });

    const mapped = rawBlocks.map((block, index) => {
      const positionKey = `${block.startOffset}-${index}`;

      if (!blockKeyMapRef.current.has(positionKey)) {
        blockKeyMapRef.current.set(positionKey, `${generatedId}-${positionKey}`);
      }

      return {
        content: block.content,
        startOffset: block.startOffset,
        blockType: block.blockType,
        key: blockKeyMapRef.current.get(positionKey)!,
      };
    });

    return mapped;
  }, [blocksContent, generatedId]);




  // Single-tree: UnifiedRenderer handles all modes
  // Block fade-in no longer depends on the streaming flag: UnifiedRenderer animates only
  // blocks that appear after the first render, so history/static content never flashes.
  const animationActive = !disableAnimation;

  // Aggregate remark plugins from plugin registry
  const registry = getRegistry();
  const remarkPlugins = useMemo(() => registry.getRemarkPlugins(), [registry.version]);

  // Memoize context values to prevent unnecessary re-renders of all consumers
  const renderValue = useMemo(() => ({
    blocks: parsedBlocks,
    className,
    SimpleStreamMermaid,
    remarkPlugins,
  }), [parsedBlocks, className, SimpleStreamMermaid, remarkPlugins]);

  const animationValue = useMemo(() => ({ animationActive }), [animationActive]);

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
