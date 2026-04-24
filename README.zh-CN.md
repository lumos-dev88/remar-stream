# Remar-stream · React 流式 Markdown 渲染组件

[English](./README.md) | [中文](./README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/remar.svg?style=flat-square)](https://www.npmjs.com/package/remar-stream)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

专为 AI 聊天界面设计的 React Markdown 流式渲染组件，原生支持 SSE 流式更新、KaTeX 数学公式与 Mermaid 图表。采用线性渲染架构 + Web Animations API，实现流畅无闪烁的流式输出效果。

## 特性

- **线性渲染架构** — 流式和静态共用同一渲染管线，架构简洁，无多余抽象层。
- **字符淡入动画** — 基于 Web Animations API，GPU 加速，流畅无闪烁。
- **RC + CPS 微缓冲** — 自适应过滤网络抖动，控制字符显示速率。无需内存队列，零额外延迟。
- **Block 生命周期管理** — 自动检测每个 Markdown 块的渲染完成状态。
- **数学公式** — KaTeX 渲染，支持行内（`$...$`）和块级（`$$...$$`），内置缓存加速。
- **Mermaid 图表** — 懒加载（主包减负约 500KB），内置缩放/下载/全屏/源码工具栏。
- **代码高亮** — Shiki + Web Worker 非阻塞语法高亮，支持 200+ 种语言，内置明暗主题，代码块显示语言标签和复制按钮。
- **插件系统** — 内置注册中心，支持扩展自定义 Markdown 元素渲染。
- **TypeScript** — 完整类型定义，开箱即用。

## 安装

```bash
npm install remar-stream
# 或
yarn add remar-stream
# 或
pnpm add remar-stream
```

**Peer dependencies**（需在项目中安装）：

```bash
npm install react@^18.0.0 react-dom@^18.0.0
# 或 React 19
npm install react@^19.0.0 react-dom@^19.0.0
```

## 快速上手

### 静态内容

```tsx
import { RemarMarkdown } from 'remar-stream';

function App() {
  return <RemarMarkdown content="# Hello, remar!" />;
}
```

### SSE 流式场景

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

### 无动画模式

不需要字符淡入动画时，传入 `disableAnimation` 即可，所有字符立即显示。缓冲机制仍然生效，确保输出流畅：

```tsx
<RemarMarkdown
  content={content}
  isStreaming={isStreaming}
  disableAnimation
/>
```

### 暗色主题

通过 `theme` prop 切换暗色模式，组件自动设置 `data-theme="dark"` 属性：

```tsx
<RemarMarkdown content={content} theme="dark" />
```

### 内置插件功能

Mermaid 图表、数学公式（KaTeX）、代码高亮（Shiki）、表格样式等在**首次渲染时自动注册**，无需手动配置。直接在 Markdown 中使用即可：

````markdown
```mermaid
graph LR
  A --> B
```

$$E = mc^2$$

```python
print("Hello")
```
````

> 完整插件系统文档请参阅 [docs/plugin-system.zh-CN.md](./docs/plugin-system.zh-CN.md)

## API

### `<RemarMarkdown>`

| Prop                 | 类型                               | 默认值       | 说明                        |
| -------------------- | ---------------------------------- | ------------ | --------------------------- |
| `content`            | `string`                           | **必填**     | Markdown 字符串             |
| `isStreaming`        | `boolean`                          | `false`      | 是否处于 SSE 流式传输状态       |
| `className`          | `string`                           | —            | 附加到容器的 CSS 类名        |
| `theme`              | `'light' \| 'dark'`                | `'light'`    | 主题模式，通过 `data-theme` 属性切换 |
| `disableAnimation`   | `boolean`                          | `false`      | 关闭字符淡入动画，字符立即显示   |
| `SimpleStreamMermaid`| `React.ComponentType<any>`         | —            | 自定义 Mermaid 渲染组件       |
| `onStatsUpdate`      | `(stats: StreamStats) => void`     | —            | 调试回调，输出实时流式指标     |

## 支持的 Markdown 语法

基于 `react-markdown` + `remark-gfm`，支持标准 CommonMark 和 GFM 扩展语法，包括标题、粗体、斜体、列表、链接、图片、代码块、引用、分隔线、表格、任务列表。

**数学公式（KaTeX）**

```
行内：$E = mc^2$

块级：
$$
\sum_{i=1}^{n} x_i = x_1 + x_2 + \cdots + x_n
$$
```

**Mermaid 图表**

````markdown
```mermaid
graph TD
    A[开始] --> B{判断}
    B -->|是| C[确定]
    B -->|否| D[结束]
```
````

**代码高亮（Shiki）**

基于 Shiki 引擎，通过 Web Worker 实现非阻塞语法高亮，支持 200+ 种语言，内置自定义 `remar-light`/`remar-dark` 主题。

## 主题定制

支持通过 CSS 变量自定义外观，暗色模式开箱即用。

> 完整主题定制文档请参阅 [docs/theme.zh-CN.md](./docs/theme.zh-CN.md)

## 浏览器支持

- Chrome >= 84
- Firefox >= 75
- Safari >= 14
- Edge >= 84

## 常见问题

**流式输出时动画效果是怎样的？**

流式传输时，字符会逐个淡入显示。内部通过自适应缓冲机制过滤网络抖动，确保输出流畅稳定。缓冲完成后自动排空剩余内容，不会丢失字符。

`disableAnimation` 模式下关闭字符淡入动画，所有字符立即显示。缓冲机制仍然生效，确保输出流畅。

**支持 Next.js 吗？**

支持。remar 的构建产物已内置 `"use client"` 指令，无需手动添加。在 App Router 中直接导入即可：

```tsx
import { RemarMarkdown } from 'remar-stream';
```

**不使用流式场景时可以用吗？**

可以。省略 `isStreaming` 或设为 `false`，remar 即作为普通静态 Markdown 渲染器使用，无额外开销。

**需要手动引入 CSS 吗？**

通常不需要。`dist/index.js` 顶部包含 CSS 静态引用，Vite / Webpack / Next.js 等构建工具会自动处理。只需正常导入组件即可：

```tsx
import { RemarMarkdown } from 'remar-stream';
```

如果样式未生效（非标准打包环境），可手动引入：

```tsx
import 'remar-stream/styles.css';
```

**依赖了哪些 UI 组件库？**

不依赖任何 UI 组件库。remar 的 peer dependencies 只有 `react`（^18.0.0 || ^19.0.0）和 `react-dom`，可以与 Ant Design、MUI、Arco Design、shadcn/ui 等任何 UI 框架共存。样式基于 CSS 变量体系，通过 `--remar-` 前缀隔离，不会污染全局样式。

**如何扩展自定义渲染？**

remar 提供插件系统，支持注册自定义组件匹配规则、remark 插件、语言映射等。详见 [插件系统文档](./docs/plugin-system.zh-CN.md)。

## 参与贡献

欢迎提交 Issue 和 Pull Request。

## 开源协议

MIT © [remar](https://github.com/lumos-dev88/remar-stream)
