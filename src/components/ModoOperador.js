import { useState } from "react";
import ClicheImg from './ClicheImg';
import { supabase } from '../lib/supabase';
import { uid, today } from '../lib/utils';
import { COMPS, SEV } from '../lib/constants';

export default function ModoOperador({ pedidos, setPedidos, prodDiaria, setProdDiaria, setFallas, onSalir }) {
  const pedidosEnProceso = pedidos.filter(p => p.status === "proceso");
  const pedidosAnotados = pedidos.filter(p => p.status === "anotado");
  const [pedidoSel, setPedidoSel] = useState(null);
  const [vista, setVista] = useState(null); // null | "prod" | "falla"
  const [formProd, setFormProd] = useState({ cajas_dia: "", notas: "" });
  const [formConsumos, setFormConsumos] = useState({ rollos_usados: "", tinta_kg: "", alcohol_litros: "" });
  const [formFalla, setFormFalla] = useState({ comp: "Rodillo anilox", min_paro: "", sev: "leve", descripcion: "" });
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const showToast = t => { setToast(t); setTimeout(() => setToast(""), 2500); };

  const seleccionarPedido = (p) => {
    setPedidoSel(p);
    setVista(null);
    setFormProd({ cajas_dia: "", notas: "" });
    setFormConsumos({
      rollos_usados: p.rollos_usados ?? "",
      tinta_kg: p.tinta_kg ?? "",
      alcohol_litros: p.alcohol_litros ?? "",
    });
    setFormFalla({ comp: "Rodillo anilox", min_paro: "", sev: "leve", descripcion: "" });
  };

  const guardarProduccion = async () => {
    if (!formProd.cajas_dia) { showToast("⚠ Ingresa las cajas del día"); return; }
    setLoading(true);
    const nuevo = {
      id: uid(), created: today(), fecha: today(),
      num_pedido: String(pedidoSel.num), cajas_dia: formProd.cajas_dia,
      op: "William", notas: formProd.notas,
    };
    const { error: errProd } = await supabase.from("prod_diaria").insert([nuevo]);
    if (errProd) { showToast("❌ Error al guardar producción"); setLoading(false); return; }

    const consumosUpdate = {};
    if (formConsumos.rollos_usados !== "") consumosUpdate.rollos_usados = Number(formConsumos.rollos_usados);
    if (formConsumos.tinta_kg !== "") consumosUpdate.tinta_kg = Number(formConsumos.tinta_kg);
    if (formConsumos.alcohol_litros !== "") consumosUpdate.alcohol_litros = Number(formConsumos.alcohol_litros);
    if (Object.keys(consumosUpdate).length > 0) {
      await supabase.from("pedidos").update(consumosUpdate).eq("id", pedidoSel.id);
      setPedidos(ps => ps.map(p => p.id === pedidoSel.id ? { ...p, ...consumosUpdate } : p));
      setPedidoSel(prev => ({ ...prev, ...consumosUpdate }));
    }

    setProdDiaria(d => [nuevo, ...d]);
    setVista(null);
    setFormProd({ cajas_dia: "", notas: "" });
    showToast("✓ Producción registrada");
    setLoading(false);
  };

  const guardarFalla = async () => {
    if (!formFalla.descripcion || !formFalla.min_paro) { showToast("⚠ Descripción y minutos obligatorios"); return; }
    setLoading(true);
    const nueva = {
      id: uid(), created: today(), fecha: today(),
      maq: pedidoSel?.maq || "SIAT L36 #1",
      comp: formFalla.comp, min_paro: formFalla.min_paro,
      sev: formFalla.sev, op: "William",
      descripcion: formFalla.descripcion, accion: "", status: "abierta",
    };
    const { error } = await supabase.from("fallas").insert([nueva]);
    if (error) { showToast("❌ Error al guardar falla"); setLoading(false); return; }
    setFallas(fs => [nueva, ...fs]);
    setVista(null);
    setFormFalla({ comp: "Rodillo anilox", min_paro: "", sev: "leve", descripcion: "" });
    showToast("✓ Falla reportada");
    setLoading(false);
  };

  const card = { background: "#1a1d26", borderRadius: 12, padding: 16, marginBottom: 12 };
  const miniCard = { background: "#0d0f14", borderRadius: 8, padding: "8px 12px" };
  const miniLbl = { fontSize: 10, color: "#666", marginBottom: 2, textTransform: "uppercase", letterSpacing: ".05em" };

  return (
    <div style={{ minHeight: "100vh", background: "#0d0f14" }}>
      <header style={{ background: "#1a2744", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #c9922a" }}>
        <div>
          <div style={{ color: "#c9922a", fontWeight: 700, fontSize: 16, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: ".05em" }}>EEMSA · Modo Operador</div>
          <div style={{ color: "#4be87a", fontSize: 11 }}>👷 William</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onSalir}>Salir</button>
      </header>

      <div style={{ padding: 16, maxWidth: 480, margin: "0 auto" }}>

        {/* Lista de pedidos */}
        {!pedidoSel && (
          <>
            <h2 style={{ color: "#4a9eff", fontSize: 13, margin: "12px 0 8px", textTransform: "uppercase", letterSpacing: ".08em" }}>▶ En proceso</h2>
            {pedidosEnProceso.length === 0
              ? <p style={{ color: "#555", fontSize: 13, marginBottom: 16 }}>Sin pedidos en proceso.</p>
              : pedidosEnProceso.map(p => (
                <div key={p.id} onClick={() => seleccionarPedido(p)} style={{ ...card, borderLeft: "4px solid #4a9eff", cursor: "pointer" }}>
                  <div style={{ fontSize: 19, fontWeight: 700, color: "#fff", marginBottom: 4 }}>{p.cliente}</div>
                  <div style={{ color: "#c9922a", fontSize: 16, fontWeight: 700, marginBottom: 6 }}>📏 {p.medida}</div>
                  <div style={{ display: "flex", gap: 12, fontSize: 13, color: "#aaa", flexWrap: "wrap" }}>
                    <span>📦 {p.cajas} cajas</span>
                    <span>🎨 {p.tipo}</span>
                    {p.color && <span>🖌 {p.color}</span>}
                    <span style={{ color: "#555" }}>#Ped {p.num}</span>
                  </div>
                </div>
              ))
            }

            {pedidosAnotados.length > 0 && (
              <>
                <h2 style={{ color: "#ff9900", fontSize: 13, margin: "16px 0 8px", textTransform: "uppercase", letterSpacing: ".08em" }}>📋 Próximos anotados</h2>
                {pedidosAnotados.map(p => (
                  <div key={p.id} style={{ ...card, borderLeft: "4px solid #ff9900", opacity: 0.85 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#e0e0e0", marginBottom: 4 }}>{p.cliente}</div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 13 }}>
                      <span style={{ color: "#c9922a", fontWeight: 700 }}>📏 {p.medida}</span>
                      <span style={{ color: "#aaa" }}>🎨 {p.tipo}</span>
                      {p.color && <span style={{ color: "#aaa" }}>🖌 {p.color}</span>}
                      <span style={{ color: "#aaa" }}>📦 {p.cajas} cajas</span>
                      {p.rollos_caja && <span style={{ color: "#aaa" }}>🧻 {p.rollos_caja} rollos/caja</span>}
                    </div>
                    {p.fecha_solicitud && <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>Solicitud: {p.fecha_solicitud}</div>}
                  </div>
                ))}
              </>
            )}
          </>
        )}

        {/* Detalle del pedido seleccionado */}
        {pedidoSel && vista === null && (
          <>
            <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} onClick={() => setPedidoSel(null)}>← Volver</button>
            <div style={{ ...card, borderLeft: "4px solid #4a9eff" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 10 }}>{pedidoSel.cliente}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <div style={miniCard}><div style={miniLbl}>Medida</div><div style={{ color: "#c9922a", fontWeight: 700, fontSize: 18 }}>{pedidoSel.medida}</div></div>
                <div style={miniCard}><div style={miniLbl}>Cajas meta</div><div style={{ color: "#4be87a", fontWeight: 700, fontSize: 18 }}>{pedidoSel.cajas}</div></div>
                <div style={miniCard}><div style={miniLbl}>Tipo</div><div style={{ color: "#e0e0e0", fontSize: 14 }}>{pedidoSel.tipo}</div></div>
                <div style={miniCard}><div style={miniLbl}>Máquina</div><div style={{ color: "#e0e0e0", fontSize: 14 }}>{pedidoSel.maq}</div></div>
              </div>
              {pedidoSel.color && <div style={{ fontSize: 12, color: "#aaa" }}>🎨 Color: {pedidoSel.color}</div>}
              {pedidoSel.rollos_usados || pedidoSel.tinta_kg || pedidoSel.alcohol_litros ? (
                <div style={{ marginTop: 10, padding: "8px 10px", background: "#0d0f14", borderRadius: 8, fontSize: 12, color: "#888" }}>
                  Consumos registrados: {pedidoSel.rollos_usados ? `${pedidoSel.rollos_usados} rollos` : ""}{pedidoSel.tinta_kg ? ` · ${pedidoSel.tinta_kg}kg tinta` : ""}{pedidoSel.alcohol_litros ? ` · ${pedidoSel.alcohol_litros}L alcohol` : ""}
                </div>
              ) : null}
            </div>
            {pedidoSel.cliche_url && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: "#aaa", marginBottom: 6 }}>📷 Cliché</div>
                <ClicheImg src={pedidoSel.cliche_url} style={{ width: "100%", borderRadius: 10, border: "1px solid #2a2d3a" }} />
              </div>
            )}
            <button className="btn btn-primary btn-block" style={{ marginBottom: 10, padding: 16, fontSize: 16 }} onClick={() => setVista("prod")}>✅ Registrar producción del día</button>
            <button className="btn btn-danger btn-block" style={{ padding: 16, fontSize: 16 }} onClick={() => setVista("falla")}>⚠️ Reportar falla</button>
          </>
        )}

        {/* Formulario de producción */}
        {pedidoSel && vista === "prod" && (
          <>
            <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} onClick={() => setVista(null)}>← Volver</button>
            <h3 style={{ color: "#c9922a", marginBottom: 12 }}>Producción del día — {pedidoSel.cliente}</h3>
            <div className="form-grid">
              <div className="field">
                <label>Cajas del día *</label>
                <input type="number" placeholder="12" value={formProd.cajas_dia} onChange={e => setFormProd(f => ({ ...f, cajas_dia: e.target.value }))} />
              </div>
              <div className="field">
                <label>Rollos usados (total acumulado pedido)</label>
                <input type="number" placeholder="0" value={formConsumos.rollos_usados} onChange={e => setFormConsumos(f => ({ ...f, rollos_usados: e.target.value }))} />
              </div>
              <div className="field">
                <label>Tinta kg (total acumulado pedido)</label>
                <input type="number" step="0.1" placeholder="0.0" value={formConsumos.tinta_kg} onChange={e => setFormConsumos(f => ({ ...f, tinta_kg: e.target.value }))} />
              </div>
              <div className="field">
                <label>Alcohol L (total acumulado pedido)</label>
                <input type="number" step="0.1" placeholder="0.0" value={formConsumos.alcohol_litros} onChange={e => setFormConsumos(f => ({ ...f, alcohol_litros: e.target.value }))} />
              </div>
              <div className="field full">
                <label>Observaciones</label>
                <textarea placeholder="Incidencias, ajustes de velocidad…" value={formProd.notas} onChange={e => setFormProd(f => ({ ...f, notas: e.target.value }))} />
              </div>
            </div>
            <button className="btn btn-primary btn-block" onClick={guardarProduccion} disabled={loading} style={{ padding: 16, fontSize: 16 }}>
              {loading ? "Guardando…" : "✅ Guardar producción"}
            </button>
          </>
        )}

        {/* Formulario de falla */}
        {pedidoSel && vista === "falla" && (
          <>
            <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} onClick={() => setVista(null)}>← Volver</button>
            <h3 style={{ color: "#ff4d4d", marginBottom: 12 }}>⚠️ Reportar falla</h3>
            <div className="form-grid">
              <div className="field">
                <label>Componente</label>
                <select value={formFalla.comp} onChange={e => setFormFalla(f => ({ ...f, comp: e.target.value }))}>
                  {COMPS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Minutos de paro *</label>
                <input type="number" placeholder="30" value={formFalla.min_paro} onChange={e => setFormFalla(f => ({ ...f, min_paro: e.target.value }))} />
              </div>
              <div className="field">
                <label>Severidad</label>
                <select value={formFalla.sev} onChange={e => setFormFalla(f => ({ ...f, sev: e.target.value }))}>
                  {Object.entries(SEV).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="field full">
                <label>Descripción *</label>
                <textarea placeholder="¿Qué ocurrió?" value={formFalla.descripcion} onChange={e => setFormFalla(f => ({ ...f, descripcion: e.target.value }))} />
              </div>
            </div>
            <button className="btn btn-danger btn-block" onClick={guardarFalla} disabled={loading} style={{ padding: 16, fontSize: 16 }}>
              {loading ? "Guardando…" : "⚠️ Reportar falla"}
            </button>
          </>
        )}
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
