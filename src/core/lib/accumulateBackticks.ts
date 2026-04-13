/**
 * Accumulate backtick patterns to avoid misjudgment during streaming
 *
 * Simple Strategy:
 * - Check if content starts with backtick prefix (` `` ```)
 * - If yes, accumulate until pattern is closed
 * - If no, render immediately
 *
 * This prevents `IndexError` being misjudged as code block during streaming
 */

export interface AccumulationState {
  /** Content that has been confirmed and can be rendered */
  confirmedContent: string;
  /** Content being accumulated (unclosed backtick patterns) */
  pendingContent: string;
  /** The backtick prefix type: 1|2|3 for `|``|``` */
  backtickType: number;
}

/**
 * Check if content starts with backtick prefix
 * Returns the actual number of consecutive backticks (1, 2, 3, 4+)
 */
function getBacktickPrefix(content: string): number {
  const match = content.match(/^(`+)/);
  if (!match) return 0;
  return Math.min(match[1].length, 4); // Cap at 4 to avoid edge cases
}

/**
 * Build a regex that matches a closing backtick sequence on its own line
 */
function buildClosingPattern(backtickType: number): RegExp {
  const ticks = '`'.repeat(backtickType);
  return new RegExp(`\\n${ticks}\\s*$`);
}

/**
 * Check if pattern is closed based on prefix type
 */
function isPatternClosed(content: string, backtickType: number): boolean {
  if (backtickType >= 3) {
    // Code block: need closing backticks (same count) on its own line
    const closingPattern = buildClosingPattern(backtickType);
    return closingPattern.test(content);
  }

  if (backtickType === 2) {
    // Double backtick: need closing ``
    // Must have even number of `` occurrences
    const matches = content.match(/``/g) || [];
    return matches.length % 2 === 0;
  }

  if (backtickType === 1) {
    // Single backtick: need closing `
    // Must have even number of ` occurrences
    const matches = content.match(/`/g) || [];
    return matches.length % 2 === 0;
  }

  return true;
}

export function accumulateBackticks(
  content: string,
  prevState?: AccumulationState
): {
  renderContent: string;
  state: AccumulationState;
  hasPending: boolean;
} {
  const state: AccumulationState = prevState || {
    confirmedContent: '',
    pendingContent: '',
    backtickType: 0,
  };

  // If we have pending content from previous call
  if (state.pendingContent) {
    const combined = state.pendingContent + content;

    // Check if pattern is now closed
    if (isPatternClosed(combined, state.backtickType)) {
      return {
        renderContent: state.confirmedContent + combined,
        state: { confirmedContent: '', pendingContent: '', backtickType: 0 },
        hasPending: false,
      };
    }

    // Still accumulating
    return {
      renderContent: state.confirmedContent,
      state: { ...state, pendingContent: combined },
      hasPending: true,
    };
  }

  // No pending content, check if we need to start accumulating
  const prefixType = getBacktickPrefix(content);

  if (prefixType === 0) {
    // No backtick prefix, render immediately
    return {
      renderContent: content,
      state: { confirmedContent: '', pendingContent: '', backtickType: 0 },
      hasPending: false,
    };
  }

  // Check if pattern is already closed
  if (isPatternClosed(content, prefixType)) {
    return {
      renderContent: content,
      state: { confirmedContent: '', pendingContent: '', backtickType: 0 },
      hasPending: false,
    };
  }

  // Need to accumulate
  return {
    renderContent: '',
    state: {
      confirmedContent: '',
      pendingContent: content,
      backtickType: prefixType,
    },
    hasPending: true,
  };
}

export function flushAccumulated(state: AccumulationState): string {
  return state.confirmedContent + state.pendingContent;
}
