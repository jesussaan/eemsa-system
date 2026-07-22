import { useState } from "react";
import { authHeaders } from '../lib/auth';
import { uid, today } from '../lib/utils';
import { sendPush } from '../lib/push';
import { MAQUINAS, OPERADORES, COMPS, COMPS_REBOBINADORA, REBOB_OPERADORES, SEV } from '../lib/constants';
import { analizarComponentes } from '../lib/mantenimiento';
import { confirmar } from '../lib/confirm';
import { IcoPlus } from './Icons';

const Ico = ({ icon: I, size = 13 }) => <span style={{ display: "inline-flex", fontSize: size, verticalAlign: -2 }}><I /></span>;

export default function Fallas({ fallas, setFallas }) {
  const [form, setForm] = useState({ fecha: today(), maq: "SIAT L36 #1", comp: "Rodillo anilox", min_paro: "", sev: "leve", op: "", descripcion: "", accion: "", status: "abierta" });
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("abiertas");
  const [filtroMaq, setFiltroMaq] = useState("todas");
  const [filtroSev, setFiltroSev] = useState("todas");
  const [vista, setVista] = useState("lista"); // "lista" | "componente"
  const [compExpandido, setCompExpandido] = useState(null);
  const [editandoFalla, setEditandoFalla] = useState(null);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const showToast = t => { setToast(t); setTimeout(() => setToast(""), 2200); };
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.descripcion || !form.min_paro) { showToast("⚠ Descripción y minutos son obligatorios"); return; }
    setLoading(true);
    const nuevo = { id: uid(), created: today(), fecha: form.fecha, maq: form.maq, comp: form.comp, min_paro: form.min_paro, sev: form.sev, op: form.op, descripcion: form.descripcion, accion: form.accion, status: form.status };
    try {
      const res = await fetch('/api/registro?tabla=fallas', { method: 'POST', headers: authHeaders(), body: JSON.stringify(nuevo) });
      const data = await res.json();
      if (!res.ok) { showToast("❌ Error: " + (data.error || "desconocido")); setLoading(false); return; }
      setFallas(f => [nuevo, ...f]);
      if (nuevo.sev === 'critica') sendPush('⚠️ Falla crítica reportada', `${nuevo.comp} — ${nuevo.min_paro} min de paro`);
      setForm(f => ({ ...f, min_paro: "", descripcion: "", accion: "", status: "abierta" }));
      showToast("✓ Falla guardada en la nube ☁️");
    } catch (e) { showToast("❌ Error: " + e.message); }
    setLoading(false);
  };

  const esRebobinadora = form.maq === "Rebobinadora";
  const compsBase = esRebobinadora ? COMPS_REBOBINADORA : COMPS;
  const operadoresBase = esRebobinadora ? REBOB_OPERADORES : OPERADORES;
  const compsSugeridos = [...new Set([...compsBase, ...fallas.filter(f => f.maq === form.maq).map(f => f.comp).filter(Boolean)])];

  const del = async id => {
    if (!(await confirmar("¿Eliminar?"))) return;
    const res = await fetch('/api/registro?tabla=fallas', { method: 'DELETE', headers: authHeaders(), body: JSON.stringify({ id }) });
    if (!res.ok) { showToast("❌ Error al eliminar"); return; }
    setFallas(f => f.filter(x => x.id !== id));
  };
  const close = async id => {
    const res = await fetch('/api/registro?tabla=fallas', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ action: 'cerrar', id }) });
    if (!res.ok) { showToast("❌ Error al cerrar"); return; }
    setFallas(f => f.map(x => x.id === id ? { ...x, status: "cerrada" } : x));
  };
  const sevCls = s => s === "critica" ? "b-red" : s === "moderada" ? "b-orange" : "b-green";

  const guardarEdicionFalla = async () => {
    if (!editandoFalla) return;
    if (!editandoFalla.descripcion || !editandoFalla.min_paro) { showToast("⚠ Descripción y minutos son obligatorios"); return; }
    setGuardandoEdicion(true);
    const actualizado = {
      fecha: editandoFalla.fecha, maq: editandoFalla.maq, comp: editandoFalla.comp,
      min_paro: editandoFalla.min_paro, sev: editandoFalla.sev, op: editandoFalla.op,
      descripcion: editandoFalla.descripcion, accion: editandoFalla.accion, status: editandoFalla.status,
    };
    const res = await fetch('/api/registro?tabla=fallas', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ action: 'completo', id: editandoFalla.id, ...actualizado }) });
    const data = await res.json();
    if (!res.ok) { showToast("❌ Error: " + (data.error || "desconocido")); setGuardandoEdicion(false); return; }
    setFallas(fs => fs.map(x => x.id === editandoFalla.id ? { ...x, ...actualizado } : x));
    setEditandoFalla(null);
    showToast("✓ Falla actualizada");
    setGuardandoEdicion(false);
  };

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
        <div className="field"><label>Máquina</label><select value={form.maq} onChange={e => { const maq = e.target.value; const base = maq === "Rebobinadora" ? COMPS_REBOBINADORA : COMPS; setForm(f => ({ ...f, maq, comp: base[0], op: "" })); }}>{MAQUINAS.map(m => <option key={m}>{m}</option>)}</select></div>
        <div className="field">
          <label>Componente</label>
          <input list="comps-list" value={form.comp} onChange={e => upd("comp", e.target.value)} placeholder="Escribe o elige un componente" />
          <datalist id="comps-list">{compsSugeridos.map(c => <option key={c} value={c} />)}</datalist>
        </div>
        <div className="field"><label>Minutos de paro *</label><input type="number" value={form.min_paro} onChange={e => upd("min_paro", e.target.value)} placeholder="30" /></div>
        <div className="field"><label>Severidad</label><select value={form.sev} onChange={e => upd("sev", e.target.value)}>{Object.entries(SEV).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="field"><label>Operador</label><select value={form.op} onChange={e => upd("op", e.target.value)}><option value="">—</option>{operadoresBase.map(o => <option key={o}>{o}</option>)}</select></div>
        <div className="field full"><label>Descripción *</label><textarea value={form.descripcion} onChange={e => upd("descripcion", e.target.value)} placeholder="¿Qué ocurrió?" /></div>
        <div className="field full"><label>Acción correctiva</label><textarea value={form.accion} onChange={e => upd("accion", e.target.value)} placeholder="¿Cómo se resolvió?" /></div>
      </div>
      <button className="btn btn-primary btn-block" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }} onClick={save} disabled={loading}>{loading ? "Guardando…" : <><Ico icon={IcoPlus} size={15} /> Registrar falla</>}</button>
      <h3 className="sub-title" style={{ marginTop: 20 }}>Historial</h3>

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <button className={`btn btn-sm ${vista === "lista" ? "btn-primary" : "btn-ghost"}`} onClick={() => setVista("lista")}>Lista</button>
        <button className={`btn btn-sm ${vista === "componente" ? "btn-primary" : "btn-ghost"}`} onClick={() => setVista("componente")}>Por Componente</button>
      </div>

      {vista === "componente" && (() => {
        const analisis = analizarComponentes(fallas);
        if (analisis.length === 0) return <p className="empty">Sin fallas registradas todavía.</p>;
        return (
          <div style={{ display: "grid", gap: 12 }}>
            {analisis.map(c => {
              const expandido = compExpandido === c.comp;
              const historialComp = fallas.filter(f => (f.comp || "Sin componente") === c.comp).sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
              return (
                <div key={c.comp} style={{ background: "var(--card)", borderRadius: "var(--r-md)", borderLeft: c.vencido ? "4px solid var(--red)" : "4px solid var(--border-light)", padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: "var(--text)" }}>{c.comp}</div>
                      <div className="muted" style={{ marginTop: 2 }}>{c.maquinas.join(", ") || "—"}</div>
                    </div>
                    {c.abiertas > 0 && <span className="badge b-red">{c.abiertas} abierta{c.abiertas !== 1 ? "s" : ""}</span>}
                  </div>
                  <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap", fontSize: 13 }}>
                    <span className="muted">{c.totalFallas} falla{c.totalFallas !== 1 ? "s" : ""}</span>
                    <span className="muted">{c.minParoTotal} min de paro total</span>
                  </div>
                  {c.prediccionDisponible ? (
                    <div style={{ marginTop: 10, background: c.vencido ? "var(--red-dim)" : "var(--surface)", border: `1px solid ${c.vencido ? "rgba(232,75,75,0.3)" : "var(--border)"}`, borderRadius: "var(--r-sm)", padding: "8px 12px", fontSize: 12 }}>
                      {c.vencido
                        ? <span style={{ color: "var(--red)", fontWeight: 700 }}>⚠ Posible falla — vencido hace {Math.abs(c.diasRestantes)} día{Math.abs(c.diasRestantes) !== 1 ? "s" : ""} (cada ~{c.promedioIntervalo}d)</span>
                        : <span className="muted">Cada ~{c.promedioIntervalo} días · van {c.diasDesdeUltima} desde la última · ~{c.diasRestantes} días para la siguiente</span>}
                    </div>
                  ) : (
                    <div className="muted" style={{ marginTop: 8, fontSize: 11 }}>Necesita al menos 3 fallas para estimar un patrón (lleva {c.totalFallas}).</div>
                  )}
                  <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setCompExpandido(expandido ? null : c.comp)}>
                    {expandido ? "▲ Ocultar historial" : `▼ Ver historial (${historialComp.length})`}
                  </button>
                  {expandido && (
                    <div className="list" style={{ marginTop: 10 }}>
                      {historialComp.map(f => (
                        <div key={f.id} className="list-item">
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                            <div className="muted">{f.fecha} · {f.maq} · {f.min_paro} min · <span className={`badge ${sevCls(f.sev)}`}>{SEV[f.sev]}</span> · <span className={`badge ${f.status === "abierta" ? "b-red" : "b-green"}`}>{f.status === "abierta" ? "Abierta" : "Cerrada"}</span></div>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditandoFalla({ ...f })}>✏️</button>
                          </div>
                          <div className="muted">{f.descripcion}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}

      {vista === "lista" && <>
      {/* Filtro estado */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {[["abiertas", "🔴 Abiertas"], ["cerradas", "🟢 Cerradas"], ["todas", "Todas"]].map(([k, lbl]) => (
          <button key={k} className={`btn btn-sm ${filtroStatus === k ? "btn-primary" : "btn-ghost"}`} onClick={() => setFiltroStatus(k)}>{lbl}</button>
        ))}
      </div>

      {/* Filtro severidad */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {[["todas", "Todas"], ["leve", "🟢 Leve"], ["moderada", "🟡 Moderada"], ["critica", "🔴 Crítica"]].map(([k, lbl]) => (
          <button key={k} onClick={() => setFiltroSev(k)} style={{ padding: "4px 12px", borderRadius: 20, border: `1.5px solid ${filtroSev === k ? "#c9922a" : "#2a2d3a"}`, background: filtroSev === k ? "#c9922a22" : "transparent", color: filtroSev === k ? "#c9922a" : "#666", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Filtro máquina */}
      <div style={{ marginBottom: 8 }}>
        <select value={filtroMaq} onChange={e => setFiltroMaq(e.target.value)} style={{ background: "#1a1d26", border: "1px solid #2a2d3a", borderRadius: 8, padding: "7px 12px", color: filtroMaq === "todas" ? "#666" : "#e0e0e0", fontSize: 13, width: "100%" }}>
          <option value="todas">🔧 Todas las máquinas</option>
          {MAQUINAS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="🔍 Buscar por componente, descripción…" style={{ width: "100%", marginBottom: 10, background: "#1a1d26", border: "1px solid #2a2d3a", borderRadius: 8, padding: "8px 12px", color: "#e0e0e0", fontSize: 13 }} />

      {(() => {
        const fallasFiltradas = fallas.filter(f => {
          const matchStatus = filtroStatus === "todas" || (filtroStatus === "abiertas" ? f.status === "abierta" : f.status === "cerrada");
          const matchBusqueda = !busqueda || [f.maq, f.comp, f.descripcion, f.op].some(v => String(v || "").toLowerCase().includes(busqueda.toLowerCase()));
          const matchMaq = filtroMaq === "todas" || f.maq === filtroMaq;
          const matchSev = filtroSev === "todas" || f.sev === filtroSev;
          return matchStatus && matchBusqueda && matchMaq && matchSev;
        });
        return (
          <>
            {fallasFiltradas.length === 0 && <p className="empty">{fallas.length === 0 ? "Sin fallas. ¡Buena señal! 🟢" : "Sin resultados con estos filtros."}</p>}
            {fallasFiltradas.length > 0 && <div style={{ fontSize: 11, color: "#555", marginBottom: 8 }}>{fallasFiltradas.length} falla{fallasFiltradas.length !== 1 ? "s" : ""}</div>}
          </>
        );
      })()}

      {fallas.length === 0 ? null : (
        <div className="list">
          {fallas.filter(f => {
            const matchStatus = filtroStatus === "todas" || (filtroStatus === "abiertas" ? f.status === "abierta" : f.status === "cerrada");
            const matchBusqueda = !busqueda || [f.maq, f.comp, f.descripcion, f.op].some(v => String(v || "").toLowerCase().includes(busqueda.toLowerCase()));
            const matchMaq = filtroMaq === "todas" || f.maq === filtroMaq;
            const matchSev = filtroSev === "todas" || f.sev === filtroSev;
            return matchStatus && matchBusqueda && matchMaq && matchSev;
          }).map(f => (
            <div key={f.id} className="list-item">
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                <div><strong>{f.comp}</strong> — {f.maq}<span className={`badge ${sevCls(f.sev)}`}>{SEV[f.sev]}</span><span className={`badge ${f.status === "abierta" ? "b-red" : "b-green"}`}>{f.status === "abierta" ? "Abierta" : "Cerrada"}</span></div>
                <div style={{ display: "flex", gap: 6 }}>
                  {f.status === "abierta" && <button className="btn btn-ghost btn-sm" onClick={() => close(f.id)}>✓</button>}
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditandoFalla({ ...f })}>✏️</button>
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
      </>}

      {editandoFalla && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: "#14171f", borderRadius: "16px 16px 0 0", padding: 20, width: "100%", maxWidth: 600, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, color: "#c9922a" }}>✏️ Editar falla</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditandoFalla(null)}>✕</button>
            </div>
            <div className="form-grid">
              <div className="field"><label>Fecha</label><input type="date" value={editandoFalla.fecha || ""} onChange={e => setEditandoFalla(x => ({ ...x, fecha: e.target.value }))} /></div>
              <div className="field"><label>Máquina</label><select value={editandoFalla.maq || ""} onChange={e => setEditandoFalla(x => ({ ...x, maq: e.target.value }))}>{MAQUINAS.map(m => <option key={m}>{m}</option>)}</select></div>
              <div className="field">
                <label>Componente</label>
                <input list="comps-list-edit" value={editandoFalla.comp || ""} onChange={e => setEditandoFalla(x => ({ ...x, comp: e.target.value }))} placeholder="Nombre del componente" />
                <datalist id="comps-list-edit">{compsSugeridos.map(c => <option key={c} value={c} />)}</datalist>
              </div>
              <div className="field"><label>Minutos de paro *</label><input type="number" value={editandoFalla.min_paro || ""} onChange={e => setEditandoFalla(x => ({ ...x, min_paro: e.target.value }))} /></div>
              <div className="field"><label>Severidad</label><select value={editandoFalla.sev || "leve"} onChange={e => setEditandoFalla(x => ({ ...x, sev: e.target.value }))}>{Object.entries(SEV).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div className="field"><label>Operador</label><select value={editandoFalla.op || ""} onChange={e => setEditandoFalla(x => ({ ...x, op: e.target.value }))}><option value="">—</option>{OPERADORES.map(o => <option key={o}>{o}</option>)}</select></div>
              <div className="field"><label>Estado</label>
                <select value={editandoFalla.status || "abierta"} onChange={e => setEditandoFalla(x => ({ ...x, status: e.target.value }))}>
                  <option value="abierta">Abierta</option>
                  <option value="cerrada">Cerrada</option>
                </select>
              </div>
              <div className="field full"><label>Descripción *</label><textarea value={editandoFalla.descripcion || ""} onChange={e => setEditandoFalla(x => ({ ...x, descripcion: e.target.value }))} /></div>
              <div className="field full"><label>Acción correctiva</label><textarea value={editandoFalla.accion || ""} onChange={e => setEditandoFalla(x => ({ ...x, accion: e.target.value }))} /></div>
            </div>
            <button className="btn btn-primary btn-block" onClick={guardarEdicionFalla} disabled={guardandoEdicion}>{guardandoEdicion ? "Guardando…" : "💾 Guardar cambios"}</button>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}

    </div>
  );
}
