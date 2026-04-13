export interface CodeBlockProps {
  code: string;
  language?: string;
  isStreaming?: boolean;
}

export interface CodeBlockHeaderProps {
  language: string;
  code: string;
  copied: boolean;
  onCopy: () => void;
}

export interface CodeBlockPluginOptions {
  /**
   * Whether to enable copy functionality
   * @default true
   */
  copy?: boolean;
  /**
   * Whether to show language label
   * @default true
   */
  showLanguage?: boolean;
}
