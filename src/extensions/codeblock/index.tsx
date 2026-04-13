'use client';

import React from 'react';
import type { RemarPlugin, PluginContext, ComponentMatchRule } from '../../core/plugin-registry/types';
import CodeBlock from './CodeBlock';
import { CodeBlockHeader } from './CodeBlockHeader';
import type { CodeBlockPluginOptions } from './types';

export type { CodeBlockProps, CodeBlockHeaderProps, CodeBlockPluginOptions } from './types';

/**
 * CodeBlock Plugin Factory
 *
 * Declarative plugin that registers:
 * - Component match rule for <code data-block-type="code"> (code blocks)
 * - General CodeBlock and CodeBlockHeader components
 *
 * @example
 * ```typescript
 * import { codeblockPlugin } from '@remar/plugins/codeblock';
 * import { getRegistry } from '@remar/core';
 *
 * const registry = getRegistry();
 * await registry.register(codeblockPlugin({
 *   copy: true,
 *   showLanguage: true
 * }));
 * ```
 */
export function codeblockPlugin(options: CodeBlockPluginOptions = {}): RemarPlugin {
  // Shared transformProps for both rules
  const codeTransformProps = (props: Record<string, any>) => ({
    language: props._language,
    code: String(props.children || '').replace(/\n$/, ''),
    isStreaming: props._isStreaming,
  });

  // Build component match rules
  const componentMatchRules: ComponentMatchRule[] = [
    // Rule 1 (high priority): StreamingRenderer path — <code data-block-type="code">
    {
      element: 'code',
      match: { blockType: 'code' },
      component: CodeBlock as React.ComponentType<any>,
      priority: 5,
      transformProps: codeTransformProps,
    },
    // Rule 2 (low priority): StaticRenderer fallback — <code class="language-xxx"> or multi-line <code>
    // Catches code blocks that don't have data-block-type injected (non-StreamdownBlock path)
    {
      element: 'code',
      match: { className: /^language-/ },
      component: CodeBlock as React.ComponentType<any>,
      priority: 1,
      transformProps: codeTransformProps,
    },
  ];

  return {
    name: 'codeblock',
    version: '2.0.0',
    displayName: 'Code Block Plugin',
    description: 'Provides syntax highlighting and copy functionality for code blocks',
    options,

    // Lifecycle: Initialize plugin
    onInit: (ctx: PluginContext) => {
      ctx.logger.info('CodeBlock plugin initialized', {
        copy: options.copy,
        showLanguage: options.showLanguage,
      });
    },

    // Lifecycle: Cleanup
    onDestroy: (ctx: PluginContext) => {
      ctx.logger.info('CodeBlock plugin destroyed');
    },

    // Declarative component overrides
    componentMatchRules,

    // Language mapping for parseBlocks — generic: any language without a specific mapping → code
    languageMappings: [{ language: '*', blockType: 'code' }],

    // General component registry
    components: {
      CodeBlock,
      CodeBlockHeader,
    },
  };
}

// Re-exports for components
export { CodeBlock, CodeBlockHeader };

// Default export for plugin system
export default codeblockPlugin;
