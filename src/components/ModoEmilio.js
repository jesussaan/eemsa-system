import { useState } from "react";
import ClicheImg from './ClicheImg';
import { supabase } from "../lib/supabase";
import { today, diasHabiles } from "../lib/utils";

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
  const miniCard = { background: "#0d0f14", borderRadius: 8, padding: "8px 12px" };
  const miniLbl = { fontSize: 10, color: "#666", marginBottom: 2, textTransform: "uppercase", letterSpacing: ".05em" };

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
              {(p.color || p.tinta_tipo) && <span style={{ color: "#aaa" }}>🖌 Tinta: {p.color || p.tinta_tipo}</span>}
              <span style={{ color: "#aaa" }}>📦 {p.cajas} cajas</span>
              <span style={{ color: "#555" }}>#Ped {p.num}</span>
            </div>
            {p.fecha_solicitud && <div style={{ fontSize: 11, color: "#555", marginBottom: 10 }}>Solicitud: {p.fecha_solicitud}</div>}

            {/* Datos anotados por el operador */}
            <div style={{ background: "#0d0f14", borderRadius: 10, padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "#c9922a", fontWeight: 700, letterSpacing: ".06em", marginBottom: 8, textTransform: "uppercase" }}>👷 Lo que anotó el operador</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {p.piezas_prod != null && p.piezas_prod !== "" && <div style={miniCard}><div style={miniLbl}>Piezas producidas</div><div style={{ color: "#4be87a", fontWeight: 700, fontSize: 16 }}>{p.piezas_prod}</div></div>}
                {p.merma != null && p.merma !== "" && <div style={miniCard}><div style={miniLbl}>Merma (piezas)</div><div style={{ color: "#e0e0e0", fontSize: 16 }}>{p.merma}</div></div>}
                {p.merma_pct != null && p.merma_pct !== "" && <div style={miniCard}><div style={miniLbl}>% Merma</div><div style={{ color: Number(p.merma_pct) > 3 ? "#ff4d4d" : "#4be87a", fontWeight: 700, fontSize: 16 }}>{p.merma_pct}%</div></div>}
                {p.rollos_usados != null && p.rollos_usados !== "" && <div style={miniCard}><div style={miniLbl}>Rollos usados</div><div style={{ color: "#e0e0e0", fontSize: 16 }}>{p.rollos_usados}</div></div>}
                {p.tinta_kg != null && p.tinta_kg !== "" && <div style={miniCard}><div style={miniLbl}>Tinta usada</div><div style={{ color: "#e0e0e0", fontSize: 16 }}>{p.tinta_kg} kg</div></div>}
                {p.alcohol_litros != null && p.alcohol_litros !== "" && <div style={miniCard}><div style={miniLbl}>Alcohol usado</div><div style={{ color: "#e0e0e0", fontSize: 16 }}>{p.alcohol_litros} L</div></div>}
                {p.fecha_inicio && <div style={miniCard}><div style={miniLbl}>Fecha inicio</div><div style={{ color: "#e0e0e0", fontSize: 14 }}>{p.fecha_inicio}</div></div>}
                {p.fecha_termino && <div style={miniCard}><div style={miniLbl}>Fecha término</div><div style={{ color: "#e0e0e0", fontSize: 14 }}>{p.fecha_termino}</div></div>}
                {p.fecha_inicio && p.fecha_termino && <div style={miniCard}><div style={miniLbl}>Días hábiles producción</div><div style={{ color: "#c9922a", fontWeight: 700, fontSize: 16 }}>{diasHabiles(p.fecha_inicio, p.fecha_termino)}</div></div>}
              </div>
              {p.notas && <div style={{ fontSize: 12, color: "#aaa", marginTop: 8 }}>📝 {p.notas}</div>}
              {p.foto_producto_url && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>📷 Foto del producto</div>
                  <ClicheImg src={p.foto_producto_url} style={{ width: "100%", maxWidth: 300, borderRadius: 8, border: "1px solid #2a2d3a" }} />
                </div>
              )}
            </div>

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
