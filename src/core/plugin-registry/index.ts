/**
 * Remar Plugin System
 *
 * Unified plugin architecture for extensible markdown rendering.
 * Plugins use declarative ComponentMatchRules to intercept HTML elements.
 *
 * @example
 * ```typescript
 * import { createPlugin, getRegistry } from '@remar/plugin-system';
 *
 * const myPlugin = createPlugin({
 *   name: 'my-plugin',
 *   version: '1.0.0',
 *   componentMatchRules: [
 *     {
 *       element: 'code',
 *       match: { blockType: 'my-lang' },
 *       component: MyComponent,
 *       priority: 10,
 *     },
 *   ],
 * });
 *
 * const registry = getRegistry();
 * await registry.register(myPlugin());
 * ```
 */

// Core types
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
  ComponentMatchCondition,
  MatchContext,
  LanguageMapping,
} from './types';

// Registry
export { PluginRegistry, getRegistry, resetRegistry } from './registry';

// Logger
export { Logger, createLogger } from './logger';

// Import types for function signatures
import type { RemarPlugin } from './types';

/**
 * Create a plugin factory with default options
 */
export function createPlugin(
  defaults: Omit<RemarPlugin, 'options'>
): (options?: Record<string, any>) => RemarPlugin {
  return (options?: Record<string, any>) => ({
    ...defaults,
    options: options ?? {},
  });
}

/**
 * Create a plugin with required fields
 */
export function definePlugin(
  plugin: RemarPlugin
): RemarPlugin {
  if (!plugin.name) {
    throw new Error('Plugin name is required');
  }
  if (!plugin.version) {
    throw new Error(`Plugin "${plugin.name}" version is required`);
  }

  return plugin;
}
