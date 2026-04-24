/**
 * RendererContext - Shared context between IncrementalRenderer and UnifiedRenderer
 *
 * Replaces 12 individual props with 2 grouped contexts:
 * - RenderContext: blocks, className, isStreaming, SimpleStreamMermaid, remarkPlugins
 * - AnimationContext: getBlockState, blockAnimationMeta, handleAnimationDoneRef
 */

import React, { createContext, useContext, type MutableRefObject } from 'react';
import type { Pluggable } from 'unified';
import type { BlockInfo, BlockAnimationMeta } from '../../core/types';

// ============================================================
// RenderContext — Data & rendering configuration
// ============================================================

export interface RenderContextValue {
  blocks: BlockInfo[];
  className?: string;
  isStreaming: boolean;
  SimpleStreamMermaid?: React.ComponentType<{ children: string }>;
  remarkPlugins: Pluggable[];
}

const RenderContext = createContext<RenderContextValue | null>(null);

export function RenderProvider({ children, value }: {
  children: React.ReactNode;
  value: RenderContextValue;
}) {
  return <RenderContext.Provider value={value}>{children}</RenderContext.Provider>;
}

export function useRenderContext(): RenderContextValue {
  const ctx = useContext(RenderContext);
  if (!ctx) {
    throw new Error('useRenderContext must be used within a RenderProvider');
  }
  return ctx;
}

// ============================================================
// AnimationContext — Block animation state & callbacks
// ============================================================

export interface AnimationContextValue {
  animationActive: boolean;
  getBlockState: (index: number) => any;
  blockAnimationMeta: Map<number, BlockAnimationMeta>;
  handleAnimationDoneRef: MutableRefObject<((index: number) => void) | undefined>;
}

const AnimationContext = createContext<AnimationContextValue | null>(null);

export function AnimationProvider({ children, value }: {
  children: React.ReactNode;
  value: AnimationContextValue;
}) {
  return <AnimationContext.Provider value={value}>{children}</AnimationContext.Provider>;
}

export function useAnimationContext(): AnimationContextValue {
  const ctx = useContext(AnimationContext);
  if (!ctx) {
    throw new Error('useAnimationContext must be used within an AnimationProvider');
  }
  return ctx;
}
