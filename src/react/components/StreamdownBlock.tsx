import React, { memo, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Pluggable } from 'unified';
import type { MarkdownCodeProps, MarkdownElementProps } from '../../core/types';
import { rehypeStreamAnimated } from '../../core/rehype-plugins/rehypeStreamAnimated';

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
  /** Block index for container registration */
  blockIndex?: number;
  /** Register this block's containerRef for Single RAF Loop DOM animation */
  registerContainer?: (index: number, ref: React.RefObject<HTMLElement | null>) => void;
  /** Unregister this block's containerRef */
  unregisterContainer?: (index: number) => void;
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
    blockIndex,
    registerContainer,
    unregisterContainer,
  }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const prevSettledRef = useRef(settled);

    useEffect(() => {
      if (settled && !prevSettledRef.current && onAnimationDone) {
        onAnimationDone();
      }
      prevSettledRef.current = settled;
    }, [settled, onAnimationDone]);

    // Register/unregister containerRef for Single RAF Loop DOM animation.
    // The RAF loop in useBlockAnimation directly manipulates className on this
    // container's spans — no per-block RAF loops needed.
    useEffect(() => {
      if (blockIndex !== undefined && registerContainer && containerRef) {
        registerContainer(blockIndex, containerRef);
      }
      return () => {
        if (blockIndex !== undefined && unregisterContainer) {
          unregisterContainer(blockIndex);
        }
      };
    }, [blockIndex, registerContainer, unregisterContainer]);

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

    // Create rehype plugin with containerRef for flicker prevention.
    // When ReactMarkdown rebuilds the DOM (e.g., list content changes, inline tags close),
    // the plugin checks existing DOM spans and inherits their revealed state.
    // Only needed when animation plugins are present.
    const rehypePluginsWithRef = useMemo<Pluggable[]>(() => {
      if (!rehypePlugins || rehypePlugins.length === 0) return [];
      return rehypePlugins.map(plugin => {
        if (Array.isArray(plugin) && plugin[0] === rehypeStreamAnimated) {
          return [rehypeStreamAnimated, { ...plugin[1], containerRef }] as Pluggable;
        }
        return plugin;
      });
    }, [rehypePlugins, containerRef]);

    return (
      <div ref={containerRef}>
        <ReactMarkdown
          components={componentsWithContext as any}
          remarkPlugins={remarkPlugins}
          rehypePlugins={rehypePluginsWithRef}
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
    if (prev.blockIndex !== next.blockIndex) return false;

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
