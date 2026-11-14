import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// Si algo falla, muestra el error en vez de dejar la pantalla congelada o en blanco
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('[Pizarra] Error:', error, info?.componentStack); }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div style={{ padding: 24, color: '#e8efec', fontFamily: 'system-ui', maxWidth: 760, margin: '40px auto' }}>
        <h2 style={{ marginTop: 0 }}>La pizarra encontró un error</h2>
        <p>Copiá este texto y pasáselo a Claude para corregirlo:</p>
        <pre style={{ whiteSpace: 'pre-wrap', background: '#111816', border: '1px solid #2c3a36', borderRadius: 8, padding: 12, fontSize: 12 }}>
          {String(error?.stack || error)}
        </pre>
        <button onClick={() => this.setState({ error: null })}>Volver a la pizarra</button>{' '}
        <button onClick={() => { try { localStorage.removeItem('pcf-pizarra-v1'); } catch {} location.reload(); }}>
          Empezar de cero (borra las jugadas guardadas)
        </button>
      </div>
    );
  }
}

createRoot(document.getElementById('root')).render(
  <ErrorBoundary><App /></ErrorBoundary>
);
