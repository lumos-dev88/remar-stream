/**
 * Mermaid render log collector
 * Used to collect render logs and export for analysis
 */

interface LogEntry {
  timestamp: string;
  level: 'log' | 'error' | 'warn';
  message: string;
  data?: any;
}

class MermaidLogger {
  private logs: LogEntry[] = [];
  private maxLogs = 1000;

  log(message: string, data?: any) {
    this.addLog('log', message, data);
  }

  error(message: string, data?: any) {
    this.addLog('error', message, data);
  }

  warn(message: string, data?: any) {
    this.addLog('warn', message, data);
  }

  private addLog(level: LogEntry['level'], message: string, data?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
    };

    this.logs.push(entry);

    // Limit log count
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Console output removed for production — use exportLogs() for debugging
  }

  /**
   * Export logs as text format
   */
  exportLogs(): string {
    return this.logs
      .map(
        (log) =>
          `${log.timestamp} [${log.level.toUpperCase()}] ${log.message}${
            log.data ? ' ' + JSON.stringify(log.data) : ''
          }`
      )
      .join('\n');
  }

  /**
   * Export logs as JSON format
   */
  exportLogsJSON(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * Clear logs
   */
  clear() {
    this.logs = [];
  }

  getLogCount(): number {
    return this.logs.length;
  }
}

export const mermaidLogger = new MermaidLogger();

export const logMermaid = (message: string, data?: any) =>
  mermaidLogger.log(message, data);
export const errorMermaid = (message: string, data?: any) =>
  mermaidLogger.error(message, data);
export const warnMermaid = (message: string, data?: any) =>
  mermaidLogger.warn(message, data);
