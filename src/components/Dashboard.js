import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import BarChart from './BarChart';
import { today, fmt, diasHabilesRestantes, estadoPlazo } from '../lib/utils';
import { META_CAJAS, META_MERMA_PCT, STATUS_PED } from '../lib/constants';

export default function Dashboard({ pedidos, fallas, refacciones, proveedores, prodDiaria }) {
  const activos = pedidos.filter(p => p.status !== "terminado").length;
  const fallasAbiertas = fallas.filter(f => f.status === "abierta").length;
  const gastoRef = proveedores.reduce((s, p) => s + Number(p.monto || 0), 0);
  const valorInventario = refacciones.reduce((s, r) => s + (Number(r.costo || 0) * Number(r.stock || 1)), 0);
  const cajasTerminadas = pedidos.filter(p => p.status === "terminado").reduce((s, p) => s + Number(p.cajas || 0), 0);
  const cajasTotal = pedidos.reduce((s, p) => s + Number(p.cajas || 0), 0);
  const pedTerm = pedidos.filter(p => p.status === "terminado" && p.piezas_prod);
  const mermaTotal = pedTerm.reduce((s, p) => s + Number(p.merma || 0), 0);
  const piezasTotal = pedTerm.reduce((s, p) => s + Number(p.piezas_prod || 0), 0);
  const mermaPct = piezasTotal > 0 ? ((mermaTotal / piezasTotal) * 100).toFixed(1) : 0;
  const vencidos = pedidos.filter(p => p.status !== "terminado" && diasHabilesRestantes(p.fecha_solicitud) < 0).length;
  const stockBajoDash = refacciones.filter(r => { const min = r.stock_min ?? 1; return min > 0 && Number(r.stock || 0) <= min; }).length;
  const todayStr = today();
  const cajasHoy = prodDiaria.filter(r => r.fecha === todayStr).reduce((s, r) => s + Number(r.cajas_dia || 0), 0);
  const metaHoyCumplida = cajasHoy >= META_CAJAS;
  const mesActual = today().slice(0, 7);
  const diasDelMes = [...new Set(prodDiaria.filter(r => r.fecha?.startsWith(mesActual)).map(r => r.fecha))];
  const diasConMeta = diasDelMes.filter(fecha => prodDiaria.filter(r => r.fecha === fecha).reduce((s, r) => s + Number(r.cajas_dia || 0), 0) >= META_CAJAS).length;
  const pctMeta = diasDelMes.length > 0 ? Math.round((diasConMeta / diasDelMes.length) * 100) : 0;
  const pedidosUrgentes = pedidos.filter(p => p.status !== "terminado" && p.fecha_solicitud).map(p => ({ ...p, diasRest: diasHabilesRestantes(p.fecha_solicitud) })).sort((a, b) => a.diasRest - b.diasRest).slice(0, 5);
  const ultimas14 = [...Array(14)].map((_, i) => { const d = new Date(today() + "T12:00:00"); d.setDate(d.getDate() - 13 + i); const fecha = d.toISOString().slice(0, 10); const val = prodDiaria.filter(r => r.fecha === fecha).reduce((s, r) => s + Number(r.cajas_dia || 0), 0); return { lbl: fecha.slice(8), val }; });
  const pedidosMerma = pedidos.filter(p => p.status === "terminado" && p.merma_pct !== null && p.merma_pct !== "").slice(-10).map(p => ({ lbl: String(p.cliente).slice(0, 6), val: Number(p.merma_pct) }));
  const pedConTiempo = pedidos.filter(p => p.status === "terminado" && p.fecha_inicio && p.fecha_termino);
  const tiempoPromedio = pedConTiempo.length > 0 ? Math.round(pedConTiempo.reduce((s, p) => s + (new Date(p.fecha_termino + "T12:00:00") - new Date(p.fecha_inicio + "T12:00:00")) / 86400000 + 1, 0) / pedConTiempo.length) : null;
  const fallasPorComp = [
    { comp: "Rodillo anilox", lbl: "Anilox" }, { comp: "Sistema de tintas", lbl: "Tintas" },
    { comp: "Cliché/portacliché", lbl: "Cliché" }, { comp: "Motor principal", lbl: "Motor" },
    { comp: "Sistema de corte", lbl: "Corte" }, { comp: "Banda transportadora", lbl: "Banda" },
    { comp: "Sistema eléctrico", lbl: "Eléct." }, { comp: "Otro", lbl: "Otro" },
  ].map(({ comp, lbl }) => ({ lbl, val: fallas.filter(f => f.comp === comp).reduce((s, f) => s + Number(f.min_paro || 0), 0) })).filter(d => d.val > 0).sort((a, b) => b.val - a.val);

  const generarPDF = () => {
    const doc = new jsPDF();
    const mes = new Date().toLocaleString("es-MX", { month: "long", year: "numeric" });
    doc.setFillColor(26, 39, 68); doc.rect(0, 0, 210, 30, "F");
    doc.setTextColor(201, 146, 42); doc.setFontSize(18); doc.text("EEMSA System", 14, 15);
    doc.setFontSize(10); doc.text(`Reporte mensual — ${mes}`, 14, 23);
    doc.setTextColor(0, 0, 0); doc.setFontSize(12); doc.text("Resumen de Pedidos", 14, 40);
    autoTable(doc, { startY: 44, head: [["No. Pedido", "Cliente", "Cajas", "Status", "Merma %"]], body: pedidos.map(p => [p.num, p.cliente, p.cajas || 0, STATUS_PED[p.status] || p.status, p.merma_pct ? p.merma_pct + "%" : "—"]) });
    doc.text("Fallas", 14, doc.lastAutoTable.finalY + 10);
    autoTable(doc, { startY: doc.lastAutoTable.finalY + 14, head: [["Fecha", "Máquina", "Componente", "Min Paro", "Severidad"]], body: fallas.map(f => [f.fecha, f.maq, f.comp, f.min_paro, f.sev]) });
    doc.text("Compras", 14, doc.lastAutoTable.finalY + 10);
    autoTable(doc, { startY: doc.lastAutoTable.finalY + 14, head: [["Proveedor", "Qué se compró", "Monto", "Fecha"]], body: proveedores.map(p => [p.nombre, p.que_compro, `$${fmt(p.monto)}`, p.fecha]) });
    doc.save(`EEMSA_Reporte_${mes}.pdf`);
  };

  return (
    <div>
      <h2 className="sec-title">📊 Dashboard</h2>
      <button className="btn btn-primary" style={{ marginBottom: 12 }} onClick={generarPDF}>📄 Generar reporte PDF</button>
      <div className="stat-grid">
        <div className="stat-card accent"><div className="stat-val">{activos}</div><div className="stat-lbl">Pedidos activos</div></div>
        <div className="stat-card green"><div className="stat-val">{cajasTerminadas}</div><div className="stat-lbl">Cajas terminadas</div></div>
        <div className="stat-card blue"><div className="stat-val">{cajasTotal}</div><div className="stat-lbl">Cajas totales</div></div>
        <div className="stat-card red"><div className="stat-val">{vencidos}</div><div className="stat-lbl">Pedidos vencidos</div></div>
        <div className="stat-card orange"><div className="stat-val">{mermaPct}%</div><div className="stat-lbl">% Merma del mes</div></div>
        <div className="stat-card red"><div className="stat-val">{fallasAbiertas}</div><div className="stat-lbl">Fallas abiertas</div></div>
        <div className={`stat-card ${stockBajoDash > 0 ? "red" : "green"}`}><div className="stat-val">{stockBajoDash}</div><div className="stat-lbl">Refacc. stock bajo</div></div>
        <div className="stat-card blue"><div className="stat-val">${fmt(gastoRef)}</div><div className="stat-lbl">Gasto en compras</div></div>
        <div className="stat-card accent"><div className="stat-val">${fmt(valorInventario)}</div><div className="stat-lbl">Valor inventario</div></div>
        <div className={`stat-card ${metaHoyCumplida ? "green" : "red"}`}><div className="stat-val">{cajasHoy}/{META_CAJAS}</div><div className="stat-lbl">Cajas hoy {metaHoyCumplida ? "✅" : "❌"}</div></div>
        <div className={`stat-card ${pctMeta >= 80 ? "green" : pctMeta >= 50 ? "orange" : "red"}`}><div className="stat-val">{pctMeta}%</div><div className="stat-lbl">Días con meta ({diasConMeta}/{diasDelMes.length})</div></div>
        {tiempoPromedio !== null && <div className="stat-card blue"><div className="stat-val">{tiempoPromedio}d</div><div className="stat-lbl">Días promedio por pedido ({pedConTiempo.length} ped.)</div></div>}
      </div>
      <div style={{ background: "#1a1d26", borderRadius: 10, padding: "12px 16px", marginTop: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: "#aaa" }}>Merma del mes vs meta (máx {META_MERMA_PCT}%)</span>
          <span style={{ fontSize: 12, color: Number(mermaPct) > META_MERMA_PCT ? "#ff4d4d" : "#4be87a", fontWeight: 700 }}>{mermaPct}%</span>
        </div>
        <div style={{ background: "#2a2d3a", borderRadius: 4, height: 8, overflow: "hidden" }}>
          <div style={{ width: `${Math.min(100, (Number(mermaPct) / META_MERMA_PCT) * 100)}%`, height: "100%", background: Number(mermaPct) > META_MERMA_PCT ? "#ff4d4d" : "#4be87a", transition: "width .4s" }} />
        </div>
      </div>
      <h3 className="sub-title">🚨 Pedidos por urgencia</h3>
      {pedidosUrgentes.length === 0 ? <p className="empty">Sin pedidos activos.</p> : (
        <div className="list">
          {pedidosUrgentes.map(p => {
            const ep = estadoPlazo(p.diasRest);
            return (
              <div key={p.id} className="list-item" style={{ borderLeft: `3px solid ${p.status === "terminado" ? "#4be87a" : p.status === "proceso" ? "#4a9eff" : "#ff9900"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div><strong>{p.num}</strong> — {p.cliente}</div>
                  {ep && <span className={`badge ${ep.cls}`}>{ep.txt}</span>}
                </div>
                <div className="muted">{p.tipo} · {p.medida} · {p.cajas} cajas · Sol: {p.fecha_solicitud}</div>
                {p.merma_pct !== undefined && p.merma_pct !== "" && (<div className="muted">Merma: <span style={{ color: Number(p.merma_pct) > META_MERMA_PCT ? "#ff4d4d" : "#4be87a" }}>{p.merma_pct}%</span></div>)}
              </div>
            );
          })}
        </div>
      )}
      <h3 className="sub-title">📈 Producción últimas 2 semanas</h3>
      <div style={{ background: "#1a1d26", borderRadius: 10, padding: "12px 16px", marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: "#aaa" }}>Cajas por día · meta {META_CAJAS}</span>
          <div style={{ display: "flex", gap: 8, fontSize: 10, color: "#666" }}>
            <span><span style={{ color: "#4be87a" }}>■</span> Cumplida</span>
            <span><span style={{ color: "#c9922a" }}>■</span> Sin meta</span>
          </div>
        </div>
        <BarChart data={ultimas14} meta={META_CAJAS} />
      </div>
      {pedidosMerma.length > 0 && (
        <>
          <h3 className="sub-title">🗑 Merma % por pedido</h3>
          <div style={{ background: "#1a1d26", borderRadius: 10, padding: "12px 16px", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: "#aaa" }}>% merma · meta máx {META_MERMA_PCT}%</span>
              <div style={{ display: "flex", gap: 8, fontSize: 10, color: "#666" }}>
                <span><span style={{ color: "#4be87a" }}>■</span> OK</span>
                <span><span style={{ color: "#ff4d4d" }}>■</span> Excedida</span>
              </div>
            </div>
            <BarChart data={pedidosMerma} meta={META_MERMA_PCT} lowerIsBetter />
          </div>
        </>
      )}
      {fallasPorComp.length > 0 && (
        <>
          <h3 className="sub-title">🔩 Minutos de paro por componente</h3>
          <div style={{ background: "#1a1d26", borderRadius: 10, padding: "12px 16px" }}>
            <span style={{ fontSize: 11, color: "#aaa" }}>Total minutos detenido por componente</span>
            <BarChart data={fallasPorComp} />
          </div>
        </>
      )}
    </div>
  );
}
