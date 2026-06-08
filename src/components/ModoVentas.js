import { useState } from "react";
import { supabase } from "../lib/supabase";
import { today } from "../lib/utils";

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DIAS  = ["LUN","MAR","MIÉ","JUE","VIE","SÁB","DOM"];
const TIPOS = ["Blanca","Color","Kraft","Holográfica","Burbuja"];

const S = { fill:"none", stroke:"currentColor", strokeWidth:2, strokeLinecap:"round", strokeLinejoin:"round" };
const IcoAgenda = () => (<svg viewBox="0 0 24 24" {...S}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="8" cy="15" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="15" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="15" r="1" fill="currentColor" stroke="none"/></svg>);
const IcoNuevo  = () => (<svg viewBox="0 0 24 24" {...S}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>);

const FORM_INIT = { cliente:"", num:"", tipo:"Blanca", medida:"", cajas:"", rollos_caja:"", fecha_estimada:"", notas:"" };

const STATUS_LBL = { pendiente:"Pendiente", anotado:"Anotado", proceso:"En proceso", terminado:"Terminado" };

export default function ModoVentas({ pedidos, setPedidos, onSalir }) {
  const hoy = today();
  const [tab, setTab]   = useState("agenda");
  const [form, setForm] = useState(FORM_INIT);
  const [saving, setSaving] = useState(false);
  const [toast, setToast]   = useState("");

  const initMes = () => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; };
  const [mes, setMes]       = useState(initMes);
  const [diaSel, setDiaSel] = useState(null);

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(""), 3000); };
  const upd = (k, v) => setForm(f => ({...f, [k]: v}));

  const mesStr  = `${mes.y}-${String(mes.m+1).padStart(2,"0")}`;
  const numDias = new Date(mes.y, mes.m+1, 0).getDate();
  const offset  = (() => { const d = new Date(mes.y, mes.m, 1).getDay(); return d===0?6:d-1; })();

  const pedActivos = pedidos.filter(p => p.status !== "terminado");
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
      cliente:         form.cliente.trim(),
      num:             form.num.trim() || `V-${Date.now().toString().slice(-5)}`,
      tipo:            form.tipo,
      medida:          form.medida.trim(),
      cajas:           Number(form.cajas),
      rollos_caja:     form.rollos_caja ? Number(form.rollos_caja) : null,
      fecha_solicitud: hoy,
      fecha_estimada:  form.fecha_estimada || null,
      notas:           form.notas.trim() || null,
      status:          "pendiente",
      maq:             "SIAT L36 #1",
      op:              "",
    };
    const { data, error } = await supabase.from("pedidos").insert([nuevo]).select().single();
    if (error) { showToast("❌ Error: " + error.message); setSaving(false); return; }
    setPedidos(ps => [data || nuevo, ...ps]);
    setForm(FORM_INIT);
    showToast("✅ Pedido registrado correctamente");
    setTab("agenda");
    setSaving(false);
  };

  const selPeds = diaSel ? porDia(diaSel) : [];

  const inputStyle = { width:"100%", background:"#1a1d26", border:"1px solid #2a2d3a", borderRadius:8, padding:"11px 12px", color:"#e0e0e0", fontSize:14, boxSizing:"border-box" };

  return (
    <div style={{ display:"flex", flexDirection:"column", minHeight:"100vh", background:"#0d0f14" }}>

      {/* Header */}
      <header style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", background:"#11131a", borderBottom:"1px solid #1e2130", position:"sticky", top:0, zIndex:10 }}>
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
            <div style={{ background:"#13161e", borderRadius:16, padding:16, marginBottom:16 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
                <button onClick={() => { setMes(x => x.m===0?{y:x.y-1,m:11}:{...x,m:x.m-1}); setDiaSel(null); }} style={{ background:"transparent", border:"1px solid #252a38", borderRadius:10, color:"#aaa", fontSize:20, width:38, height:38, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>‹</button>
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:22, color:"#e8b84b", letterSpacing:".08em" }}>{MESES[mes.m].toUpperCase()}</div>
                  <div style={{ fontSize:13, color:"#555", marginTop:-2 }}>{mes.y}</div>
                </div>
                <button onClick={() => { setMes(x => x.m===11?{y:x.y+1,m:0}:{...x,m:x.m+1}); setDiaSel(null); }} style={{ background:"transparent", border:"1px solid #252a38", borderRadius:10, color:"#aaa", fontSize:20, width:38, height:38, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>›</button>
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:3, marginBottom:4 }}>
                {DIAS.map(d => <div key={d} style={{ textAlign:"center", fontSize:9, fontWeight:700, color:"#444", letterSpacing:".06em", padding:"3px 0" }}>{d}</div>)}
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:3 }}>
                {Array.from({length:offset}).map((_,i) => <div key={`e${i}`} />)}
                {Array.from({length:numDias},(_,i)=>i+1).map(d => {
                  const pds   = porDia(d);
                  const dStr  = `${mesStr}-${String(d).padStart(2,"0")}`;
                  const esHoy = dStr === hoy;
                  const sel   = diaSel === d;
                  return (
                    <div key={d} onClick={() => setDiaSel(sel?null:d)} style={{ background:sel?"#1a2744":esHoy?"#1a1a0d":"#1a1d26", border:`1.5px solid ${esHoy?"#e8b84b":sel?"#4b8fe8":pds.length>0?"#2a3050":"#1e2130"}`, borderRadius:10, padding:"6px 4px 5px", minHeight:56, cursor:"pointer" }}>
                      <div style={{ textAlign:"center", fontSize:12, fontWeight:esHoy?800:400, color:esHoy?"#e8b84b":sel?"#4b8fe8":"#ccc", marginBottom:3 }}>{d}</div>
                      {pds.slice(0,2).map(p => (
                        <div key={p.id} style={{ background:chipColor(p), borderRadius:3, padding:"1px 3px", fontSize:8, fontWeight:700, color:"#000", marginBottom:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {p.num} {(p.cliente||"").slice(0,7)}
                        </div>
                      ))}
                      {pds.length > 2 && <div style={{ fontSize:8, color:"#777", textAlign:"center" }}>+{pds.length-2}</div>}
                      {pds.length === 0 && esHoy && <div style={{ width:6, height:6, background:"#e8b84b44", borderRadius:"50%", margin:"2px auto 0" }} />}
                    </div>
                  );
                })}
              </div>

              <div style={{ display:"flex", gap:14, marginTop:12, paddingTop:10, borderTop:"1px solid #1e2130" }}>
                {[["#e8b84b","Anotado"],["#4b8fe8","En proceso"],["#e84b4b","Vencido"]].map(([c,l]) => (
                  <div key={l} style={{ display:"flex", alignItems:"center", gap:5, fontSize:10, color:"#666" }}>
                    <div style={{ width:9, height:9, background:c, borderRadius:2 }} />{l}
                  </div>
                ))}
              </div>
            </div>

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
                          <div style={{ fontSize:12, color:"#666", marginTop:2 }}>{p.medida} · {p.cajas} cajas</div>
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
                      <div style={{ fontSize:12, color:"#555", marginTop:2 }}>{p.medida} · {p.cajas} cajas</div>
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
        {tab === "nuevo" && (
          <div>
            <h2 style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:22, fontWeight:800, color:"#e8b84b", letterSpacing:".06em", margin:"0 0 18px" }}>Nuevo Pedido</h2>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>

              <div style={{ gridColumn:"1/-1" }}>
                <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5, fontWeight:600 }}>Cliente *</label>
                <input value={form.cliente} onChange={e=>upd("cliente",e.target.value)} placeholder="Nombre del cliente" style={inputStyle} />
              </div>

              <div>
                <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5, fontWeight:600 }}>No. Pedido</label>
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

              <div style={{ gridColumn:"1/-1" }}>
                <label style={{ fontSize:12, color:"#888", display:"block", marginBottom:5, fontWeight:600 }}>📅 Fecha deseada de entrega</label>
                <input type="date" value={form.fecha_estimada} onChange={e=>upd("fecha_estimada",e.target.value)} style={inputStyle} />
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
        )}
      </main>

      {/* Toast */}
      {toast && (
        <div style={{ position:"fixed", top:20, left:"50%", transform:"translateX(-50%)", background:"#1e2130", border:"1px solid #3a3d4a", borderRadius:10, padding:"10px 22px", color:"#e0e0e0", fontSize:13, fontWeight:600, zIndex:300, whiteSpace:"nowrap", boxShadow:"0 4px 20px #0008" }}>
          {toast}
        </div>
      )}

      {/* Bottom nav */}
      <nav style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:640, background:"#11131a", borderTop:"1px solid #1e2130", display:"flex", paddingBottom:"env(safe-area-inset-bottom,0px)", zIndex:50 }}>
        {[
          { id:"agenda", Icon:IcoAgenda, lbl:"Agenda" },
          { id:"nuevo",  Icon:IcoNuevo,  lbl:"Nuevo Pedido" },
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
