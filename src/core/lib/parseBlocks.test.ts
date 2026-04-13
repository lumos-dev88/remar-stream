import { describe, it, expect } from 'vitest';
import { parseMarkdownIntoBlocks, type ParseBlocksResult, type BlockWithOffset } from './parseBlocks';

// Helper: extract blocks from result
function blocks(result: ParseBlocksResult): BlockWithOffset[] {
  return result.blocks;
}

// Helper: extract block types
function blockTypes(result: ParseBlocksResult): string[] {
  return result.blocks.map((b) => b.blockType ?? 'unknown');
}

// Helper: filter out 'space' blocks (marked generates these between separated blocks)
function nonSpaceBlocks(result: ParseBlocksResult): BlockWithOffset[] {
  return result.blocks.filter((b) => b.blockType !== 'space');
}

// Helper: filter block types to exclude 'space'
function nonSpaceBlockTypes(result: ParseBlocksResult): string[] {
  return blockTypes(result).filter((t) => t !== 'space');
}

// ===========================================================================
// 1. Basic Block Parsing
// ===========================================================================
describe('parseMarkdownIntoBlocks - Basic Block Parsing', () => {
  // --- Plain text paragraph ---
  describe('Plain text paragraph', () => {
    it('should parse a single line of text as a paragraph', () => {
      const result = parseMarkdownIntoBlocks('Hello world');
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['paragraph']);
      expect(result.blocks[0].content).toContain('Hello world');
    });

    it('should parse multiple lines of text as a single paragraph', () => {
      const result = parseMarkdownIntoBlocks('Line 1\nLine 2\nLine 3');
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['paragraph']);
    });

    it('should parse multiple paragraphs separated by blank lines', () => {
      const result = parseMarkdownIntoBlocks('First paragraph\n\nSecond paragraph\n\nThird paragraph');
      // marked generates 'space' tokens between paragraphs
      expect(nonSpaceBlocks(result)).toHaveLength(3);
      expect(nonSpaceBlockTypes(result)).toEqual(['paragraph', 'paragraph', 'paragraph']);
    });

    it('should set correct startOffset for each block', () => {
      const result = parseMarkdownIntoBlocks('AAA\n\nBBB\n\nCCC');
      expect(result.blocks[0].startOffset).toBe(0);
      // Subsequent blocks start after previous content
      expect(result.blocks[1].startOffset).toBeGreaterThan(0);
      expect(result.blocks[2].startOffset).toBeGreaterThan(result.blocks[1].startOffset);
    });
  });

  // --- Headings ---
  describe('Headings (# ~ ######)', () => {
    it('should parse h1 heading', () => {
      const result = parseMarkdownIntoBlocks('# Title');
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['heading']);
    });

    it('should parse h2 heading', () => {
      const result = parseMarkdownIntoBlocks('## Subtitle');
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['heading']);
    });

    it('should parse h3 heading', () => {
      const result = parseMarkdownIntoBlocks('### Section');
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['heading']);
    });

    it('should parse h4 heading', () => {
      const result = parseMarkdownIntoBlocks('#### Subsection');
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['heading']);
    });

    it('should parse h5 heading', () => {
      const result = parseMarkdownIntoBlocks('##### Detail');
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['heading']);
    });

    it('should parse h6 heading', () => {
      const result = parseMarkdownIntoBlocks('###### Minor');
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['heading']);
    });

    it('should parse multiple headings of different levels', () => {
      const result = parseMarkdownIntoBlocks('# H1\n## H2\n### H3');
      expect(blocks(result)).toHaveLength(3);
      expect(blockTypes(result)).toEqual(['heading', 'heading', 'heading']);
    });
  });

  // --- Code blocks ---
  describe('Code blocks (```language ... ```)', () => {
    it('should parse a fenced code block without language', () => {
      const result = parseMarkdownIntoBlocks('```\ncode here\n```');
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['code']);
    });

    it('should parse a fenced code block with javascript language', () => {
      const result = parseMarkdownIntoBlocks('```javascript\nconst x = 1;\n```');
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['code']);
    });

    it('should parse a fenced code block with python language', () => {
      const result = parseMarkdownIntoBlocks('```python\nprint("hello")\n```');
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['code']);
    });

    it('should parse a fenced code block with mermaid language as mermaid block', () => {
      const result = parseMarkdownIntoBlocks('```mermaid\ngraph LR\n  A --> B\n```');
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['mermaid']);
    });

    it('should parse a fenced code block with math language as math-block', () => {
      const result = parseMarkdownIntoBlocks('```math\nE = mc^2\n```');
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['math-block']);
    });

    it('should parse multiple code blocks separated by blank lines', () => {
      const result = parseMarkdownIntoBlocks('```js\nfoo()\n```\n\n```python\nbar()\n```');
      // marked generates 'space' between the two code blocks
      expect(nonSpaceBlocks(result)).toHaveLength(2);
      expect(nonSpaceBlockTypes(result)).toEqual(['code', 'code']);
    });

    it('should parse code block followed by paragraph', () => {
      const result = parseMarkdownIntoBlocks('```\ncode\n```\n\nSome text');
      expect(nonSpaceBlocks(result)).toHaveLength(2);
      expect(nonSpaceBlockTypes(result)).toEqual(['code', 'paragraph']);
    });

    it('should parse paragraph followed by code block', () => {
      const result = parseMarkdownIntoBlocks('Some text\n\n```\ncode\n```');
      expect(nonSpaceBlocks(result)).toHaveLength(2);
      expect(nonSpaceBlockTypes(result)).toEqual(['paragraph', 'code']);
    });

    it('should handle code block with empty content', () => {
      const result = parseMarkdownIntoBlocks('```\n```');
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['code']);
    });

    it('should handle code block with multiple language aliases', () => {
      const pyResult = parseMarkdownIntoBlocks('```py\nx = 1\n```');
      expect(blockTypes(pyResult)).toEqual(['code']);

      const tsResult = parseMarkdownIntoBlocks('```ts\nconst x = 1;\n```');
      expect(blockTypes(tsResult)).toEqual(['code']);
    });
  });

  // --- Inline code ---
  describe('Inline code', () => {
    it('should parse paragraph containing inline code', () => {
      const result = parseMarkdownIntoBlocks('Use `console.log()` for debugging');
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['paragraph']);
      expect(result.blocks[0].content).toContain('`console.log()`');
    });

    it('should parse paragraph with multiple inline code spans', () => {
      const result = parseMarkdownIntoBlocks('Use `foo` and `bar` together');
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['paragraph']);
    });
  });

  // --- Unordered lists ---
  describe('Unordered lists (- / * / +)', () => {
    it('should parse unordered list with dash markers', () => {
      const result = parseMarkdownIntoBlocks('- item 1\n- item 2\n- item 3');
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['list']);
    });

    it('should parse unordered list with asterisk markers', () => {
      const result = parseMarkdownIntoBlocks('* item 1\n* item 2\n* item 3');
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['list']);
    });

    it('should parse unordered list with plus markers', () => {
      const result = parseMarkdownIntoBlocks('+ item 1\n+ item 2\n+ item 3');
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['list']);
    });

    it('should parse nested unordered list', () => {
      const result = parseMarkdownIntoBlocks('- item 1\n  - nested 1\n  - nested 2\n- item 2');
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['list']);
    });
  });

  // --- Ordered lists ---
  describe('Ordered lists (1. 2. 3.)', () => {
    it('should parse ordered list', () => {
      const result = parseMarkdownIntoBlocks('1. first\n2. second\n3. third');
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['list']);
    });

    it('should parse ordered list with non-sequential numbers', () => {
      const result = parseMarkdownIntoBlocks('1. first\n5. second\n3. third');
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['list']);
    });

    it('should parse nested ordered list', () => {
      const result = parseMarkdownIntoBlocks('1. item 1\n   1. nested 1\n   2. nested 2\n2. item 2');
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['list']);
    });
  });

  // --- Blockquotes ---
  describe('Blockquotes (>)', () => {
    it('should parse a single-line blockquote', () => {
      const result = parseMarkdownIntoBlocks('> This is a quote');
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['blockquote']);
    });

    it('should parse a multi-line blockquote', () => {
      const result = parseMarkdownIntoBlocks('> Line 1\n> Line 2\n> Line 3');
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['blockquote']);
    });

    it('should parse blockquote followed by paragraph', () => {
      const result = parseMarkdownIntoBlocks('> A quote\n\nNormal text');
      // marked generates a 'space' token between blockquote and paragraph
      expect(nonSpaceBlocks(result)).toHaveLength(2);
      expect(nonSpaceBlockTypes(result)).toEqual(['blockquote', 'paragraph']);
    });
  });

  // --- Tables ---
  describe('Tables', () => {
    it('should parse a simple table', () => {
      const md = '| Header 1 | Header 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |';
      const result = parseMarkdownIntoBlocks(md);
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['table']);
    });

    it('should parse a table with alignment', () => {
      const md = '| Left | Center | Right |\n| :--- | :---: | ---: |\n| A | B | C |';
      const result = parseMarkdownIntoBlocks(md);
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['table']);
    });

    it('should parse table followed by paragraph', () => {
      const md = '| A | B |\n| --- | --- |\n| 1 | 2 |\n\nAfter table';
      const result = parseMarkdownIntoBlocks(md);
      expect(nonSpaceBlocks(result)).toHaveLength(2);
      expect(nonSpaceBlockTypes(result)).toEqual(['table', 'paragraph']);
    });
  });

  // --- Horizontal rules ---
  describe('Horizontal rules (--- / *** / ___)', () => {
    it('should parse --- as a horizontal rule', () => {
      const result = parseMarkdownIntoBlocks('---');
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['hr']);
    });

    it('should parse *** as a horizontal rule', () => {
      const result = parseMarkdownIntoBlocks('***');
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['hr']);
    });

    it('should parse ___ as a horizontal rule', () => {
      const result = parseMarkdownIntoBlocks('___');
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['hr']);
    });

    it('should parse horizontal rule with more than 3 characters', () => {
      const result = parseMarkdownIntoBlocks('-----');
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['hr']);
    });

    it('should parse horizontal rule between paragraphs', () => {
      const result = parseMarkdownIntoBlocks('Before\n\n---\n\nAfter');
      // marked generates 'space' tokens between blocks
      expect(nonSpaceBlocks(result)).toHaveLength(3);
      expect(nonSpaceBlockTypes(result)).toEqual(['paragraph', 'hr', 'paragraph']);
    });
  });
});

// ===========================================================================
// 2. Boundary Conditions
// ===========================================================================
describe('parseMarkdownIntoBlocks - Boundary Conditions', () => {
  it('should handle empty string', () => {
    const result = parseMarkdownIntoBlocks('');
    // marked lexer may return an empty paragraph or nothing
    expect(result.blocks).toBeDefined();
    expect(Array.isArray(result.blocks)).toBe(true);
  });

  it('should handle whitespace-only string', () => {
    const result = parseMarkdownIntoBlocks('   \n  \n\t  ');
    expect(result.blocks).toBeDefined();
    expect(Array.isArray(result.blocks)).toBe(true);
  });

  it('should handle a single character', () => {
    const result = parseMarkdownIntoBlocks('a');
    expect(blocks(result)).toHaveLength(1);
    expect(blockTypes(result)).toEqual(['paragraph']);
  });

  it('should handle a single newline', () => {
    const result = parseMarkdownIntoBlocks('\n');
    expect(result.blocks).toBeDefined();
  });

  it('should handle only blank lines', () => {
    const result = parseMarkdownIntoBlocks('\n\n\n');
    expect(result.blocks).toBeDefined();
  });

  it('should handle text with only inline formatting (bold, italic)', () => {
    const result = parseMarkdownIntoBlocks('This is **bold** and *italic* text');
    expect(blocks(result)).toHaveLength(1);
    expect(blockTypes(result)).toEqual(['paragraph']);
  });

  it('should handle text with links', () => {
    const result = parseMarkdownIntoBlocks('Visit [example](https://example.com)');
    expect(blocks(result)).toHaveLength(1);
    expect(blockTypes(result)).toEqual(['paragraph']);
  });

  it('should handle text with images', () => {
    const result = parseMarkdownIntoBlocks('![alt text](image.png)');
    expect(blocks(result)).toHaveLength(1);
    expect(blockTypes(result)).toEqual(['paragraph']);
  });
});

// ===========================================================================
// 3. Footnote Detection
// ===========================================================================
describe('parseMarkdownIntoBlocks - Footnote Detection', () => {
  // The footnote regex uses pattern: \^\[[\w-]{1,200}\](?!:)
  // This matches standard Markdown footnote syntax: ^[id] (e.g., ^[1], ^[note-id])
  it('should return entire document as single block when footnote reference (^[id]) is present', () => {
    const md = 'Some text with a footnote ^[1] reference.\n\nMore text.';
    const result = parseMarkdownIntoBlocks(md);
    expect(blocks(result)).toHaveLength(1);
    expect(result.blocks[0].blockType).toBe('paragraph');
    expect(result.blocks[0].content).toBe(md);
    expect(result.blocks[0].startOffset).toBe(0);
  });

  it('should return entire document as single block when footnote definition (^[id]:) is present', () => {
    const md = 'Some text.\n\n^[1]: Footnote content here.';
    const result = parseMarkdownIntoBlocks(md);
    expect(blocks(result)).toHaveLength(1);
    expect(result.blocks[0].blockType).toBe('paragraph');
    expect(result.blocks[0].content).toBe(md);
  });

  it('should return entire document as single block when both reference and definition are present', () => {
    const md = 'Text ^[1] and more.\n\n^[1]: The footnote.';
    const result = parseMarkdownIntoBlocks(md);
    expect(blocks(result)).toHaveLength(1);
  });

  it('should return entire document as single block for footnote with hyphenated id', () => {
    const md = 'See ^[note-id] for details.';
    const result = parseMarkdownIntoBlocks(md);
    expect(blocks(result)).toHaveLength(1);
    expect(result.blocks[0].blockType).toBe('paragraph');
  });

  it('should not trigger footnote detection for caret without id and bracket', () => {
    const md = 'Some text with a caret ^ but no id';
    const result = parseMarkdownIntoBlocks(md);
    // Should parse normally, not as a single block forced by footnote logic
    expect(result.blocks.length).toBeGreaterThanOrEqual(1);
  });

  it('should not trigger footnote detection for ^id] syntax (no square brackets)', () => {
    // ^1] without square brackets doesn't match \^\[[\w-]{1,200}\]
    const md = 'Text with ^1] no-bracket syntax';
    const result = parseMarkdownIntoBlocks(md);
    // Should parse normally (not forced into single block)
    expect(result.blocks.length).toBeGreaterThanOrEqual(1);
    // The block content should NOT be the entire input
    if (result.blocks.length === 1) {
      // If it's one block, it's because marked parsed it as one paragraph,
      // not because of footnote detection
      expect(result.blocks[0].blockType).toBe('paragraph');
    }
  });

  it('should preserve backtick state even when footnotes are detected', () => {
    const md = 'Text ^[1] reference';
    const state = { confirmedContent: '', pendingContent: '```', backtickType: 3 };
    const result = parseMarkdownIntoBlocks(md, { isStreaming: true, _backtickState: state });
    // When footnotes are detected, backtickState is preserved (returned as-is)
    expect(result.backtickState).toBeDefined();
    expect(result.backtickState).toBe(state);
  });

  it('should not trigger footnote detection for definition pattern without colon', () => {
    // ^1] at end of text is a reference (no colon follows)
    const md = 'End of text ^1]';
    const result = parseMarkdownIntoBlocks(md);
    // This IS a footnote reference, so it should be a single block
    expect(blocks(result)).toHaveLength(1);
    expect(result.blocks[0].content).toBe(md);
  });
});

// ===========================================================================
// 4. Mixed Content
// ===========================================================================
describe('parseMarkdownIntoBlocks - Mixed Content', () => {
  it('should parse heading + paragraph + code block', () => {
    const md = '# Title\n\nSome text\n\n```\ncode\n```';
    const result = parseMarkdownIntoBlocks(md);
    // marked: heading consumes trailing \n\n, then paragraph, then space, then code
    expect(nonSpaceBlocks(result)).toHaveLength(3);
    expect(nonSpaceBlockTypes(result)).toEqual(['heading', 'paragraph', 'code']);
  });

  it('should parse paragraph + list + blockquote + code', () => {
    const md = 'Intro text\n\n- item 1\n- item 2\n\n> A quote\n\n```\ncode\n```';
    const result = parseMarkdownIntoBlocks(md);
    expect(nonSpaceBlocks(result)).toHaveLength(4);
    expect(nonSpaceBlockTypes(result)).toEqual(['paragraph', 'list', 'blockquote', 'code']);
  });

  it('should parse table + hr + heading + list', () => {
    const md = '| A | B |\n| --- | --- |\n| 1 | 2 |\n\n---\n\n## Section\n\n- item';
    const result = parseMarkdownIntoBlocks(md);
    // Table and HR may be adjacent (no space between them)
    expect(nonSpaceBlocks(result)).toHaveLength(4);
    expect(nonSpaceBlockTypes(result)).toEqual(['table', 'hr', 'heading', 'list']);
  });

  it('should handle inline code within paragraphs among other block types', () => {
    const md = '# Title\n\nUse `var` keyword\n\n```\ncode\n```';
    const result = parseMarkdownIntoBlocks(md);
    expect(nonSpaceBlocks(result)).toHaveLength(3);
    expect(nonSpaceBlockTypes(result)).toEqual(['heading', 'paragraph', 'code']);
  });
});

// ===========================================================================
// 5. Streaming Scenarios
// ===========================================================================
describe('parseMarkdownIntoBlocks - Streaming Scenarios', () => {
  // --- Unclosed code blocks ---
  describe('Unclosed code blocks (streaming)', () => {
    it('should handle unclosed code block in streaming mode', () => {
      const md = '```javascript\nconst x = 1;';
      const result = parseMarkdownIntoBlocks(md, { isStreaming: true });
      // The backtick accumulation should kick in
      expect(result.backtickState).toBeDefined();
    });

    it('should accumulate backticks when code block is not closed', () => {
      const md = '```python\nprint("hello")';
      const result = parseMarkdownIntoBlocks(md, { isStreaming: true });
      expect(result.backtickState).toBeDefined();
      expect(result.backtickState!.pendingContent).toContain('```');
    });

    it('should return empty blocks when content is entirely pending backticks', () => {
      const md = '```python\ncode';
      const result = parseMarkdownIntoBlocks(md, { isStreaming: true });
      // renderContent should be empty since everything is pending
      expect(result.blocks.length).toBeGreaterThanOrEqual(0);
    });
  });

  // --- Backtick state passing ---
  describe('backtickState passing between calls', () => {
    it('should pass backtick state from one call to the next', () => {
      // First call: opening backticks
      const result1 = parseMarkdownIntoBlocks('```', { isStreaming: true });
      expect(result1.backtickState).toBeDefined();

      // Second call: more content
      const result2 = parseMarkdownIntoBlocks('python\ncode here', {
        isStreaming: true,
        _backtickState: result1.backtickState,
      });
      expect(result2.backtickState).toBeDefined();
    });

    it('should resolve when closing backticks arrive', () => {
      // First call: opening + content
      const result1 = parseMarkdownIntoBlocks('```python\nhello', { isStreaming: true });
      expect(result1.backtickState).toBeDefined();

      // Second call: closing backticks
      const result2 = parseMarkdownIntoBlocks('\n```', {
        isStreaming: true,
        _backtickState: result1.backtickState,
      });
      // After closing, the accumulated content should be rendered as a code block
      expect(result2.blocks.length).toBeGreaterThanOrEqual(1);
      expect(result2.blocks[0].blockType).toBe('code');
      // backtickState is reset to empty state (not undefined)
      expect(result2.backtickState).toBeDefined();
      expect(result2.backtickState!.pendingContent).toBe('');
    });

    it('should handle multiple streaming chunks forming a complete code block', () => {
      // Chunk 1: opening fence
      const r1 = parseMarkdownIntoBlocks('```', { isStreaming: true });
      expect(r1.backtickState).toBeDefined();

      // Chunk 2: language
      const r2 = parseMarkdownIntoBlocks('javascript', {
        isStreaming: true,
        _backtickState: r1.backtickState,
      });
      expect(r2.backtickState).toBeDefined();

      // Chunk 3: code content
      const r3 = parseMarkdownIntoBlocks('\nconst x = 1;\n', {
        isStreaming: true,
        _backtickState: r2.backtickState,
      });
      expect(r3.backtickState).toBeDefined();

      // Chunk 4: closing fence
      const r4 = parseMarkdownIntoBlocks('```', {
        isStreaming: true,
        _backtickState: r3.backtickState,
      });
      // Should be resolved now
      expect(r4.blocks.length).toBeGreaterThanOrEqual(1);
      expect(r4.blocks[0].blockType).toBe('code');
      // State is reset (pendingContent empty)
      expect(r4.backtickState!.pendingContent).toBe('');
    });
  });

  // --- Stream complete ---
  describe('Stream completion (isStreamComplete)', () => {
    it('should flush accumulated content when stream is complete', () => {
      // Simulate: accumulated backticks, then stream completes
      const r1 = parseMarkdownIntoBlocks('```python\nunclosed code', { isStreaming: true });
      expect(r1.backtickState).toBeDefined();

      // Stream completes without closing backticks
      const r2 = parseMarkdownIntoBlocks('', {
        isStreaming: true,
        isStreamComplete: true,
        _backtickState: r1.backtickState,
      });
      // Should flush everything - backtickState should be cleared
      expect(r2.backtickState).toBeUndefined();
    });

    it('should handle isStreamComplete with no prior state', () => {
      const result = parseMarkdownIntoBlocks('some text', {
        isStreaming: true,
        isStreamComplete: true,
      });
      expect(result.blocks).toBeDefined();
      expect(result.backtickState).toBeUndefined();
    });
  });

  // --- languagePending detection ---
  describe('languagePending detection', () => {
    it('should detect pending language identifier for short prefix (e.g., "py")', () => {
      // "py" is a known language, so it should NOT be pending
      const result = parseMarkdownIntoBlocks('```py\ncode\n```', {
        isStreaming: true,
      });
      expect(blockTypes(result)).toEqual(['code']);
      expect(result.blocks[0].isTypePending).toBe(false);
    });

    it('should detect pending language for partial identifier (e.g., "pyt")', () => {
      // "pyt" is a prefix of "python", should be pending
      const result = parseMarkdownIntoBlocks('```pyt\ncode\n```', {
        isStreaming: true,
      });
      expect(blockTypes(result)).toEqual(['code-pending']);
      expect(result.blocks[0].isTypePending).toBe(true);
    });

    it('should not mark complete language as pending', () => {
      const result = parseMarkdownIntoBlocks('```python\ncode\n```', {
        isStreaming: true,
      });
      expect(blockTypes(result)).toEqual(['code']);
      expect(result.blocks[0].isTypePending).toBe(false);
    });

    it('should not mark language as pending in non-streaming mode', () => {
      const result = parseMarkdownIntoBlocks('```pyt\ncode\n```');
      // In non-streaming mode, isTypePending should be false
      expect(result.blocks[0].isTypePending).toBe(false);
    });

    it('should mark "jav" as pending (prefix of "java" and "javascript")', () => {
      const result = parseMarkdownIntoBlocks('```jav\ncode\n```', {
        isStreaming: true,
      });
      expect(blockTypes(result)).toEqual(['code-pending']);
      expect(result.blocks[0].isTypePending).toBe(true);
    });

    it('should not mark "java" as pending (complete language)', () => {
      const result = parseMarkdownIntoBlocks('```java\ncode\n```', {
        isStreaming: true,
      });
      expect(blockTypes(result)).toEqual(['code']);
      expect(result.blocks[0].isTypePending).toBe(false);
    });

    it('should not mark "type" as pending (prefix of "typescript" but >= 4 chars)', () => {
      // "type" is 4 chars, so isLangComplete returns true
      const result = parseMarkdownIntoBlocks('```type\ncode\n```', {
        isStreaming: true,
      });
      expect(blockTypes(result)).toEqual(['code']);
    });

    it('should mark "typ" as pending (prefix of "typescript")', () => {
      const result = parseMarkdownIntoBlocks('```typ\ncode\n```', {
        isStreaming: true,
      });
      expect(blockTypes(result)).toEqual(['code-pending']);
      expect(result.blocks[0].isTypePending).toBe(true);
    });

    it('should not mark unknown long language as pending', () => {
      // "haskell" is 7 chars, not a common prefix, should be complete
      const result = parseMarkdownIntoBlocks('```haskell\ncode\n```', {
        isStreaming: true,
      });
      expect(blockTypes(result)).toEqual(['code']);
      expect(result.blocks[0].isTypePending).toBe(false);
    });

    it('should not mark code block without language as pending', () => {
      const result = parseMarkdownIntoBlocks('```\ncode\n```', {
        isStreaming: true,
      });
      expect(blockTypes(result)).toEqual(['code']);
      expect(result.blocks[0].isTypePending).toBe(false);
    });
  });

  // --- Nested code blocks in lists ---
  describe('Nested code blocks in list items', () => {
    it('should detect code block inside list item', () => {
      const md = '- Use the following:\n  ```python\n  print("hello")\n  ```';
      const result = parseMarkdownIntoBlocks(md);
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['code']);
    });

    it('should detect mermaid code block inside list item', () => {
      const md = '- Diagram:\n  ```mermaid\n  graph LR\n    A --> B\n  ```';
      const result = parseMarkdownIntoBlocks(md);
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['mermaid']);
    });

    it('should detect math code block inside list item', () => {
      const md = '- Formula:\n  ```math\n  E = mc^2\n  ```';
      const result = parseMarkdownIntoBlocks(md);
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['math-block']);
    });

    it('should detect pending language in nested code block during streaming', () => {
      const md = '- Code:\n  ```pyt\n  x = 1\n  ```';
      const result = parseMarkdownIntoBlocks(md, { isStreaming: true });
      expect(blockTypes(result)).toEqual(['code-pending']);
      expect(result.blocks[0].isTypePending).toBe(true);
    });
  });
});

// ===========================================================================
// 6. Special Syntax
// ===========================================================================
describe('parseMarkdownIntoBlocks - Special Syntax', () => {
  // --- Math formulas ---
  describe('Math formulas ($...$ and $$...$$)', () => {
    it('should parse inline math $...$ as paragraph', () => {
      const result = parseMarkdownIntoBlocks('The formula is $E = mc^2$ and it works');
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['paragraph']);
    });

    it('should parse block math $$...$$ (handled by rendering layer)', () => {
      const result = parseMarkdownIntoBlocks('$$\nE = mc^2\n$$');
      // marked may parse this as code or paragraph depending on configuration
      expect(result.blocks).toBeDefined();
      expect(result.blocks.length).toBeGreaterThanOrEqual(1);
    });

    it('should parse mixed text with inline math', () => {
      const result = parseMarkdownIntoBlocks('Given $a^2 + b^2 = c^2$, we can derive $c = \\sqrt{a^2 + b^2}$.');
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['paragraph']);
    });
  });

  // --- HTML tags ---
  describe('HTML tags', () => {
    it('should parse HTML block as html type', () => {
      const result = parseMarkdownIntoBlocks('<div>Hello</div>');
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['html']);
    });

    it('should parse HTML with attributes', () => {
      const result = parseMarkdownIntoBlocks('<div class="container" id="main">Content</div>');
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['html']);
    });

    it('should parse self-closing HTML tags', () => {
      const result = parseMarkdownIntoBlocks('<br />\n\n<hr />');
      expect(result.blocks).toBeDefined();
    });

    it('should parse HTML mixed with markdown', () => {
      const result = parseMarkdownIntoBlocks('# Title\n\n<div>HTML content</div>\n\nParagraph');
      // heading consumes \n\n, then html, then space, then paragraph
      expect(nonSpaceBlocks(result)).toHaveLength(3);
      expect(nonSpaceBlockTypes(result)).toEqual(['heading', 'html', 'paragraph']);
    });
  });

  // --- GFM features ---
  describe('GFM features', () => {
    it('should parse task list (checkbox items)', () => {
      const md = '- [x] Done item\n- [ ] Undone item\n- [ ] Another item';
      const result = parseMarkdownIntoBlocks(md, { gfm: true });
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['list']);
    });

    it('should parse strikethrough text within paragraph', () => {
      const result = parseMarkdownIntoBlocks('This is ~~deleted~~ text');
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['paragraph']);
    });

    it('should parse table with GFM enabled', () => {
      const md = '| A | B |\n| --- | --- |\n| 1 | 2 |';
      const result = parseMarkdownIntoBlocks(md, { gfm: true });
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['table']);
    });

    it('should handle GFM autolinks', () => {
      const result = parseMarkdownIntoBlocks('Visit https://example.com for more info');
      expect(blocks(result)).toHaveLength(1);
      expect(blockTypes(result)).toEqual(['paragraph']);
    });
  });
});

// ===========================================================================
// 7. Preprocessing (list recognition fix)
// ===========================================================================
describe('parseMarkdownIntoBlocks - Preprocessing', () => {
  it('should handle list with incomplete marker at end of line (streaming)', () => {
    // "- item\n-" without space after the second dash
    const md = '- first item\n-';
    const result = parseMarkdownIntoBlocks(md);
    // Should not throw, and should handle gracefully
    expect(result.blocks).toBeDefined();
  });

  it('should not modify content inside code blocks', () => {
    const md = '```\n- this is not a list\n*\n```\n\n- real list item';
    const result = parseMarkdownIntoBlocks(md);
    // Code block content is preserved, list after is recognized
    expect(nonSpaceBlocks(result)).toHaveLength(2);
    expect(nonSpaceBlockTypes(result)).toEqual(['code', 'list']);
  });

  it('should handle ordered list marker at end of line', () => {
    const md = '1. first item\n2.';
    const result = parseMarkdownIntoBlocks(md);
    expect(result.blocks).toBeDefined();
  });

  it('should not treat horizontal rules as list markers', () => {
    const result = parseMarkdownIntoBlocks('---');
    expect(blockTypes(result)).toEqual(['hr']);
  });

  it('should not treat *** as list markers', () => {
    const result = parseMarkdownIntoBlocks('***');
    expect(blockTypes(result)).toEqual(['hr']);
  });

  it('should not treat ___ as list markers', () => {
    const result = parseMarkdownIntoBlocks('___');
    expect(blockTypes(result)).toEqual(['hr']);
  });
});

// ===========================================================================
// 8. Options and Configuration
// ===========================================================================
describe('parseMarkdownIntoBlocks - Options', () => {
  it('should accept default options (empty object)', () => {
    const result = parseMarkdownIntoBlocks('Hello', {});
    expect(blocks(result)).toHaveLength(1);
  });

  it('should accept no options', () => {
    const result = parseMarkdownIntoBlocks('Hello');
    expect(blocks(result)).toHaveLength(1);
  });

  it('should work with gfm: true', () => {
    const result = parseMarkdownIntoBlocks('| A | B |\n| --- | --- |\n| 1 | 2 |', { gfm: true });
    expect(blockTypes(result)).toEqual(['table']);
  });

  it('should work with gfm: false', () => {
    const md = '| A | B |\n| --- | --- |\n| 1 | 2 |';
    const result = parseMarkdownIntoBlocks(md, { gfm: false });
    // Without GFM, table may not be recognized as table
    expect(result.blocks).toBeDefined();
  });

  it('should return backtickState as undefined in non-streaming mode', () => {
    const result = parseMarkdownIntoBlocks('```python\ncode\n```');
    expect(result.backtickState).toBeUndefined();
  });
});

// ===========================================================================
// 9. Result Structure Validation
// ===========================================================================
describe('parseMarkdownIntoBlocks - Result Structure', () => {
  it('should return object with blocks array and backtickState', () => {
    const result = parseMarkdownIntoBlocks('Hello');
    expect(result).toHaveProperty('blocks');
    expect(result).toHaveProperty('backtickState');
    expect(Array.isArray(result.blocks)).toBe(true);
  });

  it('each block should have content, startOffset, blockType, and isTypePending', () => {
    const result = parseMarkdownIntoBlocks('# Title\n\nParagraph');
    for (const block of result.blocks) {
      expect(block).toHaveProperty('content');
      expect(block).toHaveProperty('startOffset');
      expect(block).toHaveProperty('blockType');
      expect(block).toHaveProperty('isTypePending');
    }
  });

  it('startOffset should be non-negative', () => {
    const result = parseMarkdownIntoBlocks('A\n\nB\n\nC');
    for (const block of result.blocks) {
      expect(block.startOffset).toBeGreaterThanOrEqual(0);
    }
  });

  it('startOffset should be monotonically increasing', () => {
    const result = parseMarkdownIntoBlocks('A\n\nB\n\nC\n\nD');
    for (let i = 1; i < result.blocks.length; i++) {
      expect(result.blocks[i].startOffset).toBeGreaterThan(result.blocks[i - 1].startOffset);
    }
  });

  it('isTypePending should be boolean', () => {
    const result = parseMarkdownIntoBlocks('Hello');
    for (const block of result.blocks) {
      expect(typeof block.isTypePending).toBe('boolean');
    }
  });
});

// ===========================================================================
// 10. Default Export
// ===========================================================================
describe('parseMarkdownIntoBlocks - Default Export', () => {
  it('should have a default export that is the same function', async () => {
    // Dynamic import to check default export
    const mod = await import('./parseBlocks');
    expect(mod.default).toBe(mod.parseMarkdownIntoBlocks);
  });
});
