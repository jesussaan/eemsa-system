import { useState, useEffect, useCallback } from "react";
import { registrarConfirmador } from "../lib/confirm";
import { IcoFal } from "./Icons";

// Reemplaza los window.confirm() nativos por un dialogo con el estilo de
// la app -- se monta una sola vez (ver App.js) y cualquier componente lo
// usa llamando `await confirmar(mensaje)` en vez del confirm() del navegador.
export default function ConfirmModal() {
  const [estado, setEstado] = useState(null);

  const pedirConfirmacion = useCallback((mensaje, opciones = {}) => {
    return new Promise(resolve => {
      setEstado({
        mensaje,
        textoConfirmar: opciones.textoConfirmar || "Eliminar",
        textoCancelar: opciones.textoCancelar || "Cancelar",
        peligro: opciones.peligro !== false,
        resolve,
      });
    });
  }, []);

  useEffect(() => { registrarConfirmador(pedirConfirmacion); }, [pedirConfirmacion]);

  if (!estado) return null;

  const cerrar = (resultado) => { estado.resolve(resultado); setEstado(null); };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={() => cerrar(false)}
    >
      <div
        className="confirm-modal-card"
        style={{ background: "var(--card)", border: "1px solid var(--border-light)", borderRadius: "var(--r-lg)", padding: 22, width: "100%", maxWidth: 340, boxShadow: "var(--shadow-lg)" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 20 }}>
          <span style={{ display: "inline-flex", fontSize: 22, color: estado.peligro ? "var(--red)" : "var(--accent)", flexShrink: 0, marginTop: 1 }}>
            <IcoFal />
          </span>
          <p style={{ color: "var(--text)", fontSize: 14, lineHeight: 1.5, margin: 0 }}>{estado.mensaje}</p>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn btn-ghost btn-sm" onClick={() => cerrar(false)}>{estado.textoCancelar}</button>
          <button className={`btn btn-sm ${estado.peligro ? "btn-danger" : "btn-primary"}`} onClick={() => cerrar(true)}>{estado.textoConfirmar}</button>
        </div>
      </div>
    </div>
  );
}
