export function countChars(text: string): number {
  return toCharArray(text).length;
}

export function getNow(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

export function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).substring(0, 8);
}

export const toCharArray = (text: string): string[] => {
  // Defensive programming: ensure text is a string
  const safeText = typeof text === 'string' ? text : '';
  return Array.from(safeText);
};

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

