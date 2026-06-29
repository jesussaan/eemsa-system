import { useState } from "react";
import { today } from '../lib/utils';
import { STATUS_PED, META_MERMA_PCT } from '../lib/constants';
import { supabase } from '../lib/supabase';

const PORTAL_BASE_URL = "https://eemsa-system.vercel.app";

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
      const { data: token, error } = await supabase.rpc("get_or_create_portal_token", { p_nombre: nombre });
      if (error || !token) { showToast("❌ Error: " + (error?.message || "sin token")); setCopiando(null); return; }
      await navigator.clipboard.writeText(`${PORTAL_BASE_URL}/cliente/${token}`);
      showToast("🔗 Link del portal copiado");
    } catch {
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
    const diasDesdeUltimo = ultimaFecha
      ? Math.floor((new Date(today() + "T12:00:00") - new Date(ultimaFecha + "T12:00:00")) / 86400000)
      : null;

    let frecuencia = null;
    if (sorted.length >= 2) {
      const diffs = [];
      for (let i = 1; i < sorted.length; i++) {
        diffs.push((new Date(sorted[i].fecha_solicitud + "T12:00:00") - new Date(sorted[i - 1].fecha_solicitud + "T12:00:00")) / 86400000);
      }
      frecuencia = Math.round(diffs.reduce((s, d) => s + d, 0) / diffs.length);
    }

    // Próximo pedido estimado
    let proximoEst = null;
    if (frecuencia && ultimaFecha) {
      const d = new Date(ultimaFecha + "T12:00:00");
      d.setDate(d.getDate() + frecuencia);
      proximoEst = d;
    }
    const diasParaProximo = proximoEst
      ? Math.ceil((proximoEst - new Date(today() + "T12:00:00")) / 86400000)
      : null;

    const cajasTotal    = c.pedidos.reduce((s, p) => s + Number(p.cajas || 0), 0);
    const cajasSolicita = c.pedidos.length > 0 ? (cajasTotal / c.pedidos.length).toFixed(1) : null;

    // Pedidos activos (anotado o en proceso)
    const pedidosActivos = c.pedidos.filter(p => p.status === "proceso" || p.status === "anotado");
    const cajasActivas   = pedidosActivos.reduce((s, p) => s + Number(p.cajas || 0), 0);

    const pedConMerma   = c.pedidos.filter(p => p.status === "terminado" && p.merma_pct !== null && p.merma_pct !== "");
    const mermaPromedio = pedConMerma.length > 0
      ? (pedConMerma.reduce((s, p) => s + Number(p.merma_pct), 0) / pedConMerma.length).toFixed(1)
      : null;

    const pedConTiempo = c.pedidos.filter(p => p.status === "terminado" && p.fecha_inicio && p.fecha_termino);
    const tiempoProm   = pedConTiempo.length > 0
      ? Math.round(pedConTiempo.reduce((s, p) => s + (new Date(p.fecha_termino + "T12:00:00") - new Date(p.fecha_inicio + "T12:00:00")) / 86400000 + 1, 0) / pedConTiempo.length)
      : null;

    const medidaCounts = c.pedidos.reduce((acc, p) => { if (p.medida) acc[p.medida] = (acc[p.medida] || 0) + 1; return acc; }, {});
    const topMedidas   = Object.entries(medidaCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);

    const color = diasDesdeUltimo === null ? "#666" : diasDesdeUltimo < 30 ? "#4be87a" : diasDesdeUltimo <= 60 ? "#ff9900" : "#ff4d4d";

    return { ...c, cajasTotal, cajasSolicita, cajasActivas, pedidosActivos, ultimaFecha, diasDesdeUltimo, frecuencia, proximoEst, diasParaProximo, mermaPromedio, tiempoProm, topMedidas, color, sorted };
  }).sort((a, b) => (a.diasDesdeUltimo ?? 9999) - (b.diasDesdeUltimo ?? 9999));

  const porTab = {
    todos:   clientes,
    activo:  clientes.filter(c => c.diasDesdeUltimo !== null && c.diasDesdeUltimo < 30),
    medio:   clientes.filter(c => c.diasDesdeUltimo !== null && c.diasDesdeUltimo >= 30 && c.diasDesdeUltimo <= 60),
    perdido: clientes.filter(c => c.diasDesdeUltimo !== null && c.diasDesdeUltimo > 60),
  };

  const filtrados = (porTab[filtroTab] || clientes)
    .filter(c => !busqueda || c.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    .sort((a, b) => {
      if (orden === "alfabetico")  return a.nombre.localeCompare(b.nombre);
      if (orden === "mas_cajas")   return b.cajasTotal - a.cajasTotal;
      if (orden === "mas_pedidos") return b.pedidos.length - a.pedidos.length;
      return (a.diasDesdeUltimo ?? 9999) - (b.diasDesdeUltimo ?? 9999);
    });

  const seleccionado = clientes.find(c => c.nombre === clienteSel) || null;

  const totalCajasActivas = clientes.reduce((s, c) => s + c.cajasActivas, 0);

  return (
    <div>
      <h2 className="sec-title">👥 Clientes</h2>

      {/* Stats globales */}
      <div className="stat-grid">
        <div className="stat-card accent"><div className="stat-val">{clientes.length}</div><div className="stat-lbl">Clientes únicos</div></div>
        <div className="stat-card green"><div className="stat-val">{clientes.filter(c => c.diasDesdeUltimo !== null && c.diasDesdeUltimo < 30).length}</div><div className="stat-lbl">Activos &lt;30 días</div></div>
        <div className="stat-card blue"><div className="stat-val">{totalCajasActivas}</div><div className="stat-lbl">Cajas en producción</div></div>
        <div className="stat-card red"><div className="stat-val">{clientes.filter(c => c.diasDesdeUltimo !== null && c.diasDesdeUltimo > 60).length}</div><div className="stat-lbl">Sin pedir &gt;60 días</div></div>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 6, margin: "10px 0 8px", flexWrap: "wrap" }}>
        {[
          { key: "todos",   lbl: "Todos",           color: null,      count: clientes.length },
          { key: "activo",  lbl: "Activo <30d",     color: "#4be87a", count: porTab.activo.length },
          { key: "medio",   lbl: "30–60 días",       color: "#ff9900", count: porTab.medio.length },
          { key: "perdido", lbl: "+60 días",          color: "#ff4d4d", count: porTab.perdido.length },
        ].map(t => (
          <button key={t.key} onClick={() => setFiltroTab(t.key)} style={{
            padding: "6px 12px", borderRadius: 20,
            border: `2px solid ${filtroTab === t.key ? (t.color || "#c9922a") : "#2a2d3a"}`,
            background: filtroTab === t.key ? (t.color ? t.color + "22" : "#c9922a22") : "transparent",
            color: filtroTab === t.key ? (t.color || "#c9922a") : "#888",
            fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
          }}>
            {t.lbl}
            <span style={{ background: filtroTab === t.key ? (t.color || "#c9922a") : "#2a2d3a", color: filtroTab === t.key ? "#000" : "#aaa", borderRadius: 20, padding: "1px 6px", fontSize: 11 }}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* Búsqueda + orden */}
      <div style={{ display: "flex", gap: 8, margin: "4px 0 10px" }}>
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="🔍 Buscar cliente…" style={{ flex: 1, background: "#1a1d26", border: "1px solid #2a2d3a", borderRadius: 8, padding: "8px 12px", color: "#e0e0e0", fontSize: 13 }} />
        <select value={orden} onChange={e => setOrden(e.target.value)} style={{ background: "#1a1d26", border: "1px solid #2a2d3a", borderRadius: 8, padding: "8px 12px", color: "#e0e0e0", fontSize: 13 }}>
          <option value="recientes">Más recientes</option>
          <option value="mas_cajas">Más cajas</option>
          <option value="mas_pedidos">Más pedidos</option>
          <option value="alfabetico">A–Z</option>
        </select>
      </div>

      {/* Lista de clientes */}
      <div className="list">
        {filtrados.map(c => (
          <div key={c.nombre} className="list-item" style={{ borderLeft: `3px solid ${c.color}`, cursor: "pointer" }} onClick={() => setClienteSel(c.nombre)}>

            {/* Fila principal */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <strong style={{ fontSize: 15 }}>{c.nombre}</strong>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 11, color: c.color, fontWeight: 700 }}>
                  {c.diasDesdeUltimo !== null ? `hace ${c.diasDesdeUltimo}d` : "—"}
                </div>
                {c.diasParaProximo !== null && (
                  <div style={{ fontSize: 10, color: c.diasParaProximo <= 7 ? "#e8b84b" : "#545a78", marginTop: 2 }}>
                    {c.diasParaProximo <= 0 ? "⏰ Pronto pedirá" : `próx. en ~${c.diasParaProximo}d`}
                  </div>
                )}
              </div>
            </div>

            {/* Pedido activo destacado */}
            {c.pedidosActivos.length > 0 && (
              <div style={{ margin: "6px 0 4px", padding: "6px 10px", background: "rgba(75,232,122,0.07)", borderRadius: 7, border: "1px solid rgba(75,232,122,0.15)" }}>
                {c.pedidosActivos.map(p => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: p.status === "proceso" ? "#4be87a" : "#e8b84b", fontWeight: 700 }}>
                      {p.status === "proceso" ? "🏭 En proceso" : "📋 Anotado"} · #{p.num}
                    </span>
                    <span style={{ fontSize: 11, color: "#9aa0bc" }}>{p.medida} · {p.cajas} cajas</span>
                  </div>
                ))}
              </div>
            )}

            {/* Métricas */}
            <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
              <span className="muted">📋 {c.pedidos.length} pedidos</span>
              <span className="muted">📦 {c.cajasTotal} cajas hist.</span>
              {c.cajasActivas > 0 && <span style={{ fontSize: 12, color: "#4be87a", fontWeight: 600 }}>⚡ {c.cajasActivas} en prod.</span>}
              {c.frecuencia !== null && <span className="muted">🔄 c/ {c.frecuencia}d</span>}
              {c.tiempoProm !== null && <span className="muted">⏱ {c.tiempoProm}d entrega</span>}
              {!ocultarMerma && c.mermaPromedio !== null && (
                <span className="muted" style={{ color: Number(c.mermaPromedio) > META_MERMA_PCT ? "#ff4d4d" : "#4be87a" }}>
                  🗑 {c.mermaPromedio}% merma
                </span>
              )}
            </div>

            {/* Medidas top */}
            {c.topMedidas.length > 0 && (
              <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap" }}>
                {c.topMedidas.map(([med, cnt]) => (
                  <span key={med} style={{ background: "#1a2133", borderRadius: 6, padding: "2px 8px", fontSize: 11, color: "#c9922a" }}>{med} ×{cnt}</span>
                ))}
              </div>
            )}

            <button
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 8 }}
              disabled={copiando === c.nombre}
              onClick={e => { e.stopPropagation(); copiarLinkPortal(c.nombre); }}
            >
              {copiando === c.nombre ? "Copiando…" : "🔗 Portal cliente"}
            </button>
          </div>
        ))}
      </div>

      {/* Modal detalle cliente */}
      {seleccionado && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.78)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={() => setClienteSel(null)}>
          <div style={{ background: "#14171f", borderRadius: "18px 18px 0 0", padding: 22, width: "100%", maxWidth: 620, maxHeight: "92vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>

            {/* Header modal */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, color: "#c9922a", fontSize: 20 }}>👥 {seleccionado.nombre}</h3>
                {seleccionado.ultimaFecha && (
                  <div style={{ fontSize: 12, color: "#545a78", marginTop: 3 }}>
                    Último pedido: {seleccionado.ultimaFecha} · hace {seleccionado.diasDesdeUltimo}d
                  </div>
                )}
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setClienteSel(null)}>✕</button>
            </div>

            {/* Stats del cliente */}
            <div className="stat-grid" style={{ marginBottom: 14 }}>
              <div className="stat-card accent"><div className="stat-val">{seleccionado.pedidos.length}</div><div className="stat-lbl">Pedidos</div></div>
              <div className="stat-card blue"><div className="stat-val">{seleccionado.cajasTotal}</div><div className="stat-lbl">Cajas totales</div></div>
              {seleccionado.cajasActivas > 0 && <div className="stat-card green"><div className="stat-val">{seleccionado.cajasActivas}</div><div className="stat-lbl">Cajas en prod.</div></div>}
              {seleccionado.tiempoProm !== null && <div className="stat-card blue"><div className="stat-val">{seleccionado.tiempoProm}d</div><div className="stat-lbl">Entrega prom.</div></div>}
              {seleccionado.frecuencia !== null && <div className="stat-card orange"><div className="stat-val">{seleccionado.frecuencia}d</div><div className="stat-lbl">Frecuencia prom.</div></div>}
              {!ocultarMerma && seleccionado.mermaPromedio !== null && (
                <div className={`stat-card ${Number(seleccionado.mermaPromedio) > META_MERMA_PCT ? "red" : "green"}`}>
                  <div className="stat-val">{seleccionado.mermaPromedio}%</div><div className="stat-lbl">Merma prom.</div>
                </div>
              )}
            </div>

            {/* Próximo pedido estimado */}
            {seleccionado.diasParaProximo !== null && (
              <div style={{ background: seleccionado.diasParaProximo <= 7 ? "rgba(232,184,75,0.08)" : "#0e1018", border: `1px solid ${seleccionado.diasParaProximo <= 7 ? "rgba(232,184,75,0.25)" : "#1e2132"}`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 12, color: "#545a78", fontWeight: 700 }}>PRÓXIMO PEDIDO ESTIMADO</div>
                  <div style={{ fontSize: 15, color: seleccionado.diasParaProximo <= 7 ? "#e8b84b" : "#9aa0bc", fontWeight: 600, marginTop: 2 }}>
                    {seleccionado.proximoEst?.toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}
                  </div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: seleccionado.diasParaProximo <= 0 ? "#ff4d4d" : seleccionado.diasParaProximo <= 7 ? "#e8b84b" : "#545a78" }}>
                  {seleccionado.diasParaProximo <= 0 ? "¡Ya!" : `en ${seleccionado.diasParaProximo}d`}
                </div>
              </div>
            )}

            {/* Medidas más pedidas */}
            {seleccionado.topMedidas.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: "#545a78", fontWeight: 700, marginBottom: 6 }}>MEDIDAS MÁS PEDIDAS</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {seleccionado.topMedidas.map(([med, cnt]) => (
                    <div key={med} style={{ background: "#1a2133", borderRadius: 8, padding: "5px 12px", fontSize: 13, color: "#c9922a", fontWeight: 600 }}>
                      {med} <span style={{ color: "#545a78" }}>×{cnt}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pedidos activos */}
            {seleccionado.pedidosActivos.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: "#4be87a", fontWeight: 700, marginBottom: 6 }}>EN PRODUCCIÓN AHORA</div>
                {seleccionado.pedidosActivos.map(p => (
                  <div key={p.id} style={{ background: "rgba(75,232,122,0.06)", border: "1px solid rgba(75,232,122,0.15)", borderRadius: 8, padding: "10px 14px", marginBottom: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontWeight: 700, color: p.status === "proceso" ? "#4be87a" : "#e8b84b" }}>
                        {p.status === "proceso" ? "🏭 En proceso" : "📋 Anotado"} · Ped. #{p.num}
                      </span>
                      {p.fecha_estimada && <span style={{ fontSize: 12, color: "#e8b84b" }}>📅 {p.fecha_estimada}</span>}
                    </div>
                    <div className="muted">{p.tipo} · {p.medida} · {p.cajas} cajas · {p.maq}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Historial */}
            <div style={{ fontSize: 11, color: "#545a78", fontWeight: 700, marginBottom: 8 }}>HISTORIAL DE PEDIDOS</div>
            <div className="list">
              {seleccionado.sorted.slice().reverse().map(p => (
                <div key={p.id} className="list-item" style={{ borderLeft: `3px solid ${p.status === "terminado" ? "#4be87a" : p.status === "proceso" ? "#4a9eff" : "#ff9900"}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong>Ped. #{p.num}</strong>
                    <span className={`badge ${p.status === "terminado" ? "b-green" : p.status === "proceso" ? "b-blue" : "b-orange"}`}>{STATUS_PED[p.status] || p.status}</span>
                  </div>
                  <div className="muted">{p.fecha_solicitud} · {p.tipo} · {p.medida} · {p.cajas} cajas</div>
                  {p.fecha_estimada && p.status !== "terminado" && <div className="muted" style={{ color: "#e8b84b" }}>📅 Est.: {p.fecha_estimada}</div>}
                  {p.status === "terminado" && p.fecha_inicio && p.fecha_termino && (
                    <div className="muted">⏱ {Math.round((new Date(p.fecha_termino + "T12:00:00") - new Date(p.fecha_inicio + "T12:00:00")) / 86400000) + 1} días de producción</div>
                  )}
                  {!ocultarMerma && p.merma_pct && <div className="muted">Merma: {p.merma_pct}%</div>}
                </div>
              ))}
            </div>

            <button className="btn btn-ghost btn-block" style={{ marginTop: 14 }} disabled={copiando === seleccionado.nombre} onClick={() => copiarLinkPortal(seleccionado.nombre)}>
              {copiando === seleccionado.nombre ? "Copiando…" : "🔗 Copiar link del portal"}
            </button>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
