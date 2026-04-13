/**
 * MermaidCodePanel - Source code display panel
 *
 * Simple code display without toolbar (toolbar is handled by parent)
 */

'use client';

import React from 'react';

interface MermaidCodePanelProps {
  /** Raw mermaid code */
  code: string;
  /** Whether panel is open */
  isOpen: boolean;
  /** Whether to display in full view mode (no sidebar, takes full width) */
  isFullView?: boolean;
}

export const MermaidCodePanel: React.FC<MermaidCodePanelProps> = ({
  code,
  isOpen,
  isFullView = false,
}) => {
  if (!isOpen) return null;

  return (
    <div className={`remar-mermaid-code-panel ${isFullView ? 'full-view' : ''}`}>
      <pre className="remar-mermaid-code-panel-content">
        <code>{code}</code>
      </pre>
    </div>
  );
};

export default MermaidCodePanel;
