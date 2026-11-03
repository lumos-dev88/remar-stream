import { Lexer } from 'marked';
import type { BlockContentType } from '../types';

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
function resolveCodeBlockType(lang: string): string {
  switch (lang) {
    case 'mermaid':
      return 'mermaid';
    case 'math':
      return 'math-block';
    default:
      return 'code';
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
 * Resolve block content type from marked token.
 *
 * Code blocks route by language (mermaid / math / plain code). A list that
 * contains a nested code block is routed by that code block's language.
 */
function resolveBlockType(token: any): BlockContentType {
  // Direct code block
  if (token.type === 'code') {
    return resolveCodeBlockType((token.lang ?? '').toLowerCase());
  }

  // For list tokens, check if they contain nested code blocks
  if (token.type === 'list') {
    const nestedCode = findNestedCodeBlock(token);
    if (nestedCode) {
      return resolveCodeBlockType((nestedCode.lang ?? '').toLowerCase());
    }
  }

  return token.type;
}

/**
 * Parse Markdown into Blocks
 * 1. Detect footnotes, if present return as single block
 * 2. Use marked.lexer directly without any additional merging
 *    - remark-math correctly handles $e$ as inlineMath
 *    - HTML tags and $$ formulas are handled by the rendering layer
 * 3. Return startOffset for each block for generating stable keys
 * 4. Resolve block type for plugin routing
 *
 * Streaming and settled content go through the same path: orphaned trailing
 * syntax is handled upstream by trimTrailingIncompleteSyntax.
 */

export interface ParseBlocksResult {
  blocks: BlockWithOffset[];
}

interface ParseBlocksInternalOptions {
  /** Whether to enable GFM (GitHub Flavored Markdown) */
  gfm?: boolean;
}

/**
 * Parse Markdown into Blocks
 *
 * @param markdown - The markdown content to parse
 * @param options - Parsing options
 * @returns ParseBlocksResult with the parsed blocks
 */
export const parseMarkdownIntoBlocks = (
  markdown: string,
  options: ParseBlocksInternalOptions = {}
): ParseBlocksResult => {
  const { gfm = true } = options;

  // Check if contains footnotes
  const hasFootnoteReference = footnoteReferencePattern.test(markdown);
  const hasFootnoteDefinition = footnoteDefinitionPattern.test(markdown);

  // If footnotes present, return entire document as single block
  if (hasFootnoteReference || hasFootnoteDefinition) {
    return { blocks: [{ content: markdown, startOffset: 0, blockType: 'paragraph' }] };
  }

  // Preprocess Markdown (fix list recognition issues)
  const processedMarkdown = preprocessMarkdown(markdown);

  const tokens = Lexer.lex(processedMarkdown, { gfm });

  // Note: Do not modify tokens here as ReactMarkdown will re-parse

  let offset = 0;
  const blocks: BlockWithOffset[] = tokens.map((token: any) => {
    const block: BlockWithOffset = {
      content: token.raw,
      startOffset: offset,
      blockType: resolveBlockType(token),
    };

    offset += token.raw.length;
    return block;
  });

  return { blocks };
};

export default parseMarkdownIntoBlocks;
