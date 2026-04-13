import React from 'react';
import type { RemarPlugin, PluginContext, ComponentMatchRule } from '../../core/plugin-registry/types';
import remarkMath from 'remark-math-extended';
import { MathInline } from './MathInline';
import { MathBlock } from './MathBlock';
import { formulaCache } from './formulaCache';
import type { StreamingConfig } from './types';

// Re-export types
export type {
  FormulaType,
  FormulaRenderStatus,
  FormulaBlock,
  FormulaRenderOptions,
  FormulaRenderResult,
  CacheEntry,
  StreamingConfig,
} from './types';

// Re-export utilities
export {
  getKatex,
  resetKatex,
  isKatexLoaded,
  renderFormula,
  renderFormulaSync,
  preloadKatex,
} from './katex';

// Re-export cache management
export {
  formulaCache,
  getCachedFormula,
  setCachedFormula,
  clearFormulaCache,
} from './formulaCache';

// Re-export hooks
export { useFormulaRender, useFormulaBatchRender } from './useFormulaRender';

// Re-export config
export { DEFAULT_STREAMING_CONFIG } from './types';

// Re-export CSS injection utility
export {
  injectKatexCss,
  isKatexCssInjected,
  resetKatexCssInjection,
} from './injectKatexCss';

/**
 * MathRenderer unified entry
 *
 * Core Design:
 * - Auto-close: Try rendering, display on success
 * - Syntax validation: Pass if KaTeX doesn't throw errors
 * - Cache on success: Store successful render results in cache
 * - Read from cache: Prioritize cache reads
 */
interface MathRendererProps {
  /** Formula content */
  content: string;
  /** Whether inline formula */
  inline?: boolean;
  /** Whether in streaming state */
  isStreaming?: boolean;
  /** Streaming configuration */
  streamingConfig?: Partial<StreamingConfig>;
}

export const MathRenderer: React.FC<MathRendererProps> = ({
  content,
  inline = true,
  isStreaming = false,
  streamingConfig,
}) => {
  if (inline) {
    return (
      <MathInline
        content={content}
        isStreaming={isStreaming}
        streamingConfig={streamingConfig}
      />
    );
  }

  return (
    <MathBlock
      content={content}
      isStreaming={isStreaming}
      streamingConfig={streamingConfig}
    />
  );
};

/**
 * Math Plugin Factory
 *
 * Creates a standardized plugin instance following Remar Plugin System specification.
 * Renders LaTeX math formulas with KaTeX and caching support.
 *
 * @example
 * ```typescript
 * import { mathPlugin } from '@remar/plugins/math';
 * import { getRegistry } from '@remar/core';
 *
 * const registry = getRegistry();
 * await registry.register(mathPlugin({
 *   debounceMs: 50,
 *   enableCache: true,
 *   progressiveRender: true
 * }));
 * ```
 */
export function mathPlugin(options: Partial<StreamingConfig> = {}): RemarPlugin {
  const mergedOptions: StreamingConfig = {
    debounceMs: 50,
    minLength: 1,
    enableCache: true,
    progressiveRender: true,
    ...options,
  };

  const componentMatchRules: ComponentMatchRule[] = [
    // Rule 1: <span class="math-inline"> → MathInline
    {
      element: 'span',
      match: { className: 'math-inline' },
      component: MathInline as React.ComponentType<any>,
      priority: 10,
      transformProps: (props) => ({
        content: props.children,
        isStreaming: props._isStreaming,
      }),
    },
    // Rule 2: <div class="math-display"> → MathBlock
    {
      element: 'div',
      match: { className: 'math-display' },
      component: MathBlock as React.ComponentType<any>,
      priority: 10,
      transformProps: (props) => ({
        content: props.children,
        isStreaming: props._isStreaming,
      }),
    },
    // Rule 3: <code class="language-math math-inline"> → MathInline
    {
      element: 'code',
      match: { className: 'math-inline' },
      component: MathInline as React.ComponentType<any>,
      priority: 10,
      transformProps: (props) => ({
        content: props.children,
        isStreaming: props._isStreaming,
      }),
    },
    // Rule 4: <code class="language-math math-display"> → MathBlock
    {
      element: 'code',
      match: { className: 'math-display' },
      component: MathBlock as React.ComponentType<any>,
      priority: 10,
      transformProps: (props) => ({
        content: String(props.children || '').replace(/\n$/, ''),
        isStreaming: props._isStreaming,
      }),
    },
    // Rule 5: <code data-block-type="math-block"> → MathBlock (StreamingRenderer path)
    {
      element: 'code',
      match: { blockType: 'math-block' },
      component: MathBlock as React.ComponentType<any>,
      priority: 10,
      transformProps: (props) => ({
        content: String(props.children || '').replace(/\n$/, ''),
        isStreaming: props._isStreaming,
      }),
    },
    // Rule 6: <code class="language-math"> → MathBlock (StaticRenderer fallback)
    // Catches ```math fenced code blocks that don't have math-inline/math-display className
    // or data-block-type injected (non-StreamdownBlock path)
    {
      element: 'code',
      match: { className: 'language-math' },
      component: MathBlock as React.ComponentType<any>,
      priority: 5,
      transformProps: (props) => ({
        content: String(props.children || '').replace(/\n$/, ''),
        isStreaming: props._isStreaming,
      }),
    },
  ];

  return {
    name: 'math',
    version: '2.0.0',
    displayName: 'Math Formula Plugin',
    description: 'Renders LaTeX math formulas with KaTeX and caching support',
    options: mergedOptions,

    // Remark plugin for parsing $...$ and $$...$$ syntax
    remarkPlugins: [remarkMath],

    // Lifecycle: Initialize plugin
    onInit: (ctx: PluginContext) => {
      ctx.logger.info('Math plugin initialized', {
        enableCache: mergedOptions.enableCache,
        progressiveRender: mergedOptions.progressiveRender,
      });

      // Store cache reference in shared state
      if (mergedOptions.enableCache) {
        ctx.state.set('math:cache', formulaCache);
      }
    },

    // Lifecycle: Cleanup
    onDestroy: (ctx: PluginContext) => {
      ctx.logger.info('Math plugin destroyed');
      ctx.state.delete('math:cache');
    },

    // Declarative component overrides
    componentMatchRules,

    // Language mapping for parseBlocks
    languageMappings: [{ language: 'math', blockType: 'math-block' }],

    // Register React components
    components: {
      MathInline,
      MathBlock,
      MathRenderer,
    },
  };
}

// Re-exports for components
export { MathInline, MathBlock };

// Default export for plugin system
export default mathPlugin;
