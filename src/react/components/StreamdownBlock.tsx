import React, { memo, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Pluggable } from 'unified';
import type { MarkdownCodeProps, MarkdownElementProps } from '../../core/types';

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
  }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const prevSettledRef = useRef(settled);

    // ─── Web Animations API trigger ─────────────────────────────
    // After React commit, spans exist in DOM with opacity:0 (from CSS).
    // element.animate() starts from the first keyframe automatically —
    // no rAF needed (unlike CSS transition which required a paint-first step).
    // data-animated attribute prevents re-animating spans on re-render.
    useLayoutEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const pending = container.querySelectorAll<HTMLElement>(
        '.stream-char:not([data-animated])'
      );
      if (pending.length === 0) return;

      if (settled) {
        // Settled blocks: instant opacity:1, no animation.
        // Defensive — if spans exist without prior animation (e.g. content
        // changed after settled), ensure they're visible immediately.
        for (const span of pending) {
          span.setAttribute('data-animated', '');
          span.animate([{ opacity: 1 }], { duration: 0, fill: 'forwards' });
        }
        return;
      }

      for (const span of pending) {
        if (span.isConnected) {
          span.setAttribute('data-animated', '');
          span.animate(
            [{ opacity: 0 }, { opacity: 1 }],
            { duration: 150, fill: 'forwards', easing: 'ease-out' }
          );
        }
      }
    }, [children, settled]);

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

    // In linear render mode, rehype plugins are used as-is (no containerRef injection needed).
    // The rehypeStreamAnimated plugin marks characters with .stream-char + data-ci,
    // and useLayoutEffect triggers WAAPI element.animate() per flush.
    const finalRehypePlugins = useMemo(() => {
      if (!rehypePlugins || rehypePlugins.length === 0) return [];
      return rehypePlugins;
    }, [rehypePlugins]);

    return (
      <div ref={containerRef}>
        <ReactMarkdown
          components={componentsWithContext as any}
          remarkPlugins={remarkPlugins}
          rehypePlugins={finalRehypePlugins}
        >
          {children}
        </ReactMarkdown>
      </div>
    );
  },
  // Relaxed memo: children change triggers re-render (needed for rehype-driven animation)
  (prev, next) => {
    if (prev.children !== next.children) return false;
    if (prev.settled !== next.settled) return false;
    if (prev.blockType !== next.blockType) return false;
    if (prev.isTypePending !== next.isTypePending) return false;

    // Compare plugins structurally
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
