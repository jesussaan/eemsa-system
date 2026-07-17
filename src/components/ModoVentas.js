import { useState } from "react";
import { authHeaders } from "../lib/auth";
import { today, uid, siguienteNumPedido } from "../lib/utils";
import { rollosPorCaja } from "../lib/produccion";
import { TIPOS, REBOB_CLIENTE } from "../lib/constants";
import { sendWhatsApp, mensajePedidoNuevo } from "../utils/whatsapp";
import Clientes from "./Clientes";
import CalendarGrid from "./CalendarGrid";

// La Medida se escribe como "2x100" -- las pulgadas son el numero inicial.
const anchoDeMedida = (medida) => (String(medida).match(/^\s*(\d+(\.\d+)?)/) || [])[1] || '';

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

const S = { fill:"none", stroke:"currentColor", strokeWidth:2, strokeLinecap:"round", strokeLinejoin:"round" };
const IcoAgenda = () => (<svg viewBox="0 0 24 24" {...S}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="8" cy="15" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="15" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="15" r="1" fill="currentColor" stroke="none"/></svg>);
const IcoNuevo  = () => (<svg viewBox="0 0 24 24" {...S}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>);
const IcoCli    = () => (<svg viewBox="0 0 24 24" {...S}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>);

const FORM_INIT = { cliente:"", num:"", tipo:"Blanca", medida:"", cajas:"", rollos_caja:"", rollos_totales:"", tinta_tipo:"", color2:"", notas:"" };

const STATUS_LBL = { pendiente:"Pendiente", anotado:"Anotado", proceso:"En proceso", terminado:"Terminado" };

export default function ModoVentas({ pedidos, setPedidos, onSalir }) {
  const hoy = today();
  const [tab, setTab]   = useState("agenda");
  const [form, setForm] = useState(() => ({ ...FORM_INIT, num: siguienteNumPedido(pedidos) }));
  const [saving, setSaving] = useState(false);
  const [toast, setToast]   = useState("");

  const initMes = () => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; };
  const [mes, setMes]       = useState(initMes);
  const [diaSel, setDiaSel] = useState(null);
  const setMesYLimpiar = (updater) => { setMes(updater); setDiaSel(null); };

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(""), 3000); };
  const upd = (k, v) => setForm(f => {
    const nf = {...f, [k]: v};
    // Rollos/caja ya no se escribe a mano -- se calcula solo de tipo + las
    // pulgadas que trae la Medida (2"=36, 3"=24, Engomado=10).
    if (k === "medida" || k === "tipo") {
      const medidaActual = k === "medida" ? v : nf.medida;
      const tipoActual    = k === "tipo"   ? v : nf.tipo;
      nf.rollos_caja = String(rollosPorCaja(anchoDeMedida(medidaActual), tipoActual === "Engomado"));
    }
    if (k === "cajas" || k === "medida" || k === "tipo") {
      const c = k === "cajas" ? v : nf.cajas;
      nf.rollos_totales = (c && nf.rollos_caja) ? String(Number(c) * Number(nf.rollos_caja)) : "";
    }
    return nf;
  });

  const repetirPedido = (p) => {
    const tipo  = p.tipo || "Blanca";
    const cajas = p.cajas ? String(p.cajas) : "";
    const rollosCaja = String(rollosPorCaja(anchoDeMedida(p.medida || ""), tipo === "Engomado"));
    setForm(f => ({
      ...f,
      cliente:        p.cliente || "",
      tipo,
      medida:         p.medida || "",
      cajas,
      rollos_caja:    rollosCaja,
      rollos_totales: (cajas && rollosCaja) ? String(Number(cajas) * Number(rollosCaja)) : "",
      tinta_tipo:     p.tinta_tipo || "",
      color2:         p.color2 || "",
      notas:          "",
    }));
    showToast("✓ Datos pre-llenados — revisa y guarda");
  };

  const mesStr  = `${mes.y}-${String(mes.m+1).padStart(2,"0")}`;

  const pedActivos = pedidos.filter(p => p.status !== "terminado" && p.cliente !== REBOB_CLIENTE);
  const conFecha   = pedActivos.filter(p => p.fecha_estimada).sort((a,b) => a.fecha_estimada.localeCompare(b.fecha_estimada));
  const proximos   = conFecha.filter(p => p.fecha_estimada >= hoy).slice(0, 10);

  const porDia = d => {
    const k = `${mesStr}-${String(d).padStart(2,"0")}`;
    return pedActivos.filter(p => p.fecha_estimada === k);
  };

  const chipColor = p => {
    if (p.fecha_estimada && p.fecha_estimada < hoy) return "#e84b4b";
    if (p.status === "proceso") return "#4b8fe8";
    return "#e8b84b";
  };

  const save = async () => {
    if (!form.cliente.trim()) { showToast("⚠ Escribe el nombre del cliente"); return; }
    if (!form.medida.trim())  { showToast("⚠ Escribe la medida"); return; }
    if (!form.cajas)          { showToast("⚠ Escribe el número de cajas"); return; }
    setSaving(true);
    const nuevo = {
      id:              uid(),
      cliente:         form.cliente.trim(),
      num:             form.num.trim() || `V-${Date.now().toString().slice(-5)}`,
      tipo:            form.tipo,
      medida:          form.medida.trim(),
      cajas:           Number(form.cajas),
      rollos_caja:     form.rollos_caja ? Number(form.rollos_caja) : null,
      rollos_totales:  form.rollos_totales ? Number(form.rollos_totales) : null,
      tinta_tipo:      form.tinta_tipo.trim() || null,
      color2:          form.color2.trim() || null,
      fecha_solicitud: form.fecha_solicitud || hoy,
      notas:           form.notas.trim() || null,
      status:          "anotado",
      maq:             "SIAT L36 #1",
      op:              "",
    };
    const res = await fetch('/api/pedidos', { method: 'POST', headers: authHeaders(), body: JSON.stringify(nuevo) });
    const data = await res.json();
    if (!res.ok) { showToast("❌ Error: " + (data.error || "desconocido")); setSaving(false); return; }
    const guardado = data || nuevo;
    setPedidos(ps => [guardado, ...ps]);
    setForm({ ...FORM_INIT, num: siguienteNumPedido([guardado, ...pedidos]) });
    sendWhatsApp(mensajePedidoNuevo(guardado));
    showToast("✅ Pedido registrado correctamente");
    setTab("agenda");
    setSaving(false);
  };

  const selPeds = diaSel ? porDia(diaSel) : [];

  const inputStyle = { width:"100%", background:"var(--card)", border:"1px solid var(--border-light)", borderRadius:"var(--r-sm)", padding:"11px 12px", color:"var(--text)", fontSize:14, boxSizing:"border-box" };

  return (
    <div style={{ display:"flex", flexDirection:"column", minHeight:"100vh", background:"var(--bg)" }}>

      {/* Header */}
      <header style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", background:"var(--surface)", borderBottom:"2px solid var(--green)", position:"sticky", top:0, zIndex:10 }}>
        <img src="/logo192.png" alt="EEMSA" style={{ height:36, width:"auto" }} />
        <div>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:16, color:"#e0e0e0", letterSpacing:".06em" }}>EEMSA System</div>
          <div style={{ fontSize:10, color:"#c9922a", fontWeight:700, letterSpacing:".08em" }}>MÓDULO VENTAS</div>
        </div>
        <button onClick={onSalir} style={{ marginLeft:"auto", fontSize:11, color:"#666", background:"transparent", border:"none", cursor:"pointer", padding:"4px 8px" }}>← Salir</button>
      </header>

      {/* Main */}
      <main style={{ flex:1, padding:"16px 16px 82px", maxWidth:640, margin:"0 auto", width:"100%" }}>

        {/* ── AGENDA ── */}
        {tab === "agenda" && (
          <div>
            <h2 style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:22, fontWeight:800, color:"#e8b84b", letterSpacing:".06em", margin:"0 0 14px" }}>Agenda de Entregas</h2>

            {/* Stats */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
              <div style={{ background:"#13161e", borderRadius:12, padding:"12px 14px" }}>
                <div style={{ fontSize:24, fontWeight:800, color:"#e8b84b" }}>{proximos.length}</div>
                <div style={{ fontSize:11, color:"#666" }}>Próximas entregas</div>
              </div>
              <div style={{ background:"#13161e", borderRadius:12, padding:"12px 14px" }}>
                <div style={{ fontSize:24, fontWeight:800, color:"#e84b4b" }}>{pedActivos.filter(p => p.fecha_estimada && p.fecha_estimada < hoy).length}</div>
                <div style={{ fontSize:11, color:"#666" }}>Vencidas</div>
              </div>
            </div>

            {/* Calendario */}
            <CalendarGrid
              mes={mes} setMes={setMesYLimpiar}
              diaSel={diaSel} onSelectDia={(d) => setDiaSel(d)}
              pedidos={pedActivos}
              chipColor={chipColor}
              hoy={hoy}
            />

            {/* Panel día seleccionado */}
            {diaSel !== null && (
              <div style={{ background:"#13161e", borderRadius:14, padding:14, marginBottom:16 }}>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:18, fontWeight:700, color:"#e8b84b", marginBottom:10 }}>
                  {diaSel} de {MESES[mes.m]} {mes.y}
                </div>
                {selPeds.length === 0
                  ? <p style={{ color:"#444", fontSize:13, margin:0 }}>Sin entregas programadas para este día.</p>
                  : selPeds.map(p => {
                      const cc = chipColor(p);
                      return (
                        <div key={p.id} style={{ background:cc+"22", border:`1px solid ${cc}`, borderRadius:10, padding:"10px 12px", marginBottom:8 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                            <span style={{ fontWeight:700, fontSize:15, color:"#e0e0e0" }}>Ped. {p.num}</span>
                            <span style={{ background:cc+"33", color:cc, borderRadius:6, padding:"2px 8px", fontSize:11, fontWeight:700 }}>{STATUS_LBL[p.status]||p.status}</span>
                          </div>
                          <div style={{ fontSize:13, color:"#aaa" }}>{p.cliente}</div>
                          <div style={{ fontSize:12, color:"#666", marginTop:2 }}>{p.medida} · {p.cajas} cajas{p.rollos_totales ? ` · ${p.rollos_totales} piezas/rollos` : ""}</div>
                        </div>
                      );
                    })
                }
              </div>
            )}

            {/* Próximas entregas */}
            {proximos.length > 0 && (
              <>
                <div style={{ fontSize:12, fontWeight:700, color:"#666", letterSpacing:".06em", marginBottom:8, marginTop:4 }}>PRÓXIMAS ENTREGAS</div>
                {proximos.map(p => {
                  const cc = chipColor(p);
                  const diasFaltan = Math.round((new Date(p.fecha_estimada+"T12:00:00") - new Date(hoy+"T12:00:00")) / 86400000);
                  return (
                    <div key={p.id} style={{ background:"#13161e", borderLeft:`3px solid ${cc}`, borderRadius:"0 10px 10px 0", padding:"10px 14px", marginBottom:6 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                        <div>
                          <strong style={{ color:"#e0e0e0", fontSize:14 }}>{p.num}</strong>
                          <span style={{ color:"#666", fontSize:13 }}> — {p.cliente}</span>
                        </div>
                        <div style={{ textAlign:"right", flexShrink:0, marginLeft:8 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:cc }}>{p.fecha_estimada}</div>
                          <div style={{ fontSize:11, color:"#555" }}>{diasFaltan===0?"Hoy":diasFaltan>0?`en ${diasFaltan}d`:`hace ${Math.abs(diasFaltan)}d`}</div>
                        </div>
                      </div>
                      <div style={{ fontSize:12, color:"#555", marginTop:2 }}>{p.medida} · {p.cajas} cajas{p.rollos_totales ? ` · ${p.rollos_totales} piezas/rollos` : ""}</div>
                    </div>
                  );
                })}
              </>
            )}

            {proximos.length === 0 && conFecha.length === 0 && (
              <div style={{ textAlign:"center", padding:"32px 0", color:"#444", fontSize:13 }}>
                No hay entregas con fecha asignada.<br />El supervisor las asigna desde el módulo Agenda.
              </div>
            )}
          </div>
        )}

        {/* ── NUEVO PEDIDO ── */}
        {tab === "nuevo" && (() => {
          const sorted = [...pedidos].filter(p => p.cliente !== REBOB_CLIENTE).sort((a, b) => (b.fecha_solicitud || "").localeCompare(a.fecha_solicitud || ""));
          const clientesSugeridos = [...new Set(sorted.map(p => p.cliente).filter(Boolean))].sort();
          const q = form.cliente.trim().toLowerCase();
          const recientes = q.length >= 2
            ? sorted.filter(p => p.cliente?.toLowerCase().includes(q)).slice(0, 5)
            : sorted.slice(0, 6);
          return (
          <div>
            <h2 style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:22, fontWeight:800, color:"#e8b84b", letterSpacing:".06em", margin:"0 0 14px" }}>Nuevo Pedido</h2>

            {recientes.length > 0 && (
              <div style={{ background:"#13161e", borderRadius:12, padding:"10px 12px", marginBottom:18 }}>
                <div style={{ fontSize:10, color:"#666", fontWeight:700, letterSpacing:".07em", textTransform:"uppercase", marginBottom:8 }}>
                  {q.length >= 2 ? `Pedidos de ${form.cliente.trim()}` : "Pedidos recientes"}
                </div>
                {recientes.map((p, i) => (
                  <div key={p.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom: i < recientes.length - 1 ? "1px solid #1a1d26" : "none" }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, color:"#e0e0e0", fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{p.cliente}</div>
                      <div style={{ fontSize:11, color:"#555", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                        #{p.num} · {p.medida} · {p.cajas} cajas · {p.tipo}
                      </div>
                    </div>
                    <button
                      onClick={() => repetirPedido(p)}
                      style={{ flexShrink:0, background:"#0f1a2e", border:"1px solid #2a4a7a", borderRadius:8, color:"#4b8fe8", fontSize:12, fontWeight:700, padding:"6px 14px", cursor:"pointer" }}
                    >
                      Repetir
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>

              <div style={{ gridColumn:"1/-1" }}>
                <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5, fontWeight:600 }}>Cliente *</label>
                <input value={form.cliente} onChange={e=>upd("cliente",e.target.value)} placeholder="Nombre del cliente" style={inputStyle} list="clientes-list-ventas" />
                <datalist id="clientes-list-ventas">{clientesSugeridos.map(c => <option key={c} value={c} />)}</datalist>
              </div>

              <div>
                <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5, fontWeight:600 }}>No. Pedido <span style={{ color:"#555", fontWeight:400 }}>(sugerido, edítalo si no aplica)</span></label>
                <input value={form.num} onChange={e=>upd("num",e.target.value)} placeholder="Ej: 1042" style={inputStyle} />
              </div>

              <div>
                <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5, fontWeight:600 }}>Tipo de cinta</label>
                <select value={form.tipo} onChange={e=>upd("tipo",e.target.value)} style={inputStyle}>
                  {TIPOS.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>

              <div>
                <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5, fontWeight:600 }}>Medida *</label>
                <input value={form.medida} onChange={e=>upd("medida",e.target.value)} placeholder="Ej: 2x100" style={inputStyle} />
              </div>

              <div>
                <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5, fontWeight:600 }}>Cajas *</label>
                <input type="number" min="0" value={form.cajas} onChange={e=>upd("cajas",e.target.value)} placeholder="0" style={inputStyle} />
              </div>

              <div>
                <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5, fontWeight:600 }}>Rollos / caja <span style={{ color:"#555", fontWeight:400 }}>(automático)</span></label>
                <input type="number" readOnly value={form.rollos_caja} placeholder="Ej: 36" style={{ ...inputStyle, background: "#1a2744", color: "#c9922a" }} />
              </div>

              <div>
                <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5, fontWeight:600 }}>Piezas / rollos totales <span style={{ color:"#555", fontWeight:400 }}>(automático)</span></label>
                <input type="number" readOnly value={form.rollos_totales} placeholder="Cajas × Rollos/caja" style={{ ...inputStyle, background: "#1a2744", color: "#c9922a" }} />
              </div>

              <div>
                <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5, fontWeight:600 }}>Tinta</label>
                <input value={form.tinta_tipo} onChange={e=>upd("tinta_tipo",e.target.value)} placeholder="Ej: Roja UV, Azul PMS…" style={inputStyle} />
              </div>

              <div>
                <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5, fontWeight:600 }}>2do color (opcional)</label>
                <input value={form.color2} onChange={e=>upd("color2",e.target.value)} placeholder="Solo si el pedido lleva 2 tintas" style={inputStyle} />
              </div>

              <div>
                <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5, fontWeight:600 }}>📅 Fecha de solicitud</label>
                <input type="date" value={form.fecha_solicitud||hoy} onChange={e=>upd("fecha_solicitud",e.target.value)} style={inputStyle} />
              </div>

              <div style={{ gridColumn:"1/-1" }}>
                <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5, fontWeight:600 }}>Notas / Especificaciones</label>
                <textarea value={form.notas} onChange={e=>upd("notas",e.target.value)} placeholder="Color, instrucciones especiales, urgencia…" rows={3} style={{ ...inputStyle, resize:"vertical" }} />
              </div>
            </div>

            <button onClick={save} disabled={saving} style={{ width:"100%", marginTop:20, padding:"15px 0", borderRadius:12, border:"none", background:saving?"#2a2d3a":"#e8b84b", color:saving?"#666":"#000", fontSize:16, fontWeight:800, cursor:saving?"default":"pointer", letterSpacing:".04em" }}>
              {saving ? "Guardando…" : "📋 Registrar Pedido"}
            </button>
          </div>
          );
        })()}

        {/* ── CLIENTES ── */}
        {tab === "clientes" && <Clientes pedidos={pedidos} ocultarMerma />}
      </main>

      {/* Toast */}
      {toast && (
        <div style={{ position:"fixed", top:20, left:"50%", transform:"translateX(-50%)", background:"#1e2130", border:"1px solid #3a3d4a", borderRadius:10, padding:"10px 22px", color:"#e0e0e0", fontSize:13, fontWeight:600, zIndex:300, whiteSpace:"nowrap", boxShadow:"0 4px 20px #0008" }}>
          {toast}
        </div>
      )}

      {/* Bottom nav */}
      <nav style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:640, background:"var(--surface)", borderTop:"1px solid var(--border)", display:"flex", paddingBottom:"env(safe-area-inset-bottom,0px)", zIndex:50 }}>
        {[
          { id:"agenda",   Icon:IcoAgenda, lbl:"Agenda" },
          { id:"nuevo",    Icon:IcoNuevo,  lbl:"Nuevo Pedido" },
          { id:"clientes", Icon:IcoCli,    lbl:"Clientes" },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ flex:1, background:"transparent", border:"none", padding:"9px 4px 7px", display:"flex", flexDirection:"column", alignItems:"center", gap:3, cursor:"pointer", color:tab===t.id?"#e8b84b":"#555", borderTop:tab===t.id?"2px solid #e8b84b":"2px solid transparent" }}>
            <span style={{ width:22, height:22 }}><t.Icon /></span>
            <span style={{ fontSize:10, fontWeight:700, letterSpacing:".04em" }}>{t.lbl}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
