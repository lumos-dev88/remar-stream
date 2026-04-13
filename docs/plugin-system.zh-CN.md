# Remar 插件系统

## 概述

Remar 的渲染行为完全由插件驱动。内置功能（数学公式、Mermaid 图表、代码高亮、表格包装）全部通过 `PluginRegistry` 注册为插件实现。你可以通过注册、注销或替换插件来自定义渲染行为。

## 架构

```
PluginRegistry（单例）
  ├── corePlugin      → remarkGfm, remarkNormalizeList, TableWrapper, PreComponent
  ├── mathPlugin      → remarkMath, MathInline, MathBlock, 6 条 componentMatchRules
  ├── mermaidPlugin   → MermaidRenderer, 2 条 componentMatchRules, 1 条 languageMapping
  └── codeblockPlugin → CodeBlock, CodeBlockHeader, 2 条 componentMatchRules
```

Remar 渲染时，从所有已注册的插件中收集：
- **remarkPlugins** — Markdown 解析扩展（如 GFM 表格、数学语法）
- **componentMatchRules** — 声明式 HTML 元素拦截规则
- **languageMappings** — 代码块语言 → 块类型映射
- **rehypePlugins** — HTML 转换插件
- **components** — 直接的 React 组件覆盖

## 快速上手

### 使用内置插件（默认）

无需配置。`getRegistry()` 首次调用时自动注册所有内置插件：

```tsx
import { RemarMarkdown } from 'remar-stream';

// 内置插件已预注册
<RemarMarkdown content={markdown} isStreaming={false} />
```

### 自定义内置插件

传入选项覆盖默认行为：

```tsx
import { getRegistry, mermaidPlugin, mathPlugin, codeblockPlugin } from 'remar-stream';

// 获取单例注册中心
const registry = getRegistry();

// 使用自定义选项注册（覆盖默认值）
await registry.register(mermaidPlugin({ theme: 'dark' }));
await registry.register(codeblockPlugin({ copy: true, showLanguage: true }));
await registry.register(mathPlugin({ enableCache: true }));
```

### 创建自定义插件

#### 使用 `createPlugin`（推荐）

```tsx
import { createPlugin, getRegistry, type ComponentMatchRule } from 'remar-stream';
import React from 'react';

// 自定义 <think /> 块组件
const ThinkBlock: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="think-block" style={{ borderLeft: '3px solid #6366f1', paddingLeft: 12 }}>
    {children}
  </div>
);

const thinkPlugin = createPlugin({
  name: 'think-block',
  version: '1.0.0',
  displayName: 'Think Block 渲染器',

  componentMatchRules: [
    {
      element: 'div',
      match: { className: 'think' },
      component: ThinkBlock,
      priority: 10,
    },
  ],
});

// 注册
const registry = getRegistry();
await registry.register(thinkPlugin);
```

#### 使用 `definePlugin`（工厂模式）

适用于接受用户选项的插件：

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

// 使用
await getRegistry().register(highlightPlugin({ color: '#22d3ee' }));
```

## API 参考

### `getRegistry(config?)`

返回单例 `PluginRegistry` 实例。首次调用时自动注册内置插件。

```tsx
const registry = getRegistry({ debug: true });
```

### `resetRegistry()`

重置注册中心到初始状态（移除所有插件，包括内置插件）。适用于测试场景。

```tsx
import { resetRegistry, getRegistry } from 'remar-stream';

resetRegistry();
const freshRegistry = getRegistry();
```

### `PluginRegistry` 类

| 方法 | 返回值 | 说明 |
|------|--------|------|
| `register(plugin, options?)` | `Promise<void>` | 注册插件。选项：`{ overwrite?: boolean, priority?: number }` |
| `unregister(name)` | `Promise<boolean>` | 按名称注销插件。未找到返回 `false` |
| `get<T>(name)` | `T \| undefined` | 获取已注册的插件实例 |
| `has(name)` | `boolean` | 检查插件是否已注册 |
| `version` | `number` | 版本计数器，注册/注销时递增 |
| `getPluginNames()` | `string[]` | 列出所有已注册的插件名称 |
| `getAllPlugins()` | `PluginMetadata[]` | 获取所有插件元数据 |
| `getRemarkPlugins()` | `Pluggable[]` | 收集所有已注册插件的 remark 插件 |
| `getComponentMatchRules()` | `ComponentMatchRule[]` | 收集所有组件匹配规则（按优先级降序） |
| `getLanguageMappings()` | `LanguageMapping[]` | 收集所有语言映射 |
| `getRehypePlugins()` | `Pluggable[]` | 收集所有 rehype 插件 |
| `getHandlers()` | `Array<{ name, priority, process }>` | 收集所有处理器（按优先级降序） |

## 组件匹配规则

`componentMatchRules` 是自定义元素渲染的主要机制。当 ReactMarkdown 遇到 HTML 元素时，Remar 按优先级顺序（高优先级优先）检查已注册的规则。

### 规则结构

```tsx
interface ComponentMatchRule {
  element: string;              // 要拦截的 HTML 元素：'code' | 'span' | 'div' | 'table' | 'pre'
  match: {
    className?: string | RegExp; // 按 className 匹配
    language?: string;           // 按代码语言匹配（来自 "language-xxx" class）
    blockType?: string;          // 按 data-block-type 属性匹配
    inline?: boolean;            // 按行内/块级状态匹配
  };
  component: ComponentType<any>; // 要渲染的 React 组件
  priority?: number;             // 越高越优先检查（默认：0）
  transformProps?: (props, ctx) => props; // 传递给组件前转换 props
}
```

### 各元素匹配行为

| 元素 | 匹配字段 | 回退 |
|------|---------|------|
| `code` | `className`, `language`, `blockType` | 默认 `<code>`（行内代码保持原样） |
| `span` | `className` | 默认 `<span>` |
| `div` | `className` | 默认 `<div>` |
| `table` | `className`（任意匹配字段） | 默认 `<table>` |
| `pre` | `className`（任意匹配字段） | 默认 `<pre>` |

### 特殊：Code 元素

`code` 元素有额外的逻辑：
- `inline=true` → 始终渲染为纯 `<code>`，跳过规则
- `data-type-pending` 或 `blockType=code-pending` → 渲染为纯 `<code>`（等待类型检测）
- 否则 → 按优先级检查规则

### 示例：自定义代码块渲染器

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
      match: { blockType: 'code' },  // 匹配代码块
      component: CustomCodeBlock,
      priority: 10,                   // 高于内置 codeblock 插件（5）
      transformProps: (props) => ({
        ...props,
        children: String(props.children || '').replace(/\n$/, ''),
      }),
    },
  ],
});

await getRegistry().register(customCodePlugin);
```

## 语言映射

`languageMappings` 告诉 Remar 如何按语言标识符分类代码块。这驱动了流式渲染时注入到 `<code>` 元素的 `blockType` 属性。

```tsx
interface LanguageMapping {
  language: string;   // 源语言（如 'mermaid'）
  blockType: string;  // 目标块类型（如 'mermaid'）
}
```

### 内置映射

| 语言 | 块类型 | 插件 |
|------|--------|------|
| `mermaid` | `mermaid` | mermaidPlugin |
| `math` | `math-block` | mathPlugin |

### 自定义映射示例

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

## 插件生命周期

```
register() → onInit() → [插件活跃]
                              ↓
                    beforeParse() → remarkPlugins → beforeRender() → rehypePlugins → 渲染
                              ↓
                    unregister() → onDestroy() → [插件已移除]
```

| 生命周期钩子 | 触发时机 | 用途 |
|-------------|---------|------|
| `onInit(ctx)` | 插件注册时 | 初始化资源、验证选项 |
| `beforeParse(content, ctx)` | Markdown 解析前 | 预处理原始 Markdown |
| `beforeRender(content, ctx)` | 解析后、渲染前 | 转换 HTML |
| `onDestroy(ctx)` | 插件注销时 | 清理资源、移除监听器 |

## 内置插件参考

### `mathPlugin(options?)`

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enableCache` | `boolean` | `true` | 缓存已渲染的公式 |
| `trustMath` | `boolean` | `false` | 允许 LaTeX 中的 `\href{}` 和 `\class{}` |

注册内容：remark-math、6 条 componentMatchRules（math-inline、math-display、language-math、math-block）、MathInline、MathBlock 组件。

### `mermaidPlugin(options?)`

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `theme` | `'dark' \| 'light' \| 'default' \| 'forest' \| 'neutral'` | `'default'` | Mermaid 主题 |
| `cache` | `boolean` | `true` | 缓存已渲染的 SVG |
| `cacheMaxSize` | `number` | `50` | 最大缓存图表数 |

注册内容：2 条 componentMatchRules（blockType=mermaid、className=language-mermaid）、1 条 languageMapping（mermaid→mermaid）、MermaidRenderer 组件。

### `codeblockPlugin(options?)`

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `copy` | `boolean` | `true` | 显示复制按钮 |
| `showLanguage` | `boolean` | `true` | 显示语言标签 |

注册内容：2 条 componentMatchRules（blockType=code、className=/^language-/）、CodeBlock、CodeBlockHeader 组件。

### `corePlugin`

无选项。注册内容：remark-gfm、remark-normalize-list、TableWrapper、PreComponent。始终最先注册。
