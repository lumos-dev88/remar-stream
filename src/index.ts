// Remar - Streaming Markdown renderer for AI chat

// ============================================================
// Core Components
// ============================================================

export { RemarMarkdown } from './react/RemarMarkdown';
export type { RemarMarkdownProps } from './react/RemarMarkdown';

export { ErrorBoundary } from './react/components/ErrorBoundary';

// ============================================================
// Plugin System (Public API for custom plugins)
// ============================================================

export { definePlugin } from './core/plugin-registry';

export type {
  RemarPlugin,
  ComponentMatchRule,
} from './core/plugin-registry';

// ============================================================
// Debug / Monitoring
// ============================================================

export type { StreamStats } from './core/types';

// ============================================================
// Styles
// ============================================================

import './styles/index.scss';

// ============================================================
// Version
// ============================================================

export const version = '0.1.4';
