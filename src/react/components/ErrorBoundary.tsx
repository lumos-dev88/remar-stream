import React, { Component, type ErrorInfo, type ReactNode } from 'react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Fallback UI to render when an error is caught */
  fallback?: ReactNode;
  /** Optional error renderer — receives the error object */
  renderError?: (error: Error) => ReactNode;
  /** Optional callback when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Component name for logging */
  name?: string;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary — Catches rendering errors in child components and displays a fallback.
 *
 * Usage:
 *   <ErrorBoundary fallback={<pre>Failed to render</pre>}>
 *     <SomeComponent />
 *   </ErrorBoundary>
 *
 *   <ErrorBoundary renderError={(err) => <p>Error: {err.message}</p>}>
 *     <SomeComponent />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const { onError, name } = this.props;
    if (onError) {
      onError(error, errorInfo);
    } else {
      console.error(`[Remar ErrorBoundary${name ? ` (${name})` : ''}]`, error, errorInfo);
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.renderError && this.state.error) {
        return this.props.renderError(this.state.error);
      }
      if (this.props.fallback) {
        return this.props.fallback;
      }
      // Default fallback: minimal, non-disruptive
      return null;
    }
    return this.props.children;
  }
}
