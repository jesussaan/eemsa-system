import { useState, useEffect } from "react";
import { authHeaders } from "../lib/auth";

const MODOS = [
  { id: "operador", label: "Operador" },
  { id: "ventas", label: "Ventas" },
  { id: "emilio", label: "Emilio" },
  { id: "rebobinado", label: "Rebobinado" },
  { id: "supervisor", label: "Supervisor" },
  { id: "cotizador", label: "Cotizador" },
];

export default function AdminUsuarios({ onSalir }) {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(null);
  const [toast, setToast] = useState("");
  const showToast = t => { setToast(t); setTimeout(() => setToast(""), 2200); };

  const cargar = async () => {
    setLoading(true);
    const res = await fetch("/api/usuarios", { headers: authHeaders() });
    const data = await res.json();
    if (res.ok) setUsuarios(data);
    else showToast("❌ Error al cargar usuarios: " + (data.error || ""));
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargar(); }, []);

  const actualizar = async (id, cambios) => {
    setGuardando(id);
    setUsuarios(us => us.map(u => u.id === id ? { ...u, ...cambios } : u));
    const res = await fetch("/api/usuarios", { method: "PUT", headers: authHeaders(), body: JSON.stringify({ id, ...cambios }) });
    if (!res.ok) { showToast("❌ No se pudo guardar"); cargar(); }
    setGuardando(null);
  };

  const toggleModo = (u, modo) => {
    const modos = u.modos.includes(modo) ? u.modos.filter(m => m !== modo) : [...u.modos, modo];
    actualizar(u.id, { modos });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg)" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "var(--surface)", borderBottom: "2px solid var(--accent)", position: "sticky", top: 0, zIndex: 10 }}>
        <img src="/logo192.png" alt="EEMSA" style={{ height: 36, width: "auto" }} />
        <div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 16, color: "#e0e0e0", letterSpacing: ".06em" }}>EEMSA System</div>
          <div style={{ fontSize: 10, color: "var(--accent)", fontWeight: 700, letterSpacing: ".08em" }}>USUARIOS</div>
        </div>
        <button onClick={onSalir} style={{ marginLeft: "auto", fontSize: 11, color: "#666", background: "transparent", border: "none", cursor: "pointer", padding: "4px 8px" }}>← Salir</button>
      </header>

      <main style={{ flex: 1, padding: "16px 16px 82px", maxWidth: 640, margin: "0 auto", width: "100%" }}>
        <h2 className="sec-title">Usuarios</h2>
        <p className="muted" style={{ marginBottom: 16 }}>Marca a qué módulos tiene acceso cada cuenta. Sin ningún módulo marcado, esa persona solo ve la pantalla de "cuenta pendiente".</p>

        {loading ? <p className="empty">Cargando…</p> : usuarios.length === 0 ? <p className="empty">Sin usuarios registrados todavía.</p> : usuarios.map(u => (
          <div key={u.id} className="list-item" style={{ marginBottom: 10, opacity: guardando === u.id ? 0.6 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <strong>{u.email}</strong>
                {u.es_admin && <span className="badge b-orange" style={{ marginLeft: 8 }}>Admin</span>}
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                <input type="checkbox" checked={!!u.activo} onChange={e => actualizar(u.id, { activo: e.target.checked })} />
                <span className={`badge ${u.activo ? "b-green" : "b-orange"}`}>{u.activo ? "Activo" : "Pendiente"}</span>
              </label>
            </div>
            <div className="muted" style={{ marginBottom: 8 }}>Registrado: {(u.created_at || "").slice(0, 10)}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {MODOS.map(m => (
                <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={u.modos.includes(m.id)} onChange={() => toggleModo(u, m.id)} />
                  {m.label}
                </label>
              ))}
            </div>
          </div>
        ))}

        {toast && <div className="toast">{toast}</div>}
      </main>
    </div>
  );
}
