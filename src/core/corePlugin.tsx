/**
 * Core Plugin - Built-in plugins for remar
 *
 * Provides essential remark plugins and base component overrides
 * that are always active in a RemarMarkdown instance.
 */

import React from 'react';
import remarkGfm from 'remark-gfm';
import { remarkNormalizeList } from './rehype-plugins/remarkNormalizeList';
import type { RemarPlugin, ComponentMatchRule } from './plugin-registry/types';

/**
 * TableWrapper component — wraps <table> in a scrollable container.
 *
 * Must render the actual <table> element inside the wrapper div,
 * otherwise thead/tbody/tr/td lose their table context and columns collapse.
 */
const TableWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="remar-table-wrapper">
    <table>{children}</table>
  </div>
);

/**
 * Pre component — strips outer <pre> wrapper, lets CodeBlock manage its own container
 */
const PreComponent: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <>{children}</>
);

/**
 * Core Plugin Factory
 *
 * Built-in plugin that provides:
 * - remark-gfm: GitHub Flavored Markdown (tables, strikethrough, task lists)
 * - remarkNormalizeList: Normalize list rendering (<li><p>content</p></li> → <li>content</li>)
 * - table/pre component overrides
 *
 * This plugin is always registered by default and should not be unregistered.
 */
export function corePlugin(): RemarPlugin {
  const componentMatchRules: ComponentMatchRule[] = [
    // Rule 1: <table> → TableWrapper (horizontal scroll support)
    {
      element: 'table',
      match: {},
      component: TableWrapper as React.ComponentType<any>,
      priority: 0,
      transformProps: (props) => props,
    },
    // Rule 2: <pre> → strip wrapper
    {
      element: 'pre',
      match: {},
      component: PreComponent as React.ComponentType<any>,
      priority: 0,
      transformProps: (props) => props,
    },
  ];

  return {
    name: 'core',
    version: '1.0.0',
    displayName: 'Core Plugin',
    description: 'Built-in remark plugins (GFM, list normalization) and base component overrides',
    options: {},

    // Built-in remark plugins
    remarkPlugins: [remarkGfm, remarkNormalizeList],

    // Base component overrides
    componentMatchRules,

    components: {
      TableWrapper,
    },
  };
}

export default corePlugin;
