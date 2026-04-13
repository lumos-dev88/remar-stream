/**
 * Plugin Logger Implementation
 *
 * Provides structured logging for plugins (disabled in production)
 */

import type { PluginLogger } from './types';

export class Logger implements PluginLogger {
  private prefix: string;
  private debugEnabled: boolean;

  constructor(pluginName: string, debugEnabled = false) {
    this.prefix = `[Remar:${pluginName}]`;
    this.debugEnabled = debugEnabled;
  }

  debug(message: string, ...args: any[]): void {
    if (this.debugEnabled) {
      console.debug(this.prefix, message, ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.debugEnabled) {
      console.info(this.prefix, message, ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    console.warn(this.prefix, message, ...args);
  }

  error(message: string, ...args: any[]): void {
    console.error(this.prefix, message, ...args);
  }
}

/** Create a logger instance for a plugin */
export function createLogger(pluginName: string, debugEnabled = false): PluginLogger {
  return new Logger(pluginName, debugEnabled);
}
