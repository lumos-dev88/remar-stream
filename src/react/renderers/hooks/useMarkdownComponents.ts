/**
 * useMarkdownComponents - Hook to create stable markdown components from plugin registry
 *
 * Uses buildComponentsFromRules to dynamically generate ReactMarkdown component overrides
 * from the plugin registry's ComponentMatchRules. This replaces the previous hardcoded
 * component mapping with a registry-driven approach.
 *
 * Performance: Uses ref to avoid re-creating components when isStreaming changes,
 * preventing unnecessary re-renders of StreamdownBlock.
 */

import React, { useMemo, useRef, useEffect } from 'react';
import { getRegistry } from '../../../core/plugin-registry';
import { buildComponentsFromRules } from './buildComponentsFromRules';
import type { MarkdownElementProps } from '../../../core/types';

interface UseMarkdownComponentsOptions {
  isStreaming?: boolean;
  SimpleStreamMermaid?: React.ComponentType<{ children: string }>;
}

/**
 * Custom hook to create stable markdown components from plugin registry.
 *
 * Components are created from ComponentMatchRules declared by plugins.
 * Uses ref to avoid re-creating components when isStreaming changes,
 * preventing unnecessary re-renders of StreamdownBlock.
 */
export function useMarkdownComponents(options: UseMarkdownComponentsOptions): Record<string, React.ComponentType<MarkdownElementProps>> {
  const { isStreaming, SimpleStreamMermaid } = options;

  // Use ref to keep isStreaming value stable across renders
  const isStreamingRef = useRef<boolean>(isStreaming ?? false);
  useEffect(() => {
    isStreamingRef.current = isStreaming ?? false;
  }, [isStreaming]);

  // Build components from registry rules
  // Rebuild when registry version changes (plugin registered/unregistered)
  const registry = getRegistry();
  const components = useMemo<Record<string, React.ComponentType<MarkdownElementProps>>>(() => {
    const rules = registry.getComponentMatchRules();
    return buildComponentsFromRules(rules, { isStreamingRef, SimpleStreamMermaid });
  }, [SimpleStreamMermaid, isStreamingRef, registry.version]);

  return components;
}
