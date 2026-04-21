// Remar - Streaming Markdown renderer for AI chat

// ============================================================
// Core Components
// ============================================================

export { RemarMarkdown } from './react/RemarMarkdown';
export type { RemarMarkdownProps, RemarTheme } from './react/RemarMarkdown';

export { ErrorBoundary } from './react/components/ErrorBoundary';
export type { ErrorBoundaryProps } from './react/components/ErrorBoundary';

// ============================================================
// Plugin System (Public API for custom plugins)
// ============================================================

export { createPlugin, definePlugin } from './core/plugin-registry';

export type {
  RemarPlugin,
  ComponentMatchRule,
} from './core/plugin-registry';

// ============================================================
// Extensions (Feature Plugins)
// ============================================================

// Mermaid Diagram Extension
export { mermaidPlugin, MermaidRenderer } from './extensions/mermaid';
export type { MermaidPluginOptions } from './extensions/mermaid/types';

// CodeBlock Extension
export { codeblockPlugin, CodeBlock } from './extensions/codeblock';
export type { CodeBlockPluginOptions } from './extensions/codeblock/types';

// Math Formula Extension
export { mathPlugin, MathRenderer } from './extensions/math';

// ============================================================
// Styles
// ============================================================

import './styles/index.scss';

// ============================================================
// Version
// ============================================================

export const version = '0.1.3';
