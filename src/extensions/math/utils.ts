/**
 * Normalize formula content
 * Handles various input types: string | any[] | undefined | null
 */
export function normalizeMathContent(content: unknown): string {
  // Handle array case: filter out undefined/null, then join
  if (Array.isArray(content)) {
    const validItems = content.filter(item => item != null)
    if (validItems.length === 0) return ''
    return String(validItems.join('')).replace(/\n$/, '')
  }
  // Handle non-array case
  if (content == null) return ''
  return String(content).replace(/\n$/, '')
}
