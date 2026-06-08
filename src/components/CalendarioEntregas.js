import { useState } from "react";
import { supabase } from "../lib/supabase";
import { today } from "../lib/utils";
import { STATUS_PED } from "../lib/constants";

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DIAS  = ["LUN","MAR","MIÉ","JUE","VIE","SÁB","DOM"];

export default function CalendarioEntregas({ pedidos, setPedidos }) {
  const hoy = today();
  const init = () => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; };
  const [mes, setMes]             = useState(init);
  const [diaSel, setDiaSel]       = useState(null);
  const [fechaTemp, setFechaTemp] = useState({});
  const [saving, setSaving]       = useState(null);
  const [asignando, setAsignando] = useState(false);

  const prev  = () => setMes(x => x.m === 0 ? { y: x.y-1, m: 11 } : { ...x, m: x.m-1 });
  const next  = () => setMes(x => x.m === 11 ? { y: x.y+1, m:  0 } : { ...x, m: x.m+1 });
  const irHoy = () => { setMes(init()); setDiaSel(null); };

  const mesStr  = `${mes.y}-${String(mes.m+1).padStart(2,"0")}`;
  const numDias = new Date(mes.y, mes.m+1, 0).getDate();
  const offset  = (() => { const d = new Date(mes.y,mes.m,1).getDay(); return d===0?6:d-1; })();

  const pedidosActivos = pedidos.filter(p => p.status !== "terminado");
  const sinFecha = pedidosActivos.filter(p => !p.fecha_estimada);
  const conFecha = pedidosActivos.filter(p => p.fecha_estimada).sort((a,b) => a.fecha_estimada.localeCompare(b.fecha_estimada));
  const proximos = conFecha.filter(p => p.fecha_estimada >= hoy).slice(0, 10);

  const porDia = d => {
    const k = `${mesStr}-${String(d).padStart(2,"0")}`;
    return pedidosActivos.filter(p => p.fecha_estimada === k);
  };

  const colorStatus = p => {
    if (p.fecha_estimada && p.fecha_estimada < hoy) return { bg:"#e84b4b22", border:"#e84b4b", txt:"#e84b4b", chip:"#e84b4b" };
    if (p.status === "proceso") return { bg:"#4b8fe822", border:"#4b8fe8", txt:"#4b8fe8", chip:"#4b8fe8" };
    return { bg:"#e8b84b18", border:"#e8b84b", txt:"#e8b84b", chip:"#e8b84b" };
  };

  const asignarFecha = async (pedidoId, fecha) => {
    if (!fecha) return;
    setSaving(pedidoId);
    const { error } = await supabase.from("pedidos").update({ fecha_estimada: fecha }).eq("id", pedidoId);
    if (!error) {
      setPedidos(ps => ps.map(p => p.id === pedidoId ? { ...p, fecha_estimada: fecha } : p));
      setFechaTemp(f => { const n = {...f}; delete n[pedidoId]; return n; });
    }
    setSaving(null);
  };

  const asignarADia = async (pedidoId, dia) => {
    const fecha = `${mesStr}-${String(dia).padStart(2,"0")}`;
    await asignarFecha(pedidoId, fecha);
    setAsignando(false);
  };

  const quitarFecha = async (pedidoId) => {
    setSaving(pedidoId);
    const { error } = await supabase.from("pedidos").update({ fecha_estimada: null }).eq("id", pedidoId);
    if (!error) {
      setPedidos(ps => ps.map(p => p.id === pedidoId ? { ...p, fecha_estimada: null } : p));
    }
    setSaving(null);
  };

  const selPeds = diaSel ? porDia(diaSel) : [];

  return (
    <div>
      <h2 className="sec-title">Agenda de Entregas</h2>

      {/* Stats */}
      <div className="stat-grid" style={{ marginBottom: 14 }}>
        <div className="stat-card accent">
          <div className="stat-val">{conFecha.length}</div>
          <div className="stat-lbl">Con fecha</div>
        </div>
        <div className="stat-card red">
          <div className="stat-val">{pedidosActivos.filter(p => p.fecha_estimada && p.fecha_estimada < hoy).length}</div>
          <div className="stat-lbl">Vencidos</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-val">{proximos.length}</div>
          <div className="stat-lbl">Próximas</div>
        </div>
        <div className="stat-card orange">
          <div className="stat-val">{sinFecha.length}</div>
          <div className="stat-lbl">Sin fecha</div>
        </div>
      </div>

      {/* Calendario */}
      <div style={{ background:"#13161e", borderRadius:16, padding:16, marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
          <button onClick={prev} style={{ background:"transparent", border:"1px solid #252a38", borderRadius:10, color:"#aaa", fontSize:20, width:38, height:38, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>‹</button>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:22, color:"#e8b84b", letterSpacing:".08em" }}>{MESES[mes.m].toUpperCase()}</div>
            <div style={{ fontSize:13, color:"#555", marginTop:-2 }}>{mes.y}</div>
          </div>
          <button onClick={next} style={{ background:"transparent", border:"1px solid #252a38", borderRadius:10, color:"#aaa", fontSize:20, width:38, height:38, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>›</button>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:3, marginBottom:4 }}>
          {DIAS.map(d => (
            <div key={d} style={{ textAlign:"center", fontSize:9, fontWeight:700, color:"#444", letterSpacing:".06em", padding:"3px 0" }}>{d}</div>
          ))}
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:3 }}>
          {Array.from({length:offset}).map((_,i) => <div key={`e${i}`} />)}
          {Array.from({length:numDias},(_,i)=>i+1).map(d => {
            const pds   = porDia(d);
            const dStr  = `${mesStr}-${String(d).padStart(2,"0")}`;
            const esHoy = dStr === hoy;
            const sel   = diaSel === d;
            return (
              <div
                key={d}
                onClick={() => { setDiaSel(sel ? null : d); setAsignando(false); }}
                style={{
                  background: sel ? "#1a2744" : esHoy ? "#1a1a0d" : "#1a1d26",
                  border: `1.5px solid ${esHoy ? "#e8b84b" : sel ? "#4b8fe8" : pds.length > 0 ? "#2a3050" : "#1e2130"}`,
                  borderRadius: 10, padding: "6px 4px 5px", minHeight: 58,
                  cursor: "pointer", transition: "border-color .15s",
                }}
              >
                <div style={{ textAlign:"center", fontSize:12, fontWeight: esHoy ? 800 : 400, color: esHoy ? "#e8b84b" : sel ? "#4b8fe8" : "#ccc", marginBottom:3 }}>{d}</div>
                {pds.slice(0,2).map(p => {
                  const c = colorStatus(p);
                  return (
                    <div key={p.id} style={{ background:c.chip, borderRadius:3, padding:"1px 3px", fontSize:8, fontWeight:700, color:"#000", marginBottom:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {p.num} {(p.cliente||"").slice(0,7)}
                    </div>
                  );
                })}
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
          <button onClick={irHoy} style={{ marginLeft:"auto", background:"transparent", border:"1px solid #252a38", borderRadius:6, color:"#888", fontSize:10, padding:"2px 8px", cursor:"pointer" }}>Hoy</button>
        </div>
      </div>

      {/* Panel de día seleccionado */}
      {diaSel !== null && (
        <div style={{ background:"#13161e", borderRadius:14, padding:14, marginBottom:16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:18, fontWeight:700, color:"#e8b84b" }}>
              {diaSel} de {MESES[mes.m]} {mes.y}
            </div>
            {sinFecha.length > 0 && !asignando && (
              <button onClick={() => setAsignando(true)} style={{ background:"#e8b84b22", border:"1px solid #e8b84b", borderRadius:8, color:"#e8b84b", fontSize:12, fontWeight:700, padding:"5px 12px", cursor:"pointer" }}>
                + Asignar pedido aquí
              </button>
            )}
          </div>

          {/* Lista de pedidos sin fecha para asignar a este día */}
          {asignando && (
            <div style={{ background:"#0d0f14", borderRadius:10, padding:12, marginBottom:12 }}>
              <div style={{ fontSize:12, color:"#888", marginBottom:8 }}>¿Cuál pedido entra el {diaSel}/{mes.m+1}?</div>
              {sinFecha.map(p => (
                <div
                  key={p.id}
                  onClick={() => saving !== p.id && asignarADia(p.id, diaSel)}
                  style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 10px", borderRadius:8, background:"#13161e", border:"1px solid #252a38", marginBottom:6, cursor:"pointer" }}
                >
                  <div>
                    <span style={{ fontWeight:700, color:"#e0e0e0", fontSize:13 }}>Ped. {p.num}</span>
                    <span style={{ color:"#666", fontSize:12 }}> — {p.cliente} · {p.medida}</span>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <span className={`badge ${p.status==="proceso"?"b-blue":"b-orange"}`}>{STATUS_PED[p.status]||p.status}</span>
                    {saving === p.id
                      ? <span style={{ color:"#888", fontSize:12 }}>…</span>
                      : <span style={{ color:"#e8b84b", fontSize:18, fontWeight:700 }}>→</span>
                    }
                  </div>
                </div>
              ))}
              <button onClick={() => setAsignando(false)} style={{ width:"100%", marginTop:4, background:"transparent", border:"1px solid #252a38", borderRadius:8, color:"#666", fontSize:12, padding:"7px 0", cursor:"pointer" }}>Cancelar</button>
            </div>
          )}

          {selPeds.length === 0 && !asignando && (
            <p style={{ color:"#444", fontSize:13, margin:0 }}>Sin entregas para este día.{sinFecha.length > 0 ? " Toca "+ '"+ Asignar pedido aquí"' + " para agregar uno." : ""}</p>
          )}

          {selPeds.map(p => {
            const c = colorStatus(p);
            return (
              <div key={p.id} style={{ background:c.bg, border:`1px solid ${c.border}`, borderRadius:10, padding:"10px 12px", marginBottom:8 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                  <span style={{ fontWeight:700, fontSize:15, color:"#e0e0e0" }}>Ped. {p.num}</span>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ background:c.border+"33", color:c.txt, borderRadius:6, padding:"2px 8px", fontSize:11, fontWeight:700 }}>{STATUS_PED[p.status]||p.status}</span>
                    <button onClick={() => quitarFecha(p.id)} disabled={saving === p.id} style={{ background:"transparent", border:"none", color:"#555", fontSize:14, cursor:"pointer", padding:"0 4px" }} title="Quitar fecha">✕</button>
                  </div>
                </div>
                <div style={{ fontSize:13, color:"#aaa" }}>{p.cliente}</div>
                <div style={{ fontSize:12, color:"#666", marginTop:2 }}>{p.medida} · {p.cajas} cajas</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Próximas entregas */}
      {proximos.length > 0 && (
        <>
          <h3 className="sub-title">Próximas entregas</h3>
          <div className="list">
            {proximos.map(p => {
              const c = colorStatus(p);
              const diasFaltan = Math.round((new Date(p.fecha_estimada+"T12:00:00") - new Date(hoy+"T12:00:00")) / 86400000);
              return (
                <div key={p.id} className="list-item" style={{ borderLeft:`3px solid ${c.border}` }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                    <div>
                      <strong>{p.num}</strong> — {p.cliente}
                      <span className={`badge ${p.status==="proceso"?"b-blue":"b-orange"}`}>{STATUS_PED[p.status]||p.status}</span>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:13, fontWeight:700, color:c.txt }}>{p.fecha_estimada}</div>
                      <div style={{ fontSize:11, color:"#666" }}>{diasFaltan === 0 ? "Hoy" : diasFaltan > 0 ? `en ${diasFaltan}d` : `hace ${Math.abs(diasFaltan)}d`}</div>
                    </div>
                  </div>
                  <div className="muted">{p.medida} · {p.cajas} cajas</div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Sin fecha — asignación rápida */}
      {sinFecha.length > 0 && (
        <>
          <h3 className="sub-title" style={{ marginTop:16 }}>Sin fecha de entrega ({sinFecha.length})</h3>
          <div style={{ background:"#13161e", borderRadius:10, padding:"10px 14px" }}>
            <p style={{ fontSize:12, color:"#555", margin:"0 0 10px" }}>Ponle fecha directamente aquí, o toca un día del calendario y usa "+ Asignar pedido aquí".</p>
            {sinFecha.map(p => (
              <div key={p.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 0", borderBottom:"1px solid #1e2130", gap:8, flexWrap:"wrap" }}>
                <div style={{ minWidth:0, flex:1 }}>
                  <span style={{ fontWeight:600, color:"#ccc", fontSize:13 }}>Ped. {p.num}</span>
                  <span style={{ color:"#555", fontSize:12 }}> — {p.cliente} · {p.medida}</span>
                  <span className={`badge ${p.status==="proceso"?"b-blue":"b-orange"}`} style={{ marginLeft:4 }}>{STATUS_PED[p.status]||p.status}</span>
                </div>
                <div style={{ display:"flex", gap:6, alignItems:"center", flexShrink:0 }}>
                  <input
                    type="date"
                    value={fechaTemp[p.id]||""}
                    onChange={e => setFechaTemp(f=>({...f,[p.id]:e.target.value}))}
                    style={{ background:"#1a1d26", border:"1px solid #2a2d3a", borderRadius:6, color:"#e0e0e0", fontSize:12, padding:"5px 8px" }}
                  />
                  <button
                    onClick={() => asignarFecha(p.id, fechaTemp[p.id])}
                    disabled={!fechaTemp[p.id] || saving === p.id}
                    style={{
                      background: fechaTemp[p.id] ? "#e8b84b" : "#1e2130",
                      color: fechaTemp[p.id] ? "#000" : "#444",
                      border:"none", borderRadius:6, padding:"5px 14px",
                      fontSize:13, fontWeight:700,
                      cursor: fechaTemp[p.id] ? "pointer" : "default",
                    }}
                  >
                    {saving === p.id ? "…" : "✓"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
