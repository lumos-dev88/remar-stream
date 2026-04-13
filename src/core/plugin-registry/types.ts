/**
 * Remar Plugin System - Type Definitions
 *
 * Provides unified plugin interface and lifecycle management
 */

import type { ComponentType } from 'react';
import type { Pluggable } from 'unified';

/** Plugin context for cross-plugin communication */
export interface PluginContext {
  /** Global configuration */
  config: RemarConfig;
  /** Shared state between plugins */
  state: Map<string, unknown>;
  /** Logger instance */
  logger: PluginLogger;
  /** Get another plugin's API */
  getPlugin: <T = any>(name: string) => T | undefined;
}

/** Logger interface for plugins */
export interface PluginLogger {
  debug: (message: string, ...args: any[]) => void;
  info: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
}

/** Global Remar configuration */
export interface RemarConfig {
  /** Enable debug mode */
  debug?: boolean;
  /** Default theme */
  theme?: 'light' | 'dark';
  /** Animation settings */
  animation?: {
    enabled: boolean;
    charDelay: number;
    fadeDuration: number;
  };
  /** Cache settings */
  cache?: {
    enabled: boolean;
    maxSize: number;
    ttl: number;
  };
}

/** Base plugin interface */
export interface RemarPlugin {
  /** Plugin unique identifier (kebab-case recommended) */
  name: string;
  /** Plugin version (semver) */
  version: string;
  /** Plugin display name */
  displayName?: string;
  /** Plugin description */
  description?: string;
  /** Plugin configuration options */
  options?: Record<string, any>;

  /** Lifecycle: Plugin initialization */
  onInit?: (ctx: PluginContext) => void | Promise<void>;
  /** Lifecycle: Before markdown parsing */
  beforeParse?: (content: string, ctx: PluginContext) => string | Promise<string>;
  /** Lifecycle: After markdown parsing, before rendering */
  beforeRender?: (content: string, ctx: PluginContext) => string | Promise<string>;
  /** Lifecycle: Plugin cleanup */
  onDestroy?: (ctx: PluginContext) => void | Promise<void>;

  /** React components to register */
  components?: Record<string, ComponentType<any>>;
  /** Remark plugins to apply */
  remarkPlugins?: Pluggable[];
  /** Rehype plugins to apply */
  rehypePlugins?: Pluggable[];
  /** Custom handlers for specific syntax */
  handlers?: PluginHandler[];
  /** Component match rules for declarative element interception */
  componentMatchRules?: ComponentMatchRule[];
  /** Language mappings for code block syntax highlighting */
  languageMappings?: LanguageMapping[];
}

/** Plugin handler for custom syntax processing */
export interface PluginHandler {
  /** Handler name */
  name: string;
  /** Handler priority (higher = earlier execution) */
  priority: number;
  /** Test if content matches this handler */
  test: (content: string) => boolean;
  /** Process the content */
  process: (content: string, ctx: PluginContext) => string | Promise<string>;
}

/** Plugin factory function type */
export type PluginFactory<TOptions = Record<string, any>> = (
  options?: TOptions
) => RemarPlugin;

/** Plugin metadata for registry */
export interface PluginMetadata {
  name: string;
  version: string;
  displayName?: string;
  description?: string;
  installedAt: Date;
  instance: RemarPlugin;
}

/** Plugin registration options */
export interface PluginRegistrationOptions {
  /** Whether to overwrite existing plugin */
  overwrite?: boolean;
  /** Plugin priority order */
  priority?: number;
}

/** Event types for plugin communication */
export type PluginEventType =
  | 'plugin:registered'
  | 'plugin:unregistered'
  | 'plugin:error'
  | 'render:start'
  | 'render:complete'
  | 'content:changed';

/** Plugin event callback */
export type PluginEventCallback = (data: unknown, ctx: PluginContext) => void;

/** Plugin event map */
export interface PluginEventMap {
  'plugin:registered': PluginMetadata;
  'plugin:unregistered': PluginMetadata;
  'plugin:error': { error: Error; plugin: string };
  'render:start': { content: string };
  'render:complete': { content: string };
  'content:changed': { content: string; prev: string };
}

// ============================================================
// Component Match Rule System
// ============================================================

/** Condition for matching a component rule */
export interface ComponentMatchCondition {
  /** Match by className (string or RegExp) */
  className?: string | RegExp;
  /** Match by code language (extracted from "language-xxx" className) */
  language?: string;
  /** Match by data-block-type attribute */
  blockType?: string;
  /** Match inline vs block state */
  inline?: boolean;
}

/** Context passed to transformProps when a rule matches */
export interface MatchContext {
  /** The element name that was matched */
  element: string;
  /** Extracted values from match conditions */
  matchedValues: Record<string, unknown>;
}

/** Rule for matching and rendering a specific HTML element */
export interface ComponentMatchRule {
  /** HTML element name to intercept (e.g. 'code', 'think', 'tool') */
  element: string;
  /** Match conditions (all must be satisfied) */
  match: ComponentMatchCondition;
  /** React component to render when matched */
  component: ComponentType<any>;
  /** Rule priority (higher = checked first, default 0) */
  priority?: number;
  /** Transform props before passing to component */
  transformProps?: (props: Record<string, any>, ctx: MatchContext) => Record<string, any>;
}

/** Language mapping for code block syntax highlighting */
export interface LanguageMapping {
  /** Source language identifier (e.g. 'mermaid', 'math') */
  language: string;
  /** Target block type for rendering (e.g. 'mermaid', 'math-block') */
  blockType: string;
}
