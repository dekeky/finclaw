import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Finclaw ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return <>{this.props.fallback}</>;
      return (
        <div style={styles.container}>
          <div style={styles.icon}>⚠️</div>
          <div style={styles.title}>Something went wrong</div>
          <div style={styles.message}>{this.state.error?.message || 'Unknown error'}</div>
          <button style={styles.button} onClick={this.handleReset}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
    gap: 16,
  },
  icon: { fontSize: 40 },
  title: { fontSize: 20, fontWeight: 500, color: '#f0f0f2' },
  message: { fontSize: 13, color: '#8a8a8e', fontFamily: 'JetBrains Mono, monospace', textAlign: 'center', maxWidth: 400 },
  button: {
    marginTop: 8,
    padding: '10px 24px',
    background: 'rgba(201,168,76,0.1)',
    border: '1px solid rgba(201,168,76,0.3)',
    borderRadius: 8,
    color: '#c9a84c',
    fontSize: 14,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
};
