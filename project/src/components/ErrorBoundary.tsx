import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center px-6">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 bg-accent-100 dark:bg-accent-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-2xl font-serif text-accent-600 dark:text-accent-400">!</span>
            </div>
            <h2 className="font-serif text-2xl font-semibold mb-3">Something went wrong</h2>
            <p className="text-sm text-ink-500 mb-6 leading-relaxed">
              An unexpected error occurred. Please try refreshing the page.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="btn-primary text-sm"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
