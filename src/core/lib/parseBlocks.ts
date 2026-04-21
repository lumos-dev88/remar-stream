import { Lexer } from 'marked';
import type { BlockContentType } from '../types';
import { accumulateBackticks, flushAccumulated, type AccumulationState } from './accumulateBackticks';

// ============================================
// Regex patterns
// ============================================

// Footnote identifiers must be alphanumeric, underscore, or hyphen
const footnoteReferencePattern = /\^\[[\w-]{1,200}\](?!:)/;
const footnoteDefinitionPattern = /\^\[[\w-]{1,200}\]:/;

// List prefix detection
const unorderedListPrefix = /^[\s]*[-*+][\s]/;
const orderedListPrefix = /^[\s]*\d+\.[\s]/;

// ============================================
// Main function: Parse Markdown into Blocks
// ============================================

/**
 * Resolve code block type from language identifier.
 * Shared by direct code blocks and nested code blocks in lists.
 */
function resolveCodeBlockType(
  lang: string,
  isStreaming: boolean,
  isLastBlock: boolean,
): { blockType: string; isTypePending: boolean } {
  if (!lang) {
    return { blockType: 'code', isTypePending: false };
  }

  // Streaming last block: check if lang is settled or still pending
  if (isStreaming && isLastBlock && !isLangComplete(lang)) {
    return { blockType: 'code-pending', isTypePending: true };
  }

  switch (lang) {
    case 'mermaid':
      return { blockType: 'mermaid', isTypePending: false };
    case 'math':
      return { blockType: 'math-block', isTypePending: false };
    default:
      return { blockType: 'code', isTypePending: false };
  }
}

/**
 * Detect if a line is the start of a list item
 * Includes unordered lists (-, *, +) and ordered lists (1., 2., etc.)
 */
function isListItemStart(line: string): boolean {
  return unorderedListPrefix.test(line) || orderedListPrefix.test(line);
}

/**
 * Preprocess Markdown to fix list recognition issues during streaming
 *
 * [Note] List marker trimming logic has been moved to trimTrailingIncompleteSyntax.ts
 * This only handles list item recognition issues (e.g., `- item\n-` without space)
 *
 * Problem: During streaming, when `- item\n-` (no space), marked cannot recognize `-` as a new list item,
 *          causing the entire content to be treated as a single list item.
 *
 * Solution: When a line ends with `-`, `*`, `+`, or `\d+.` (and the line is not just the marker),
 *           add a space and zero-width space to ensure marked recognizes it as a new list item.
 */
function preprocessMarkdown(markdown: string): string {
  const lines = markdown.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Detect code block boundaries
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      result.push(line);
      continue;
    }

    // Inside code blocks, do not process
    if (inCodeBlock) {
      result.push(line);
      continue;
    }

    // Detect if current line is a list item start (including marker-only without space)
    const trimmedLine = line.trimStart();

    // [Removed] Lines with only list markers are handled by trimTrailingIncompleteSyntax.ts
    // This only handles list item recognition issues

    // Skip horizontal rules ---, ***, ___ (avoid misjudging as list markers)
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmedLine)) {
      result.push(line);
      continue;
    }

    // Detect unordered list markers (-, *, +)
    // Match: `- xxx` where content ends with `-`, `*`, `+` (no space)
    if (/^[-*+]/.test(trimmedLine) && !/^[-*+]$/.test(trimmedLine) && !/^[-*+][\s]+$/.test(trimmedLine)) {
      // List item with content, check if it ends with a marker
      if (/[-*+]$/.test(trimmedLine)) {
        // Ends with marker but no space, add space and zero-width space
        line = line + ' \u200B';
      }
    }
    // Detect ordered list markers (1., 2., etc.)
    else if (/^\d+\./.test(trimmedLine) && !/^\d+\.?$/.test(trimmedLine) && !/^\d+\.[\s]+$/.test(trimmedLine)) {
      // List item with content, check if it ends with number.
      if (/\d+\.$/.test(trimmedLine)) {
        // Ends with number. but no space, add space and zero-width space
        line = line + ' \u200B';
      }
    }

    result.push(line);
  }

  return result.join('\n');
}

/**
 * Block information, including content and offset
 */
export interface BlockWithOffset {
  content: string;
  startOffset: number;
  blockType?: BlockContentType;
  isTypePending?: boolean;
}

/**
 * Common programming language identifiers for validation
 * Used to detect incomplete language identifiers during streaming
 */
const COMMON_LANGUAGES = new Set([
  'python', 'py', 'javascript', 'js', 'typescript', 'ts',
  'java', 'cpp', 'c', 'csharp', 'cs', 'go', 'rust', 'rs',
  'ruby', 'rb', 'php', 'swift', 'kotlin', 'scala',
  'html', 'css', 'scss', 'sass', 'less',
  'json', 'xml', 'yaml', 'yml', 'toml',
  'sql', 'bash', 'sh', 'shell', 'powershell', 'ps1',
  'markdown', 'md', 'dockerfile', 'docker',
  'jsx', 'tsx', 'vue', 'svelte',
  'graphql', 'gql', 'regex', 'vim', 'lua',
]);

/**
 * Check if a language identifier is likely complete
 * During streaming, lang might be partial (e.g., 'py' instead of 'python')
 */
function isLangComplete(lang: string): boolean {
  // Empty lang is considered complete (no language specified)
  if (!lang) return true;

  // Exact match with common languages
  if (COMMON_LANGUAGES.has(lang)) return true;

  // If lang is 4+ chars and not a common prefix, likely complete
  if (lang.length >= 4) return true;

  // Check if it's a prefix of any common language
  for (const commonLang of COMMON_LANGUAGES) {
    if (commonLang.startsWith(lang) && commonLang !== lang) {
      // It's a prefix of a longer language name, might be incomplete
      return false;
    }
  }

  // Not a prefix of any common language, likely complete
  return true;
}

/**
 * Recursively find the first code block in nested tokens
 * Used to detect code blocks inside list items
 */
function findNestedCodeBlock(token: any): { type: string; lang?: string } | null {
  if (token.type === 'code') {
    return { type: 'code', lang: token.lang };
  }

  // Check list items
  if (token.type === 'list' && token.items) {
    for (const item of token.items) {
      if (item.tokens) {
        for (const subToken of item.tokens) {
          const found = findNestedCodeBlock(subToken);
          if (found) return found;
        }
      }
    }
  }

  return null;
}

/**
 * Resolve block content type from marked token
 *
 * For code blocks during streaming, detects if lang identifier is complete.
 * - lang exists + lang incomplete = pending (wait for more content)
 * - lang exists + lang complete = lang confirmed
 * - lang empty = plain code block
 *
 * Also handles nested code blocks in list items - if a list contains a code block,
 * the block type is resolved based on the code block's language.
 */
function resolveBlockType(
  token: any,
  isLastBlock: boolean,
  isStreaming: boolean
): { blockType: BlockContentType; isTypePending: boolean } {
  // Direct code block
  if (token.type === 'code') {
    const lang = (token.lang ?? '').toLowerCase();
    return resolveCodeBlockType(lang, isStreaming, isLastBlock);
  }

  // For list tokens, check if they contain nested code blocks
  if (token.type === 'list') {
    const nestedCode = findNestedCodeBlock(token);
    if (nestedCode) {
      const lang = (nestedCode.lang ?? '').toLowerCase();
      return resolveCodeBlockType(lang, isStreaming, isLastBlock);
    }
  }

  // Non-code tokens: type is immediately known
  return { blockType: token.type, isTypePending: false };
}

/**
 * Parse Markdown into Blocks
 * 1. Detect footnotes, if present return as single block
 * 2. Use marked.lexer directly without any additional merging
 *    - remark-math correctly handles $e$ as inlineMath
 *    - HTML tags and $$ formulas are handled by the rendering layer
 * 3. Return startOffset for each block for generating stable keys
 * 4. Resolve block type for plugin routing (with streaming-aware pending detection)
 * 5. Apply backtick accumulation for streaming to avoid misjudgment
 */

export interface ParseBlocksResult {
  blocks: BlockWithOffset[];
  /** Updated backtick accumulation state (pass back on next call for instance isolation) */
  backtickState: AccumulationState | undefined;
}

interface ParseBlocksInternalOptions {
  /** Whether to enable GFM (GitHub Flavored Markdown) */
  gfm?: boolean;
  isStreaming?: boolean;
  isStreamComplete?: boolean;
  /** Instance-isolated backtick accumulation state (avoids global mutable state) */
  _backtickState?: AccumulationState;
}

/**
 * Parse Markdown into Blocks
 *
 * @param markdown - The markdown content to parse
 * @param options - Parsing options
 * @returns ParseBlocksResult with blocks and updated backtick state
 */
export const parseMarkdownIntoBlocks = (
  markdown: string,
  options: ParseBlocksInternalOptions = {}
): ParseBlocksResult => {
  const { gfm = true, isStreaming = false, isStreamComplete = false, _backtickState } = options;

  // Check if contains footnotes
  const hasFootnoteReference = footnoteReferencePattern.test(markdown);
  const hasFootnoteDefinition = footnoteDefinitionPattern.test(markdown);

  // If footnotes present, return entire document as single block
  // Note: Preserve backtick state even when footnotes are detected,
  // so that accumulated state is not lost if footnotes appear mid-stream
  if (hasFootnoteReference || hasFootnoteDefinition) {
    return { blocks: [{ content: markdown, startOffset: 0, blockType: 'paragraph', isTypePending: false }], backtickState: _backtickState };
  }

  // Step 1: Apply backtick accumulation for streaming
  let processedMarkdown = markdown;
  let hasPendingBackticks = false;
  let newBacktickState: AccumulationState | undefined;

  if (isStreaming) {
    if (isStreamComplete) {
      // Stream complete, flush accumulated content
      if (_backtickState) {
        processedMarkdown = flushAccumulated(_backtickState);
        newBacktickState = undefined;
      }
    } else {
      // Accumulate backticks to avoid misjudgment
      const result = accumulateBackticks(markdown, _backtickState);
      processedMarkdown = result.renderContent;
      newBacktickState = result.state;
      hasPendingBackticks = result.hasPending;
    }
  }

  // Step 2: Preprocess Markdown (fix list recognition issues during streaming)
  processedMarkdown = preprocessMarkdown(processedMarkdown);

  const tokens = Lexer.lex(processedMarkdown, { gfm });

  // Note: Do not modify tokens here as ReactMarkdown will re-parse

  let offset = 0;
  const blocks: BlockWithOffset[] = tokens.map((token: any, index: number) => {
    const isLastBlock = index === tokens.length - 1;
    const { blockType, isTypePending } = resolveBlockType(token, isLastBlock, isStreaming);

    const block: BlockWithOffset = {
      content: token.raw,
      startOffset: offset,
      blockType,
      isTypePending: isTypePending || (isLastBlock && hasPendingBackticks),
    };

    offset += token.raw.length;
    return block;
  });

  return { blocks, backtickState: newBacktickState };
};

export default parseMarkdownIntoBlocks;
