/**
 * Remar Custom Shiki Themes
 *
 * Light + Dark themes using Remar design token colors.
 * Used with themes: { light: 'remar-light', dark: 'remar-dark' } + defaultColor: false
 *
 * This generates CSS variables (--shiki-light / --shiki-dark) on each token span.
 * Theme switching is handled by a single CSS rule:
 *   [data-theme='dark'] .shiki span { color: var(--shiki-dark) !important; }
 *
 * Color mapping (aligned with Remar design system):
 *   keyword/storage/control  → --remar-color-error
 *   string/char              → --remar-code-token-string
 *   comment                  → --remar-text-tertiary (italic)
 *   function/method          → --remar-color-primary
 *   number/constant/boolean  → --remar-color-error
 *   operator                 → --remar-code-token-operator
 *   variable/property/text   → --remar-color-text-base
 *   type/class               → --remar-color-primary
 *   tag (HTML/JSX)           → --remar-color-error
 */

import type { ThemeInput } from '@shikijs/core';

// ─── Light Theme ──────────────────────────────────────────────────────

export const remarLightTheme: ThemeInput = {
  name: 'remar-light',
  type: 'light',
  colors: {
    'editor.background': '#ffffff',
    'editor.foreground': '#1d1d1f',
  },
  tokenColors: [
    { scope: ['keyword', 'storage', 'keyword.control', 'keyword.operator', 'storage.type', 'storage.modifier'], settings: { foreground: '#ff3b30' } },
    { scope: ['string', 'string.quoted', 'string.quoted.double', 'string.quoted.single', 'string.template', 'string.regexp', 'char'], settings: { foreground: '#52c41a' } },
    { scope: ['comment', 'comment.line', 'comment.block', 'comment.doc', 'prolog', 'doctype', 'cdata'], settings: { foreground: 'rgba(0,0,0,0.48)', fontStyle: 'italic' } },
    { scope: ['entity.name.function', 'entity.name.method', 'support.function', 'meta.function'], settings: { foreground: '#0071e3' } },
    { scope: ['constant', 'constant.numeric', 'number', 'boolean', 'variable.language'], settings: { foreground: '#ff3b30' } },
    { scope: ['operator', 'keyword.operator'], settings: { foreground: '#faad14' } },
    { scope: ['entity.name.type', 'entity.name.class', 'support.class', 'support.type', 'type'], settings: { foreground: '#0071e3' } },
    { scope: ['variable', 'variable.other', 'variable.parameter', 'variable.object', 'property', 'meta.property'], settings: { foreground: '#1d1d1f' } },
    { scope: ['entity.name.tag', 'meta.tag', 'punctuation.definition.tag'], settings: { foreground: '#ff3b30' } },
    { scope: ['entity.other.attribute-name', 'attribute.name'], settings: { foreground: '#0071e3' } },
    { scope: ['punctuation', 'punctuation.separator', 'punctuation.terminator', 'punctuation.section', 'delimiter', 'bracket'], settings: { foreground: '#1d1d1f' } },
    { scope: ['support.function.builtin', 'support.builtin', 'builtin'], settings: { foreground: '#0071e3' } },
    { scope: ['markup.inserted', 'inserted'], settings: { foreground: '#34c759' } },
    { scope: ['markup.deleted', 'deleted'], settings: { foreground: '#ff3b30' } },
    { scope: ['markup.link', 'markup.url'], settings: { foreground: '#0071e3' } },
    { scope: ['selector', 'selector.tag', 'selector.id', 'selector.class'], settings: { foreground: '#0071e3' } },
    { scope: ['atrule', 'keyword.control.at-rule'], settings: { foreground: '#ff3b30' } },
  ],
};

// ─── Dark Theme ───────────────────────────────────────────────────────
// Colors aligned with dark.scss design tokens

export const remarDarkTheme: ThemeInput = {
  name: 'remar-dark',
  type: 'dark',
  colors: {
    'editor.background': '#25253d',
    'editor.foreground': '#e2e8f0',
  },
  tokenColors: [
    { scope: ['keyword', 'storage', 'keyword.control', 'keyword.operator', 'storage.type', 'storage.modifier'], settings: { foreground: '#f87171' } },
    { scope: ['string', 'string.quoted', 'string.quoted.double', 'string.quoted.single', 'string.template', 'string.regexp', 'char'], settings: { foreground: '#86efac' } },
    { scope: ['comment', 'comment.line', 'comment.block', 'comment.doc', 'prolog', 'doctype', 'cdata'], settings: { foreground: '#64748b', fontStyle: 'italic' } },
    { scope: ['entity.name.function', 'entity.name.method', 'support.function', 'meta.function'], settings: { foreground: '#60a5fa' } },
    { scope: ['constant', 'constant.numeric', 'number', 'boolean', 'variable.language'], settings: { foreground: '#f87171' } },
    { scope: ['operator', 'keyword.operator'], settings: { foreground: '#fdba74' } },
    { scope: ['entity.name.type', 'entity.name.class', 'support.class', 'support.type', 'type'], settings: { foreground: '#60a5fa' } },
    { scope: ['variable', 'variable.other', 'variable.parameter', 'variable.object', 'property', 'meta.property'], settings: { foreground: '#e2e8f0' } },
    { scope: ['entity.name.tag', 'meta.tag', 'punctuation.definition.tag'], settings: { foreground: '#f87171' } },
    { scope: ['entity.other.attribute-name', 'attribute.name'], settings: { foreground: '#60a5fa' } },
    { scope: ['punctuation', 'punctuation.separator', 'punctuation.terminator', 'punctuation.section', 'delimiter', 'bracket'], settings: { foreground: '#e2e8f0' } },
    { scope: ['support.function.builtin', 'support.builtin', 'builtin'], settings: { foreground: '#60a5fa' } },
    { scope: ['markup.inserted', 'inserted'], settings: { foreground: '#4ade80' } },
    { scope: ['markup.deleted', 'deleted'], settings: { foreground: '#f87171' } },
    { scope: ['markup.link', 'markup.url'], settings: { foreground: '#60a5fa' } },
    { scope: ['selector', 'selector.tag', 'selector.id', 'selector.class'], settings: { foreground: '#60a5fa' } },
    { scope: ['atrule', 'keyword.control.at-rule'], settings: { foreground: '#f87171' } },
  ],
};
