/**
 * Normalize formula content
 * Handles various input types: string | any[] | undefined | null | React elements
 */
export function normalizeMathContent(content: unknown): string {
  // Handle array case: filter out undefined/null, extract text from React elements
  if (Array.isArray(content)) {
    const validItems = content.filter(item => item != null)
    if (validItems.length === 0) return ''
    const textParts = validItems.map(item => {
      if (typeof item === 'string') return item
      if (typeof item === 'number') return String(item)
      // React element: extract text from props.children recursively
      if (item && typeof item === 'object' && 'props' in item) {
        return extractTextFromReactNode(item.props?.children)
      }
      return ''
    }).filter(Boolean)
    return textParts.join('').replace(/\n$/, '')
  }
  // Handle non-array case
  if (content == null) return ''
  // React element: extract text recursively instead of String() which gives "[object Object]"
  if (content && typeof content === 'object' && 'props' in content) {
    return extractTextFromReactNode((content as any).props?.children).replace(/\n$/, '')
  }
  return String(content).replace(/\n$/, '')
}

/**
 * Recursively extract text from React node children
 */
function extractTextFromReactNode(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractTextFromReactNode).join('')
  if (node && typeof node === 'object' && 'props' in node) {
    return extractTextFromReactNode((node as any).props?.children)
  }
  return ''
}
