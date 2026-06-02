import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) this.props.onReset();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="ereader" dir="rtl" lang="ar">
          <div className="ereader-error">
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem', opacity: 0.5 }}>⚠️</div>
            <h2 style={{ marginBottom: '0.5rem', fontSize: '1.1rem' }}>حدث خطأ غير متوقع</h2>
            <p style={{ color: '#888', fontSize: '0.85rem', marginBottom: '1.5rem', maxWidth: '300px', lineHeight: 1.6 }}>
              لا تقلق — بياناتك محفوظة. يمكنك المحاولة مرة أخرى أو العودة للمكتبة.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button onClick={this.handleReset} style={{ padding: '0.5rem 1.5rem', borderRadius: '8px', border: '1px solid #444', background: 'transparent', color: '#ccc', cursor: 'pointer', fontSize: '0.9rem' }}>
                إعادة المحاولة
              </button>
              {this.props.onBack && (
                <button onClick={this.props.onBack} style={{ padding: '0.5rem 1.5rem', borderRadius: '8px', border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: '0.9rem' }}>
                  العودة للمكتبة
                </button>
              )}
            </div>
            <details style={{ marginTop: '1.5rem', fontSize: '0.7rem', color: '#666', maxWidth: '300px', textAlign: 'left' }}>
              <summary style={{ cursor: 'pointer' }}>تفاصيل الخطأ</summary>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginTop: '0.5rem' }}>
                {this.state.error?.message || 'Unknown error'}
              </pre>
            </details>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
