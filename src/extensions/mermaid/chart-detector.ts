/**
 * Chart Type Detector
 *
 * Detects Mermaid chart types from code content.
 * Used to apply type-specific rendering logic.
 */

export type ChartType =
  | 'flowchart'
  | 'sequence'
  | 'class'
  | 'state'
  | 'gantt'
  | 'pie'
  | 'quadrant'
  | 'journey'
  | 'mindmap'
  | 'er'
  | 'gitgraph'
  | 'requirement'
  | 'c4context'
  | 'timeline'
  | 'sankey'
  | 'xychart'
  | 'block'
  | 'network'
  | 'architecture'
  | 'unknown';

/**
 * Chart type keywords for detection
 * Ordered by specificity (more specific patterns first)
 */
const CHART_TYPE_KEYWORDS: { type: ChartType; keywords: string[] }[] = [
  // Specific diagram types with unique keywords
  { type: 'journey', keywords: ['journey'] },
  { type: 'quadrant', keywords: ['quadrantChart'] },
  { type: 'mindmap', keywords: ['mindmap'] },
  { type: 'gitgraph', keywords: ['gitgraph'] },
  { type: 'c4context', keywords: ['c4context', 'c4container', 'c4component', 'c4deployment', 'c4dynamic'] },
  { type: 'sankey', keywords: ['sankey-beta', 'sankey'] },
  { type: 'xychart', keywords: ['xychart'] },
  { type: 'block', keywords: ['block-beta', 'block'] },
  { type: 'network', keywords: ['network-beta', 'network'] },
  { type: 'architecture', keywords: ['architecture-beta', 'architecture'] },
  { type: 'timeline', keywords: ['timeline'] },
  { type: 'requirement', keywords: ['requirementDiagram', 'requirement'] },

  // Standard diagram types
  { type: 'flowchart', keywords: ['flowchart', 'graph ', 'graph\t', 'graph\n', 'graph TD', 'graph LR', 'graph BT', 'graph RL'] },
  { type: 'sequence', keywords: ['sequenceDiagram'] },
  { type: 'class', keywords: ['classDiagram'] },
  { type: 'state', keywords: ['stateDiagram', 'stateDiagram-v2'] },
  { type: 'er', keywords: ['erDiagram'] },
  { type: 'gantt', keywords: ['gantt'] },
  { type: 'pie', keywords: ['pie', 'showData'] },
];

/**
 * Detect chart type from Mermaid code
 *
 * @param code - Mermaid code content
 * @returns Detected chart type
 *
 * @example
 * detectChartType('journey\n  title User Journey') // 'journey'
 * detectChartType('flowchart TD\n  A --> B') // 'flowchart'
 */
export function detectChartType(code: string): ChartType {
  const trimmedCode = code.trim().toLowerCase();

  for (const { type, keywords } of CHART_TYPE_KEYWORDS) {
    for (const keyword of keywords) {
      const lowerKeyword = keyword.toLowerCase();

      // Check for keyword at start of code (most common case)
      if (trimmedCode.startsWith(lowerKeyword)) {
        return type;
      }

      // Check for keyword at beginning of any line
      const lines = trimmedCode.split('\n');
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith(lowerKeyword)) {
          return type;
        }
      }
    }
  }

  return 'unknown';
}

/**
 * Check if chart type requires special centering logic
 *
 * Journey charts have viewBox with negative values that cause
 * visual centering issues with standard transform approaches.
 *
 * @param type - Chart type
 * @returns true if special centering is needed
 */
export function requiresSpecialCentering(type: ChartType): boolean {
  return type === 'journey';
}

/**
 * Get chart type display name
 *
 * @param type - Chart type
 * @returns Human-readable name
 */
export function getChartTypeDisplayName(type: ChartType): string {
  const displayNames: Record<ChartType, string> = {
    flowchart: 'Flowchart',
    sequence: 'Sequence Diagram',
    class: 'Class Diagram',
    state: 'State Diagram',
    gantt: 'Gantt Chart',
    pie: 'Pie Chart',
    quadrant: 'Quadrant Chart',
    journey: 'User Journey',
    mindmap: 'Mindmap',
    er: 'ER Diagram',
    gitgraph: 'Git Graph',
    requirement: 'Requirement Diagram',
    c4context: 'C4 Diagram',
    timeline: 'Timeline',
    sankey: 'Sankey Diagram',
    xychart: 'XY Chart',
    block: 'Block Diagram',
    network: 'Network Diagram',
    architecture: 'Architecture Diagram',
    unknown: 'Unknown Chart',
  };

  return displayNames[type] || 'Unknown Chart';
}

/**
 * Chart type categories for rendering logic
 */
export const CHART_CATEGORIES = {
  /**
   * Charts that work well with standard transform centering
   */
  STANDARD_CENTERING: [
    'flowchart',
    'sequence',
    'class',
    'state',
    'gantt',
    'pie',
    'quadrant',
    'mindmap',
    'er',
    'gitgraph',
    'requirement',
    'c4context',
    'timeline',
    'sankey',
    'xychart',
    'block',
    'network',
    'architecture',
  ] as ChartType[],

  /**
   * Charts that require special centering (viewBox issues)
   */
  SPECIAL_CENTERING: ['journey'] as ChartType[],

  /**
   * Charts that typically have large width (may need horizontal scroll)
   */
  WIDE_CHARTS: ['journey', 'timeline', 'gantt', 'sequence'] as ChartType[],

  /**
   * Charts that typically have large height (may need vertical scroll)
   */
  TALL_CHARTS: ['mindmap', 'gitgraph'] as ChartType[],
};

/**
 * Get recommended zoom behavior for chart type
 *
 * @param type - Chart type
 * @returns Recommended initial zoom level (1 = 100%)
 */
export function getRecommendedZoom(type: ChartType): number {
  // Journey charts often need slight zoom out to fit
  if (type === 'journey') {
    return 0.9;
  }

  // Default to 100%
  return 1;
}

/**
 * Get chart metadata for debugging and analytics
 *
 * @param code - Mermaid code
 * @returns Chart metadata
 */
export function getChartMetadata(code: string): {
  type: ChartType;
  displayName: string;
  requiresSpecialCentering: boolean;
  recommendedZoom: number;
  lineCount: number;
} {
  const type = detectChartType(code);

  return {
    type,
    displayName: getChartTypeDisplayName(type),
    requiresSpecialCentering: requiresSpecialCentering(type),
    recommendedZoom: getRecommendedZoom(type),
    lineCount: code.split('\n').length,
  };
}
