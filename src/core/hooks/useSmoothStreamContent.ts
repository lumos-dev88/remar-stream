import { useMemo } from 'react';
import remend from 'remend';
import { trimTrailingIncompleteSyntax } from '../lib/trimTrailingIncompleteSyntax';
import { getLatexRemendHandlers } from '../lib/remendLatexHandlers';

// Pre-create LaTeX handlers to avoid recreating on each call
const latexHandlers = getLatexRemendHandlers();

// remend configuration with LaTeX support
// Disable links and images: remend scans the whole document and appends the
// "incomplete link" suffix at the END of it, which corrupts unrelated text
// (earlier unmatched `[`, task lists `- [x`, table cells, footnotes).
// Disable katex: prevent $$ from being converted to $$$$, remark-math handles formulas itself
const remendOptions = {
  links: false,
  images: false,
  katex: false,
  handlers: latexHandlers,
};

/**
 * Prepare streamed Markdown for rendering: drop trailing orphaned syntax and
 * close unfinished inline constructs. No pacing or buffering — output follows
 * input immediately, so display latency is just one React render.
 */
export const useSmoothStreamContent = (content: string): string => {
  const safeContent = typeof content === 'string' ? content : '';
  return useMemo(
    () => remend(trimTrailingIncompleteSyntax(safeContent), remendOptions),
    [safeContent],
  );
};
