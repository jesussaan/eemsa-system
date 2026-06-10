import { useState } from "react";
import { supabase } from "../lib/supabase";
import { today } from "../lib/utils";

export default function ModoEmilio({ pedidos, setPedidos, onSalir }) {
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(null);
  const showToast = msg => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  const pendientes = pedidos
    .filter(p => p.status === "pendiente")
    .sort((a, b) => (a.fecha_solicitud || "").localeCompare(b.fecha_solicitud || ""));

  const darDeAlta = async (id) => {
    setLoading(id);
    const update = { status: "terminado", fecha_termino: today() };
    const { error } = await supabase.from("pedidos").update(update).eq("id", id);
    if (error) { showToast("❌ Error: " + error.message); setLoading(null); return; }
    setPedidos(ps => ps.map(p => p.id === id ? { ...p, ...update } : p));
    showToast("✓ Pedido dado de alta");
    setLoading(null);
  };

  const card = { background: "#1a1d26", borderRadius: 12, padding: 16, marginBottom: 12, borderLeft: "4px solid #ff4d4d" };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#0d0f14" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "#11131a", borderBottom: "1px solid #1e2130", position: "sticky", top: 0, zIndex: 10 }}>
        <img src="/logo192.png" alt="EEMSA" style={{ height: 36, width: "auto" }} />
        <div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 16, color: "#e0e0e0", letterSpacing: ".06em" }}>EEMSA System</div>
          <div style={{ fontSize: 10, color: "#c9922a", fontWeight: 700, letterSpacing: ".08em" }}>MÓDULO EMILIO</div>
        </div>
        <button onClick={onSalir} style={{ marginLeft: "auto", fontSize: 11, color: "#666", background: "transparent", border: "none", cursor: "pointer", padding: "4px 8px" }}>← Salir</button>
      </header>

      <main style={{ flex: 1, padding: "16px 16px 32px", maxWidth: 640, margin: "0 auto", width: "100%" }}>
        <h2 style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 22, fontWeight: 800, color: "#ff4d4d", letterSpacing: ".06em", margin: "0 0 14px" }}>🔔 Falta dar de alta</h2>

        {pendientes.length === 0 && (
          <div style={{ textAlign: "center", padding: "32px 0", color: "#444", fontSize: 13 }}>
            No hay pedidos pendientes de dar de alta.
          </div>
        )}

        {pendientes.map(p => (
          <div key={p.id} style={card}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 4 }}>{p.cliente}</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 13, marginBottom: 10 }}>
              <span style={{ color: "#c9922a", fontWeight: 700 }}>📏 {p.medida}</span>
              <span style={{ color: "#aaa" }}>🎨 {p.tipo}</span>
              <span style={{ color: "#aaa" }}>📦 {p.cajas} cajas</span>
              <span style={{ color: "#555" }}>#Ped {p.num}</span>
            </div>
            {p.fecha_solicitud && <div style={{ fontSize: 11, color: "#555", marginBottom: 10 }}>Solicitud: {p.fecha_solicitud}</div>}
            <button
              onClick={() => darDeAlta(p.id)}
              disabled={loading === p.id}
              style={{ width: "100%", padding: "12px 0", borderRadius: 10, border: "none", background: loading === p.id ? "#2a2d3a" : "#4be87a", color: "#000", fontSize: 14, fontWeight: 800, cursor: loading === p.id ? "default" : "pointer" }}>
              {loading === p.id ? "Guardando…" : "✓ Ya lo di de alta"}
            </button>
          </div>
        ))}
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
