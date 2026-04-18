import type { Element, ElementContent, Root } from 'hast';
import type { BuildVisitor } from 'unist-util-visit';
import { visit } from 'unist-util-visit';

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
 * These elements are preserved as-is, NOT wrapped in stream-char.
 * - pre: codeblock plugin (Shiki syntax highlighting)
 * - svg: mermaid plugin (diagram rendering)
 * - script / style: security (prevent content injection)
 *
 * NOT hard-skipped (but treated as single animation units):
 * - math / code.math-inline / span.math-inline / *.katex: wrapped as single stream-char
 *   so they participate in the animation timeline without being split apart.
 *
 * NOT skipped:
 * - code (without math class): inline code has no plugin, should participate in animation
 * - img / a / br / hr etc.: normal HTML tags, should animate normally
 */
const HARD_SKIP_TAGS = new Set(['pre', 'svg', 'script', 'style']);

/** CSS class prefixes/suffixes that indicate math content (plugin-managed) */
const MATH_CLASSES = ['math-inline', 'math-display', 'katex', 'katex-display', 'katex-inline'];

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
 * Check if an element has any math-related CSS class.
 */
function hasMathClass(node: Element): boolean {
  const cn = node.properties?.className;
  if (!cn) return false;
  const classes = Array.isArray(cn) ? cn.map(String) : (typeof cn === 'string' ? [cn] : []);
  return classes.some(c => MATH_CLASSES.some(mc => c.includes(mc)));
}

/**
 * Determine if a node should be hard-skipped (no animation processing).
 */
function isHardSkip(node: Element): boolean {
  if (HARD_SKIP_TAGS.has(node.tagName)) return true;
  return false;
}

/**
 * Check if an element is a math-related element that should be treated
 * as a single animation unit (wrapped as one stream-char span).
 */
function isMathElement(node: Element): boolean {
  if (node.tagName === 'math') return true;
  return hasMathClass(node);
}

/**
 * Check if a character is pure whitespace (no need to wrap in span).
 */
function isWhitespace(char: string): boolean {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r';
}

/**
 * rehype plugin: Mark characters for streaming animation.
 *
 * [Architecture: Mark-only — animation driven by RAF + DOM]
 *
 * This plugin ONLY wraps non-whitespace characters in <span class="stream-char" data-ci="N">.
 * It does NOT compute animation-delay or className (stream-char-revealed/stream-char-waiting).
 *
 * Animation state is managed by useStreamAnimator hook, which uses RAF to directly
 * update DOM className based on timeline progress. This completely bypasses React's
 * render cycle, solving the "animation freezes when memo blocks re-render" bug.
 *
 * [Why this approach?]
 * Previous approach: rehype computed animation-delay per character → required React
 * re-render to update → arePluginsEqual skipped timelineElapsedMs to prevent flicker
 * → animation froze for content-stable blocks (lists, headings, code blocks).
 *
 * New approach: rehype only marks characters → RAF updates DOM directly → no React
 * dependency → animation works for ALL block types regardless of content stability.
 *
 * [DOM rebuild flicker prevention]
 * When ReactMarkdown re-renders (e.g., list content changes, inline tags close),
 * all old spans are destroyed and new spans are created. Without intervention, new spans
 * lack stream-char-revealed class → 1 frame of "all invisible" → flicker.
 *
 * Solution: pass containerRef to the plugin. When generating a new span, check if the
 * container DOM has an old span with the same data-ci that was already revealed.
 * If so, inherit the revealed state immediately — no flicker.
 */

export interface StreamAnimatedOptions {
  /** If true, all spans start with stream-char-revealed class */
  revealed?: boolean;
  /**
   * Container DOM element ref. When provided, the plugin checks if old spans
   * with the same data-ci were already revealed, and inherits that state.
   * This prevents flicker when ReactMarkdown rebuilds the DOM tree.
   */
  containerRef?: { current: HTMLElement | null };
}

export const rehypeStreamAnimated = (options: StreamAnimatedOptions = {}) => {
  const { revealed = false, containerRef } = options;

  // Pre-read revealed state from existing DOM spans (for flicker prevention).
  // This is called once per rehype execution, before wrapText traverses the tree.
  // We collect all data-ci values of already-revealed spans into a Set for O(1) lookup.
  let revealedCiSet: Set<number> | null = null;
  if (containerRef?.current && !revealed) {
    revealedCiSet = new Set<number>();
    const existingRevealed = containerRef.current.querySelectorAll<HTMLElement>('.stream-char.stream-char-revealed');
    for (let i = 0; i < existingRevealed.length; i++) {
      const ci = parseInt(existingRevealed[i].getAttribute('data-ci') || '', 10);
      if (!isNaN(ci)) revealedCiSet.add(ci);
    }
  }

  return (tree: Root) => {
    /** Global character counter across the entire tree */
    let globalCharIndex = 0;

    /**
     * Recursively traverse node children, wrapping each non-whitespace character
     * in <span class="stream-char" data-ci="N">.
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

            const charIndex = globalCharIndex;
            globalCharIndex++;

            // Check if this character was already revealed in the previous DOM
            const wasRevealed = revealed || (revealedCiSet !== null && revealedCiSet.has(charIndex));

            const properties: Record<string, unknown> = {
              className: wasRevealed
                ? 'stream-char stream-char-revealed'
                : 'stream-char',
              'data-ci': charIndex,
            };

            newChildren.push({
              type: 'element',
              tagName: 'span',
              properties,
              children: [{ type: 'text', value: char }],
            });
          }
        } else if (child.type === 'element') {
          if (isHardSkip(child)) {
            // Hard-skip: preserve as-is (pre, svg, script, style)
            newChildren.push(child);
          } else if (isMathElement(child)) {
            // Math element: wrap as a single animation unit
            // This makes the formula appear at the correct position in the
            // animation timeline, preventing the "sudden pop" effect
            const charIndex = globalCharIndex;
            globalCharIndex++;

            const wasRevealed = revealed || (revealedCiSet !== null && revealedCiSet.has(charIndex));

            const properties: Record<string, unknown> = {
              className: wasRevealed
                ? 'stream-char stream-char-revealed'
                : 'stream-char',
              'data-ci': charIndex,
            };

            newChildren.push({
              type: 'element',
              tagName: 'span',
              properties,
              children: [child],
            });
          } else {
            // Normal element: recurse into children
            wrapText(child);
            newChildren.push(child);
          }
        } else {
          newChildren.push(child);
        }
      }

      node.children = newChildren;
    }

    visit(tree, 'element', ((node: Element) => {
      if (isHardSkip(node)) return 'skip';

      if (BLOCK_ENTRY_TAGS.has(node.tagName)) {
        wrapText(node);
        return 'skip';
      }

      return undefined;
    }) as BuildVisitor<Root, 'element'>);
  };
};
