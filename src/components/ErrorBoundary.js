import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Error capturado por ErrorBoundary:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0d0e12", color: "#e0e0e0", padding: 24, textAlign: "center", fontFamily: "sans-serif" }}>
          <div>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <h2 style={{ color: "#c9922a", marginBottom: 8 }}>Ocurrió un error inesperado</h2>
            <p style={{ color: "#aaa", marginBottom: 20 }}>Algo falló en esta pantalla. No se perdió ningún dato — solo recarga la app.</p>
            <button onClick={() => window.location.reload()}
              style={{ background: "#c9922a", color: "#1a1d26", border: "none", borderRadius: 8, padding: "10px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              Recargar app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
