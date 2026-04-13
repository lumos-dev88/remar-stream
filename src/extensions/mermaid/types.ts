export interface MermaidPluginOptions {
  /**
   * Whether to enable cache
   * @default true
   */
  cache?: boolean;
  /**
   * Cache size limit
   * @default 100
   */
  cacheMaxSize?: number;
  /**
   * Cache TTL (milliseconds)
   * @default 300000 (5 minutes)
   */
  cacheTTL?: number;
  /**
   * Theme configuration
   */
  theme?: 'default' | 'forest' | 'dark' | 'neutral';
}

export interface MermaidRendererProps {
  /**
   * Mermaid diagram code
   */
  children: string;
  /**
   * Whether in streaming mode
   */
  isStreaming?: boolean;
  /**
   * Plugin options
   */
  options?: MermaidPluginOptions;
}
