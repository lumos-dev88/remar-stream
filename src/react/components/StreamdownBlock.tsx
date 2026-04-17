import React, { memo, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Pluggable } from 'unified';
import type { MarkdownCodeProps, MarkdownElementProps } from '../../core/types';
import { useStreamAnimator } from '../hooks/useStreamAnimator';

interface StreamdownBlockProps {
  children: string;
  components?: Record<string, React.ComponentType<MarkdownElementProps>>;
  remarkPlugins?: Pluggable[];
  rehypePlugins?: Pluggable[];
  settled?: boolean;
  onAnimationDone?: () => void;
  /** Block type from parse phase for plugin routing */
  blockType?: string;
  /** Whether block type is pending (streaming incomplete) */
  isTypePending?: boolean;
  /** Timeline progress ref (ms) — updated by RAF in useBlockAnimation */
  timelineRef?: React.RefObject<number>;
  /** Character delay (ms) */
  charDelay?: number;
  /** Fade duration (ms) */
  fadeDuration?: number;
}

export const StreamdownBlock = memo<StreamdownBlockProps>(
  ({
    children,
    components,
    remarkPlugins,
    rehypePlugins,
    settled,
    onAnimationDone,
    blockType,
    isTypePending,
    timelineRef,
    charDelay = 20,
    fadeDuration = 150,
  }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const prevSettledRef = useRef(settled);

    useEffect(() => {
      if (settled && !prevSettledRef.current && onAnimationDone) {
        onAnimationDone();
      }
      prevSettledRef.current = settled;
    }, [settled, onAnimationDone]);

    // Wrap components to inject blockType context
    const componentsWithContext = React.useMemo(() => {
      if (!components) return undefined;

      return {
        ...components,
        code: (props: MarkdownCodeProps) => {
          const CodeComponent = components.code;
          if (!CodeComponent) return null;

          return (
            <CodeComponent
              {...props}
              data-block-type={blockType}
              data-type-pending={isTypePending}
            />
          );
        },
      };
    }, [components, blockType, isTypePending]);

    // RAF-driven DOM animation — bypasses React render cycle
    const isAnimating = !settled && !!timelineRef;
    useStreamAnimator(containerRef, {
      timelineRef: timelineRef!,
      charDelay,
      fadeDuration,
      active: isAnimating,
      settled: !!settled,
    });

    return (
      <div ref={containerRef}>
        <ReactMarkdown
          components={componentsWithContext as any}
          remarkPlugins={remarkPlugins}
          rehypePlugins={rehypePlugins}
        >
          {children}
        </ReactMarkdown>
      </div>
    );
  },
  (prev, next) => {
    if (prev.children !== next.children) return false;
    if (prev.settled !== next.settled) return false;
    if (prev.blockType !== next.blockType) return false;
    if (prev.isTypePending !== next.isTypePending) return false;
    if (prev.charDelay !== next.charDelay) return false;
    if (prev.fadeDuration !== next.fadeDuration) return false;

    // Compare plugins structurally (no timelineElapsedMs special case needed)
    if (!pluginsEqual(prev.rehypePlugins, next.rehypePlugins)) return false;
    if (!pluginsEqual(prev.remarkPlugins, next.remarkPlugins)) return false;

    if (prev.components !== next.components) {
      const prevComponentKeys = Object.keys(prev.components || {});
      const nextComponentKeys = Object.keys(next.components || {});
      if (prevComponentKeys.length !== nextComponentKeys.length) return false;
      for (const key of prevComponentKeys) {
        if (prev.components?.[key] !== next.components?.[key]) {
          return false;
        }
      }
    }

    return true;
  }
);

/**
 * Simple structural plugin comparison — no special cases needed.
 * timelineElapsedMs is no longer passed to rehype plugins.
 */
function pluginsEqual(prev: Pluggable[] | undefined, next: Pluggable[] | undefined): boolean {
  if (prev === next) return true;
  if (!prev || !next) return false;
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i] !== next[i]) return false;
  }
  return true;
}

StreamdownBlock.displayName = 'StreamdownBlock';
