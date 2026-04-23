/**
 * DOM Expando Type Definitions (Declaration Merging)
 *
 * Extends the global HTMLElement interface to include remar-specific
 * expando properties used for cross-system communication between
 * rehype (AST layer) and RAF (animation layer).
 *
 * These properties use the `__` prefix convention to indicate they are
 * non-standard DOM attributes.
 *
 * ⚠️ Do NOT add new expando properties without architecture review.
 *    Current expandos are documented in knowledge-base §5.5, §13, §14.
 */
interface HTMLElement {
  /**
   * CI cache version number.
   * Written by rehypeStreamAnimated on each DOM rebuild (incremented).
   * Read by useBlockAnimation RAF loop to detect cache invalidation.
   */
  __ciVersion: number;

  /**
   * Set of revealed character indices (global ci values).
   * Written by useBlockAnimation RAF loop (markRevealed).
   * Read by rehypeStreamAnimated for DOM rebuild flicker prevention (inherit revealed state).
   */
  __revealedCiSet: Set<number>;
}
