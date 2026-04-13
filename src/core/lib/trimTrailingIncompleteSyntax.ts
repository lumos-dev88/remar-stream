/**
 * Remove trailing orphaned syntax symbols from streaming Markdown
 *
 * PRD:
 * 1. Entire line is symbol → truncate (# ` * ~ $ > |)
 * 2. Has text → don't truncate (let remend auto-close)
 * 3. Empty line → don't truncate
 * 4. List markers (- + 1.) → truncate (avoid list premature rendering causing flicker during streaming)
 * 5. Unclosed inline formulas → truncate ($...$ and \(...\))
 */

/** Entire line is orphaned symbol (including list markers, avoid list premature rendering during streaming) */
const TRAILING_ORPHAN_SYNTAX = /^(#{1,6}|`{1,3}|\*{1,3}|~~?|\$\$?|>{2,3}|\|)$/;

/** List markers (- + 1. etc.) → truncate when entire line is only list marker */
const TRAILING_LIST_MARKER = /^[-*+]\s*$|^\d+\.\s*$/;

/**
 * Check and truncate unclosed inline formulas
 * Handle: $...$ and \(...\)
 * Return truncated content, or original content if no unclosed formulas
 */
function trimTrailingIncompleteInlineMath(line: string): string {
  // Check $ formula (single $, not $$)
  // Calculate unpaired $ count
  let dollarCount = 0;
  let lastDollarPos = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '$' && (i === 0 || line[i - 1] !== '\\')) {
      // Skip $$ (block formula)
      if (i < line.length - 1 && line[i + 1] === '$') {
        i++; // Skip second $
        continue;
      }
      dollarCount++;
      lastDollarPos = i;
    }
  }
  // If $ count is odd, there's an unclosed formula, truncate before last $
  if (dollarCount % 2 === 1 && lastDollarPos !== -1) {
    return line.slice(0, lastDollarPos);
  }

  // Check \( formula
  const openParenMatch = line.match(/\\\(/g);
  const closeParenMatch = line.match(/\\\)/g);
  const openCount = openParenMatch ? openParenMatch.length : 0;
  const closeCount = closeParenMatch ? closeParenMatch.length : 0;

  if (openCount > closeCount) {
    // Has unclosed \(, find last \( and truncate
    const lastOpenParen = line.lastIndexOf('\\(');
    if (lastOpenParen !== -1) {
      return line.slice(0, lastOpenParen);
    }
  }

  return line;
}

/**
 * Check and truncate orphaned \ at end of line
 * Example: orphaned \ in "When \\theta = \\pi"
 */
function trimTrailingBackslash(line: string): string {
  // Find orphaned \ at end of line
  // Case 1: Line ends with \\ (escaped \)
  // Case 2: Line ends with single \, and not preceded by \\ (i.e., not escape sequence)

  // Search from end
  let i = line.length - 1;

  // Skip trailing spaces
  while (i >= 0 && line[i] === ' ') {
    i--;
  }

  // Check if within formula (simple check: if within $ or \(, don't process)
  const textBefore = line.slice(0, i + 1);

  // Calculate unclosed $ count
  let dollarCount = 0;
  for (let j = 0; j < textBefore.length; j++) {
    if (textBefore[j] === '$' && (j === 0 || textBefore[j - 1] !== '\\')) {
      if (j < textBefore.length - 1 && textBefore[j + 1] === '$') {
        j++;
        continue;
      }
      dollarCount++;
    }
  }
  const inDollarMath = dollarCount % 2 === 1;

  // Calculate unclosed \(
  const openParenMatch = textBefore.match(/\\\(/g);
  const closeParenMatch = textBefore.match(/\\\)/g);
  const inLatexMath = (openParenMatch?.length || 0) > (closeParenMatch?.length || 0);

  // If within formula, don't process (let formula logic handle)
  if (inDollarMath || inLatexMath) {
    return line;
  }

  if (i >= 0 && line[i] === '\\') {
    if (i >= 1 && line[i - 1] === '\\') {
      return line;
    }
    return line.slice(0, i);
  }

  return line;
}

export function trimTrailingIncompleteSyntax(content: string): string {
  if (!content) return content;

  const lastNewLine = content.lastIndexOf('\n');
  const lastLine = content.slice(lastNewLine + 1);

  if (!lastLine.trim()) return content;

  if (TRAILING_ORPHAN_SYNTAX.test(lastLine.trim())) {
    return content.slice(0, lastNewLine + 1);
  }

  if (TRAILING_LIST_MARKER.test(lastLine.trim())) {
    return content.slice(0, lastNewLine + 1);
  }

  const trimmedLastLine = trimTrailingIncompleteInlineMath(lastLine);
  if (trimmedLastLine !== lastLine) {
    return content.slice(0, lastNewLine + 1) + trimmedLastLine;
  }

  const trimmedBackslash = trimTrailingBackslash(lastLine);
  if (trimmedBackslash !== lastLine) {
    return content.slice(0, lastNewLine + 1) + trimmedBackslash;
  }

  return content;
}
