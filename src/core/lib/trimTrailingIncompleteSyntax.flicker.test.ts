import { describe, it, expect } from 'vitest';
import { trimTrailingIncompleteSyntax } from './trimTrailingIncompleteSyntax';

describe('trimTrailingIncompleteSyntax - list flicker scenario', () => {
  // listContent ends with "- \n" so that appending "- " creates a new last line
  const listContent = `## 4. 注意事项列表

### 语法注意事项
- **空格的重要性**：某些语法需要特定空格格式
  - 标题 \`#\` 后需要空格
  - 列表符号后需要空格
  - 链接描述和 URL 之间需要空格

-
`;

  // listContentWithoutTrailingDash = listContent minus the trailing "- \n"
  const listContentWithoutTrailingDash = listContent.slice(0, -3); // remove "- \n"

  it('should truncate trailing "- " (list marker only)', () => {
    // listContent ends with "- \n", appending "- " makes lastLine = "- "
    const input = listContent + '- ';
    const result = trimTrailingIncompleteSyntax(input);
    // "- " matches TRAILING_LIST_MARKER → truncated to lastNewLine+1
    // which is listContent itself (ends with "- \n")
    expect(result).toBe(listContent);
    expect(result.endsWith('-\n')).toBe(true); // listContent ends with "- \n"
  });

  it('should NOT truncate trailing "- *" (has non-whitespace after marker)', () => {
    const input = listContent + '- *';
    const result = trimTrailingIncompleteSyntax(input);
    // "- *" does NOT match TRAILING_LIST_MARKER (has *)
    expect(result).toBe(input);
    expect(result.endsWith('- *')).toBe(true);
  });

  it('should reproduce the flicker: content length oscillates', () => {
    // This is the core flicker scenario:
    // 1. displayedContent = listContent + "- " → trim truncates → result = listContent
    //    (block content SHORTENS: list loses the trailing "- " line)
    // 2. displayedContent = listContent + "- *" → trim does NOT truncate → result = listContent + "- *"
    //    (block content LENGTHENS: list gains "- *" line)
    //
    // These two consecutive content changes cause ReactMarkdown to rebuild
    // the list DOM twice → flicker

    const step1Input = listContent + '- ';
    const step1Result = trimTrailingIncompleteSyntax(step1Input);
    // step1Result = listContent (truncated "- " line)
    expect(step1Result).toBe(listContent);
    expect(step1Result.length).toBeLessThan(step1Input.length);

    const step2Input = listContent + '- *';
    const step2Result = trimTrailingIncompleteSyntax(step2Input);
    // step2Result = listContent + "- *" (NOT truncated)
    expect(step2Result).toBe(step2Input);
    expect(step2Result.length).toBeGreaterThan(listContent.length);

    // The oscillation: listContent → listContent (same!) → listContent + "- *"
    // Actually step1Result === listContent, so no change from previous state.
    // But step2Result !== step1Result, so there IS a change.
    // The real issue is when the PREVIOUS displayedContent already had "- "
    // trimmed away, and now we get "- *" which is NOT trimmed.
  });

  it('should truncate all list marker variants', () => {
    // Each of these ends with just a list marker → should be truncated
    expect(trimTrailingIncompleteSyntax(listContent + '- ')).toBe(listContent);
    expect(trimTrailingIncompleteSyntax(listContent + '+ ')).toBe(listContent);
    expect(trimTrailingIncompleteSyntax(listContent + '* ')).toBe(listContent);
    expect(trimTrailingIncompleteSyntax(listContent + '1. ')).toBe(listContent);
  });

  it('should NOT truncate when list item has actual text', () => {
    const withText = listContent + '- some text';
    expect(trimTrailingIncompleteSyntax(withText)).toBe(withText);
  });

  it('should NOT truncate "- *" (asterisk after list marker is text, not whitespace)', () => {
    // "- *" is a list item starting with "*"
    // TRAILING_LIST_MARKER = /^[-*+]\s*$/ → "- *" has "*" after "- " → does NOT match
    // TRAILING_ORPHAN_SYNTAX = /^(#{1,6}|`{1,3}|\*{1,3}|...)$/ → "- *" is not just "*"
    const input = listContent + '- *';
    const result = trimTrailingIncompleteSyntax(input);
    expect(result).toBe(input);
  });
});
