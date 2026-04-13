# Remar Plugin System

## Overview

Remar's rendering behavior is fully driven by plugins. The built-in features (math, mermaid, code highlighting, table wrapper) are all implemented as plugins registered through the `PluginRegistry`. You can customize rendering by registering, unregistering, or replacing plugins.

## Architecture

```
PluginRegistry (singleton)
  ├── corePlugin      → remarkGfm, remarkNormalizeList, TableWrapper, PreComponent
  ├── mathPlugin      → remarkMath, MathInline, MathBlock, 6 componentMatchRules
  ├── mermaidPlugin   → MermaidRenderer, 2 componentMatchRules, 1 languageMapping
  └── codeblockPlugin → CodeBlock, CodeBlockHeader, 2 componentMatchRules
```

When Remar renders, it collects from all registered plugins:
- **remarkPlugins** — markdown parsing extensions (e.g., GFM tables, math syntax)
- **componentMatchRules** — declarative rules for intercepting HTML elements
- **languageMappings** — code block language → block type mappings
- **rehypePlugins** — HTML transform plugins
- **components** — direct React component overrides

## Quick Start

### Using Built-in Plugins (Default)

No configuration needed. `getRegistry()` automatically registers all built-in plugins on first call:

```tsx
import { RemarMarkdown } from 'remar-stream';

// Built-in plugins are pre-registered
<RemarMarkdown content={markdown} isStreaming={false} />
```

### Customizing a Built-in Plugin

Pass options to override default behavior:

```tsx
import { getRegistry, mermaidPlugin, mathPlugin, codeblockPlugin } from 'remar-stream';

// Get the singleton registry
const registry = getRegistry();

// Register with custom options (overwrites defaults)
await registry.register(mermaidPlugin({ theme: 'dark' }));
await registry.register(codeblockPlugin({ copy: true, showLanguage: true }));
await registry.register(mathPlugin({ enableCache: true }));
```

### Creating a Custom Plugin

#### Using `createPlugin` (Recommended)

```tsx
import { createPlugin, getRegistry, type ComponentMatchRule } from 'remar-stream';
import React from 'react';

// Custom component for <think /> blocks
const ThinkBlock: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="think-block" style={{ borderLeft: '3px solid #6366f1', paddingLeft: 12 }}>
    {children}
  </div>
);

const thinkPlugin = createPlugin({
  name: 'think-block',
  version: '1.0.0',
  displayName: 'Think Block Renderer',

  componentMatchRules: [
    {
      element: 'div',
      match: { className: 'think' },
      component: ThinkBlock,
      priority: 10,
    },
  ],
});

// Register
const registry = getRegistry();
await registry.register(thinkPlugin);
```

#### Using `definePlugin` (Factory Pattern)

For plugins that accept user options:

```tsx
import { definePlugin, getRegistry, type ComponentMatchRule } from 'remar-stream';
import type { RemarPlugin } from 'remar-stream';
import React from 'react';

interface HighlightPluginOptions {
  color?: string;
  enabled?: boolean;
}

function highlightPlugin(options: HighlightPluginOptions = {}): RemarPlugin {
  const { color = '#fbbf24', enabled = true } = options;

  return definePlugin({
    name: 'highlight-block',
    version: '1.0.0',

    componentMatchRules: enabled
      ? [
          {
            element: 'span',
            match: { className: /highlight-/ },
            component: ({ children, ...props }) =>
              React.createElement('mark', { style: { background: color }, ...props }, children),
            priority: 10,
          },
        ]
      : [],
  });
}

// Usage
await getRegistry().register(highlightPlugin({ color: '#22d3ee' }));
```

## API Reference

### `getRegistry(config?)`

Returns the singleton `PluginRegistry` instance. Built-in plugins are auto-registered on first call.

```tsx
const registry = getRegistry({ debug: true });
```

### `resetRegistry()`

Resets the registry to a clean state (removes all plugins including built-ins). Useful for testing.

```tsx
import { resetRegistry, getRegistry } from 'remar-stream';

resetRegistry();
const freshRegistry = getRegistry();
```

### `PluginRegistry` Class

| Method | Returns | Description |
|--------|---------|-------------|
| `register(plugin, options?)` | `Promise<void>` | Register a plugin. Options: `{ overwrite?: boolean, priority?: number }` |
| `unregister(name)` | `Promise<boolean>` | Unregister a plugin by name. Returns `false` if not found |
| `get<T>(name)` | `T \| undefined` | Get a registered plugin instance |
| `has(name)` | `boolean` | Check if a plugin is registered |
| `version` | `number` | Version counter, increments on register/unregister |
| `getPluginNames()` | `string[]` | List all registered plugin names |
| `getAllPlugins()` | `PluginMetadata[]` | Get all plugin metadata |
| `getRemarkPlugins()` | `Pluggable[]` | Collect all remark plugins from registered plugins |
| `getComponentMatchRules()` | `ComponentMatchRule[]` | Collect all component match rules (sorted by priority desc) |
| `getLanguageMappings()` | `LanguageMapping[]` | Collect all language mappings |
| `getRehypePlugins()` | `Pluggable[]` | Collect all rehype plugins |
| `getHandlers()` | `Array<{ name, priority, process }>` | Collect all handlers (sorted by priority desc) |

## Component Match Rules

`componentMatchRules` is the primary mechanism for customizing element rendering. When ReactMarkdown encounters an HTML element, Remar checks registered rules in priority order (higher first).

### Rule Structure

```tsx
interface ComponentMatchRule {
  element: string;              // HTML element to intercept: 'code' | 'span' | 'div' | 'table' | 'pre'
  match: {
    className?: string | RegExp; // Match by className
    language?: string;           // Match code language (from "language-xxx" class)
    blockType?: string;          // Match data-block-type attribute
    inline?: boolean;            // Match inline vs block state
  };
  component: ComponentType<any>; // React component to render
  priority?: number;             // Higher = checked first (default: 0)
  transformProps?: (props, ctx) => props; // Transform props before passing to component
}
```

### Match Behavior by Element

| Element | Match Fields | Fallback |
|---------|-------------|----------|
| `code` | `className`, `language`, `blockType` | Default `<code>` (inline code stays as-is) |
| `span` | `className` | Default `<span>` |
| `div` | `className` | Default `<div>` |
| `table` | `className` (any match field) | Default `<table>` |
| `pre` | `className` (any match field) | Default `<pre>` |

### Special: Code Element

The `code` element has additional logic:
- `inline=true` → always renders as plain `<code>`, rules are skipped
- `data-type-pending` or `blockType=code-pending` → renders as plain `<code>` (waiting for type detection)
- Otherwise → checks rules by priority

### Example: Custom Code Block Renderer

```tsx
import { createPlugin, getRegistry } from 'remar-stream';
import React from 'react';

const CustomCodeBlock: React.FC<{ children: string; className?: string }> = (props) => (
  <div className="custom-code">
    <pre><code className={props.className}>{props.children}</code></pre>
  </div>
);

const customCodePlugin = createPlugin({
  name: 'custom-code',
  version: '1.0.0',

  componentMatchRules: [
    {
      element: 'code',
      match: { blockType: 'code' },  // Match code blocks
      component: CustomCodeBlock,
      priority: 10,                   // Higher than built-in codeblock plugin (5)
      transformProps: (props) => ({
        ...props,
        children: String(props.children || '').replace(/\n$/, ''),
      }),
    },
  ],
});

await getRegistry().register(customCodePlugin);
```

## Language Mappings

`languageMappings` tells Remar how to classify code blocks by their language identifier. This drives the `blockType` attribute injected into `<code>` elements during streaming.

```tsx
interface LanguageMapping {
  language: string;   // Source language (e.g., 'mermaid')
  blockType: string;  // Target block type (e.g., 'mermaid')
}
```

### Built-in Mappings

| Language | Block Type | Plugin |
|----------|-----------|--------|
| `mermaid` | `mermaid` | mermaidPlugin |
| `math` | `math-block` | mathPlugin |

### Custom Mapping Example

```tsx
import { createPlugin, getRegistry } from 'remar-stream';

const plantumlPlugin = createPlugin({
  name: 'plantuml',
  version: '1.0.0',

  languageMappings: [
    { language: 'plantuml', blockType: 'plantuml' },
    { language: 'puml', blockType: 'plantuml' },
  ],

  componentMatchRules: [
    {
      element: 'code',
      match: { blockType: 'plantuml' },
      component: PlantUMLRenderer,
      priority: 10,
    },
  ],
});

await getRegistry().register(plantumlPlugin);
```

## Plugin Lifecycle

```
register() → onInit() → [plugin active]
                              ↓
                    beforeParse() → remarkPlugins → beforeRender() → rehypePlugins → render
                              ↓
                    unregister() → onDestroy() → [plugin removed]
```

| Lifecycle Hook | When | Use Case |
|----------------|------|----------|
| `onInit(ctx)` | Plugin registered | Initialize resources, validate options |
| `beforeParse(content, ctx)` | Before markdown parsing | Pre-process raw markdown |
| `beforeRender(content, ctx)` | After parsing, before rendering | Transform HTML |
| `onDestroy(ctx)` | Plugin unregistered | Cleanup resources, remove listeners |

## Built-in Plugins Reference

### `mathPlugin(options?)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enableCache` | `boolean` | `true` | Cache rendered formulas |
| `trustMath` | `boolean` | `false` | Allow `\href{}` and `\class{}` in LaTeX |

Registers: remark-math, 6 componentMatchRules (math-inline, math-display, language-math, math-block), MathInline, MathBlock components.

### `mermaidPlugin(options?)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `theme` | `'dark' \| 'light' \| 'default' \| 'forest' \| 'neutral'` | `'default'` | Mermaid theme |
| `cache` | `boolean` | `true` | Cache rendered SVGs |
| `cacheMaxSize` | `number` | `50` | Max cached diagrams |

Registers: 2 componentMatchRules (blockType=mermaid, className=language-mermaid), 1 languageMapping (mermaid→mermaid), MermaidRenderer component.

### `codeblockPlugin(options?)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `copy` | `boolean` | `true` | Show copy button |
| `showLanguage` | `boolean` | `true` | Show language label |

Registers: 2 componentMatchRules (blockType=code, className=/^language-/), CodeBlock, CodeBlockHeader components.

### `corePlugin`

No options. Registers: remark-gfm, remark-normalize-list, TableWrapper, PreComponent. Always registered first.
