import { useState } from "react";
import ClicheImg from './ClicheImg';
import { authHeaders } from '../lib/auth';
import { uid, today } from '../lib/utils';
import { OPERADORES, META_CAJAS, REBOB_CLIENTE } from '../lib/constants';
import { IcoCheck } from './Icons';

const Ico = ({ icon: I, size = 13 }) => <span style={{ display: "inline-flex", fontSize: size, verticalAlign: -2 }}><I /></span>;

export default function Produccion({ prodDiaria, setProdDiaria, pedidos: pedidosProp }) {
  // Rebobinado no tiene produccion diaria (no es un pedido de cliente).
  const pedidos = pedidosProp.filter(p => p.cliente !== REBOB_CLIENTE);
  const formInicial = { fecha: today(), num_pedido: "", cajas_dia: "", op: "William", notas: "" };
  const [form, setForm] = useState(formInicial);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const showToast = t => { setToast(t); setTimeout(() => setToast(""), 2500); };
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const pedidoRel = form.num_pedido ? pedidos.find(p => String(p.num) === String(form.num_pedido)) : null;
  const cajasHoy = prodDiaria.filter(r => r.fecha === form.fecha).reduce((s, r) => s + Number(r.cajas_dia || 0), 0);
  const cajasHoyConNuevo = cajasHoy + Number(form.cajas_dia || 0);
  const metaCumplida = cajasHoyConNuevo >= META_CAJAS;

  const save = async () => {
    if (!form.num_pedido || !form.cajas_dia) { showToast("⚠ Llena pedido y cajas"); return; }
    setLoading(true);
    const nuevo = { id: uid(), created: today(), fecha: form.fecha, num_pedido: form.num_pedido, cajas_dia: form.cajas_dia, op: form.op, notas: form.notas };
    const res = await fetch('/api/prod-diaria', { method: 'POST', headers: authHeaders(), body: JSON.stringify(nuevo) });
    const data = await res.json();
    if (!res.ok) { showToast("❌ Error: " + (data.error || "desconocido")); setLoading(false); return; }
    setProdDiaria(p => [nuevo, ...p]);
    setForm(f => ({ ...f, num_pedido: "", cajas_dia: "", notas: "" }));
    showToast("✓ Producción registrada ☁️");
    setLoading(false);
  };

  const del = async id => {
    if (!window.confirm("¿Eliminar registro?")) return;
    await fetch('/api/prod-diaria', { method: 'DELETE', headers: authHeaders(), body: JSON.stringify({ id }) });
    setProdDiaria(p => p.filter(x => x.id !== id));
  };

  const porFecha = prodDiaria.reduce((acc, r) => { if (!acc[r.fecha]) acc[r.fecha] = []; acc[r.fecha].push(r); return acc; }, {});
  const fechas = Object.keys(porFecha).sort((a, b) => b.localeCompare(a)).slice(0, 14);

  return (
    <div>
      <h2 className="sec-title">📅 Producción Diaria</h2>
      <div style={{ background: "#1a1d26", borderRadius: 10, padding: "12px 16px", marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#aaa", fontSize: 12 }}>Cajas hoy ({today()})</span>
          <span style={{ color: cajasHoy >= META_CAJAS ? "#4be87a" : "#ff9900", fontWeight: 700, fontSize: 18 }}>{cajasHoy} / {META_CAJAS}</span>
        </div>
        <div style={{ background: "#2a2d3a", borderRadius: 4, height: 8, marginTop: 6, overflow: "hidden" }}>
          <div style={{ width: `${Math.min(100, (cajasHoy / META_CAJAS) * 100)}%`, height: "100%", background: cajasHoy >= META_CAJAS ? "#4be87a" : "#c9922a", transition: "width .4s" }} />
        </div>
        <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>Meta: {META_CAJAS} cajas {cajasHoy >= META_CAJAS ? "✅ CUMPLIDA" : `— faltan ${META_CAJAS - cajasHoy}`}</div>
      </div>
      <h3 className="sub-title">Registrar producción del día</h3>
      <div className="form-grid">
        <div className="field"><label>Fecha</label><input type="date" value={form.fecha} onChange={e => upd("fecha", e.target.value)} /></div>
        <div className="field"><label>No. Pedido *</label>
          <select value={form.num_pedido} onChange={e => upd("num_pedido", e.target.value)}>
            <option value="">— Selecciona —</option>
            {pedidos.filter(p => p.status !== "terminado").map(p => (<option key={p.id} value={String(p.num)}>{p.num} — {p.cliente} · {p.medida}</option>))}
          </select>
        </div>
        {pedidoRel && <div className="field"><label>Medida</label><input value={pedidoRel.medida || ""} readOnly style={{ background: "#1a2744", color: "#c9922a" }} /></div>}
        {pedidoRel?.cliche_url && (
          <div className="field full">
            <label>Cliché del pedido</label>
            <ClicheImg src={pedidoRel.cliche_url} style={{ width: "100%", maxWidth: 300, borderRadius: 8, border: "1px solid #2a2d3a", marginTop: 4 }} />
          </div>
        )}
        <div className="field"><label>Cajas del día *</label><input type="number" value={form.cajas_dia} onChange={e => upd("cajas_dia", e.target.value)} placeholder="12" /></div>
        <div className="field"><label>Operador</label><select value={form.op} onChange={e => upd("op", e.target.value)}>{OPERADORES.map(o => <option key={o}>{o}</option>)}</select></div>
        {form.cajas_dia && (<div className="field"><label>Total del día</label><input value={`${cajasHoyConNuevo} cajas ${metaCumplida ? "✅ Meta cumplida" : `(faltan ${META_CAJAS - cajasHoyConNuevo})`}`} readOnly style={{ background: "#1a2744", color: metaCumplida ? "#4be87a" : "#c9922a" }} /></div>)}
        <div className="field full"><label>Observaciones</label><textarea value={form.notas} onChange={e => upd("notas", e.target.value)} placeholder="Incidencias, velocidad, ajustes…" /></div>
      </div>
      <button className="btn btn-primary btn-block" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }} onClick={save} disabled={loading}>{loading ? "Guardando…" : <><Ico icon={IcoCheck} size={15} /> Registrar producción</>}</button>
      <h3 className="sub-title" style={{ marginTop: 20 }}>Historial (últimos 14 días)</h3>
      {fechas.length === 0 ? <p className="empty">Sin registros.</p> : (
        <div>
          {fechas.map(fecha => {
            const registros = porFecha[fecha];
            const totalDia = registros.reduce((s, r) => s + Number(r.cajas_dia || 0), 0);
            const cumple = totalDia >= META_CAJAS;
            return (
              <div key={fecha} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #2a2d3a" }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{fecha}</span>
                  <span style={{ color: cumple ? "#4be87a" : "#ff4d4d", fontWeight: 700, fontSize: 13 }}>{totalDia} cajas {cumple ? "✅" : "❌"}</span>
                </div>
                {registros.map(r => {
                  const ped = pedidos.find(p => String(p.num) === String(r.num_pedido));
                  return (
                    <div key={r.id} className="list-item" style={{ marginTop: 4 }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <div><strong>Ped. {r.num_pedido}</strong> {ped ? `— ${ped.cliente}` : ""} · {r.cajas_dia} cajas</div>
                        <button className="btn btn-danger btn-sm" onClick={() => del(r.id)}>✕</button>
                      </div>
                      <div className="muted">{r.op}{r.notas ? ` · ${r.notas}` : ""}</div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
