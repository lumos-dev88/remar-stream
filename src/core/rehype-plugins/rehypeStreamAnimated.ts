import type { Element, ElementContent, Properties, Root } from 'hast';
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
 */
const HARD_SKIP_TAGS = new Set(['pre', 'svg', 'script', 'style']);

/** CSS class prefixes/suffixes that indicate math content (plugin-managed) */
const MATH_CLASSES = ['math-inline', 'math-display', 'katex', 'katex-display', 'katex-inline'];

function hasClass(node: Element, cls: string): boolean {
  const cn = node.properties?.className;
  if (Array.isArray(cn)) return cn.some((c) => String(c).includes(cls));
  if (typeof cn === 'string') return cn.includes(cls);
  return false;
}

function hasMathClass(node: Element): boolean {
  const cn = node.properties?.className;
  if (!cn) return false;
  const classes = Array.isArray(cn) ? cn.map(String) : (typeof cn === 'string' ? [cn] : []);
  return classes.some(c => MATH_CLASSES.some(mc => c.includes(mc)));
}

function isHardSkip(node: Element): boolean {
  if (HARD_SKIP_TAGS.has(node.tagName)) return true;
  return false;
}

function isMathElement(node: Element): boolean {
  if (node.tagName === 'math') return true;
  return hasMathClass(node);
}

function isWhitespace(char: string): boolean {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r';
}

/**
 * rehype plugin: Mark characters for streaming animation (Linear Render mode).
 *
 * This plugin wraps non-whitespace characters in <span class="stream-char" data-ci="N">.
 * Stagger rhythm is controlled by CPS flush timing — no delay injection needed.
 *
 * Pipeline: CPS → React render → rehype(span marking) → WAAPI element.animate()
 */
export const rehypeStreamAnimated = () => {
  return (tree: Root) => {
    /** Global character counter across the entire tree */
    let globalCharIndex = 0;

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

            const properties: Properties = {
              className: 'stream-char',
              'data-ci': charIndex,
            };

            // CPS flush timing controls stagger rhythm — each flush adds a few
            // characters, and useLayoutEffect triggers element.animate() on all
            // new chars together via WAAPI.

            newChildren.push({
              type: 'element',
              tagName: 'span',
              properties,
              children: [{ type: 'text', value: char }],
            });
          }
        } else if (child.type === 'element') {
          if (isHardSkip(child)) {
            newChildren.push(child);
          } else if (isMathElement(child)) {
            const charIndex = globalCharIndex;
            globalCharIndex++;

            const properties: Properties = {
              className: 'stream-char',
              'data-ci': charIndex,
            };

            // CPS flush timing controls stagger (same as character spans above).

            newChildren.push({
              type: 'element',
              tagName: 'span',
              properties,
              children: [child],
            });
          } else {
            newChildren.push(child);
          }
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
