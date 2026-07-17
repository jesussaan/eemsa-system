import { useState } from "react";
import ClicheImg from './ClicheImg';
import { authHeaders } from "../lib/auth";
import { today } from "../lib/utils";
import { sendWhatsApp } from "../utils/whatsapp";
import { sendPush } from "../lib/push";
import NotifBell from "./NotifBell";
import { IcoPalette, IcoFlask, IcoRoll, IcoProd, IcoAlertDot, IcoStore, IcoNote, IcoCal, IcoCheck, IcoPencil, IcoX, IcoEmilio, IcoRef, IcoBulb, IcoOperador, IcoCamera } from "./Icons";
import { REBOB_CLIENTE, REBOB_COLOR } from "../lib/constants";

const Ico = ({ icon: I, size = 13 }) => <span style={{ display: "inline-flex", fontSize: size, verticalAlign: -2 }}><I /></span>;

export default function ModoEmilio({ pedidos, setPedidos, listaMateriales = [], setListaMateriales, onSalir }) {
  const [toast, setToast]       = useState("");
  const [loading, setLoading]   = useState(null);
  const [stickybacks, setStickybacks] = useState({});
  const [swipes, setSwipes]     = useState({});
  const [tabEmilio, setTabEmilio] = useState("pedidos");
  const [verHistorial, setVerHistorial] = useState(false);
  const [loadingMat, setLoadingMat] = useState(null);
  const TIPO_MAT = { Tinta: "#c9922a", Solvente: "#4b8fe8", Rollos: "#4be87a", Otro: "#545a78" };
  const TIPO_ICO = { Tinta: IcoPalette, Solvente: IcoFlask, Rollos: IcoRoll, Otro: IcoProd };
  const [formMat, setFormMat] = useState({ material: "", tipo: "Tinta", cantidad: "", unidad: "kg", urgente: false, notas: "", proveedor: "" });
  const updMat = (k, v) => setFormMat(f => ({ ...f, [k]: v }));
  const [editandoMat, setEditandoMat] = useState(null);
  const [formEdit, setFormEdit] = useState({});
  const updEdit = (k, v) => setFormEdit(f => ({ ...f, [k]: v }));

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  const SWIPE_THRESHOLD = 90;

  const onTouchStart = (id, e) => {
    const t = e.touches[0];
    setSwipes(s => ({ ...s, [id]: { startX: t.clientX, startY: t.clientY, dx: 0, active: false } }));
  };

  const onTouchMove = (id, e) => {
    setSwipes(s => {
      const sw = s[id];
      if (!sw) return s;
      const dx = e.touches[0].clientX - sw.startX;
      const dy = e.touches[0].clientY - sw.startY;
      if (!sw.active && Math.abs(dy) > Math.abs(dx)) return s;
      return { ...s, [id]: { ...sw, dx, active: true } };
    });
  };

  const onTouchEnd = (id) => {
    const dx = swipes[id]?.dx || 0;
    if (dx >= SWIPE_THRESHOLD) {
      darDeAlta(id);
    }
    setSwipes(s => ({ ...s, [id]: { startX: 0, startY: 0, dx: 0, active: false } }));
  };

  const pendientesImpresora = pedidos
    .filter(p => p.status === "pendiente" && p.cliente !== REBOB_CLIENTE)
    .sort((a, b) => (a.fecha_solicitud || "").localeCompare(b.fecha_solicitud || ""));
  const pendientesRebobinado = pedidos
    .filter(p => p.status === "pendiente" && p.cliente === REBOB_CLIENTE)
    .sort((a, b) => (a.fecha_solicitud || "").localeCompare(b.fecha_solicitud || ""));
  const pendientes = tabEmilio === "rebobinado" ? pendientesRebobinado : pendientesImpresora;

  // Agrupa los cortes de un mismo rollo mixto (comparten folio_rebobinado)
  // para que salgan pegados en la lista y no se confundan con otro lote --
  // los pedidos de cliente normal (sin folio_rebobinado) quedan cada uno
  // en su propio grupo de 1, igual que siempre.
  const gruposPendientes = Object.values(
    pendientes.reduce((acc, p) => {
      const key = p.folio_rebobinado != null ? `f${p.folio_rebobinado}` : `solo${p.id}`;
      (acc[key] = acc[key] || []).push(p);
      return acc;
    }, {})
  ).map(grupo => [...grupo].sort((a, b) => String(a.num).localeCompare(String(b.num))));

  const darDeAlta = async (id) => {
    setLoading(id);
    const update = { status: "terminado", fecha_termino: today() };
    const res = await fetch('/api/pedidos', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ action: 'estado', id, ...update }) });
    if (!res.ok) { showToast("❌ Error al dar de alta"); setLoading(null); return; }
    setPedidos(ps => ps.map(p => p.id === id ? { ...p, ...update } : p));
    const p = pedidos.find(x => x.id === id);
    if (p) {
      sendWhatsApp(`✅ Pedido #${p.num} ${p.cliente} dado de alta por Emilio`);
      sendPush('✅ Pedido dado de alta', `#${p.num} ${p.cliente} — dado de alta por Emilio`);
    }
    showToast("✓ Pedido dado de alta");
    setLoading(null);
  };

  const calcTiempo = (p) => {
    const start = p.inicio_ts  ? new Date(p.inicio_ts)
                : p.fecha_inicio   ? new Date(p.fecha_inicio   + 'T07:00:00')
                : null;
    const end   = p.fin_ts     ? new Date(p.fin_ts)
                : p.fecha_termino  ? new Date(p.fecha_termino  + 'T16:00:00')
                : null;
    if (!start || !end) return null;
    const ms = end - start;
    if (ms < 0) return null;
    const days = ms / (1000 * 3600 * 24);
    const rounded = Math.round(days * 10) / 10;
    return rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1);
  };

  const fmtTS = (ts, fecha) => {
    if (ts) {
      const d = new Date(ts);
      return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
           + ' · '
           + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    }
    return fecha || '—';
  };

  const agregarMaterial = async () => {
    if (!formMat.material.trim()) { showToast("⚠ Escribe el material"); return; }
    setLoadingMat("add");
    const payload = { material: formMat.material.trim(), tipo: formMat.tipo, cantidad: formMat.cantidad || null, unidad: formMat.unidad, urgente: formMat.urgente, notas: formMat.notas || null, proveedor: formMat.proveedor || null };
    const res = await fetch('/api/registro?tabla=lista-materiales', { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) { showToast("❌ Error: " + (data.error || "")); setLoadingMat(null); return; }
    setListaMateriales(p => [data, ...p]);
    setFormMat({ material: "", tipo: "Tinta", cantidad: "", unidad: "kg", urgente: false, notas: "", proveedor: "" });
    showToast("✓ Material agregado");
    setLoadingMat(null);
  };

  const marcarListo = async (id) => {
    setLoadingMat(id);
    const update = { status: "listo", fecha_listo: today() };
    const res = await fetch('/api/registro?tabla=lista-materiales', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ action: 'listo', id, fecha_listo: update.fecha_listo }) });
    if (!res.ok) { showToast("❌ Error"); setLoadingMat(null); return; }
    setListaMateriales(p => p.map(m => m.id === id ? { ...m, ...update } : m));
    showToast("✓ Marcado como listo");
    setLoadingMat(null);
  };

  const eliminarMaterial = async (id) => {
    await fetch('/api/registro?tabla=lista-materiales', { method: 'DELETE', headers: authHeaders(), body: JSON.stringify({ id }) });
    setListaMateriales(p => p.filter(m => m.id !== id));
  };

  const abrirEdicion = (m) => {
    setEditandoMat(m.id);
    setFormEdit({ material: m.material || "", tipo: m.tipo || "Tinta", cantidad: m.cantidad || "", unidad: m.unidad || "kg", urgente: !!m.urgente, notas: m.notas || "", proveedor: m.proveedor || "" });
  };

  const guardarEdicion = async (id) => {
    setLoadingMat("edit_" + id);
    const update = { material: formEdit.material.trim(), tipo: formEdit.tipo, cantidad: formEdit.cantidad || null, unidad: formEdit.unidad, urgente: formEdit.urgente, notas: formEdit.notas || null, proveedor: formEdit.proveedor || null };
    const res = await fetch('/api/registro?tabla=lista-materiales', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ action: 'editar', id, ...update }) });
    const data = await res.json();
    if (!res.ok) { showToast("❌ Error: " + (data.error || "")); setLoadingMat(null); return; }
    setListaMateriales(p => p.map(m => m.id === id ? { ...m, ...update } : m));
    setEditandoMat(null);
    showToast("✓ Guardado");
    setLoadingMat(null);
  };

  const activos    = listaMateriales.filter(m => m.status === "pendiente").sort((a, b) => (b.urgente ? 1 : 0) - (a.urgente ? 1 : 0));
  const historial  = listaMateriales.filter(m => m.status === "listo").sort((a, b) => (b.fecha_listo || "").localeCompare(a.fecha_listo || ""));

  const S = {
    card:     { background: "var(--card)", borderRadius: "var(--r-md)", padding: 16, marginBottom: 12, borderLeft: "4px solid var(--red)" },
    section:  { background: "var(--bg)", borderRadius: "var(--r-sm)", padding: 12, marginBottom: 10 },
    secTitle: { fontSize: 11, color: "var(--accent)", fontWeight: 700, letterSpacing: ".07em", marginBottom: 10, textTransform: "uppercase" },
    mini:     { background: "var(--surface)", borderRadius: "var(--r-sm)", padding: "10px 12px" },
    miniLbl:  { fontSize: 10, color: "var(--muted)", marginBottom: 3, textTransform: "uppercase", letterSpacing: ".05em" },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg)" }}>

      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "var(--surface)", borderBottom: "2px solid var(--red)", position: "sticky", top: 0, zIndex: 10 }}>
        <img src="/logo192.png" alt="EEMSA" style={{ height: 36, width: "auto" }} />
        <div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 16, color: "#e0e0e0", letterSpacing: ".06em" }}>EEMSA System</div>
          <div style={{ fontSize: 10, color: "#c9922a", fontWeight: 700, letterSpacing: ".08em" }}>MÓDULO EMILIO</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <NotifBell />
          <button onClick={onSalir} style={{ fontSize: 11, color: "#666", background: "transparent", border: "none", cursor: "pointer", padding: "4px 8px" }}>← Salir</button>
        </div>
      </header>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
        {[
          ["pedidos", IcoEmilio, "SIAT L36", pendientesImpresora.length, "#c9922a", "#ff4d4d"],
          ["rebobinado", IcoRoll, "Rebobinado", pendientesRebobinado.length, REBOB_COLOR, REBOB_COLOR],
          ["materiales", IcoProd, "Materiales", activos.length, "#c9922a", "#c9922a"],
        ].map(([k, Icon, lbl, cnt, activeColor, badgeColor]) => (
          <button key={k} onClick={() => setTabEmilio(k)} style={{ flex: 1, padding: "11px 0", fontSize: 13, fontWeight: 700, background: "transparent", border: "none", cursor: "pointer", color: tabEmilio === k ? activeColor : "#555", borderBottom: tabEmilio === k ? `2px solid ${activeColor}` : "2px solid transparent", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Ico icon={Icon} /> {lbl}
            {cnt > 0 && <span style={{ marginLeft: 6, background: badgeColor, color: "#000", fontSize: 10, fontWeight: 900, borderRadius: 20, padding: "1px 6px", verticalAlign: "middle" }}>{cnt}</span>}
          </button>
        ))}
      </div>

      <main style={{ flex: 1, padding: "16px 16px 32px", maxWidth: 640, margin: "0 auto", width: "100%" }}>

        {/* ── Tab Materiales ── */}
        {tabEmilio === "materiales" && (
          <div>
            <h2 style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 22, fontWeight: 800, color: "#c9922a", letterSpacing: ".06em", margin: "0 0 14px", display: "flex", alignItems: "center", gap: 8 }}><Ico icon={IcoProd} size={20} /> Materiales a pedir</h2>

            {/* Formulario agregar */}
            <div style={{ background: "#1a1d26", borderRadius: 12, padding: 16, marginBottom: 16, border: "1px solid #2a2d3a" }}>
              <div style={{ fontSize: 11, color: "#c9922a", fontWeight: 700, letterSpacing: ".07em", marginBottom: 12 }}>+ NUEVA SOLICITUD</div>
              {/* Selector tipo grande */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 12 }}>
                {Object.entries(TIPO_MAT).map(([t, color]) => (
                  <button key={t} type="button" onClick={() => { updMat("tipo", t); updMat("unidad", t === "Rollos" ? "rollos" : t === "Solvente" ? "kg" : "kg"); }}
                    style={{ padding: "10px 0", borderRadius: 10, border: `2px solid ${formMat.tipo === t ? color : "#2a2d3a"}`, background: formMat.tipo === t ? color + "22" : "transparent", color: formMat.tipo === t ? color : "#555", fontWeight: 800, fontSize: 13, cursor: "pointer", transition: "all .15s" }}>
                    <Ico icon={TIPO_ICO[t] || IcoProd} size={16} /><br/>{t}
                  </button>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <div style={{ gridColumn: "1/-1" }}>
                  <input value={formMat.material} onChange={e => updMat("material", e.target.value)} placeholder="Descripción (ej: Tinta roja, Solvente base…)" style={{ width: "100%", background: "#13161e", border: "1px solid #2a2d3a", borderRadius: 8, padding: "8px 10px", color: "#e0e0e0", fontSize: 13, boxSizing: "border-box" }} />
                </div>
                <input value={formMat.cantidad} onChange={e => updMat("cantidad", e.target.value)} placeholder="Cantidad" type="number" style={{ background: "#13161e", border: "1px solid #2a2d3a", borderRadius: 8, padding: "8px 10px", color: "#e0e0e0", fontSize: 13 }} />
                <select value={formMat.unidad} onChange={e => updMat("unidad", e.target.value)} style={{ background: "#13161e", border: "1px solid #2a2d3a", borderRadius: 8, padding: "8px 10px", color: "#e0e0e0", fontSize: 13 }}>
                  {["kg","L","pzas","rollos","m","cajas"].map(u => <option key={u}>{u}</option>)}
                </select>
                <div style={{ gridColumn: "1/-1" }}>
                  <input value={formMat.proveedor} onChange={e => updMat("proveedor", e.target.value)} placeholder="Proveedor (opcional)" style={{ width: "100%", background: "#13161e", border: "1px solid #2a2d3a", borderRadius: 8, padding: "8px 10px", color: "#e0e0e0", fontSize: 13, boxSizing: "border-box" }} />
                </div>
                <div style={{ gridColumn: "1/-1" }}>
                  <input value={formMat.notas} onChange={e => updMat("notas", e.target.value)} placeholder="Notas (opcional)" style={{ width: "100%", background: "#13161e", border: "1px solid #2a2d3a", borderRadius: 8, padding: "8px 10px", color: "#e0e0e0", fontSize: 13, boxSizing: "border-box" }} />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#e0e0e0", cursor: "pointer" }}>
                  <input type="checkbox" checked={formMat.urgente} onChange={e => updMat("urgente", e.target.checked)} />
                  <span style={{ color: formMat.urgente ? "#ff4d4d" : "#666", display: "inline-flex", alignItems: "center", gap: 5 }}><Ico icon={IcoAlertDot} size={9} /> Urgente</span>
                </label>
                <button onClick={agregarMaterial} disabled={loadingMat === "add"} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: "#c9922a", color: "#000", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  {loadingMat === "add" ? "…" : "Solicitar"}
                </button>
              </div>
            </div>

            {/* Lista activos */}
            {activos.length === 0
              ? <div style={{ textAlign: "center", padding: "24px 0", color: "#444", fontSize: 13 }}>Sin materiales pendientes.</div>
              : activos.map(m => {
                const tipoColor = TIPO_MAT[m.tipo] || "#545a78";
                const TipoIco   = TIPO_ICO[m.tipo] || IcoProd;
                return (
                  <div key={m.id} style={{ background: "#1a1d26", borderRadius: 14, marginBottom: 14, borderLeft: `6px solid ${m.urgente ? "#ff4d4d" : tipoColor}`, overflow: "hidden", boxShadow: `0 2px 12px ${tipoColor}18` }}>
                    {editandoMat === m.id ? (
                      <div style={{ padding: "14px 16px" }}>
                        <div style={{ fontSize: 11, color: tipoColor, fontWeight: 700, letterSpacing: ".07em", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}><Ico icon={IcoPencil} /> EDITANDO</div>
                        {/* Selector tipo */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 10 }}>
                          {Object.entries(TIPO_MAT).map(([t, color]) => (
                            <button key={t} type="button" onClick={() => updEdit("tipo", t)}
                              style={{ padding: "8px 0", borderRadius: 8, border: `2px solid ${formEdit.tipo === t ? color : "#2a2d3a"}`, background: formEdit.tipo === t ? color + "22" : "transparent", color: formEdit.tipo === t ? color : "#555", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>
                              <Ico icon={TIPO_ICO[t] || IcoProd} /> {t}
                            </button>
                          ))}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                          <div style={{ gridColumn: "1/-1" }}>
                            <input value={formEdit.material} onChange={e => updEdit("material", e.target.value)} placeholder="Material" style={{ width: "100%", background: "#13161e", border: "1px solid #2a2d3a", borderRadius: 8, padding: "8px 10px", color: "#e0e0e0", fontSize: 13, boxSizing: "border-box" }} />
                          </div>
                          <input value={formEdit.cantidad} onChange={e => updEdit("cantidad", e.target.value)} placeholder="Cantidad" type="number" style={{ background: "#13161e", border: "1px solid #2a2d3a", borderRadius: 8, padding: "8px 10px", color: "#e0e0e0", fontSize: 13 }} />
                          <select value={formEdit.unidad} onChange={e => updEdit("unidad", e.target.value)} style={{ background: "#13161e", border: "1px solid #2a2d3a", borderRadius: 8, padding: "8px 10px", color: "#e0e0e0", fontSize: 13 }}>
                            {["kg","L","pzas","rollos","m","cajas"].map(u => <option key={u}>{u}</option>)}
                          </select>
                          <div style={{ gridColumn: "1/-1" }}>
                            <input value={formEdit.proveedor} onChange={e => updEdit("proveedor", e.target.value)} placeholder="Proveedor" style={{ width: "100%", background: "#13161e", border: "1px solid #2a2d3a", borderRadius: 8, padding: "8px 10px", color: "#e0e0e0", fontSize: 13, boxSizing: "border-box" }} />
                          </div>
                          <div style={{ gridColumn: "1/-1" }}>
                            <input value={formEdit.notas} onChange={e => updEdit("notas", e.target.value)} placeholder="Notas" style={{ width: "100%", background: "#13161e", border: "1px solid #2a2d3a", borderRadius: 8, padding: "8px 10px", color: "#e0e0e0", fontSize: 13, boxSizing: "border-box" }} />
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#e0e0e0", cursor: "pointer" }}>
                            <input type="checkbox" checked={formEdit.urgente} onChange={e => updEdit("urgente", e.target.checked)} />
                            <span style={{ color: formEdit.urgente ? "#ff4d4d" : "#666", display: "inline-flex", alignItems: "center", gap: 5 }}><Ico icon={IcoAlertDot} size={9} /> Urgente</span>
                          </label>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => setEditandoMat(null)} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #2a2d3a", background: "transparent", color: "#666", fontSize: 12, cursor: "pointer" }}>Cancelar</button>
                            <button onClick={() => guardarEdicion(m.id)} disabled={loadingMat === "edit_" + m.id} style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "#c9922a", color: "#000", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                              {loadingMat === "edit_" + m.id ? "…" : "Guardar"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div>
                        {/* Barra de tipo */}
                        <div style={{ background: tipoColor + "18", padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: tipoColor, letterSpacing: ".08em", display: "flex", alignItems: "center", gap: 6 }}><Ico icon={TipoIco} /> {(m.tipo || "Otro").toUpperCase()}</span>
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            {m.urgente && <span style={{ fontSize: 10, fontWeight: 800, color: "#ff4d4d", background: "#ff4d4d22", border: "1px solid #ff4d4d44", borderRadius: 20, padding: "2px 8px", display: "inline-flex", alignItems: "center", gap: 4 }}><Ico icon={IcoAlertDot} size={8} /> URGENTE</span>}
                            <button onClick={() => abrirEdicion(m)} style={{ padding: "3px 9px", borderRadius: 6, border: "1px solid #2a2d3a", background: "transparent", color: "#666", fontSize: 11, cursor: "pointer", display: "inline-flex" }}><Ico icon={IcoPencil} size={12} /></button>
                            <button onClick={() => eliminarMaterial(m.id)} style={{ padding: "3px 8px", borderRadius: 6, border: "none", background: "transparent", color: "#444", fontSize: 12, cursor: "pointer", display: "inline-flex" }}><Ico icon={IcoX} size={13} /></button>
                          </div>
                        </div>
                        {/* Cuerpo */}
                        <div style={{ padding: "14px 16px" }}>
                          <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", marginBottom: 6 }}>{m.material}</div>
                          {(m.cantidad || m.unidad) && (
                            <div style={{ fontSize: 28, fontWeight: 900, color: tipoColor, lineHeight: 1, marginBottom: 10, fontVariantNumeric: "tabular-nums" }}>
                              {m.cantidad} <span style={{ fontSize: 16, fontWeight: 600 }}>{m.unidad}</span>
                            </div>
                          )}
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
                            {m.proveedor && <span style={{ fontSize: 12, color: "#4b8fe8", display: "inline-flex", alignItems: "center", gap: 4 }}><Ico icon={IcoStore} /> {m.proveedor}</span>}
                            {m.notas && <span style={{ fontSize: 12, color: "#666", display: "inline-flex", alignItems: "center", gap: 4 }}><Ico icon={IcoNote} /> {m.notas}</span>}
                            {m.created_at && <span style={{ fontSize: 11, color: "#3a3f5a", display: "inline-flex", alignItems: "center", gap: 4 }}><Ico icon={IcoCal} /> {new Date(m.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</span>}
                          </div>
                          <button onClick={() => marcarListo(m.id)} disabled={loadingMat === m.id}
                            style={{ padding: "7px 18px", borderRadius: 8, border: "none", background: "#4be87a", color: "#000", fontWeight: 700, fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
                            {loadingMat === m.id ? "…" : <><Ico icon={IcoCheck} size={12} /> Ya lo pedí</>}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            }

            {/* Historial */}
            <button onClick={() => setVerHistorial(v => !v)} style={{ width: "100%", background: "transparent", border: "1px solid #1e2132", borderRadius: 8, color: "#555", fontSize: 12, padding: "8px 0", cursor: "pointer", marginTop: 8 }}>
              {verHistorial ? "▲ Ocultar historial" : `▼ Ver historial (${historial.length})`}
            </button>
            {verHistorial && (
              <div style={{ marginTop: 10 }}>
                {historial.length === 0
                  ? <div style={{ textAlign: "center", color: "#444", fontSize: 13, padding: 12 }}>Sin historial aún.</div>
                  : historial.map(m => (
                    <div key={m.id} style={{ background: "#13161e", borderRadius: 10, padding: "10px 14px", marginBottom: 8, opacity: 0.7 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "#888", textDecoration: "line-through" }}>{m.material}</div>
                          {(m.cantidad || m.unidad) && <div style={{ fontSize: 12, color: "#555" }}>{m.cantidad} {m.unidad}</div>}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 10, color: "#4be87a", fontWeight: 700, display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}><Ico icon={IcoCheck} size={10} /> LISTO</div>
                          <div style={{ fontSize: 11, color: "#444" }}>{m.fecha_listo || ""}</div>
                        </div>
                      </div>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        )}

        {/* ── Tab Pedidos (SIAT L36 o Rebobinado) ── */}
        {(tabEmilio === "pedidos" || tabEmilio === "rebobinado") && <>
        <h2 style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 22, fontWeight: 800, color: tabEmilio === "rebobinado" ? REBOB_COLOR : "#ff4d4d", letterSpacing: ".06em", margin: "0 0 14px", display: "flex", alignItems: "center", gap: 8 }}>
          <Ico icon={tabEmilio === "rebobinado" ? IcoRoll : IcoEmilio} size={20} /> Falta dar de alta {tabEmilio === "rebobinado" ? "— Rebobinado" : "— SIAT L36"}
        </h2>

        {pendientes.length === 0 && (
          <div style={{ textAlign: "center", padding: "32px 0", color: "#444", fontSize: 13 }}>
            No hay pedidos pendientes de dar de alta.
          </div>
        )}

        {gruposPendientes.map(grupo => (
        <div key={grupo[0].id} style={grupo.length > 1 ? {
          border: `1px solid ${REBOB_COLOR}55`, borderRadius: 14, padding: 10, marginBottom: 12, background: "rgba(62,207,192,0.04)",
        } : undefined}>
          {grupo.length > 1 && (
            <div style={{ fontSize: 11, fontWeight: 800, color: REBOB_COLOR, letterSpacing: ".05em", marginBottom: 8 }}>
              🧵 LOTE #{grupo[0].folio_rebobinado} — ROLLO MIXTO ({grupo.length} medidas)
            </div>
          )}
          {grupo.map(p => {
          const esRebobinado = p.cliente === REBOB_CLIENTE;
          // Rebobinado guarda "cajas" directo (cajas completas del rollo),
          // no "rollos_caja" -- por eso no se puede sacar cajasProducidas
          // dividiendo piezas_prod/rollos_caja como con un pedido de cliente.
          const cajasProducidas = esRebobinado
            ? (p.cajas != null ? Number(p.cajas) : null)
            : (p.piezas_prod != null && p.rollos_caja
              ? Math.floor(Number(p.piezas_prod) / Number(p.rollos_caja))
              : null);
          const centros = p.piezas_prod != null
            ? Number(p.piezas_prod) + (Number(p.merma) || 0)
            : null;
          const sticky  = stickybacks[p.id] ?? (p.stickyback != null ? Number(p.stickyback) : null);
          const tiempo  = calcTiempo(p);
          const exacto  = !!(p.inicio_ts && p.fin_ts);

          const sw        = swipes[p.id] || {};
          const dx        = sw.dx || 0;
          const confirming = dx >= SWIPE_THRESHOLD;

          const esperaDesde = p.fin_ts ? new Date(p.fin_ts) : p.fecha_termino ? new Date(p.fecha_termino + 'T16:00:00') : null;
          const diasEsperando = esperaDesde ? Math.floor((Date.now() - esperaDesde.getTime()) / 86400000) : 0;
          const bordeColor = confirming ? '#4be87a' : esRebobinado ? REBOB_COLOR : diasEsperando >= 2 ? '#ff4d4d' : '#3a3f5a';
          // Rollo mixto: Rebobinado le pone el mismo folio base + letra a
          // cada corte del mismo rollo fisico (1A, 1B, 1C...) -- se detecta
          // aqui para mostrarlo tambien en el texto del encabezado.
          const loteMixto = esRebobinado ? String(p.num || '').match(/^(\d+)([A-Za-z])$/) : null;

          return (
            <div
              key={p.id}
              style={{
                ...S.card,
                transform:      `translateX(${dx}px) rotate(${dx * 0.015}deg)`,
                transition:     sw.active ? 'none' : 'transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94), background 0.2s',
                background:     confirming ? '#0e2a14' : '#1a1d26',
                borderLeft:     `4px solid ${bordeColor}`,
                userSelect:     'none',
                touchAction:    'pan-y',
                position:       'relative',
                overflow:       'hidden',
              }}
              onTouchStart={e => onTouchStart(p.id, e)}
              onTouchMove={e  => onTouchMove(p.id, e)}
              onTouchEnd={()  => onTouchEnd(p.id)}
            >
              {dx > 20 && (
                <div style={{
                  position:'absolute', left:16, top:'50%', transform:'translateY(-50%)',
                  fontSize:13, fontWeight:800, color:'#4be87a', letterSpacing:'.06em',
                  opacity: Math.min(1, (dx - 20) / 60), pointerEvents:'none',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <Ico icon={IcoCheck} /> DAR DE ALTA
                </div>
              )}

              {/* ── Encabezado del pedido ── */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontSize: 19, fontWeight: 700, color: "#fff" }}>{p.cliente}</div>
                  {diasEsperando >= 2 && (
                    <span style={{ fontSize: 10, fontWeight: 800, color: "#ff4d4d", background: "#ff4d4d22", border: "1px solid #ff4d4d44", borderRadius: 20, padding: "3px 9px", whiteSpace: "nowrap" }}>
                      {diasEsperando}d esperando
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 6 }}>
                  <span style={{ fontSize: 30, fontWeight: 900, color: "#c9922a", lineHeight: 1 }}>{p.medida}</span>
                  {cajasProducidas != null && <span style={{ fontSize: 20, fontWeight: 700, color: "#4be87a" }}>{cajasProducidas.toLocaleString()} cajas</span>}
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 13, marginTop: 6 }}>
                  <span style={{ color: "#aaa" }}>{p.tipo}</span>
                  {(p.color || p.tinta_tipo) && <span style={{ color: "#aaa" }}>{p.color || p.tinta_tipo}</span>}
                  {p.color2 && <span style={{ color: "#aaa" }}>+ {p.color2}</span>}
                  {loteMixto ? (
                    <span style={{ color: REBOB_COLOR, fontWeight: 700 }}>🧵 Lote #{loteMixto[1]} · Corte {loteMixto[2].toUpperCase()}</span>
                  ) : (
                    <span style={{ color: "#444" }}>{esRebobinado ? `#Rebob ${p.num}` : `#Ped ${p.num}`}</span>
                  )}
                </div>
                {p.fecha_solicitud && <div style={{ fontSize: 11, color: "#444", marginTop: 4 }}>Solicitud: {p.fecha_solicitud}</div>}
              </div>


              {/* ── PRODUCCIÓN ── */}
              <div style={S.section}>
                <div style={{ ...S.secTitle, display: "flex", alignItems: "center", gap: 6 }}><Ico icon={IcoProd} /> Producción</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {cajasProducidas != null && (
                    <div style={S.mini}>
                      <div style={S.miniLbl}>Cajas producidas</div>
                      <div style={{ color: "#4be87a", fontWeight: 800, fontSize: 20 }}>{cajasProducidas.toLocaleString()}</div>
                    </div>
                  )}
                  {p.piezas_prod != null && (
                    <div style={S.mini}>
                      <div style={S.miniLbl}>Rollos producidos</div>
                      <div style={{ color: "#4be87a", fontWeight: 800, fontSize: 20 }}>{Number(p.piezas_prod).toLocaleString()}</div>
                    </div>
                  )}
                  {p.rollos_usados != null && (
                    <div style={S.mini}>
                      <div style={S.miniLbl}>Rollos MP usados</div>
                      <div style={{ color: "#4b8fe8", fontWeight: 800, fontSize: 20 }}>{Number(p.rollos_usados).toFixed(2)}</div>
                      {p.tipo && <div style={{ fontSize: 11, color: "#8a90ac", marginTop: 2 }}>{p.tipo}</div>}
                    </div>
                  )}
                  {p.tinta_kg != null && (
                    <div style={S.mini}>
                      <div style={S.miniLbl}>Tinta</div>
                      <div style={{ color: "#c9922a", fontWeight: 800, fontSize: 18 }}>{Number(p.tinta_kg).toFixed(3)} kg</div>
                      {(p.color || p.tinta_tipo) && <div style={{ fontSize: 11, color: "#8a90ac", marginTop: 2 }}>{p.color || p.tinta_tipo}</div>}
                    </div>
                  )}
                  {p.tinta_kg2 != null && (
                    <div style={S.mini}>
                      <div style={S.miniLbl}>Tinta 2do color</div>
                      <div style={{ color: "#c9922a", fontWeight: 800, fontSize: 18 }}>{Number(p.tinta_kg2).toFixed(3)} kg</div>
                      {p.color2 && <div style={{ fontSize: 11, color: "#8a90ac", marginTop: 2 }}>{p.color2}</div>}
                    </div>
                  )}
                  {p.alcohol_litros != null && (
                    <div style={S.mini}>
                      <div style={S.miniLbl}>Solvente</div>
                      <div style={{ color: "#4b8fe8", fontWeight: 800, fontSize: 18 }}>{Number(p.alcohol_litros).toFixed(3)} kg</div>
                    </div>
                  )}
                  {p.merma_pct != null && (
                    <div style={S.mini}>
                      <div style={S.miniLbl}>% Merma</div>
                      <div style={{ color: Number(p.merma_pct) > 3 ? "#ff4d4d" : "#4be87a", fontWeight: 800, fontSize: 20 }}>
                        {Number(p.merma_pct).toFixed(2)}%
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── INSUMOS ── */}
              <div style={S.section}>
                <div style={{ ...S.secTitle, display: "flex", alignItems: "center", gap: 6 }}><Ico icon={IcoRef} /> Insumos</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {centros != null && (
                    <div style={S.mini}>
                      <div style={S.miniLbl}>Centros utilizados</div>
                      <div style={{ color: "#e0e0e0", fontWeight: 800, fontSize: 20 }}>{centros.toLocaleString()}</div>
                      {p.merma != null && (
                        <div style={{ fontSize: 10, color: "#3a3f5a", marginTop: 3 }}>
                          {Number(p.piezas_prod).toLocaleString()} prod + {Number(p.merma)} merma
                        </div>
                      )}
                    </div>
                  )}
                  {cajasProducidas != null && (
                    <div style={S.mini}>
                      <div style={S.miniLbl}>Cajas utilizadas</div>
                      <div style={{ color: "#e0e0e0", fontWeight: 800, fontSize: 20 }}>{cajasProducidas.toLocaleString()}</div>
                    </div>
                  )}
                  <div style={S.mini}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div style={S.miniLbl}>Stickybacks</div>
                      {p.stickyback != null && (
                        <span style={{ fontSize: 10, color: "#c9922a", fontWeight: 700 }}>★ Op: {p.stickyback}</span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {[1, 2].map(n => (
                        <button
                          key={n}
                          onClick={() => setStickybacks(s => ({ ...s, [p.id]: n }))}
                          style={{
                            flex: 1, padding: "10px 0", borderRadius: 8, border: "2px solid",
                            borderColor: sticky === n ? "#c9922a" : "#1e2130",
                            background:  sticky === n ? "#c9922a22" : "#13161e",
                            color:       sticky === n ? "#c9922a"   : "#444",
                            fontWeight: 900, fontSize: 20, cursor: "pointer", transition: "all .15s",
                          }}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── TIEMPO DE PRODUCCIÓN ── */}
              <div style={S.section}>
                <div style={S.secTitle}>⏱ Tiempo de producción</div>

                {/* Rango inicio → fin */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#3a3f5a", marginBottom: 10 }}>
                  <span>{fmtTS(p.inicio_ts, p.fecha_inicio)}</span>
                  <span>→</span>
                  <span>{fmtTS(p.fin_ts, p.fecha_termino)}</span>
                </div>

                {/* Tiempo total */}
                {tiempo ? (
                  <div style={{ background: "#0a0c10", borderRadius: 10, padding: "12px 16px", marginBottom: 12, display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 48, fontWeight: 900, color: "#fff", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                      {tiempo}
                    </span>
                    <span style={{ fontSize: 16, color: "#545a78", fontWeight: 600 }}>días</span>
                    {exacto && <span style={{ fontSize: 10, color: "#2a4a2a", background: "#1a2e1a", padding: "2px 7px", borderRadius: 20, marginLeft: 4 }}>exacto</span>}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "#3a3f5a", marginBottom: 12 }}>Sin datos de tiempo suficientes</div>
                )}

                {/* Desglose compacto: Mant. / Luz / operador — mismo tiempo, para que no se le olvide a Emilio que aplica a los 3 */}
                {tiempo && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                    {[
                      { ico: IcoRef, lbl: "Mant." },
                      { ico: IcoBulb, lbl: "Luz"   },
                      { ico: IcoOperador, lbl: p.op || "Operador" },
                    ].map((row, i) => (
                      <div key={i} style={{ background: "#0d0f14", border: "1px solid #1e2132", borderRadius: 8, padding: "7px 6px", textAlign: "center" }}>
                        <div style={{ fontSize: 9, color: "#5a6080", display: "flex", alignItems: "center", justifyContent: "center", gap: 3, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 3 }}>
                          <Ico icon={row.ico} size={10} /> {row.lbl}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#e0e0e0", fontVariantNumeric: "tabular-nums" }}>{tiempo}d</div>
                      </div>
                    ))}
                  </div>
                )}

                {p.notas && <div style={{ fontSize: 12, color: "#aaa", marginTop: 10, display: "flex", alignItems: "center", gap: 5 }}><Ico icon={IcoNote} /> {p.notas}</div>}
                {p.foto_producto_url && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, color: "#555", marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}><Ico icon={IcoCamera} /> Foto del producto</div>
                    <ClicheImg src={p.foto_producto_url} style={{ width: "100%", maxWidth: 300, borderRadius: 8, border: "1px solid #2a2d3a" }} />
                  </div>
                )}
              </div>

              {/* ── Botón dar de alta ── */}
              <button
                onClick={() => darDeAlta(p.id)}
                disabled={loading === p.id}
                style={{
                  width: "100%", padding: "14px 0", borderRadius: 10, border: "none",
                  background: loading === p.id ? "#2a2d3a" : "#4be87a",
                  color: "#000", fontSize: 15, fontWeight: 800,
                  cursor: loading === p.id ? "default" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}>
                {loading === p.id ? "Guardando…" : <><Ico icon={IcoCheck} size={16} /> Ya lo di de alta</>}
              </button>

            </div>
          );
          })}
        </div>
        ))}
        </>}

      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
