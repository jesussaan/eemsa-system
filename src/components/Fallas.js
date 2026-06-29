import { useState } from "react";
import { supabase } from '../lib/supabase';
import { uid, today } from '../lib/utils';
import { MAQUINAS, OPERADORES, COMPS, SEV } from '../lib/constants';

export default function Fallas({ fallas, setFallas }) {
  const [form, setForm] = useState({ fecha: today(), maq: "SIAT L36 #1", comp: "Rodillo anilox", min_paro: "", sev: "leve", op: "", descripcion: "", accion: "", status: "abierta" });
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("abiertas");
  const showToast = t => { setToast(t); setTimeout(() => setToast(""), 2200); };
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.descripcion || !form.min_paro) { showToast("⚠ Descripción y minutos son obligatorios"); return; }
    setLoading(true);
    const nuevo = { id: uid(), created: today(), fecha: form.fecha, maq: form.maq, comp: form.comp, min_paro: form.min_paro, sev: form.sev, op: form.op, descripcion: form.descripcion, accion: form.accion, status: form.status };
    const { error } = await supabase.from("fallas").insert([nuevo]);
    if (error) { showToast("❌ Error al guardar"); setLoading(false); return; }
    setFallas(f => [nuevo, ...f]);
    setForm(f => ({ ...f, min_paro: "", descripcion: "", accion: "", status: "abierta" }));
    showToast("✓ Falla guardada en la nube ☁️");
    setLoading(false);
  };

  const compsSugeridos = [...new Set([...COMPS, ...fallas.map(f => f.comp).filter(Boolean)])];

  const del = async id => { if (!window.confirm("¿Eliminar?")) return; await supabase.from("fallas").delete().eq("id", id); setFallas(f => f.filter(x => x.id !== id)); };
  const close = async id => { await supabase.from("fallas").update({ status: "cerrada" }).eq("id", id); setFallas(f => f.map(x => x.id === id ? { ...x, status: "cerrada" } : x)); };
  const sevCls = s => s === "critica" ? "b-red" : s === "moderada" ? "b-orange" : "b-green";

  return (
    <div>
      <h2 className="sec-title">⚠️ Fallas</h2>
      <div className="stat-grid">
        <div className="stat-card red"><div className="stat-val">{fallas.filter(f => f.status === "abierta").length}</div><div className="stat-lbl">Abiertas</div></div>
        <div className="stat-card orange"><div className="stat-val">{fallas.reduce((s, f) => s + Number(f.min_paro || 0), 0)}</div><div className="stat-lbl">Min paro total</div></div>
        <div className="stat-card accent"><div className="stat-val">{fallas.filter(f => f.sev === "critica").length}</div><div className="stat-lbl">Críticas</div></div>
      </div>
      <h3 className="sub-title">Registrar falla</h3>
      <div className="form-grid">
        <div className="field"><label>Fecha</label><input type="date" value={form.fecha} onChange={e => upd("fecha", e.target.value)} /></div>
        <div className="field"><label>Máquina</label><select value={form.maq} onChange={e => upd("maq", e.target.value)}>{MAQUINAS.map(m => <option key={m}>{m}</option>)}</select></div>
        <div className="field">
          <label>Componente</label>
          <input list="comps-list" value={form.comp} onChange={e => upd("comp", e.target.value)} placeholder="Escribe o elige un componente" />
          <datalist id="comps-list">{compsSugeridos.map(c => <option key={c} value={c} />)}</datalist>
        </div>
        <div className="field"><label>Minutos de paro *</label><input type="number" value={form.min_paro} onChange={e => upd("min_paro", e.target.value)} placeholder="30" /></div>
        <div className="field"><label>Severidad</label><select value={form.sev} onChange={e => upd("sev", e.target.value)}>{Object.entries(SEV).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="field"><label>Operador</label><select value={form.op} onChange={e => upd("op", e.target.value)}><option value="">—</option>{OPERADORES.map(o => <option key={o}>{o}</option>)}</select></div>
        <div className="field full"><label>Descripción *</label><textarea value={form.descripcion} onChange={e => upd("descripcion", e.target.value)} placeholder="¿Qué ocurrió?" /></div>
        <div className="field full"><label>Acción correctiva</label><textarea value={form.accion} onChange={e => upd("accion", e.target.value)} placeholder="¿Cómo se resolvió?" /></div>
      </div>
      <button className="btn btn-primary btn-block" onClick={save} disabled={loading}>{loading ? "Guardando…" : "+ Registrar falla"}</button>
      <h3 className="sub-title" style={{ marginTop: 20 }}>Historial</h3>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        {[["abiertas", "🔴 Abiertas"], ["cerradas", "🟢 Cerradas"], ["todas", "Todas"]].map(([k, lbl]) => (
          <button key={k} className={`btn btn-sm ${filtroStatus === k ? "btn-primary" : "btn-ghost"}`} onClick={() => setFiltroStatus(k)}>{lbl}</button>
        ))}
      </div>
      <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="🔍 Buscar por máquina, componente, descripción…" style={{ width: "100%", marginBottom: 8, background: "#1a1d26", border: "1px solid #2a2d3a", borderRadius: 8, padding: "8px 12px", color: "#e0e0e0", fontSize: 13 }} />
      {fallas.length === 0 ? <p className="empty">Sin fallas. ¡Buena señal! 🟢</p> : (
        <div className="list">
          {fallas.filter(f => {
            const matchStatus = filtroStatus === "todas" || (filtroStatus === "abiertas" ? f.status === "abierta" : f.status === "cerrada");
            const matchBusqueda = !busqueda || [f.maq, f.comp, f.descripcion, f.op, f.sev].some(v => String(v || "").toLowerCase().includes(busqueda.toLowerCase()));
            return matchStatus && matchBusqueda;
          }).map(f => (
            <div key={f.id} className="list-item">
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                <div><strong>{f.comp}</strong> — {f.maq}<span className={`badge ${sevCls(f.sev)}`}>{SEV[f.sev]}</span><span className={`badge ${f.status === "abierta" ? "b-red" : "b-green"}`}>{f.status === "abierta" ? "Abierta" : "Cerrada"}</span></div>
                <div style={{ display: "flex", gap: 6 }}>
                  {f.status === "abierta" && <button className="btn btn-ghost btn-sm" onClick={() => close(f.id)}>✓</button>}
                  <button className="btn btn-danger btn-sm" onClick={() => del(f.id)}>✕</button>
                </div>
              </div>
              <div className="muted">{f.fecha} · {f.min_paro} min · {f.op}</div>
              <div className="muted">{f.descripcion}</div>
              {f.accion && <div className="muted">✓ {f.accion}</div>}
            </div>
          ))}
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
