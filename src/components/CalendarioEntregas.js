import { useState } from "react";
import { today } from "../lib/utils";
import { STATUS_PED } from "../lib/constants";

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DIAS  = ["LUN","MAR","MIÉ","JUE","VIE","SÁB","DOM"];

export default function CalendarioEntregas({ pedidos, onAbrirPedido }) {
  const hoy = today();
  const init = () => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; };
  const [mes, setMes]       = useState(init);
  const [diaSel, setDiaSel] = useState(null);

  const prev = () => setMes(x => x.m === 0 ? { y: x.y-1, m: 11 } : { ...x, m: x.m-1 });
  const next = () => setMes(x => x.m === 11 ? { y: x.y+1, m:  0 } : { ...x, m: x.m+1 });
  const irHoy = () => { setMes(init()); setDiaSel(null); };

  const mesStr   = `${mes.y}-${String(mes.m+1).padStart(2,"0")}`;
  const numDias  = new Date(mes.y, mes.m+1, 0).getDate();
  const offset   = (() => { const d = new Date(mes.y,mes.m,1).getDay(); return d===0?6:d-1; })();

  const pedidosActivos = pedidos.filter(p => p.status !== "terminado");

  const porDia = d => {
    const k = `${mesStr}-${String(d).padStart(2,"0")}`;
    return pedidosActivos.filter(p => p.fecha_estimada === k);
  };

  const colorStatus = p => {
    if (p.fecha_estimada && p.fecha_estimada < hoy) return { bg:"#e84b4b22", border:"#e84b4b", txt:"#e84b4b", chip:"#e84b4b" };
    if (p.status === "proceso")  return { bg:"#4b8fe822", border:"#4b8fe8", txt:"#4b8fe8", chip:"#4b8fe8" };
    return { bg:"#e8b84b18", border:"#e8b84b", txt:"#e8b84b", chip:"#e8b84b" };
  };

  const sinFecha = pedidosActivos.filter(p => !p.fecha_estimada);
  const conFecha = pedidosActivos.filter(p => p.fecha_estimada).sort((a,b) => a.fecha_estimada.localeCompare(b.fecha_estimada));
  const proximos = conFecha.filter(p => p.fecha_estimada >= hoy).slice(0, 8);

  const selPeds = diaSel ? porDia(diaSel) : [];
  const diaSelStr = diaSel ? `${mesStr}-${String(diaSel).padStart(2,"0")}` : null;

  return (
    <div>
      <h2 className="sec-title">Agenda de Entregas</h2>

      {/* ── Estadísticas rápidas ── */}
      <div className="stat-grid" style={{ marginBottom: 14 }}>
        <div className="stat-card accent">
          <div className="stat-val">{conFecha.length}</div>
          <div className="stat-lbl">Con fecha est.</div>
        </div>
        <div className="stat-card red">
          <div className="stat-val">{pedidosActivos.filter(p => p.fecha_estimada && p.fecha_estimada < hoy).length}</div>
          <div className="stat-lbl">Vencidos</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-val">{pedidosActivos.filter(p => p.fecha_estimada && p.fecha_estimada >= hoy && p.fecha_estimada <= `${hoy.slice(0,8)}${String(parseInt(hoy.slice(8))+6).padStart(2,"0")}`).length}</div>
          <div className="stat-lbl">Esta semana</div>
        </div>
        <div className="stat-card orange">
          <div className="stat-val">{sinFecha.length}</div>
          <div className="stat-lbl">Sin fecha</div>
        </div>
      </div>

      {/* ── Calendario ── */}
      <div style={{ background:"#13161e", borderRadius:16, padding:16, marginBottom:16 }}>

        {/* Navegación */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
          <button onClick={prev} style={{ background:"transparent", border:"1px solid #252a38", borderRadius:10, color:"#aaa", fontSize:20, width:38, height:38, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>‹</button>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:22, color:"#e8b84b", letterSpacing:".08em" }}>{MESES[mes.m].toUpperCase()}</div>
            <div style={{ fontSize:13, color:"#555", marginTop:-2 }}>{mes.y}</div>
          </div>
          <button onClick={next} style={{ background:"transparent", border:"1px solid #252a38", borderRadius:10, color:"#aaa", fontSize:20, width:38, height:38, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>›</button>
        </div>

        {/* Días de semana */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:3, marginBottom:4 }}>
          {DIAS.map(d => (
            <div key={d} style={{ textAlign:"center", fontSize:9, fontWeight:700, color:"#444", letterSpacing:".06em", padding:"3px 0" }}>{d}</div>
          ))}
        </div>

        {/* Celdas */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:3 }}>
          {Array.from({length:offset}).map((_,i) => <div key={`e${i}`} />)}
          {Array.from({length:numDias},(_,i)=>i+1).map(d => {
            const pds = porDia(d);
            const dStr = `${mesStr}-${String(d).padStart(2,"0")}`;
            const esHoy = dStr === hoy;
            const sel   = diaSel === d;
            const tieneVencido = pds.some(p => p.fecha_estimada < hoy);
            const tieneProceso = pds.some(p => p.status === "proceso");
            return (
              <div
                key={d}
                onClick={() => setDiaSel(sel ? null : d)}
                style={{
                  background: sel ? "#1a2744" : esHoy ? "#1a1a0d" : "#1a1d26",
                  border: `1.5px solid ${esHoy ? "#e8b84b" : sel ? "#4b8fe8" : pds.length > 0 ? "#2a3050" : "#1e2130"}`,
                  borderRadius: 10,
                  padding: "6px 4px 5px",
                  minHeight: 58,
                  cursor: "pointer",
                  transition: "border-color .15s",
                }}
              >
                <div style={{ textAlign:"center", fontSize:12, fontWeight: esHoy ? 800 : 400, color: esHoy ? "#e8b84b" : sel ? "#4b8fe8" : "#ccc", marginBottom:3 }}>{d}</div>
                {pds.slice(0,2).map(p => {
                  const c = colorStatus(p);
                  return (
                    <div key={p.id} style={{ background:c.chip, borderRadius:3, padding:"1px 3px", fontSize:8, fontWeight:700, color: c.chip==="e8b84b" ? "#000" : "#fff", color: "#000", marginBottom:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
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

        {/* Leyenda */}
        <div style={{ display:"flex", gap:14, marginTop:12, paddingTop:10, borderTop:"1px solid #1e2130" }}>
          {[["#e8b84b","Anotado"],["#4b8fe8","En proceso"],["#e84b4b","Vencido"]].map(([c,l]) => (
            <div key={l} style={{ display:"flex", alignItems:"center", gap:5, fontSize:10, color:"#666" }}>
              <div style={{ width:9, height:9, background:c, borderRadius:2 }} />{l}
            </div>
          ))}
          <button onClick={irHoy} style={{ marginLeft:"auto", background:"transparent", border:"1px solid #252a38", borderRadius:6, color:"#888", fontSize:10, padding:"2px 8px", cursor:"pointer" }}>Hoy</button>
        </div>
      </div>

      {/* ── Panel de día seleccionado ── */}
      {diaSel !== null && (
        <div style={{ background:"#13161e", borderRadius:14, padding:14, marginBottom:16 }}>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:18, fontWeight:700, color:"#e8b84b", marginBottom:10 }}>
            {diaSel} de {MESES[mes.m]} {mes.y}
          </div>
          {selPeds.length === 0
            ? <p style={{ color:"#444", fontSize:13, margin:0 }}>Sin entregas programadas para este día.</p>
            : selPeds.map(p => {
                const c = colorStatus(p);
                return (
                  <div key={p.id} onClick={() => onAbrirPedido && onAbrirPedido(p)} style={{ background:c.bg, border:`1px solid ${c.border}`, borderRadius:10, padding:"10px 12px", marginBottom:8, cursor: onAbrirPedido ? "pointer" : "default" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                      <span style={{ fontWeight:700, fontSize:15, color:"#e0e0e0" }}>Ped. {p.num}</span>
                      <span style={{ background:c.border+"33", color:c.txt, borderRadius:6, padding:"2px 8px", fontSize:11, fontWeight:700 }}>{STATUS_PED[p.status]||p.status}</span>
                    </div>
                    <div style={{ fontSize:13, color:"#aaa" }}>{p.cliente}</div>
                    <div style={{ fontSize:12, color:"#666", marginTop:2 }}>{p.medida} · {p.cajas} cajas · {p.tipo}</div>
                  </div>
                );
              })
          }
        </div>
      )}

      {/* ── Próximas entregas ── */}
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
                      <div style={{ fontSize:11, color:"#666" }}>{diasFaltan === 0 ? "Hoy" : `en ${diasFaltan}d`}</div>
                    </div>
                  </div>
                  <div className="muted">{p.medida} · {p.cajas} cajas</div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Sin fecha estimada ── */}
      {sinFecha.length > 0 && (
        <>
          <h3 className="sub-title" style={{ marginTop:16 }}>Sin fecha de entrega</h3>
          <div style={{ background:"#13161e", borderRadius:10, padding:"10px 14px" }}>
            <p style={{ fontSize:12, color:"#555", margin:"0 0 8px" }}>Estos pedidos no tienen fecha estimada asignada — edítalos en Pedidos para agregarla.</p>
            {sinFecha.slice(0,5).map(p => (
              <div key={p.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:"1px solid #1e2130" }}>
                <div>
                  <span style={{ fontWeight:600, color:"#ccc", fontSize:13 }}>Ped. {p.num}</span>
                  <span style={{ color:"#555", fontSize:12 }}> — {p.cliente}</span>
                </div>
                <span style={{ fontSize:11, color:"#444" }}>{p.medida}</span>
              </div>
            ))}
            {sinFecha.length > 5 && <div style={{ fontSize:12, color:"#444", paddingTop:6 }}>...y {sinFecha.length-5} más</div>}
          </div>
        </>
      )}
    </div>
  );
}
