// Remar - Streaming Markdown renderer for AI chat

// ============================================================
// Core Components
// ============================================================

export { RemarMarkdown } from './react/RemarMarkdown';
export type { RemarMarkdownProps, RemarTheme } from './react/RemarMarkdown';

export { default as IncrementalRenderer } from './core/IncrementalRenderer';
export type { IncrementalRendererProps } from './core/types';

export { UnifiedRenderer } from './react/renderers/UnifiedRenderer';
export { StreamdownBlock } from './react/components/StreamdownBlock';

// ============================================================
// Plugin Registry (Plugin System Core)
// ============================================================

export {
  PluginRegistry,
  getRegistry,
  resetRegistry,
  createPlugin,
  definePlugin,
  Logger,
  createLogger,
} from './core/plugin-registry';

export type {
  RemarPlugin,
  PluginContext,
  PluginLogger,
  RemarConfig,
  PluginFactory,
  PluginMetadata,
  PluginRegistrationOptions,
  PluginEventType,
  PluginEventCallback,
  PluginHandler,
  ComponentMatchRule,
} from './core/plugin-registry';

// ============================================================
// Extensions (Feature Plugins)
// ============================================================

// Mermaid Diagram Extension
export {
  mermaidPlugin,
  MermaidRenderer,
} from './extensions/mermaid';
export type { MermaidPluginOptions, MermaidRendererProps } from './extensions/mermaid/types';

// CodeBlock Extension
export {
  codeblockPlugin,
  CodeBlock,
  CodeBlockHeader,
} from './extensions/codeblock';
export type { CodeBlockProps, CodeBlockHeaderProps, CodeBlockPluginOptions } from './extensions/codeblock/types';

// Math Formula Extension
export {
  mathPlugin,
  MathInline,
  MathBlock,
  MathRenderer,
  resetKatex,
  isKatexLoaded,
} from './extensions/math';

export type {
  FormulaType,
  FormulaRenderStatus,
  FormulaBlock,
  FormulaRenderOptions,
  FormulaRenderResult,
  StreamingConfig,
} from './extensions/math/types';

// ============================================================
// Styles
// ============================================================

import './styles/index.scss';

// ============================================================
// Version
// ============================================================

export const version = '0.1.0';
