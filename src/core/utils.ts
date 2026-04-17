export function countChars(text: string): number {
  return toCharArray(text).length;
}

export function getNow(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

export const toCharArray = (text: string): string[] => {
  // Defensive programming: ensure text is a string
  const safeText = typeof text === 'string' ? text : '';
  return Array.from(safeText);
};

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

