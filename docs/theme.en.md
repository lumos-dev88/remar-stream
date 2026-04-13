# Remar Theme System

## Overview

Remar uses a **three-layer Design Token architecture** with CSS variables for theming. All plugins (Mermaid, CodeBlock, Math) share the unified token system. Dark mode is supported out of the box.

## Architecture

```
Seed Token (Seed Variables)
  │  Minimal user-configurable set
  │  File: src/styles/tokens/seed.scss
  │
  ↓ Derived
Map Token (Gradient Variables)
  │  Consumed directly by plugins and components
  │  File: src/styles/tokens/map.scss
  │
  ↓ Override
Dark Token (Dark Mode)
     Overrides Seed + Map layers
     File: src/styles/tokens/dark.scss
```

## File Structure

```
src/styles/
  tokens/
    seed.scss    # Seed variables (brand colors, base colors, shape, spacing, fonts)
    map.scss     # Gradient variables (background, text, border, code, table, math, mermaid)
    dark.scss    # Dark mode overrides
  index.scss     # Global style entry (imports tokens + base typography + plugin styles)
```

## Quick Customization

### Method 1: Override Seed Variables (Recommended)

Override a few seed variables — the Map layer inherits automatically:

```css
:root {
  --remar-color-primary: #722ed1;   /* Brand color */
  --remar-border-radius: 8px;      /* Border radius */
  --remar-font-sans: 'Custom Font', sans-serif;
}
```

### Method 2: Override Map Variables (Fine-grained Control)

Override specific gradient variables for individual components:

```css
:root {
  --remar-codeblock-bg: #1e1e1e;    /* Dark code block */
  --remar-mermaid-radius: 12px;     /* Mermaid border radius */
  --remar-math-bg: #fafafa;         /* Formula background */
}
```

### Method 3: Custom Dark Mode

Override in `[data-theme='dark']`:

```css
[data-theme='dark'] {
  --remar-color-bg-base: #1a1a2e;
  --remar-color-text-base: #e0e0e0;
  --remar-bg-secondary: #16213e;
}
```

## Variable Reference

### Seed Token (Seed Variables)

| Variable | Default | Description |
|----------|---------|-------------|
| `--remar-color-primary` | `#1677ff` | Brand primary color |
| `--remar-color-error` | `#ff4d4f` | Error color |
| `--remar-color-success` | `#52c41a` | Success color |
| `--remar-color-warning` | `#faad14` | Warning color |
| `--remar-color-info` | `#1677ff` | Info color |
| `--remar-color-bg-base` | `#ffffff` | Base background color |
| `--remar-color-text-base` | `#1f2328` | Base text color |
| `--remar-border-radius` | `6px` | Base border radius |
| `--remar-border-radius-sm` | `4px` | Small border radius |
| `--remar-font-size` | `16px` | Base font size |
| `--remar-line-height` | `1.6` | Base line height |
| `--remar-padding` | `16px` | Base padding |
| `--remar-padding-sm` | `8px` | Small padding |
| `--remar-font-sans` | System font stack | Body font |
| `--remar-font-mono` | Monospace font stack | Code font |
| `--remar-mermaid-height` | `378px` | Mermaid container height |

### Map Token (Gradient Variables)

#### General

| Variable | Default | Description |
|----------|---------|-------------|
| `--remar-bg` | `var(--remar-color-bg-base)` | Main background |
| `--remar-bg-secondary` | `#f6f8fa` | Secondary background |
| `--remar-bg-tertiary` | `#eaeef2` | Tertiary background |
| `--remar-bg-active` | `#ddf4ff` | Active state background |
| `--remar-text` | `var(--remar-color-text-base)` | Main text |
| `--remar-text-secondary` | `#656d76` | Secondary text |
| `--remar-text-tertiary` | `#8c959f` | Tertiary text |
| `--remar-border` | `#d0d7de` | Main border |
| `--remar-border-secondary` | `#e6e9f0` | Secondary border |
| `--remar-primary` | `var(--remar-color-primary)` | Primary color alias |
| `--remar-error` | `var(--remar-color-error)` | Error color alias |
| `--remar-error-bg` | `#fff2f0` | Error background |
| `--remar-success` | `var(--remar-color-success)` | Success color alias |
| `--remar-warning` | `var(--remar-color-warning)` | Warning color alias |

#### Code

| Variable | Default | Description |
|----------|---------|-------------|
| `--remar-code-bg` | `#f6f8fa` | Inline code background |
| `--remar-code-text` | `#24292f` | Inline code text |

#### Code Block

| Variable | Default | Description |
|----------|---------|-------------|
| `--remar-codeblock-bg` | `#f6f8fa` | Code block background |
| `--remar-codeblock-header-bg` | `#f3f4f6` | Code block header background |
| `--remar-codeblock-border` | `#e1e4e8` | Code block border |

#### Table

| Variable | Default | Description |
|----------|---------|-------------|
| `--remar-table-border` | `var(--remar-border)` | Table border |
| `--remar-table-header-bg` | `var(--remar-bg-secondary)` | Table header background |
| `--remar-table-row-alt-bg` | `var(--remar-bg-secondary)` | Alternating row background |

#### Math Formulas

| Variable | Default | Description |
|----------|---------|-------------|
| `--remar-math-bg` | `#f8f9fa` | Formula block background |
| `--remar-math-error` | `#d32f2f` | Formula error color |
| `--remar-math-spinner-border` | `#e0e0e0` | Loading spinner border |
| `--remar-math-spinner-accent` | `#1976d2` | Loading spinner accent |

#### Mermaid Diagrams

| Variable | Default | Description |
|----------|---------|-------------|
| `--remar-mermaid-bg` | `var(--remar-color-bg-base)` | Diagram background |
| `--remar-mermaid-border` | `var(--remar-border)` | Diagram border |
| `--remar-mermaid-toolbar-bg` | `var(--remar-bg-secondary)` | Toolbar background |
| `--remar-mermaid-toolbar-border` | `var(--remar-border)` | Toolbar border |
| `--remar-mermaid-btn-hover` | `var(--remar-bg-tertiary)` | Button hover |
| `--remar-mermaid-btn-active` | `var(--remar-bg-active)` | Button active |
| `--remar-mermaid-text` | `var(--remar-color-text-base)` | Diagram text |
| `--remar-mermaid-text-secondary` | `var(--remar-text-secondary)` | Diagram secondary text |
| `--remar-mermaid-radius` | `8px` | Diagram border radius |
| `--remar-mermaid-shadow` | `0 1px 2px rgba(...)` | Diagram shadow |
| `--remar-mermaid-loading-bg` | `rgba(255,255,255,0.9)` | Loading indicator background |
| `--remar-mermaid-loading-dot` | `#0969da` | Loading dot color |
| `--remar-mermaid-tooltip-bg` | `#24292f` | Tooltip background |
| `--remar-mermaid-tooltip-text` | `#fff` | Tooltip text |
| `--remar-mermaid-btn-active-text` | `#0969da` | Active button text |

## Dark Mode

Dark mode is toggled via the `[data-theme='dark']` selector, linked to the `theme` prop of `RemarMarkdown`:

```tsx
<RemarMarkdown theme="dark" content={markdown} />
```

Dark mode overrides 3 Seed layer variables and 20+ Map layer variables. All plugins adapt automatically.

## Plugin Style Guidelines

- **Do NOT** define CSS variables in a plugin's `:root`
- **Must** consume global Map layer variables (`var(--remar-xxx)`)
- **Allowed** to define component-level variables within component selectors (with prefix, e.g., `--mermaid-xxx`)
- **Do NOT** `import './styles.scss'` in plugin entry files (`index.tsx`). Styles are unified through `src/styles/index.scss`

## Design Reference

This three-layer Token architecture is inspired by [Ant Design 5](https://ant.design/docs/react/customize-theme)'s Design Token design, simplified for a lightweight component library:
- Pure CSS variables, no CSS-in-JS
- No algorithmic derivation, manually maintained gradient variables
- Zero runtime overhead, zero extra dependencies
