/**
 * Plugin Registry
 *
 * Central registry for managing plugins with lifecycle support
 */

import type { ComponentType } from 'react';
import type { Pluggable } from 'unified';
import type {
  RemarPlugin,
  PluginContext,
  PluginMetadata,
  PluginRegistrationOptions,
  RemarConfig,
  ComponentMatchRule,
  LanguageMapping,
} from './types';
import { createLogger } from './logger';
import { FADE_DURATION, DEFAULT_CHAR_DELAY } from '../types';
import { corePlugin } from '../corePlugin';
import { mathPlugin } from '../../extensions/math';
import { mermaidPlugin } from '../../extensions/mermaid';
import { codeblockPlugin } from '../../extensions/codeblock';

export class PluginRegistry {
  private plugins = new Map<string, PluginMetadata>();
  private context: PluginContext;
  private config: RemarConfig;
  private _version = 0;

  constructor(config: RemarConfig = {}) {
    this.config = {
      debug: false,
      theme: 'light',
      animation: { enabled: true, charDelay: DEFAULT_CHAR_DELAY, fadeDuration: FADE_DURATION },
      cache: { enabled: true, maxSize: 1000, ttl: 5 * 60 * 1000 },
      ...config,
    };

    this.context = this.createContext();
  }

  /**
   * Create plugin context
   */
  private createContext(): PluginContext {
    const sharedState = new Map<string, any>();

    return {
      config: this.config,
      state: sharedState,
      logger: createLogger('Registry', this.config.debug),
      getPlugin: <T = any>(name: string): T | undefined => {
        const metadata = this.plugins.get(name);
        return metadata?.instance as T;
      },
    };
  }

  /**
   * Register a plugin
   */
  async register(
    plugin: RemarPlugin,
    options?: PluginRegistrationOptions
  ): Promise<void> {
    const { overwrite = false, priority = 0 } = options || {};

    // Check if plugin already exists
    if (this.plugins.has(plugin.name)) {
      if (!overwrite) {
        throw new Error(`Plugin "${plugin.name}" is already registered. Use overwrite: true to replace.`);
      }
      this.context.logger.warn(`Overwriting existing plugin "${plugin.name}"`);
      await this.unregister(plugin.name);
    }

    // Validate plugin
    this.validatePlugin(plugin);

    // Create plugin-specific context
    const pluginContext: PluginContext = {
      ...this.context,
      logger: createLogger(plugin.name, this.config.debug),
    };

    // Initialize plugin
    try {
      if (plugin.onInit) {
        await plugin.onInit(pluginContext);
      }

      // Store plugin metadata
      const metadata: PluginMetadata = {
        name: plugin.name,
        version: plugin.version,
        displayName: plugin.displayName,
        description: plugin.description,
        installedAt: new Date(),
        instance: plugin,
      };

      this.plugins.set(plugin.name, metadata);
      this._version++;
      pluginContext.logger.info(`Plugin registered successfully (priority: ${priority})`);
    } catch (error) {
      pluginContext.logger.error('Failed to initialize plugin', error);
      throw new Error(`Plugin "${plugin.name}" initialization failed: ${error}`);
    }
  }

  /**
   * Unregister a plugin
   */
  async unregister(name: string): Promise<boolean> {
    const metadata = this.plugins.get(name);
    if (!metadata) {
      return false;
    }

    const plugin = metadata.instance;
    const pluginContext: PluginContext = {
      ...this.context,
      logger: createLogger(plugin.name, this.config.debug),
    };

    try {
      if (plugin.onDestroy) {
        await plugin.onDestroy(pluginContext);
      }
    } catch (error) {
      pluginContext.logger.error('Error during plugin cleanup', error);
    } finally {
      // Always remove from registry, even if onDestroy throws
      this.plugins.delete(name);
      this._version++;
    }

    pluginContext.logger.info('Plugin unregistered');
    return true;
  }

  /**
   * Get a registered plugin
   */
  get<T = RemarPlugin>(name: string): T | undefined {
    return this.plugins.get(name)?.instance as T;
  }

  /**
   * Check if a plugin is registered
   */
  has(name: string): boolean {
    return this.plugins.has(name);
  }

  /**
   * Version counter — increments on register/unregister, used as useMemo dependency
   */
  get version(): number {
    return this._version;
  }

  /**
   * Get all registered plugin names
   */
  getPluginNames(): string[] {
    return Array.from(this.plugins.keys());
  }

  /**
   * Get all registered plugins
   */
  getAllPlugins(): PluginMetadata[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get all React components from plugins
   */
  getComponents(): Record<string, ComponentType<any>> {
    const components: Record<string, ComponentType<any>> = {};

    for (const metadata of this.plugins.values()) {
      const plugin = metadata.instance;
      if (plugin.components) {
        Object.entries(plugin.components).forEach(([key, component]) => {
          if (components[key]) {
            this.context.logger.warn(
              `Component "${key}" from "${metadata.name}" overwrites existing component`
            );
          }
          components[key] = component;
        });
      }
    }

    return components;
  }

  /**
   * Get all remark plugins
   */
  getRemarkPlugins(): Pluggable[] {
    const plugins: Pluggable[] = [];

    for (const metadata of this.plugins.values()) {
      const plugin = metadata.instance;
      if (plugin.remarkPlugins) {
        plugins.push(...plugin.remarkPlugins);
      }
    }

    return plugins;
  }

  /**
   * Get all component match rules from all plugins
   */
  getComponentMatchRules(): ComponentMatchRule[] {
    const rules: ComponentMatchRule[] = [];

    for (const metadata of this.plugins.values()) {
      const plugin = metadata.instance;
      if (plugin.componentMatchRules) {
        rules.push(...plugin.componentMatchRules);
      }
    }

    // Sort by priority (higher first)
    return rules.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  /**
   * Get all language mappings from all plugins
   */
  getLanguageMappings(): LanguageMapping[] {
    const mappings: LanguageMapping[] = [];

    for (const metadata of this.plugins.values()) {
      const plugin = metadata.instance;
      if (plugin.languageMappings) {
        mappings.push(...plugin.languageMappings);
      }
    }

    return mappings;
  }

  /**
   * Get all rehype plugins
   */
  getRehypePlugins(): Pluggable[] {
    const plugins: Pluggable[] = [];

    for (const metadata of this.plugins.values()) {
      const plugin = metadata.instance;
      if (plugin.rehypePlugins) {
        plugins.push(...plugin.rehypePlugins);
      }
    }

    return plugins;
  }

  /**
   * Get all handlers sorted by priority
   */
  getHandlers() {
    const handlers: Array<{ name: string; priority: number; process: Function }> = [];

    for (const metadata of this.plugins.values()) {
      const plugin = metadata.instance;
      if (plugin.handlers) {
        handlers.push(
          ...plugin.handlers.map((h) => ({
            name: `${metadata.name}:${h.name}`,
            priority: h.priority,
            process: h.process,
          }))
        );
      }
    }

    // Sort by priority (higher first)
    return handlers.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Process content through all plugins' beforeParse hooks
   */
  async processBeforeParse(content: string): Promise<string> {
    let result = content;

    for (const metadata of this.plugins.values()) {
      const plugin = metadata.instance;
      if (plugin.beforeParse) {
        const pluginContext: PluginContext = {
          ...this.context,
          logger: createLogger(plugin.name, this.config.debug),
        };
        try {
          result = await plugin.beforeParse(result, pluginContext);
        } catch (error) {
          pluginContext.logger.error('Error in beforeParse hook', error);
        }
      }
    }

    return result;
  }

  /**
   * Process content through all plugins' beforeRender hooks
   */
  async processBeforeRender(content: string): Promise<string> {
    let result = content;

    for (const metadata of this.plugins.values()) {
      const plugin = metadata.instance;
      if (plugin.beforeRender) {
        const pluginContext: PluginContext = {
          ...this.context,
          logger: createLogger(plugin.name, this.config.debug),
        };
        try {
          result = await plugin.beforeRender(result, pluginContext);
        } catch (error) {
          pluginContext.logger.error('Error in beforeRender hook', error);
        }
      }
    }

    return result;
  }

  /**
   * Clear all plugins
   */
  async clear(): Promise<void> {
    const names = this.getPluginNames();
    for (const name of names) {
      await this.unregister(name);
    }
  }

  /**
   * Validate plugin structure
   */
  private validatePlugin(plugin: RemarPlugin): void {
    if (!plugin.name) {
      throw new Error('Plugin must have a name');
    }

    if (!plugin.version) {
      throw new Error(`Plugin "${plugin.name}" must have a version`);
    }

    // Validate version format (semver)
    const semverRegex = /^\d+\.\d+\.\d+/;
    if (!semverRegex.test(plugin.version)) {
      throw new Error(
        `Plugin "${plugin.name}" version "${plugin.version}" must follow semver format (e.g., 1.0.0)`
      );
    }
  }

  /**
   * Synchronous plugin registration (internal use only).
   * Used for registering default plugins that have synchronous onInit.
   */
  _registerSync(plugin: RemarPlugin): void {
    this.validatePlugin(plugin);

    const pluginContext: PluginContext = {
      ...this.context,
      logger: createLogger(plugin.name, this.config.debug),
    };

    // Run onInit synchronously (default plugins only have sync onInit)
    if (plugin.onInit) {
      plugin.onInit(pluginContext);
    }

    const metadata: PluginMetadata = {
      name: plugin.name,
      version: plugin.version,
      displayName: plugin.displayName,
      description: plugin.description,
      installedAt: new Date(),
      instance: plugin,
    };

    this.plugins.set(plugin.name, metadata);
    this._version++;
  }
}

/** Singleton instance */
let globalRegistry: PluginRegistry | null = null;
/** Flag to track if default plugins have been registered */
let defaultsRegistered = false;

/**
 * Get or create global plugin registry.
 * Automatically registers built-in plugins (core, math, mermaid, codeblock) on first access.
 */
export function getRegistry(config?: RemarConfig): PluginRegistry {
  if (!globalRegistry) {
    globalRegistry = new PluginRegistry(config);
  }

  // Register default plugins once
  if (!defaultsRegistered) {
    defaultsRegistered = true;
    // Default plugins have synchronous onInit, so we can register them
    // synchronously via the internal _registerSync method
    globalRegistry._registerSync(corePlugin());
    globalRegistry._registerSync(mathPlugin());
    globalRegistry._registerSync(mermaidPlugin());
    globalRegistry._registerSync(codeblockPlugin());
  }

  return globalRegistry;
}

/**
 * Reset global registry (mainly for testing)
 */
export function resetRegistry(): void {
  globalRegistry = null;
}
