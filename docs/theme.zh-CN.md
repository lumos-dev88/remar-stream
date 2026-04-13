# Remar 主题系统

## 概述

Remar 采用 **三层 Design Token 架构**，通过 CSS 变量实现主题定制。所有插件（Mermaid、CodeBlock、Math）共享统一的 token 系统，暗色模式开箱即用。

## 架构

```
Seed Token（种子变量）
  │  用户可配置的最小集
  │  文件：src/styles/tokens/seed.scss
  │
  ↓ 派生
Map Token（梯度变量）
  │  插件和组件直接消费
  │  文件：src/styles/tokens/map.scss
  │
  ↓ 覆盖
Dark Token（暗色模式）
     覆盖 Seed + Map 层
     文件：src/styles/tokens/dark.scss
```

## 文件结构

```
src/styles/
  tokens/
    seed.scss    # 种子变量（品牌色、基础色、形状、间距、字体）
    map.scss     # 梯度变量（背景、文本、边框、代码块、表格、Math、Mermaid）
    dark.scss    # 暗色模式覆盖
  index.scss     # 全局样式入口（导入 tokens + 基础排版 + 插件样式）
```

## 快速定制

### 方式一：覆盖 Seed 变量（推荐）

只需覆盖少量种子变量，Map 层自动继承：

```css
:root {
  --remar-color-primary: #722ed1;   /* 品牌色 */
  --remar-border-radius: 8px;      /* 圆角 */
  --remar-font-sans: 'Custom Font', sans-serif;
}
```

### 方式二：覆盖 Map 变量（精细控制）

覆盖特定组件的梯度变量：

```css
:root {
  --remar-codeblock-bg: #1e1e1e;    /* 深色代码块 */
  --remar-mermaid-radius: 12px;     /* Mermaid 圆角 */
  --remar-math-bg: #fafafa;         /* 公式背景 */
}
```

### 方式三：自定义暗色模式

在 `[data-theme='dark']` 中覆盖：

```css
[data-theme='dark'] {
  --remar-color-bg-base: #1a1a2e;
  --remar-color-text-base: #e0e0e0;
  --remar-bg-secondary: #16213e;
}
```

## 变量完整列表

### Seed Token（种子变量）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `--remar-color-primary` | `#1677ff` | 品牌主色 |
| `--remar-color-error` | `#ff4d4f` | 错误色 |
| `--remar-color-success` | `#52c41a` | 成功色 |
| `--remar-color-warning` | `#faad14` | 警告色 |
| `--remar-color-info` | `#1677ff` | 信息色 |
| `--remar-color-bg-base` | `#ffffff` | 基础背景色 |
| `--remar-color-text-base` | `#1f2328` | 基础文本色 |
| `--remar-border-radius` | `6px` | 基础圆角 |
| `--remar-border-radius-sm` | `4px` | 小圆角 |
| `--remar-font-size` | `16px` | 基础字号 |
| `--remar-line-height` | `1.6` | 基础行高 |
| `--remar-padding` | `16px` | 基础内边距 |
| `--remar-padding-sm` | `8px` | 小内边距 |
| `--remar-font-sans` | 系统字体栈 | 正文字体 |
| `--remar-font-mono` | 等宽字体栈 | 代码字体 |
| `--remar-mermaid-height` | `378px` | Mermaid 容器高度 |

### Map Token（梯度变量）

#### 通用

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `--remar-bg` | `var(--remar-color-bg-base)` | 主背景 |
| `--remar-bg-secondary` | `#f6f8fa` | 次要背景 |
| `--remar-bg-tertiary` | `#eaeef2` | 第三级背景 |
| `--remar-bg-active` | `#ddf4ff` | 激活态背景 |
| `--remar-text` | `var(--remar-color-text-base)` | 主文本 |
| `--remar-text-secondary` | `#656d76` | 次要文本 |
| `--remar-text-tertiary` | `#8c959f` | 第三级文本 |
| `--remar-border` | `#d0d7de` | 主边框 |
| `--remar-border-secondary` | `#e6e9f0` | 次要边框 |
| `--remar-primary` | `var(--remar-color-primary)` | 主色别名 |
| `--remar-error` | `var(--remar-color-error)` | 错误色别名 |
| `--remar-error-bg` | `#fff2f0` | 错误背景 |
| `--remar-success` | `var(--remar-color-success)` | 成功色别名 |
| `--remar-warning` | `var(--remar-color-warning)` | 警告色别名 |

#### 代码

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `--remar-code-bg` | `#f6f8fa` | 行内代码背景 |
| `--remar-code-text` | `#24292f` | 行内代码文本 |

#### 代码块

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `--remar-codeblock-bg` | `#f6f8fa` | 代码块背景 |
| `--remar-codeblock-header-bg` | `#f3f4f6` | 代码块头部背景 |
| `--remar-codeblock-border` | `#e1e4e8` | 代码块边框 |

#### 表格

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `--remar-table-border` | `var(--remar-border)` | 表格边框 |
| `--remar-table-header-bg` | `var(--remar-bg-secondary)` | 表头背景 |
| `--remar-table-row-alt-bg` | `var(--remar-bg-secondary)` | 交替行背景 |

#### 数学公式

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `--remar-math-bg` | `#f8f9fa` | 公式块背景 |
| `--remar-math-error` | `#d32f2f` | 公式错误色 |
| `--remar-math-spinner-border` | `#e0e0e0` | 加载动画边框 |
| `--remar-math-spinner-accent` | `#1976d2` | 加载动画强调色 |

#### Mermaid 图表

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `--remar-mermaid-bg` | `var(--remar-color-bg-base)` | 图表背景 |
| `--remar-mermaid-border` | `var(--remar-border)` | 图表边框 |
| `--remar-mermaid-toolbar-bg` | `var(--remar-bg-secondary)` | 工具栏背景 |
| `--remar-mermaid-toolbar-border` | `var(--remar-border)` | 工具栏边框 |
| `--remar-mermaid-btn-hover` | `var(--remar-bg-tertiary)` | 按钮悬停 |
| `--remar-mermaid-btn-active` | `var(--remar-bg-active)` | 按钮激活 |
| `--remar-mermaid-text` | `var(--remar-color-text-base)` | 图表文本 |
| `--remar-mermaid-text-secondary` | `var(--remar-text-secondary)` | 图表次要文本 |
| `--remar-mermaid-radius` | `8px` | 图表圆角 |
| `--remar-mermaid-shadow` | `0 1px 2px rgba(...)` | 图表阴影 |
| `--remar-mermaid-loading-bg` | `rgba(255,255,255,0.9)` | 加载指示器背景 |
| `--remar-mermaid-loading-dot` | `#0969da` | 加载点颜色 |
| `--remar-mermaid-tooltip-bg` | `#24292f` | 提示框背景 |
| `--remar-mermaid-tooltip-text` | `#fff` | 提示框文本 |
| `--remar-mermaid-btn-active-text` | `#0969da` | 激活按钮文本 |

## 暗色模式

暗色模式通过 `[data-theme='dark']` 选择器切换，与 `RemarMarkdown` 组件的 `theme` prop 联动：

```tsx
<RemarMarkdown theme="dark" content={markdown} />
```

暗色模式会覆盖 Seed 层的 3 个变量和 Map 层的 20+ 个变量，所有插件自动适配。

## 插件样式规范

- **禁止**在插件的 `:root` 中定义 CSS 变量
- **必须**消费全局 Map 层变量（`var(--remar-xxx)`）
- **允许**在组件选择器内定义组件级变量（带前缀，如 `--mermaid-xxx`）
- **禁止**在插件入口文件（`index.tsx`）中 `import './styles.scss'`，样式统一由 `src/styles/index.scss` 导入

## 设计参考

本主题系统的三层 Token 架构参考了 [Ant Design 5](https://ant.design/docs/react/customize-theme) 的 Design Token 设计理念，针对轻量级组件库做了简化：
- 不使用 CSS-in-JS，纯 CSS 变量实现
- 不需要算法派生，手动维护梯度变量
- 零运行时开销，零额外依赖
