import React, { memo, useEffect, useRef } from 'react';
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

/**
 * Compare plugin configs, ignoring timelineElapsedMs changes
 * Fix flickering during fast streaming: timelineElapsedMs changes per frame should not trigger re-render
 */
function arePluginsEqual(prev: Pluggable[] | undefined, next: Pluggable[] | undefined): boolean {
  if (prev === next) return true;
  if (!prev || !next) return false;
  if (prev.length !== next.length) return false;

  for (let i = 0; i < prev.length; i++) {
    const p = prev[i];
    const n = next[i];
    if (p === n) continue;

    if (Array.isArray(p) && Array.isArray(n)) {
      if (p[0] !== n[0]) return false;
      if (typeof p[1] === 'object' && typeof n[1] === 'object') {
        const keys = Object.keys(p[1]);
        if (keys.length !== Object.keys(n[1]).length) return false;
        for (const key of keys) {
          // Ignore timelineElapsedMs changes, it changes every frame
        if (key === 'timelineElapsedMs') continue;
          if (p[1][key] !== n[1][key]) return false;
        }
      } else if (p[1] !== n[1]) {
        return false;
      }
    } else if (p !== n) {
      return false;
    }
  }
  return true;
}

export const StreamdownBlock = memo<StreamdownBlockProps>(
  ({ children, components, remarkPlugins, rehypePlugins, settled, onAnimationDone, blockType, isTypePending }) => {
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
        // Inject blockType into code component via data attributes
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

    return (
      <ReactMarkdown
        components={componentsWithContext as any}
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
      >
        {children}
      </ReactMarkdown>
    );
  },
  (prev, next) => {
    if (prev.children !== next.children) return false;
    if (prev.settled !== next.settled) return false;
    if (prev.blockType !== next.blockType) return false;
    if (prev.isTypePending !== next.isTypePending) return false;
    if (!arePluginsEqual(prev.rehypePlugins, next.rehypePlugins)) return false;
    if (!arePluginsEqual(prev.remarkPlugins, next.remarkPlugins)) return false;

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

StreamdownBlock.displayName = 'StreamdownBlock';
