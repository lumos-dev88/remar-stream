import type { Element, ElementContent, Root } from 'hast';
import type { BuildVisitor } from 'unist-util-visit';
import { visit } from 'unist-util-visit';
import type { StreamAnimatedOptions } from '../types';

const BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const SKIP_TAGS = new Set(['pre', 'code', 'table', 'svg', 'li']);

function hasClass(node: Element, cls: string): boolean {
  const cn = node.properties?.className;
  if (Array.isArray(cn)) return cn.some((c) => String(c).includes(cls));
  if (typeof cn === 'string') return cn.includes(cls);
  return false;
}

export const rehypeStreamAnimated = (options: StreamAnimatedOptions = {}) => {
  const {
    charDelay = 20,
    fadeDuration = 200,
    baseCharCount = 0,
    revealed = false,
    timelineElapsedMs,
  } = options;
  const hasTimeline = typeof timelineElapsedMs === 'number' && Number.isFinite(timelineElapsedMs);

  return (tree: Root) => {
    let globalCharIndex = 0;

    const shouldSkip = (node: Element): boolean => {
      if (SKIP_TAGS.has(node.tagName)) return true;
      if (hasClass(node, 'katex')) return true;
      if (hasClass(node, 'katex-display')) return true;
      return false;
    };

    const wrapText = (node: Element) => {
      const newChildren: ElementContent[] = [];
      for (const child of node.children || []) {
        if (child.type === 'text' && child.value) {
          // Fix: Skip pure newlines to avoid extra empty lines in list items
          // But preserve newlines for character index calculation to ensure animation timing is correct
          const isNewlineOnly = child.value.trim() === '';

          for (const char of child.value) {
            const relativeIndex = globalCharIndex - baseCharCount;

            // If pure whitespace (newline, space, tab, etc.), don't create span element
            // But still increment character index to maintain animation timing
            // This avoids wrapping spaces between list item markers and text, preventing style inconsistencies
            if (char === '\n' || char === '\r' || char === ' ' || char === '\t') {
              // Preserve space as normal text node, don't wrap in stream-char
              newChildren.push({
                type: 'text',
                value: char,
              });
              globalCharIndex++;
              continue;
            }

            let className = 'stream-char';
            let delay: number | undefined;

            if (revealed) {
              className = 'stream-char stream-char-revealed';
            } else if (hasTimeline) {
              // Fix 3: Use relativeIndex instead of globalCharIndex
              const progress = (timelineElapsedMs as number) - relativeIndex * charDelay;
              if (progress >= fadeDuration) {
                className = 'stream-char stream-char-revealed';
              } else {
                delay = Math.max(0, -progress);
              }
            } else if (relativeIndex >= 0) {
              delay = relativeIndex * charDelay;
            } else {
              const elapsed = -relativeIndex * charDelay;
              if (elapsed >= fadeDuration) {
                className = 'stream-char stream-char-revealed';
              } else {
                delay = -elapsed;
              }
            }

            const properties: Record<string, any> = { className };
            if (delay !== undefined && delay !== 0 && !Object.is(delay, -0)) {
              properties.style = `animation-delay:${delay}ms`;
            }
            newChildren.push({
              children: [{ type: 'text', value: char }],
              properties,
              tagName: 'span',
              type: 'element',
            });
            globalCharIndex++;
          }
        } else if (child.type === 'element') {
          if (!shouldSkip(child)) {
            wrapText(child);
          }
          newChildren.push(child);
        } else {
          newChildren.push(child);
        }
      }
      node.children = newChildren;
    };

    visit(tree, 'element', ((node: Element) => {
      if (shouldSkip(node)) return 'skip';
      if (BLOCK_TAGS.has(node.tagName)) {
        wrapText(node);
        return 'skip';
      }
      return undefined;
    }) as BuildVisitor<Root, 'element'>);
  };
};
