import type { Element, ElementContent, Root } from 'hast';
import type { BuildVisitor } from 'unist-util-visit';
import { visit } from 'unist-util-visit';
import type { StreamAnimatedOptions } from '../types';

/**
 * Block-level entry tags that trigger wrapText.
 * Covers all block-level containers that actually contain text content.
 */
const BLOCK_ENTRY_TAGS = new Set([
  // Headings and paragraphs
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  // Lists
  'li', 'dt', 'dd',
  // Table cells
  'td', 'th',
  // Quotes and details
  'blockquote', 'figcaption', 'summary',
]);

/**
 * Hard-skip tags — internal content is completely excluded from animation.
 * Note: table/ul/ol themselves are not entry points, but they don't need to be skipped.
 * Let visit continue traversing downward to find entry points.
 */
const HARD_SKIP_TAGS = new Set(['pre', 'code', 'svg', 'math', 'script', 'style']);

/**
 * Check if an element has a specific CSS class.
 */
function hasClass(node: Element, cls: string): boolean {
  const cn = node.properties?.className;
  if (Array.isArray(cn)) return cn.some((c) => String(c).includes(cls));
  if (typeof cn === 'string') return cn.includes(cls);
  return false;
}

/**
 * Determine if a node should be hard-skipped (no animation processing).
 */
function isHardSkip(node: Element): boolean {
  if (HARD_SKIP_TAGS.has(node.tagName)) return true;
  // Skip entire KaTeX blocks (both display and inline match 'katex' prefix)
  if (hasClass(node, 'katex')) return true;
  return false;
}

/**
 * Check if a character is pure whitespace (no need to wrap in span).
 */
function isWhitespace(char: string): boolean {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r';
}

export const rehypeStreamAnimated = (options: StreamAnimatedOptions = {}) => {
  const {
    charDelay = 20,
    fadeDuration = 200,
    baseCharCount = 0,
    revealed = false,
    timelineElapsedMs,
  } = options;

  const hasTimeline =
    typeof timelineElapsedMs === 'number' && Number.isFinite(timelineElapsedMs);

  return (tree: Root) => {
    /** Global character counter across the entire tree, ensuring monotonically increasing delays. */
    let globalCharIndex = 0;

    /**
     * Calculate the className and delay for a single character.
     * Pure function, decoupled from DOM operations for easier unit testing.
     */
    function resolveCharStyle(charIdx: number): {
      className: string;
      delay: number | undefined;
    } {
      if (revealed) {
        return { className: 'stream-char stream-char-revealed', delay: undefined };
      }

      const relativeIndex = charIdx - baseCharCount;

      if (hasTimeline) {
        const progress = (timelineElapsedMs as number) - relativeIndex * charDelay;
        if (progress >= fadeDuration) {
          return { className: 'stream-char stream-char-revealed', delay: undefined };
        }
        return {
          className: 'stream-char',
          delay: Math.max(0, -progress),
        };
      }

      // No timeline mode
      if (relativeIndex >= 0) {
        // New character: forward delay
        return { className: 'stream-char', delay: relativeIndex * charDelay };
      }

      // Old characters before baseCharCount
      const elapsed = -relativeIndex * charDelay;
      if (elapsed >= fadeDuration) {
        return { className: 'stream-char stream-char-revealed', delay: undefined };
      }
      return { className: 'stream-char', delay: elapsed };
    }

    /**
     * Recursively traverse node children, wrapping each non-whitespace character
     * in text nodes with <span class="stream-char">.
     * Hard-skip child nodes are preserved as-is without entering.
     */
    function wrapText(node: Element): void {
      const newChildren: ElementContent[] = [];

      for (const child of node.children ?? []) {
        if (child.type === 'text') {
          if (!child.value) {
            newChildren.push(child);
            continue;
          }

          for (const char of child.value) {
            // Whitespace: keep as plain text node, but advance the counter
            if (isWhitespace(char)) {
              // Merge with previous text node to reduce node count
              const prev = newChildren[newChildren.length - 1];
              if (prev?.type === 'text') {
                prev.value += char;
              } else {
                newChildren.push({ type: 'text', value: char });
              }
              globalCharIndex++;
              continue;
            }

            const { className, delay } = resolveCharStyle(globalCharIndex);
            globalCharIndex++;

            const properties: Record<string, unknown> = { className };
            // Explicitly write delay === 0, CSS animation needs explicit trigger
            if (delay !== undefined) {
              properties.style = `animation-delay:${delay}ms`;
            }

            newChildren.push({
              type: 'element',
              tagName: 'span',
              properties,
              children: [{ type: 'text', value: char }],
            });
          }
        } else if (child.type === 'element') {
          if (isHardSkip(child)) {
            // Hard-skip: don't process internal content, and don't advance character counter
            // (these characters never participate in animation)
            newChildren.push(child);
          } else {
            // Recursively process text inside child elements
            wrapText(child);
            newChildren.push(child);
          }
        } else {
          newChildren.push(child);
        }
      }

      node.children = newChildren;
    }

    // visit is only responsible for finding "entry points", wrapText handles downward recursion.
    // Hard-skip nodes are skipped directly to prevent visit from entering them.
    visit(tree, 'element', ((node: Element) => {
      if (isHardSkip(node)) return 'skip';

      if (BLOCK_ENTRY_TAGS.has(node.tagName)) {
        wrapText(node);
        return 'skip'; // Already recursively processed by wrapText, no need for visit to enter
      }

      return undefined; // Continue traversing downward to find entry points
    }) as BuildVisitor<Root, 'element'>);
  };
};
