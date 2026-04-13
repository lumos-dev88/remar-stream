/**
 * Renderer common style definitions
 */

import { cva } from 'class-variance-authority';

/**
 * Renderer container variant styles
 * Use cva (class-variance-authority) to manage style variants
 */
export const rendererContainerVariants = cva('remar-renderer', {
  variants: {
    /**
     * Renderer type
     * - static: static rendering, no animation
     * - streaming: streaming rendering, supports animation
     */
    type: {
      static: 'remar-renderer--static',
      streaming: 'remar-renderer--streaming',
    },
    /**
     * Whether to enable animation
     * Affects fade-in effect of streaming characters
     */
    animated: {
      true: 'remar-renderer--animated',
      false: null,
    },
    /**
     * Whether rendering is complete
     * Used to switch to static style after streaming rendering completes
     */
    settled: {
      true: 'remar-renderer--settled',
      false: null,
    },
  },
  defaultVariants: {
    type: 'static',
    animated: false,
    settled: false,
  },
});

/**
 * Renderer content area styles
 * Used to wrap ReactMarkdown content area
 */
export const rendererContentVariants = cva('remar-renderer-content', {
  variants: {
    type: {
      static: 'remar-renderer-content--static',
      streaming: 'remar-renderer-content--streaming',
    },
  },
  defaultVariants: {
    type: 'static',
  },
});

/**
 * Generate unified renderer container class name
 *
 * @param type - Renderer type
 * @param animated - Whether to enable animation
 * @param settled - Whether complete
 * @param className - Additional custom class name
 * @returns Merged class name string
 */
export function getRendererContainerClassName(
  type: 'static' | 'streaming' = 'static',
  animated: boolean = false,
  settled: boolean = false,
  className?: string
): string {
  const baseClass = rendererContainerVariants({ type, animated, settled });
  return className ? `${baseClass} ${className}` : baseClass;
}

/**
 * Generate unified content area class name
 *
 * @param type - Renderer type
 * @param className - Additional custom class name
 * @returns Merged class name string
 */
export function getRendererContentClassName(
  type: 'static' | 'streaming' = 'static',
  className?: string
): string {
  const baseClass = rendererContentVariants({ type });
  return className ? `${baseClass} ${className}` : baseClass;
}
