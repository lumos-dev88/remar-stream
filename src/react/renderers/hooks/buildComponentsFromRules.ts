/**
 * buildComponentsFromRules - Dynamic component mapping from PluginRegistry
 *
 * Reads ComponentMatchRules from the plugin registry and generates
 * ReactMarkdown-compatible component overrides.
 *
 * Design:
 * - Rules are grouped by element name (span, div, code, table, pre, etc.)
 * - For each element, a "router component" is created that checks match conditions
 *   in priority order (higher priority = checked first)
 * - code element has special handling for inline detection and pending state
 * - table/pre elements use simple unconditional overrides
 * - span/div elements use className matching
 */

import React from 'react';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import type { ComponentMatchRule, ComponentMatchCondition } from '../../../core/plugin-registry/types';
import type {
  MarkdownCodeProps,
  MarkdownSpanProps,
  MarkdownDivProps,
  MarkdownTableProps,
  MarkdownPreProps,
  MarkdownElementProps,
} from '../../../core/types';

/**
 * Normalize className to string for matching
 */
function normalizeClassName(className: unknown): string {
  if (Array.isArray(className)) return className.join(' ');
  if (typeof className === 'string') return className;
  return '';
}

/**
 * Extract language from className (e.g., "language-javascript" → "javascript")
 */
function extractLanguage(className: unknown): string {
  const str = normalizeClassName(className);
  const match = /language-(\w+)/.exec(str);
  return match ? match[1] : '';
}

/**
 * Check if a match condition is satisfied
 */
function matchesCondition(
  condition: ComponentMatchCondition,
  context: {
    className: string;
    language: string;
    blockType?: string;
    inline?: boolean;
  }
): boolean {
  // className match
  if (condition.className !== undefined) {
    if (typeof condition.className === 'string') {
      if (!context.className.includes(condition.className)) return false;
    } else if (condition.className instanceof RegExp) {
      if (!condition.className.test(context.className)) return false;
    }
  }

  // language match
  if (condition.language !== undefined) {
    if (condition.language === '*') {
      // Wildcard: match any language
      if (!context.language) return false;
    } else if (context.language !== condition.language) {
      return false;
    }
  }

  // blockType match
  if (condition.blockType !== undefined) {
    if (context.blockType !== condition.blockType) return false;
  }

  // inline match
  if (condition.inline !== undefined) {
    if (context.inline !== condition.inline) return false;
  }

  return true;
}

/**
 * Build context for matching from element props
 */
function buildMatchContext(props: Record<string, any>): {
  className: string;
  language: string;
  blockType?: string;
  inline?: boolean;
} {
  return {
    className: normalizeClassName(props.className),
    language: extractLanguage(props.className),
    blockType: props['data-block-type'] as string | undefined,
    inline: props.inline as boolean | undefined,
  };
}

// ============================================================
// Element-specific component builders
// ============================================================

/**
 * Create a plugin component element wrapped with ErrorBoundary.
 * Catches rendering crashes and falls back to the default element.
 */
function createPluginElement(
  Component: React.ComponentType<any>,
  props: Record<string, any>,
  FallbackElement: React.ReactElement
): React.ReactElement {
  return React.createElement(
    ErrorBoundary,
    {
      name: Component.displayName || Component.name || 'PluginComponent',
      fallback: FallbackElement,
    },
    React.createElement(Component, props)
  );
}

/**
 * Create a span router component from match rules.
 * Falls through to default <span> if no rule matches.
 */
function createSpanRouter(
  rules: ComponentMatchRule[],
  isStreamingRef: React.MutableRefObject<boolean>
): React.ComponentType<MarkdownSpanProps> {
  const SpanRouter = ({ className, children, node: _node, ...props }: MarkdownSpanProps) => {
    const ctx = buildMatchContext({ className, ...props });

    for (const rule of rules) {
      if (matchesCondition(rule.match, ctx)) {
        const transformedProps = rule.transformProps
          ? rule.transformProps({ className, children, ...props, _isStreaming: isStreamingRef.current }, { element: 'span', matchedValues: ctx })
          : { className, children, ...props };
        return createPluginElement(rule.component, transformedProps,
          React.createElement('span', { className, ...props }, children)
        );
      }
    }

    // Default: render as normal <span>
    return React.createElement('span', { className, ...props }, children);
  };
  return SpanRouter;
}

/**
 * Create a div router component from match rules.
 * Falls through to default <div> if no rule matches.
 */
function createDivRouter(
  rules: ComponentMatchRule[],
  isStreamingRef: React.MutableRefObject<boolean>
): React.ComponentType<MarkdownDivProps> {
  const DivRouter = ({ className, children, node: _node, ...props }: MarkdownDivProps) => {
    const ctx = buildMatchContext({ className, ...props });

    for (const rule of rules) {
      if (matchesCondition(rule.match, ctx)) {
        const transformedProps = rule.transformProps
          ? rule.transformProps({ className, children, ...props, _isStreaming: isStreamingRef.current }, { element: 'div', matchedValues: ctx })
          : { className, children, ...props };
        return createPluginElement(rule.component, transformedProps,
          React.createElement('div', { className, ...props }, children)
        );
      }
    }

    // Default: render as normal <div>
    return React.createElement('div', { className, ...props }, children);
  };
  return DivRouter;
}

/**
 * Create a code router component from match rules.
 *
 * Special handling:
 * 1. Inline code detection (inline=true → always render as <code>)
 * 2. Pending state (data-type-pending or blockType=code-pending → render as plain <code>)
 * 3. Code block detection (inline=false, has language class, or has newlines with blockType=code)
 * 4. Falls through to default <code> if no rule matches and not a code block
 */
function createCodeRouter(
  rules: ComponentMatchRule[],
  isStreamingRef: React.MutableRefObject<boolean>,
  SimpleStreamMermaid?: React.ComponentType<{ children: string }>
): React.ComponentType<MarkdownCodeProps> {
  const CodeRouter = ({
    inline,
    className: codeClassName,
    children,
    'data-block-type': dataBlockType,
    'data-type-pending': dataTypePending,
    node: _node,
    ...props
  }: MarkdownCodeProps) => {
    const content = String(children || '');
    const hasNewlines = content.includes('\n');
    const hasLanguageClass = !!codeClassName && normalizeClassName(codeClassName).startsWith('language-');
    const blockType = dataBlockType as string | undefined;
    const isTypePending = dataTypePending as boolean | undefined;

    // Explicit inline code → always render as <code>
    if (inline === true) {
      return React.createElement('code', { className: codeClassName, ...props }, children);
    }

    // Determine if this is a code block
    const isExplicitCodeBlock = inline === false || hasLanguageClass || (hasNewlines && blockType === 'code');

    // Not a code block → render as inline code
    if (!isExplicitCodeBlock) {
      return React.createElement('code', { className: codeClassName, ...props }, children);
    }

    // Pending state: render as plain text (no plugin processing)
    if (isTypePending || blockType === 'code-pending') {
      return React.createElement('code', { className: codeClassName, ...props }, children);
    }

    // Build match context and try rules in priority order
    const ctx = buildMatchContext({ className: codeClassName, 'data-block-type': dataBlockType, inline, ...props });

    for (const rule of rules) {
      if (matchesCondition(rule.match, ctx)) {
        const transformedProps = rule.transformProps
          ? rule.transformProps({ className: codeClassName, children, ...props, _isStreaming: isStreamingRef.current, _language: ctx.language }, { element: 'code', matchedValues: ctx })
          : { className: codeClassName, children, ...props };

        // Special: if rule component is MermaidRenderer and SimpleStreamMermaid is provided, use it instead
        if (SimpleStreamMermaid && rule.component.displayName === 'MermaidRenderer') {
          return React.createElement(SimpleStreamMermaid, {
            children: String(children || '').replace(/\n$/, ''),
          });
        }

        return createPluginElement(rule.component, transformedProps,
          React.createElement('code', { className: codeClassName, ...props }, children)
        );
      }
    }

    // Default: render as plain <code> (no matching rule)
    return React.createElement('code', { className: codeClassName, ...props }, children);
  };
  return CodeRouter;
}

/**
 * Create a table router component from match rules.
 * Checks match conditions in priority order, falls through to default <table>.
 */
function createTableRouter(
  rules: ComponentMatchRule[]
): React.ComponentType<MarkdownTableProps> {
  if (rules.length === 0) return null!;

  const TableRouter = ({ children, ...props }: MarkdownTableProps) => {
    const ctx = buildMatchContext(props);

    for (const rule of rules) {
      if (matchesCondition(rule.match, ctx)) {
        const transformedProps = rule.transformProps
          ? rule.transformProps({ children, ...props }, { element: 'table', matchedValues: ctx })
          : { children, ...props };
        return createPluginElement(rule.component, transformedProps,
          React.createElement('table', { children, ...props })
        );
      }
    }

    // Default: render as normal <table>
    return React.createElement('table', { children, ...props });
  };
  return TableRouter;
}

/**
 * Create a pre router component from match rules.
 * Checks match conditions in priority order, falls through to default <pre>.
 */
function createPreRouter(
  rules: ComponentMatchRule[]
): React.ComponentType<MarkdownPreProps> {
  if (rules.length === 0) return null!;

  const PreRouter = ({ children, ...props }: MarkdownPreProps) => {
    const ctx = buildMatchContext(props);

    for (const rule of rules) {
      if (matchesCondition(rule.match, ctx)) {
        const transformedProps = rule.transformProps
          ? rule.transformProps({ children, ...props }, { element: 'pre', matchedValues: ctx })
          : { children, ...props };
        return createPluginElement(rule.component, transformedProps,
          React.createElement('pre', { children, ...props })
        );
      }
    }

    // Default: render as normal <pre>
    return React.createElement('pre', { children, ...props });
  };
  return PreRouter;
}

// ============================================================
// Main builder function
// ============================================================

interface BuildComponentsOptions {
  /** Ref to isStreaming value (avoids re-creating components on streaming toggle) */
  isStreamingRef: React.MutableRefObject<boolean>;
  /** Optional SimpleStreamMermaid override for mermaid blocks */
  SimpleStreamMermaid?: React.ComponentType<{ children: string }>;
}

/**
 * Build ReactMarkdown components object from plugin registry match rules.
 *
 * This replaces the hardcoded component mapping in StaticRenderer and useMarkdownComponents
 * with a registry-driven approach. Plugins declare their component match rules,
 * and this function creates the appropriate router components.
 *
 * @param rules - ComponentMatchRules from registry (already sorted by priority desc)
 * @param options - Builder options
 * @returns Record<string, React.ComponentType> suitable for ReactMarkdown `components` prop
 */
export function buildComponentsFromRules(
  rules: ComponentMatchRule[],
  options: BuildComponentsOptions
): Record<string, React.ComponentType<MarkdownElementProps>> {
  const { isStreamingRef, SimpleStreamMermaid } = options;

  // Group rules by element (sort by priority desc to ensure correct match order)
  const sortedRules = [...rules].sort((a, b) => (b.priority || 0) - (a.priority || 0));
  const rulesByElement = new Map<string, ComponentMatchRule[]>();
  for (const rule of sortedRules) {
    const existing = rulesByElement.get(rule.element) || [];
    existing.push(rule);
    rulesByElement.set(rule.element, existing);
  }

  const components: Record<string, React.ComponentType<MarkdownElementProps>> = {};

  // Build span router
  const spanRules = rulesByElement.get('span');
  if (spanRules?.length) {
    components.span = createSpanRouter(spanRules, isStreamingRef) as any;
  }

  // Build div router
  const divRules = rulesByElement.get('div');
  if (divRules?.length) {
    components.div = createDivRouter(divRules, isStreamingRef) as any;
  }

  // Build code router (special handling for inline/pending)
  const codeRules = rulesByElement.get('code');
  if (codeRules?.length) {
    components.code = createCodeRouter(codeRules, isStreamingRef, SimpleStreamMermaid) as any;
  }

  // Build table router
  const tableRules = rulesByElement.get('table');
  if (tableRules?.length) {
    components.table = createTableRouter(tableRules) as any;
  }

  // Build pre router
  const preRules = rulesByElement.get('pre');
  if (preRules?.length) {
    components.pre = createPreRouter(preRules) as any;
  }

  return components;
}
