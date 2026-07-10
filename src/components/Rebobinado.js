import { useState } from "react";
import { uid, today, siguienteNumPedido } from '../lib/utils';
import { REBOB_CLIENTE, REBOB_OPERADORES, REBOB_TIPOS, REBOB_ANCHOS, REBOB_LARGOS_PIEZA, REBOB_LARGO_JUMBO_M, calcularPiezasTeoricas } from '../lib/constants';
import { IcoCheck } from './Icons';

const Ico = ({ icon: I, size = 13 }) => <span style={{ display: "inline-flex", fontSize: size, verticalAlign: -2 }}><I /></span>;

export default function Rebobinado({ pedidos, setPedidos, onSalir }) {
  const formInicial = {
    ancho: REBOB_ANCHOS[0], largoPieza: REBOB_LARGOS_PIEZA[0], tipo: REBOB_TIPOS[0], op: REBOB_OPERADORES[0],
    cajas: "", piezas: "", fecha_inicio: today(), fecha_termino: today(), notas: "",
  };
  const [form, setForm] = useState(formInicial);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const showToast = t => { setToast(t); setTimeout(() => setToast(""), 2500); };
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const vueltas = Math.floor(REBOB_LARGO_JUMBO_M / (Number(form.largoPieza) || 1));
  const piezasTeoricas = calcularPiezasTeoricas(form.ancho, form.largoPieza);
  const piezasReal = Number(form.piezas) || 0;
  const diferencia = form.piezas !== "" ? piezasReal - piezasTeoricas : null;

  const save = async () => {
    if (!form.cajas || !form.piezas) { showToast("⚠ Llena cajas y piezas"); return; }
    setLoading(true);
    const nuevo = {
      id: uid(), created: today(),
      cliente: REBOB_CLIENTE, num: siguienteNumPedido(pedidos),
      tipo: form.tipo, medida: `${form.ancho} x ${form.largoPieza}m`,
      cajas: form.cajas, piezas_prod: form.piezas, op: form.op,
      fecha_solicitud: today(), fecha_inicio: form.fecha_inicio, fecha_termino: form.fecha_termino,
      notas: form.notas || `Teórico: ${piezasTeoricas} pzas (${vueltas} vueltas x ${form.ancho})`,
      status: "pendiente",
    };
    const res = await fetch('/api/pedidos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nuevo) });
    const data = await res.json();
    if (!res.ok) { showToast("❌ Error: " + (data.error || "desconocido")); setLoading(false); return; }
    setPedidos(ps => [nuevo, ...ps]);
    setForm(f => ({ ...formInicial, ancho: f.ancho, largoPieza: f.largoPieza, tipo: f.tipo, op: f.op }));
    showToast("✓ Registrado — ya aparece en Modo Emilio para dar de alta");
    setLoading(false);
  };

  const historial = pedidos.filter(p => p.cliente === REBOB_CLIENTE).sort((a, b) => (b.created || "").localeCompare(a.created || ""));

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg)" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "var(--surface)", borderBottom: "2px solid var(--teal)", position: "sticky", top: 0, zIndex: 10 }}>
        <img src="/logo192.png" alt="EEMSA" style={{ height: 36, width: "auto" }} />
        <div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 16, color: "#e0e0e0", letterSpacing: ".06em" }}>EEMSA System</div>
          <div style={{ fontSize: 10, color: "var(--teal)", fontWeight: 700, letterSpacing: ".08em" }}>MODO REBOBINADO</div>
        </div>
        <button onClick={onSalir} style={{ marginLeft: "auto", fontSize: 11, color: "#666", background: "transparent", border: "none", cursor: "pointer", padding: "4px 8px" }}>← Salir</button>
      </header>

      <main style={{ flex: 1, padding: "16px 16px 82px", maxWidth: 640, margin: "0 auto", width: "100%" }}>
      <h2 className="sec-title">Rebobinado</h2>

      <h3 className="sub-title">Calculadora de rendimiento</h3>
      <div className="form-grid">
        <div className="field"><label>Ancho de corte</label>
          <select value={form.ancho} onChange={e => upd("ancho", e.target.value)}>{REBOB_ANCHOS.map(a => <option key={a} value={a}>{a}</option>)}</select>
        </div>
        <div className="field"><label>Largo de pieza (m)</label>
          <select value={form.largoPieza} onChange={e => upd("largoPieza", e.target.value)}>{REBOB_LARGOS_PIEZA.map(l => <option key={l} value={l}>{l}m</option>)}</select>
        </div>
      </div>
      <div style={{ background: "#1a1d26", borderRadius: 10, padding: "12px 16px", marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#aaa", marginBottom: 4 }}>
          <span>{REBOB_LARGO_JUMBO_M}m ÷ {form.largoPieza}m = {vueltas} vueltas completas</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#aaa", fontSize: 12 }}>Piezas teóricas ({vueltas} vueltas × {form.ancho})</span>
          <span style={{ color: "#c9922a", fontWeight: 700, fontSize: 18 }}>{piezasTeoricas}</span>
        </div>
      </div>

      <h3 className="sub-title">Registrar lo que salió</h3>
      <div className="form-grid">
        <div className="field"><label>Tipo *</label><select value={form.tipo} onChange={e => upd("tipo", e.target.value)}>{REBOB_TIPOS.map(t => <option key={t}>{t}</option>)}</select></div>
        <div className="field"><label>Operador</label><select value={form.op} onChange={e => upd("op", e.target.value)}>{REBOB_OPERADORES.map(o => <option key={o}>{o}</option>)}</select></div>
        <div className="field"><label>Cajas *</label><input type="number" value={form.cajas} onChange={e => upd("cajas", e.target.value)} placeholder="0" /></div>
        <div className="field"><label>Piezas reales *</label><input type="number" value={form.piezas} onChange={e => upd("piezas", e.target.value)} placeholder={String(piezasTeoricas)} /></div>
        <div className="field"><label>Fecha inicio</label><input type="date" value={form.fecha_inicio} onChange={e => upd("fecha_inicio", e.target.value)} /></div>
        <div className="field"><label>Fecha término</label><input type="date" value={form.fecha_termino} onChange={e => upd("fecha_termino", e.target.value)} /></div>
        {diferencia !== null && (
          <div className="field full">
            <label>Diferencia vs. teórico</label>
            <input readOnly value={`${diferencia > 0 ? "+" : ""}${diferencia} piezas`} style={{ background: "#1a2744", color: diferencia < 0 ? "#ff4d4d" : "#4be87a", fontWeight: 700 }} />
          </div>
        )}
        <div className="field full"><label>Notas</label><textarea value={form.notas} onChange={e => upd("notas", e.target.value)} placeholder="Opcional — si no escribes nada, se guarda el cálculo teórico" /></div>
      </div>
      <button className="btn btn-primary btn-block" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }} onClick={save} disabled={loading}>
        {loading ? "Guardando…" : <><Ico icon={IcoCheck} size={15} /> Registrar y mandar a Modo Emilio</>}
      </button>

      <h3 className="sub-title" style={{ marginTop: 20 }}>Historial</h3>
      {historial.length === 0 ? <p className="empty">Sin registros todavía.</p> : historial.map(p => (
        <div key={p.id} className="list-item" style={{ marginTop: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div><strong>#{p.num}</strong> · {p.tipo} · {p.medida}</div>
            <span className={`badge ${p.status === "terminado" ? "b-green" : "b-orange"}`}>{p.status === "terminado" ? "Terminado" : "Falta dar de alta"}</span>
          </div>
          <div className="muted">{p.cajas} cajas · {p.piezas_prod} piezas · {p.op}</div>
        </div>
      ))}

      {toast && <div className="toast">{toast}</div>}
      </main>
    </div>
  );
}
