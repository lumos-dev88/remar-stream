/**
 * Mermaid Plugin - Standardized Implementation
 *
 * Follows Remar Plugin System specification with declarative component overrides.
 *
 * [Performance Optimization]
 * 1. Suspense + lazy: Mermaid module loaded on demand, reducing initial bundle
 * 2. Error Boundary: Graceful degradation when loading fails
 * 3. Placeholder: Min-height placeholder prevents layout shift
 *
 * [Bundle Benefits]
 * - Before: Main bundle ~580KB (including Mermaid ~500KB)
 * - After: Main bundle ~80KB, Mermaid loaded on demand
 * - First screen reduction: ~500KB (-86%)
 */

import React, { lazy, Suspense } from 'react';
import type { RemarPlugin, PluginContext, ComponentMatchRule } from '../../core/plugin-registry/types';
import { ErrorBoundary } from '../../react/components/ErrorBoundary';
import mermaidCache from './cache';
import type { MermaidPluginOptions, MermaidRendererProps } from './types';

export type { MermaidPluginOptions, MermaidRendererProps };

// Lazy load MermaidRenderer for code splitting
const LazyMermaidRenderer = lazy(() =>
  import('./MermaidRenderer').then((module) => ({
    default: module.MermaidRenderer,
  }))
);

/**
 * MermaidPlaceholder - Simple placeholder to prevent layout shift
 *
 * Uses min-height to reserve space before component loads
 */
const MermaidPlaceholder: React.FC = () => (
  <div className="remar-mermaid-placeholder" />
);

/**
 * MermaidRenderer component with Suspense
 *
 * Automatically handles:
 * - Lazy loading Mermaid module
 * - Min-height placeholder to prevent layout shift
 * - Error boundary fallback
 */
export const MermaidRenderer: React.FC<MermaidRendererProps> = (props) => {
  return (
    <ErrorBoundary
      name="MermaidRenderer"
      fallback={<div className="remar-mermaid-placeholder" />}
    >
      <Suspense fallback={<MermaidPlaceholder />}>
        <LazyMermaidRenderer {...props} />
      </Suspense>
    </ErrorBoundary>
  );
};
MermaidRenderer.displayName = 'MermaidRenderer';

/**
 * Mermaid Plugin Factory
 *
 * Declarative plugin that registers:
 * - Component match rule for <code data-block-type="mermaid">
 * - Language mapping: 'mermaid' → 'mermaid'
 *
 * @example
 * ```typescript
 * import { mermaidPlugin } from '@remar/plugins/mermaid';
 * import { getRegistry } from '@remar/core';
 *
 * const registry = getRegistry();
 * await registry.register(mermaidPlugin({
 *   theme: 'dark',
 *   cache: true,
 *   cacheMaxSize: 100
 * }));
 * ```
 */
export function mermaidPlugin(options: MermaidPluginOptions = {}): RemarPlugin {
  // Shared transformProps for both rules
  const mermaidTransformProps = (props: Record<string, any>) => ({
    isStreaming: props._isStreaming,
    children: String(props.children || '').replace(/\n$/, ''),
  });

  // Build component match rules
  const componentMatchRules: ComponentMatchRule[] = [
    // Rule 1 (high priority): StreamingRenderer path — <code data-block-type="mermaid">
    {
      element: 'code',
      match: { blockType: 'mermaid' },
      component: MermaidRenderer as React.ComponentType<any>,
      priority: 10,
      transformProps: mermaidTransformProps,
    },
    // Rule 2 (low priority): StaticRenderer fallback — <code class="language-mermaid">
    // Catches mermaid code blocks that don't have data-block-type injected
    {
      element: 'code',
      match: { className: 'language-mermaid' },
      component: MermaidRenderer as React.ComponentType<any>,
      priority: 1,
      transformProps: mermaidTransformProps,
    },
  ];

  return {
    name: 'mermaid',
    version: '2.0.0',
    displayName: 'Mermaid Diagram Plugin',
    description: 'Renders Mermaid diagrams with React 18 Suspense and caching support',
    options,

    // Lifecycle: Initialize plugin
    onInit: (ctx: PluginContext) => {
      ctx.logger.info('Mermaid plugin initialized', { theme: options.theme });

      // Configure cache if enabled
      if (options.cache !== false) {
        ctx.state.set('mermaid:cache', mermaidCache);
      }
    },

    // Lifecycle: Cleanup
    onDestroy: (ctx: PluginContext) => {
      ctx.logger.info('Mermaid plugin destroyed');
      ctx.state.delete('mermaid:cache');
    },

    // Declarative component overrides
    componentMatchRules,

    // Language mapping for parseBlocks
    languageMappings: [{ language: 'mermaid', blockType: 'mermaid' }],

    // General component registry
    components: {
      MermaidRenderer,
    },
  };
}

// Re-exports
export { mermaidCache };
export { MermaidToolbar } from './MermaidToolbar';
export { MermaidCodePanel } from './MermaidCodePanel';

// Default export for plugin system
export default mermaidPlugin;
