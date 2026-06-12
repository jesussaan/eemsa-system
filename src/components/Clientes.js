import { useState } from "react";
import { today } from '../lib/utils';
import { STATUS_PED, META_MERMA_PCT } from '../lib/constants';
import { supabase } from '../lib/supabase';

const PORTAL_BASE_URL = "https://eemsa-system.vercel.app";

const generarTokenPortal = (nombre) => {
  const slug = (nombre || "")
    .trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const rand = Math.random().toString(36).slice(2, 8);
  return `${slug}-${rand}`;
};

export default function Clientes({ pedidos, ocultarMerma }) {
  const [clienteSel, setClienteSel] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroTab, setFiltroTab] = useState("todos");
  const [orden, setOrden] = useState("recientes");
  const [toast, setToast] = useState("");
  const [copiando, setCopiando] = useState(null);

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  const copiarLinkPortal = async (nombre) => {
    setCopiando(nombre);
    try {
      const { data: existente } = await supabase.from("clientes").select("portal_token").eq("nombre", nombre).maybeSingle();
      let token = existente?.portal_token;
      if (!token) {
        token = generarTokenPortal(nombre);
        const { error } = await supabase.from("clientes").upsert({ nombre, portal_token: token }, { onConflict: "nombre" });
        if (error) { showToast("❌ Error: " + error.message); setCopiando(null); return; }
      }
      await navigator.clipboard.writeText(`${PORTAL_BASE_URL}/cliente/${token}`);
      showToast("🔗 Link del portal copiado");
    } catch (err) {
      showToast("❌ No se pudo copiar el link");
    }
    setCopiando(null);
  };

  const clientes = Object.values(pedidos.reduce((acc, p) => {
    const key = (p.cliente || "").trim();
    if (!key) return acc;
    if (!acc[key]) acc[key] = { nombre: key, pedidos: [] };
    acc[key].pedidos.push(p);
    return acc;
  }, {})).map(c => {
    const sorted = [...c.pedidos].sort((a, b) => (a.fecha_solicitud || "").localeCompare(b.fecha_solicitud || ""));
    const ultimaFecha = sorted[sorted.length - 1]?.fecha_solicitud;
    const diasDesdeUltimo = ultimaFecha ? Math.floor((new Date(today() + "T12:00:00") - new Date(ultimaFecha + "T12:00:00")) / 86400000) : null;
    let frecuencia = null;
    if (sorted.length >= 2) {
      const diffs = [];
      for (let i = 1; i < sorted.length; i++) {
        const d1 = new Date(sorted[i - 1].fecha_solicitud + "T12:00:00");
        const d2 = new Date(sorted[i].fecha_solicitud + "T12:00:00");
        diffs.push((d2 - d1) / 86400000);
      }
      frecuencia = Math.round(diffs.reduce((s, d) => s + d, 0) / diffs.length);
    }
    const cajasTotal = c.pedidos.reduce((s, p) => s + Number(p.cajas || 0), 0);
    const cajasSolicita = c.pedidos.length > 0 ? (cajasTotal / c.pedidos.length).toFixed(1) : null;
    const pedConMerma = c.pedidos.filter(p => p.status === "terminado" && p.merma_pct !== null && p.merma_pct !== "");
    const mermaPromedio = pedConMerma.length > 0 ? (pedConMerma.reduce((s, p) => s + Number(p.merma_pct), 0) / pedConMerma.length).toFixed(1) : null;
    const color = diasDesdeUltimo === null ? "#666" : diasDesdeUltimo < 30 ? "#4be87a" : diasDesdeUltimo <= 60 ? "#ff9900" : "#ff4d4d";
    return { ...c, cajasTotal, cajasSolicita, ultimaFecha, diasDesdeUltimo, frecuencia, mermaPromedio, color, sorted };
  }).sort((a, b) => (a.diasDesdeUltimo ?? 9999) - (b.diasDesdeUltimo ?? 9999));

  const porTab = {
    todos: clientes,
    activo: clientes.filter(c => c.diasDesdeUltimo !== null && c.diasDesdeUltimo < 30),
    medio: clientes.filter(c => c.diasDesdeUltimo !== null && c.diasDesdeUltimo >= 30 && c.diasDesdeUltimo <= 60),
    perdido: clientes.filter(c => c.diasDesdeUltimo !== null && c.diasDesdeUltimo > 60),
  };
  const filtrados = (porTab[filtroTab] || clientes)
    .filter(c => !busqueda || c.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    .sort((a, b) => {
      if (orden === "alfabetico") return a.nombre.localeCompare(b.nombre);
      if (orden === "mas_dias") return (b.diasDesdeUltimo ?? -1) - (a.diasDesdeUltimo ?? -1);
      if (orden === "menos_dias") return (a.diasDesdeUltimo ?? 9999) - (b.diasDesdeUltimo ?? 9999);
      return (a.diasDesdeUltimo ?? 9999) - (b.diasDesdeUltimo ?? 9999);
    });
  const seleccionado = clientes.find(c => c.nombre === clienteSel) || null;

  return (
    <div>
      <h2 className="sec-title">👥 Clientes</h2>
      <div className="stat-grid">
        <div className="stat-card accent"><div className="stat-val">{clientes.length}</div><div className="stat-lbl">Clientes únicos</div></div>
        <div className="stat-card green"><div className="stat-val">{clientes.filter(c => c.diasDesdeUltimo !== null && c.diasDesdeUltimo < 30).length}</div><div className="stat-lbl">Activos &lt;30 días</div></div>
        <div className="stat-card orange"><div className="stat-val">{clientes.filter(c => c.diasDesdeUltimo !== null && c.diasDesdeUltimo >= 30 && c.diasDesdeUltimo <= 60).length}</div><div className="stat-lbl">30–60 días</div></div>
        <div className="stat-card red"><div className="stat-val">{clientes.filter(c => c.diasDesdeUltimo !== null && c.diasDesdeUltimo > 60).length}</div><div className="stat-lbl">Sin pedir &gt;60 días</div></div>
      </div>
      <div style={{ display: "flex", gap: 6, margin: "10px 0 8px", flexWrap: "wrap" }}>
        {[
          { key: "todos",   lbl: "Todos",           color: null,      count: clientes.length },
          { key: "activo",  lbl: "Activo <30 días", color: "#4be87a", count: porTab.activo.length },
          { key: "medio",   lbl: "30–60 días",       color: "#ff9900", count: porTab.medio.length },
          { key: "perdido", lbl: "+60 días",          color: "#ff4d4d", count: porTab.perdido.length },
        ].map(t => (
          <button key={t.key} onClick={() => setFiltroTab(t.key)} style={{
            padding: "6px 12px", borderRadius: 20, border: `2px solid ${filtroTab === t.key ? (t.color || "#c9922a") : "#2a2d3a"}`,
            background: filtroTab === t.key ? (t.color ? t.color + "22" : "#c9922a22") : "transparent",
            color: filtroTab === t.key ? (t.color || "#c9922a") : "#888",
            fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
          }}>
            {t.lbl}
            <span style={{ background: filtroTab === t.key ? (t.color || "#c9922a") : "#2a2d3a", color: filtroTab === t.key ? "#000" : "#aaa", borderRadius: 20, padding: "1px 6px", fontSize: 11 }}>{t.count}</span>
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, margin: "4px 0 8px" }}>
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="🔍 Buscar cliente…" style={{ flex: 1, background: "#1a1d26", border: "1px solid #2a2d3a", borderRadius: 8, padding: "8px 12px", color: "#e0e0e0", fontSize: 13 }} />
        <select value={orden} onChange={e => setOrden(e.target.value)} style={{ background: "#1a1d26", border: "1px solid #2a2d3a", borderRadius: 8, padding: "8px 12px", color: "#e0e0e0", fontSize: 13 }}>
          <option value="recientes">Más recientes primero</option>
          <option value="alfabetico">Alfabético (A-Z)</option>
          <option value="mas_dias">Más días sin pedir</option>
          <option value="menos_dias">Menos días sin pedir</option>
        </select>
      </div>
      <div className="list">
        {filtrados.map(c => (
          <div key={c.nombre} className="list-item" style={{ borderLeft: `3px solid ${c.color}`, cursor: "pointer" }} onClick={() => setClienteSel(c.nombre)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: 15 }}>{c.nombre}</strong>
              <span style={{ fontSize: 11, color: c.color, fontWeight: 700 }}>{c.diasDesdeUltimo !== null ? `hace ${c.diasDesdeUltimo}d` : "—"}</span>
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 4, flexWrap: "wrap" }}>
              <span className="muted">📋 {c.pedidos.length} pedidos</span>
              <span className="muted">📦 {c.cajasTotal} cajas</span>
              {c.cajasSolicita !== null && <span className="muted">📦 Cajas que solicita: {c.cajasSolicita}</span>}
              {c.frecuencia !== null && <span className="muted">🔄 Cada {c.frecuencia}d</span>}
              {!ocultarMerma && c.mermaPromedio !== null && <span className="muted" style={{ color: Number(c.mermaPromedio) > META_MERMA_PCT ? "#ff4d4d" : "#4be87a" }}>🗑 Merma: {c.mermaPromedio}%</span>}
            </div>
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 8 }}
              disabled={copiando === c.nombre}
              onClick={(e) => { e.stopPropagation(); copiarLinkPortal(c.nombre); }}
            >
              {copiando === c.nombre ? "Copiando…" : "🔗 Copiar link del portal"}
            </button>
          </div>
        ))}
      </div>
      {seleccionado && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: "#14171f", borderRadius: "16px 16px 0 0", padding: 20, width: "100%", maxWidth: 600, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <h3 style={{ margin: 0, color: "#c9922a" }}>👥 {seleccionado.nombre}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setClienteSel(null)}>✕</button>
            </div>
            <div className="stat-grid" style={{ marginBottom: 12 }}>
              <div className="stat-card accent"><div className="stat-val">{seleccionado.pedidos.length}</div><div className="stat-lbl">Pedidos</div></div>
              <div className="stat-card blue"><div className="stat-val">{seleccionado.cajasTotal}</div><div className="stat-lbl">Cajas total</div></div>
              {seleccionado.cajasSolicita !== null && <div className="stat-card blue"><div className="stat-val">{seleccionado.cajasSolicita}</div><div className="stat-lbl">Cajas que solicita</div></div>}
              {seleccionado.frecuencia !== null && <div className="stat-card orange"><div className="stat-val">{seleccionado.frecuencia}d</div><div className="stat-lbl">Frecuencia prom.</div></div>}
              {!ocultarMerma && seleccionado.mermaPromedio !== null && <div className={`stat-card ${Number(seleccionado.mermaPromedio) > META_MERMA_PCT ? "red" : "green"}`}><div className="stat-val">{seleccionado.mermaPromedio}%</div><div className="stat-lbl">Merma prom.</div></div>}
            </div>
            {(() => {
              const medidaCounts = seleccionado.pedidos.reduce((acc, p) => { if (p.medida) { acc[p.medida] = (acc[p.medida] || 0) + 1; } return acc; }, {});
              const topMedidas = Object.entries(medidaCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
              const pedConTiempo = seleccionado.pedidos.filter(p => p.status === "terminado" && p.fecha_inicio && p.fecha_termino);
              const tiempoProm = pedConTiempo.length > 0 ? Math.round(pedConTiempo.reduce((s, p) => s + (new Date(p.fecha_termino + "T12:00:00") - new Date(p.fecha_inicio + "T12:00:00")) / 86400000 + 1, 0) / pedConTiempo.length) : null;
              return (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                  {topMedidas.map(([med, cnt]) => (
                    <div key={med} style={{ background: "#1a2744", borderRadius: 8, padding: "4px 10px", fontSize: 12, color: "#c9922a", fontWeight: 600 }}>{med} <span style={{ color: "#666" }}>×{cnt}</span></div>
                  ))}
                  {tiempoProm !== null && <div style={{ background: "#1a2613", borderRadius: 8, padding: "4px 10px", fontSize: 12, color: "#4be87a", fontWeight: 600 }}>⏱ {tiempoProm}d promedio</div>}
                </div>
              );
            })()}
            <h4 style={{ color: "#aaa", fontSize: 12, marginBottom: 8 }}>Historial de pedidos</h4>
            <div className="list">
              {seleccionado.sorted.slice().reverse().map(p => (
                <div key={p.id} className="list-item" style={{ borderLeft: `3px solid ${p.status === "terminado" ? "#4be87a" : p.status === "proceso" ? "#4a9eff" : "#ff9900"}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <strong>Ped. {p.num}</strong>
                    <span className={`badge ${p.status === "terminado" ? "b-green" : p.status === "proceso" ? "b-blue" : "b-orange"}`}>{STATUS_PED[p.status] || p.status}</span>
                  </div>
                  <div className="muted">{p.fecha_solicitud} · {p.tipo} · {p.medida} · {p.cajas} cajas</div>
                  {p.fecha_estimada && p.status !== "terminado" && <div className="muted" style={{ color: "#e8b84b" }}>📅 Entrega est.: {p.fecha_estimada}</div>}
                  {!ocultarMerma && p.merma_pct && <div className="muted">Merma: {p.merma_pct}%</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
