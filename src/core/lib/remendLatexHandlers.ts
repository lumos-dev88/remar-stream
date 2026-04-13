/**
 * Remend custom Handler - Fix formula-related rendering issues
 */

import type { RemendHandler } from 'remend';

/**
 * Check if within code block
 */
function isWithinCodeBlock(text: string, position: number): boolean {
  const beforeText = text.slice(0, position);
  const codeBlockMatches = beforeText.match(/```/g);
  if (codeBlockMatches) {
    return codeBlockMatches.length % 2 === 1;
  }
  return false;
}

/**
 * Check if within inline code
 */
function isWithinInlineCode(text: string, position: number): boolean {
  const beforeText = text.slice(0, position);
  let backtickCount = 0;
  for (let i = 0; i < beforeText.length; i++) {
    if (beforeText[i] === '`' && (i === 0 || beforeText[i - 1] !== '\\')) {
      backtickCount++;
    }
  }
  return backtickCount % 2 === 1;
}

/**
 * Check if within standard $ formula
 */
function isWithinDollarMath(text: string, position: number): boolean {
  const beforeText = text.slice(0, position);
  let dollarCount = 0;
  for (let i = 0; i < beforeText.length; i++) {
    if (beforeText[i] === '$' && (i === 0 || beforeText[i - 1] !== '\\')) {
      if (i < beforeText.length - 1 && beforeText[i + 1] === '$') {
        i++;
      }
      dollarCount++;
    }
  }
  return dollarCount % 2 === 1;
}

/**
 * Check if within $$ block formula
 */
function isWithinBlockMath(text: string, position: number): boolean {
  const beforeText = text.slice(0, position);
  let inBlockMath = false;

  for (let i = 0; i < beforeText.length - 1; i++) {
    if (beforeText[i] === '$' && beforeText[i + 1] === '$') {
      inBlockMath = !inBlockMath;
      i++;
    }
  }

  return inBlockMath;
}

/**
 * Check if within LaTeX formula
 */
function isWithinLatexMath(text: string, position: number): boolean {
  const beforeText = text.slice(0, position);
  let inInlineLatex = false;
  let inBlockLatex = false;

  for (let i = 0; i < beforeText.length - 1; i++) {
    if (beforeText[i] === '\\' && beforeText[i + 1] === '(') {
      inInlineLatex = true;
      i++;
    } else if (beforeText[i] === '\\' && beforeText[i + 1] === ')') {
      inInlineLatex = false;
      i++;
    } else if (beforeText[i] === '\\' && beforeText[i + 1] === '[') {
      inBlockLatex = true;
      i++;
    } else if (beforeText[i] === '\\' && beforeText[i + 1] === ']') {
      inBlockLatex = false;
      i++;
    }
  }

  return inInlineLatex || inBlockLatex;
}

/**
 * Handler: Fix link closure issues within formula blocks
 * Priority: 21 (after links handler, but before other handlers)
 *
 * Issue: remend's links handler incorrectly identifies [ as link start within formula blocks
 * Solution: After links handler, remove ](streamdown:incomplete-link) within formula blocks
 */
export const fixMathLinkHandler: RemendHandler = {
  name: 'fixMathLink',
  priority: 21,
  handle: (text: string): string => {
    if (!text.includes('](streamdown:incomplete-link)')) {
      return text;
    }

    const isInBlockMath = isWithinBlockMath(text, text.length);
    const isInInlineMath = isWithinDollarMath(text, text.length);
    const isInLatexMath = isWithinLatexMath(text, text.length);

    if (isInBlockMath || isInInlineMath || isInLatexMath) {
      return text.replace(/\]\(streamdown:incomplete-link\)/g, '');
    }

    return text;
  },
};

/**
 * Get all LaTeX-related remend handlers
 *
 * Note: Formula closing is handled by remark-math, no remend intervention needed.
 * Only the handler for fixing link issues is kept here.
 */
export function getLatexRemendHandlers(): RemendHandler[] {
  return [
    fixMathLinkHandler,
  ];
}
