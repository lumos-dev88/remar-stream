import type { RemendHandler } from 'remend';

export const mermaidHandler: RemendHandler = {
  name: 'mermaid',
  priority: 85,
  handle: (text: string): string => {
    const mermaidBlockRegex = /```mermaid\b[\s\S]*?$/;
    const match = text.match(mermaidBlockRegex);

    if (match) {
      const blockContent = match[0];
      if (!blockContent.trim().endsWith('```')) {
        return text + '\n```';
      }
    }

    return text;
  },
};
