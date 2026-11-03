/**
 * useMarkdownComponents - Hook to create stable markdown components from plugin registry
 *
 * Uses buildComponentsFromRules to dynamically generate ReactMarkdown component overrides
 * from the plugin registry's ComponentMatchRules. This replaces the previous hardcoded
 * component mapping with a registry-driven approach.
 */

import React, { useMemo } from 'react';
import { getRegistry } from '../../../core/plugin-registry';
import { buildComponentsFromRules } from './buildComponentsFromRules';
import type { MarkdownElementProps } from '../../../core/types';

interface UseMarkdownComponentsOptions {
  SimpleStreamMermaid?: React.ComponentType<{ children: string }>;
}

/**
 * Custom hook to create stable markdown components from plugin registry.
 *
 * Components are created from ComponentMatchRules declared by plugins and only
 * rebuilt when the registry changes, so StreamdownBlock props stay stable.
 */
export function useMarkdownComponents(options: UseMarkdownComponentsOptions): Record<string, React.ComponentType<MarkdownElementProps>> {
  const { SimpleStreamMermaid } = options;

  // Build components from registry rules
  // Rebuild when registry version changes (plugin registered/unregistered)
  const registry = getRegistry();
  const components = useMemo<Record<string, React.ComponentType<MarkdownElementProps>>>(() => {
    const rules = registry.getComponentMatchRules();
    return buildComponentsFromRules(rules, { SimpleStreamMermaid });
  }, [SimpleStreamMermaid, registry.version]);

  return components;
}
