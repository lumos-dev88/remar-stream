/**
 * MermaidRenderer - Non-blocking streaming with React 18 Concurrent Features
 *
 * Architecture:
 * 1. Rendering Layer: useDeferredValue + useTransition for non-blocking updates
 * 2. UI Layer: Toolbar + CodePanel + Zoom + Pan/Drag controls
 * 3. State Layer: AbortController for cancellation, refs for caching
 * 4. Interaction Layer: Drag to pan, zoom controls
 *
 * UI Features:
 * - Toolbar: Zoom, Download, Fullscreen, View Code
 * - Code Panel: Source code display with copy
 * - Zoom: 50% - 300% with fit-to-window
 * - Drag/Pan: Click and drag to move diagram
 */

'use client';

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  useDeferredValue,
  useTransition,
} from 'react';
import type { MermaidRendererProps } from './types';
import { logMermaid, errorMermaid } from './logger';
import { MermaidToolbar } from './MermaidToolbar';
import { MermaidCodePanel } from './MermaidCodePanel';
import { detectChartType } from './chart-detector';

const DEBOUNCE_MS = 80;
const STREAMING_END_DELAY_MS = 250;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

let mermaidInstance: import('mermaid').Mermaid | null = null;
let initPromise: Promise<void> | null = null;
const svgCache = new Map<string, string>();

function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36).substring(0, 8);
}

function extractMermaidCode(content: string): string {
  let code = content.trim();
  if (code.startsWith('```mermaid')) {
    code = code.replace(/^```mermaid\s*/, '');
  }
  if (code.endsWith('```')) {
    code = code.replace(/```$/, '');
  }
  return code.trim();
}

async function initMermaid(theme: string): Promise<void> {
  if (mermaidInstance) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const mermaid = await import('mermaid');
    mermaid.default.initialize({
      startOnLoad: false,
      theme: theme as any,
      securityLevel: 'loose',
      flowchart: {
        useMaxWidth: true,
        htmlLabels: true,
      },
      sequence: {
        useMaxWidth: true,
      },
      journey: {
        useMaxWidth: true,
      },
    } as any);
    mermaidInstance = mermaid.default;
    logMermaid('Mermaid initialized');
  })();

  return initPromise;
}

/**
 * Render with abort support - allows cancelling stale requests
 */
async function renderWithAbort(
  code: string,
  id: string,
  signal: AbortSignal
): Promise<{ svg: string; bindFunctions?: (element: Element) => void } | null> {
  if (!mermaidInstance) return null;

  try {
    if (signal.aborted) return null;
    await mermaidInstance.parse(code);
    if (signal.aborted) return null;
    const result = await mermaidInstance.render(id, code);
    if (signal.aborted) return null;
    return result;
  } catch {
    return null;
  }
}

export const MermaidRenderer: React.FC<MermaidRendererProps> = ({
  children,
  isStreaming: externalIsStreaming = false,
  options = {},
}) => {
  const { theme = 'default' } = options;

  // ============================================================================
  // React 18 Concurrent Features
  // ============================================================================
  const [isPending, startTransition] = useTransition();

  // ============================================================================
  // Rendering State (Core - must be stable)
  // ============================================================================
  const [displaySvg, setDisplaySvg] = useState<string>('');
  const [isReady, setIsReady] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  // ============================================================================
  // UI State (Pure UI, no render logic)
  // ============================================================================
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCodeOpen, setIsCodeOpen] = useState(false);
  
  // Pan/Drag state
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  // ============================================================================
  // Refs
  // ============================================================================
  const containerRef = useRef<HTMLDivElement>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const contentAreaRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastValidSvgRef = useRef<string>('');
  const lastValidCodeRef = useRef<string>('');
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const streamEndTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Drag refs
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });

  // Track if user has manually interacted with zoom/pan
  const hasUserInteractedRef = useRef(false);

  // ============================================================================
  // Code Processing
  // ============================================================================
  const rawMermaidCode = useMemo(() => extractMermaidCode(children), [children]);
  const contentHash = useMemo(() => hashContent(rawMermaidCode), [rawMermaidCode]);
  const mermaidCode = useDeferredValue(rawMermaidCode);

  // ============================================================================
  // Journey Chart Offset Compensation
  // Journey chart SVG viewBox has offset issues that need compensation in normal rendering mode.
  // Note: Offset compensation is only applied in normal rendering mode, not in fullscreen mode.
  //       In fullscreen, browser native centering (transformOrigin: center center) is used.
  // ============================================================================
  const journeyOffset = useMemo<{ x: number; y: number }>(() => {
    const chartType = detectChartType(rawMermaidCode);
    if (chartType !== 'journey') return { x: 0, y: 0 };

    const viewBoxMatch = (displaySvg || '').match(/viewBox="([^"]+)"/);
    if (!viewBoxMatch) return { x: 0, y: 0 };

    const parts = viewBoxMatch[1].split(/\s+/).map(Number);
    if (parts.length !== 4) return { x: 0, y: 0 };

    const [vbX, vbY, vbW] = parts;
    return {
      x: vbX < 0 ? -vbX : vbW * -0.11,
      y: vbY < 0 ? -vbY * 0.5 : 0,
    };
  }, [rawMermaidCode, displaySvg]);

  // ============================================================================
  // Initialize Mermaid
  // ============================================================================
  useEffect(() => {
    initMermaid(theme).then(() => setIsReady(true));
  }, [theme]);

  // ============================================================================
  // Streaming State Detection
  // ============================================================================
  useEffect(() => {
    if (externalIsStreaming) {
      setIsStreaming(true);
      if (streamEndTimerRef.current) clearTimeout(streamEndTimerRef.current);
    } else {
      streamEndTimerRef.current = setTimeout(() => {
        setIsStreaming(false);
      }, STREAMING_END_DELAY_MS);
    }

    return () => {
      if (streamEndTimerRef.current) clearTimeout(streamEndTimerRef.current);
    };
  }, [children, externalIsStreaming]);

  // ============================================================================
  // Core Render Logic (UNCHANGED - critical for stability)
  // ============================================================================
  const attemptRender = useCallback(
    async (code: string) => {
      if (!isReady || !code.trim()) return;
      if (code === lastValidCodeRef.current) return;

      // Check cache for non-streaming
      if (!isStreaming) {
        const cached = svgCache.get(contentHash);
        if (cached) {
          startTransition(() => {
            setDisplaySvg(cached);
          });
          lastValidSvgRef.current = cached;
          lastValidCodeRef.current = code;
          return;
        }
      }

      // Cancel previous render
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const id = `mermaid-${contentHash}-${Date.now()}`;
      const result = await renderWithAbort(code, id, abortController.signal);

      if (!result || abortController.signal.aborted) {
        logMermaid('Render aborted or failed:', contentHash.substring(0, 6));
        return;
      }

      const { svg, bindFunctions } = result;

      // Discard SVG that contains Mermaid error messages (e.g. "Syntax error in text")
      if (svg.includes('Syntax error in text')) {
        logMermaid('Rendered SVG contains syntax error, discarded:', contentHash.substring(0, 6));
        return;
      }

      startTransition(() => {
        setDisplaySvg(svg);
      });

      lastValidSvgRef.current = svg;
      lastValidCodeRef.current = code;

      if (!isStreaming) {
        svgCache.set(contentHash, svg);
      }

      if (bindFunctions && containerRef.current) {
        bindFunctions(containerRef.current);
      }

      logMermaid('Rendered:', contentHash.substring(0, 6));
    },
    [isReady, isStreaming, contentHash, startTransition]
  );

  // ============================================================================
  // Render Trigger
  // ============================================================================
  const triggerRender = useCallback(
    (code: string) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        attemptRender(code);
      }, isStreaming ? DEBOUNCE_MS : 0);
    },
    [attemptRender, isStreaming]
  );

  useEffect(() => {
    if (!isReady) return;
    triggerRender(mermaidCode);
  }, [mermaidCode, isReady, triggerRender]);

  useEffect(() => {
    if (!isStreaming && isReady && mermaidCode !== lastValidCodeRef.current) {
      attemptRender(mermaidCode);
    }
  }, [isStreaming, isReady, mermaidCode, attemptRender]);

  // ============================================================================
  // UI Handlers (Pure UI, no render logic)
  // ============================================================================
  const handleZoomIn = useCallback(() => {
    hasUserInteractedRef.current = true;
    setZoom((z) => Math.min(z + ZOOM_STEP, MAX_ZOOM));
  }, []);

  const handleZoomOut = useCallback(() => {
    hasUserInteractedRef.current = true;
    setZoom((z) => Math.max(z - ZOOM_STEP, MIN_ZOOM));
  }, []);

  /**
   * Calculate and apply zoom to fit SVG within container
   * Called after each render to ensure diagram is fully visible
   */
  const applyFitZoom = useCallback(() => {
    if (!svgContainerRef.current || !contentAreaRef.current) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }

    const svgElement = svgContainerRef.current.querySelector('svg');
    if (!svgElement) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }

    // Get container dimensions (minus padding)
    const containerRect = contentAreaRef.current.getBoundingClientRect();
    const padding = 32; // 16px * 2
    const availableWidth = containerRect.width - padding;
    const availableHeight = containerRect.height - padding;

    // Get SVG natural dimensions
    const svgWidth = parseFloat(svgElement.getAttribute('width') || '0') || svgElement.viewBox?.baseVal?.width || svgElement.getBoundingClientRect().width;
    const svgHeight = parseFloat(svgElement.getAttribute('height') || '0') || svgElement.viewBox?.baseVal?.height || svgElement.getBoundingClientRect().height;

    if (!svgWidth || !svgHeight) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }

    // Calculate scale to fit
    const scaleX = availableWidth / svgWidth;
    const scaleY = availableHeight / svgHeight;
    const scale = Math.min(scaleX, scaleY, 1); // Don't zoom beyond 100%

    // Clamp to valid range
    const finalZoom = Math.max(MIN_ZOOM, Math.min(scale, MAX_ZOOM));

    setZoom(finalZoom);
    setPan({ x: 0, y: 0 });
  }, []);

  // Auto-fit zoom after SVG content changes (only if user hasn't interacted)
  useEffect(() => {
    if (!displaySvg) return;
    if (hasUserInteractedRef.current) return; // Respect user interaction

    // Use requestAnimationFrame to ensure DOM is updated
    const frameId = requestAnimationFrame(() => {
      applyFitZoom();
    });

    return () => cancelAnimationFrame(frameId);
  }, [displaySvg, applyFitZoom]);

  // Manual fit button handler - resets user interaction flag
  const handleFit = useCallback(() => {
    hasUserInteractedRef.current = false;
    applyFitZoom();
  }, [applyFitZoom]);

  const handleFullscreenToggle = useCallback(() => {
    setIsFullscreen((f) => !f);
  }, []);

  const handleCodeToggle = useCallback(() => {
    setIsCodeOpen((o) => !o);
  }, []);

  // ============================================================================
  // Drag/Pan Handlers
  // ============================================================================
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only left click and not on interactive elements
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('a, button, [role="button"]')) return;
    
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...pan };
    
    // Prevent text selection during drag
    e.preventDefault();
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;

    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    // Mark as user interacted if actually moved
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      hasUserInteractedRef.current = true;
    }

    setPan({
      x: panStartRef.current.x + dx,
      y: panStartRef.current.y + dy,
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Global mouse up to handle drag release outside container
  useEffect(() => {
    if (!isDragging) return;

    const handleGlobalMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isDragging]);

  // ============================================================================
  // Cleanup
  // ============================================================================
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (streamEndTimerRef.current) clearTimeout(streamEndTimerRef.current);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // ============================================================================
  // Render
  // ============================================================================
  const currentSvg = displaySvg || lastValidSvgRef.current;

  return (
    <div
      ref={containerRef}
      className={`remar-mermaid-wrapper ${isFullscreen ? 'fullscreen' : ''}`}
    >
      {/* Toolbar */}
      <MermaidToolbar
        svgContent={currentSvg}
        mermaidCode={mermaidCode}
        zoom={zoom}
        isFullscreen={isFullscreen}
        isCodeOpen={isCodeOpen}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFit={handleFit}
        onFullscreenToggle={handleFullscreenToggle}
        onCodeToggle={handleCodeToggle}
      />

      {/* Main content area - toggle between diagram and source code */}
      <div 
        ref={contentAreaRef}
        className="remar-mermaid-content"
        onMouseDown={!isCodeOpen ? handleMouseDown : undefined}
        onMouseMove={!isCodeOpen ? handleMouseMove : undefined}
        onMouseUp={!isCodeOpen ? handleMouseUp : undefined}
        onMouseLeave={!isCodeOpen ? handleMouseLeave : undefined}
        style={{ cursor: isCodeOpen ? 'default' : (isDragging ? 'grabbing' : 'grab') }}
      >
        {isCodeOpen ? (
          /* Code View - full-width source code display */
          <MermaidCodePanel
            code={mermaidCode}
            isOpen={true}
            isFullView={true}
          />
        ) : (
          /* SVG Display - full-width diagram display */
          <div
            ref={svgContainerRef}
            className={`remar-mermaid-svg-container ${isPending ? 'updating' : ''} ${isDragging ? 'dragging' : ''}`}
            style={{
              // No journey offset compensation in fullscreen mode, use native centering
              transform: `translate(${pan.x + (isFullscreen ? 0 : journeyOffset.x / zoom)}px, ${pan.y + (isFullscreen ? 0 : journeyOffset.y / zoom)}px) scale(${zoom})`,
              transformOrigin: 'center center',
            }}
            dangerouslySetInnerHTML={{ __html: currentSvg }}
          />
        )}
      </div>

      {/* Loading indicator */}
      {isPending && isStreaming && (
        <div className="remar-mermaid-loading-indicator">
          <span className="remar-mermaid-loading-dot" />
          <span className="remar-mermaid-loading-dot" />
          <span className="remar-mermaid-loading-dot" />
        </div>
      )}
    </div>
  );
};

export default MermaidRenderer;
