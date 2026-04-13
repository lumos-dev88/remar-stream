# Remar-stream | React Markdown Component for Streaming Content

[English](./README.md) | [中文](./README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/remar.svg?style=flat-square)](https://www.npmjs.com/package/remar-stream)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

A React Markdown renderer purpose-built for AI chat interfaces. Supports SSE streaming, KaTeX math formulas, and Mermaid diagrams. Powered by React 18/19 concurrent features (`useDeferredValue`, `useTransition`) for smooth, flicker-free rendering.

## Features

- **Single-Tree Architecture** — Streaming and static modes share the same block rendering pipeline. Blocks naturally settle when streaming ends.
- **Character-Level Fade-In** — `rehypeStreamAnimated` wraps text characters with `<span class="stream-char">` and CSS `animation-delay` for sequential fade-in.
- **Block-Level Timeline** — `useBlockAnimation` manages block states (queued → animating → revealed) driven by RAF timeline.
- **Smooth Streaming** — `useSmoothStreamContent` dynamically adjusts character output rate (CPS) and auto-closes incomplete Markdown syntax.
- **React Concurrent** — `useDeferredValue` lowers streaming update priority; `useTransition` batches block state updates.
- **Math Formulas** — KaTeX rendering for inline (`$...$`) and block (`$$...$$`) with LRU cache.
- **Mermaid Diagrams** — Lazy-loaded Mermaid module (\~500KB saved from main bundle), built-in zoom/download/fullscreen/source toolbar, SVG cache + debounce.
- **Code Highlighting** — PrismJS with 14 built-in languages, language label and copy button on code blocks.
- **Plugin System** — Built-in `PluginRegistry` for extending Markdown element rendering with custom components.
- **TypeScript** — Full type definitions included.

## Installation

```bash
npm install remar
# or
yarn add remar
# or
pnpm add remar
```

**Peer dependencies** (must be installed in your project):

```bash
npm install react@^18.0.0 react-dom@^18.0.0
# or React 19
npm install react@^19.0.0 react-dom@^19.0.0
```

## Quick Start

### Static Content

```tsx
import { RemarMarkdown } from 'remar-stream';

function App() {
  return <RemarMarkdown content="# Hello, remar!" />;
}
```

### SSE Streaming

```tsx
import { useState } from 'react';
import { RemarMarkdown } from 'remar-stream';

function ChatMessage() {
  const [content, setContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  const sendMessage = async (message: string) => {
    setIsStreaming(true);
    setContent('');

    const response = await fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message }),
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      setContent(prev => prev + decoder.decode(value));
    }

    setIsStreaming(false);
  };

  return <RemarMarkdown content={content} isStreaming={isStreaming} />;
}
```

### No Animation Mode

Skip all character and block animations for maximum performance:

```tsx
<RemarMarkdown
  content={content}
  isStreaming={isStreaming}
  disableAnimation
/>
```

### Dark Theme

Switch to dark mode via the `theme` prop. The component sets `data-theme="dark"` automatically:

```tsx
<RemarMarkdown content={content} theme="dark" />
```

### Custom Mermaid Rendering

Customize Mermaid behavior through the plugin system:

```tsx
import { getRegistry, mermaidPlugin } from 'remar-stream';

const registry = getRegistry();
await registry.register(mermaidPlugin({ theme: 'dark', cacheMaxSize: 100 }));
```

> For the full plugin system guide, see [docs/plugin-system.en.md](./docs/plugin-system.en.md)

## API

### `<RemarMarkdown>`

| Prop                 | Type                             | Default      | Description                                    |
| -------------------- | -------------------------------- | ------------ | ---------------------------------------------- |
| `content`            | `string`                         | **required** | Markdown content to render                     |
| `isStreaming`        | `boolean`                        | `false`      | Enable streaming optimization mode             |
| `className`          | `string`                         | —            | Additional CSS class for the container         |
| `theme`              | `'light' \| 'dark'`              | `'light'`    | Theme mode, applied via `data-theme` attribute |
| `disableAnimation`   | `boolean`                        | `false`      | Skip all animations for performance            |
| `viewportBlockRange` | `{ start: number; end: number }` | —            | Viewport block range for lazy rendering        |

## Supported Markdown Syntax

Based on `react-markdown` + `remark-gfm`. Supports standard CommonMark and GFM extensions including headings, bold, italic, lists, links, images, code blocks, blockquotes, horizontal rules, tables, and task lists.

**Math Formulas (KaTeX)**

```
Inline: $E = mc^2$

Block:
$$
\sum_{i=1}^{n} x_i = x_1 + x_2 + \cdots + x_n
$$
```

**Mermaid Diagrams**

````markdown
```mermaid
graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[OK]
    B -->|No| D[End]
```
````

**Code Highlighting (PrismJS)**

14 built-in languages: JavaScript, TypeScript, JSX, TSX, Python, Go, Bash, JSON, CSS, SQL, YAML, Markdown, Rust, Java.

## Styling

Remar uses a three-layer Design Token system (Seed → Map → Dark) with CSS variables for theming. Dark mode is supported out of the box.

> For the full theming guide, see [docs/theme.en.md](./docs/theme.en.md)

## Browser Support

- Chrome >= 80
- Firefox >= 75
- Safari >= 13.1
- Edge >= 80

## FAQ

**How does streaming animation work?**

Remar has two animation layers:

1. **Character-level**: `rehypeStreamAnimated` wraps text characters in block elements (p, h1-h6, etc.) with `<span class="stream-char">`, using CSS `animation-delay` for sequential fade-in. Code blocks, tables, and KaTeX elements are excluded.
2. **Block-level**: `useBlockAnimation` manages a `queued → animating → revealed` state machine. All blocks start in parallel, driven by RAF timeline.

`disableAnimation` skips all animations — blocks render directly in settled state.

**Does it work with Next.js?**

Yes. The build output includes a `"use client"` directive. Just import directly in App Router:

```tsx
import { RemarMarkdown } from 'remar-stream';
```

**Can I use it without streaming?**

Yes. Omit `isStreaming` or set it to `false` — Remar works as a standard static Markdown renderer with no animation overhead.

**Do I need to import CSS manually?**

Usually no. `dist/index.js` includes a CSS static reference that bundlers (Vite, Webpack, Next.js) handle automatically:

```tsx
import { RemarMarkdown } from 'remar-stream';
```

If styles don't load (non-standard bundler), import manually:

```tsx
import 'remar-stream/styles.css';
```

**Does it depend on any UI library?**

No. Peer dependencies are only `react` (^18.0.0 || ^19.0.0) and `react-dom`. Remar coexists with any UI framework (Ant Design, MUI, shadcn/ui, etc.). Styles use a `--remar-` prefixed CSS variable system with no global pollution.

**How to extend custom rendering?**

Use the plugin system to register custom component match rules, remark plugins, and language mappings. See [Plugin System Docs](./docs/plugin-system.en.md).

## Contributing

Contributions are welcome! Please submit an Issue or Pull Request on [GitHub](https://github.com/lumos-dev88/remar-stream).

## License

MIT © [remar](https://github.com/lumos-dev88/remar-stream)
