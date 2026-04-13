/**
 * Remark plugin: Normalize list rendering
 *
 * Issue: marked renders loose list as <li><p>content</p></li>, causing extra margin on li > p
 * Solution: Convert paragraph in listItem children to text, rendering as <li>content</li>
 */

import type { Plugin } from 'unified';
import type { Node, Parent } from 'unist';

interface ListItemNode extends Parent {
  type: 'listItem';
  children: Node[];
}

interface ParagraphNode extends Parent {
  type: 'paragraph';
  children: Node[];
}

/**
 * Check if node is listItem
 */
function isListItem(node: Node): node is ListItemNode {
  return node.type === 'listItem';
}

/**
 * Check if node is paragraph
 */
function isParagraph(node: Node): node is ParagraphNode {
  return node.type === 'paragraph';
}

/**
 * Remark plugin: Expand paragraph in listItem
 * From <li><p>content</p></li> to <li>content</li>
 */
export const remarkNormalizeList: Plugin = () => {
  return (tree: Node) => {
    let modifiedCount = 0;

    // Traverse tree, find all listItems
    const visit = (node: Node) => {
      if (isListItem(node)) {
        // If listItem's first child is paragraph, expand it
        const newChildren: Node[] = [];
        let hasParagraph = false;

        for (const child of node.children) {
          if (isParagraph(child)) {
            // Put paragraph's children directly into listItem
            newChildren.push(...child.children);
            hasParagraph = true;
            modifiedCount++;
          } else {
            newChildren.push(child);
          }
        }

        if (hasParagraph) {
          node.children = newChildren;
        }
      }

      // Recursively traverse
      if ('children' in node && Array.isArray((node as Parent).children)) {
        for (const child of (node as Parent).children) {
          visit(child);
        }
      }
    };

    visit(tree);

  };
};

export default remarkNormalizeList;
