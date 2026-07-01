import { useEffect } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, BarChart as ReBarChart, Bar, XAxis, YAxis } from 'recharts';
import BarChart from './BarChart';
import { today, fmt, diasHabilesRestantes, estadoPlazo } from '../lib/utils';
import { META_CAJAS, META_MERMA_PCT } from '../lib/constants';
import { notificar } from '../lib/notificaciones';
import { exportarExcel } from '../lib/exportExcel';

const PIE_COLORS = ['#e84b4b','#e8894b','#e8b84b','#4be87a','#4b8fe8','#9b59b6','#ff69b4','#4be8e8'];
const ChartTip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#181b24', border: '1px solid #2d3249', borderRadius: 8, padding: '7px 12px', fontSize: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}>
      <div style={{ color: '#9aa0bc', marginBottom: 2 }}>{payload[0].name}</div>
      <div style={{ color: payload[0].fill || '#e8ecf4', fontWeight: 700, fontSize: 14 }}>{payload[0].value}</div>
    </div>
  );
};

export default function Dashboard({ pedidos, fallas, refacciones, proveedores, prodDiaria }) {
  useEffect(() => {
    const hoy = today();
    const yaAvisado = localStorage.getItem('vencidos_avisado');
    if (yaAvisado === hoy) return;
    const vencidos = pedidos
      .filter(p => p.status !== "terminado" && p.fecha_solicitud)
      .map(p => ({ ...p, dias: diasHabilesRestantes(p.fecha_solicitud) }))
      .filter(p => p.dias < 0);
    if (vencidos.length > 0) {
      notificar('pedidos_vencidos', { pedidos: vencidos.map(p => ({ num: p.num, cliente: p.cliente, dias: p.dias })) });
      localStorage.setItem('vencidos_avisado', hoy);
    }
  }, [pedidos]);
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
  const mesPrev = (() => { const [y, m] = mesActual.split('-').map(Number); return m === 1 ? `${y-1}-12` : `${y}-${String(m-1).padStart(2,'0')}`; })();
  const diasDelMes = [...new Set(prodDiaria.filter(r => r.fecha?.startsWith(mesActual)).map(r => r.fecha))];
  const diasConMeta = diasDelMes.filter(fecha => prodDiaria.filter(r => r.fecha === fecha).reduce((s, r) => s + Number(r.cajas_dia || 0), 0) >= META_CAJAS).length;
  const pctMeta = diasDelMes.length > 0 ? Math.round((diasConMeta / diasDelMes.length) * 100) : 0;
  const pedidosUrgentes = pedidos.filter(p => p.status !== "terminado" && p.fecha_solicitud).map(p => ({ ...p, diasRest: diasHabilesRestantes(p.fecha_solicitud) })).sort((a, b) => a.diasRest - b.diasRest).slice(0, 5);
  const ultimas14 = [...Array(14)].map((_, i) => { const d = new Date(today() + "T12:00:00"); d.setDate(d.getDate() - 13 + i); const fecha = d.toISOString().slice(0, 10); const val = prodDiaria.filter(r => r.fecha === fecha).reduce((s, r) => s + Number(r.cajas_dia || 0), 0); return { lbl: fecha.slice(8), val }; });
  const ultimas8sem = [...Array(8)].map((_, i) => {
    const base = new Date(today() + "T12:00:00");
    const diasAtras = (7 - i) * 7;
    const fin = new Date(base); fin.setDate(fin.getDate() - diasAtras);
    const ini = new Date(fin); ini.setDate(ini.getDate() - 6);
    const val = prodDiaria.filter(r => {
      const f = r.fecha || "";
      return f >= ini.toISOString().slice(0, 10) && f <= fin.toISOString().slice(0, 10);
    }).reduce((s, r) => s + Number(r.cajas_dia || 0), 0);
    const mes = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][fin.getMonth()];
    return { lbl: `${mes} ${fin.getDate()}`, val };
  });
  const pedidosMerma = pedidos.filter(p => p.status === "terminado" && p.merma_pct !== null && p.merma_pct !== "").slice(-10).map(p => ({ lbl: String(p.cliente).slice(0, 6), val: Number(p.merma_pct) }));
  const pedConTiempo = pedidos.filter(p => p.status === "terminado" && p.fecha_inicio && p.fecha_termino);
  const tiempoPromedio = pedConTiempo.length > 0 ? Math.round(pedConTiempo.reduce((s, p) => s + (new Date(p.fecha_termino + "T12:00:00") - new Date(p.fecha_inicio + "T12:00:00")) / 86400000 + 1, 0) / pedConTiempo.length) : null;
  const fallasPorComp = [
    { comp: "Rodillo anilox", lbl: "Anilox" }, { comp: "Sistema de tintas", lbl: "Tintas" },
    { comp: "Cliché/portacliché", lbl: "Cliché" }, { comp: "Motor principal", lbl: "Motor" },
    { comp: "Sistema de corte", lbl: "Corte" }, { comp: "Banda transportadora", lbl: "Banda" },
    { comp: "Sistema eléctrico", lbl: "Eléct." }, { comp: "Otro", lbl: "Otro" },
  ].map(({ comp, lbl }) => ({ lbl, val: fallas.filter(f => f.comp === comp).reduce((s, f) => s + Number(f.min_paro || 0), 0) })).filter(d => d.val > 0).sort((a, b) => b.val - a.val);

  const topClientes = Object.entries(
    pedidos.filter(p => p.status === "terminado")
      .reduce((acc, p) => { const k = p.cliente || "Sin nombre"; acc[k] = (acc[k] || 0) + Number(p.cajas || 0); return acc; }, {})
  ).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([lbl, val]) => ({ lbl: lbl.slice(0, 14), val }));

  const rentabilidadClientes = (() => {
    const map = {};
    pedidos.filter(p => p.status === "terminado" && p.costo_pieza != null).forEach(p => {
      const k = p.cliente || "Sin nombre";
      if (!map[k]) map[k] = { valor: 0, merma: 0, pedidos: 0 };
      map[k].valor   += Number(p.costo_pieza) * Number(p.piezas_prod || 0);
      map[k].merma   += Number(p.costo_pieza) * Number(p.merma || 0);
      map[k].pedidos += 1;
    });
    return Object.entries(map)
      .map(([nombre, d]) => ({ nombre, ...d }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 8);
  })();

  const pedidosConCosto  = pedidos.filter(p => p.status === "terminado" && p.costo_pieza != null);
  const valorProducido   = pedidosConCosto.reduce((s, p) => s + (Number(p.costo_pieza) * Number(p.piezas_prod || 0)), 0);
  const perdidaMerma     = pedidosConCosto.reduce((s, p) => s + (Number(p.costo_pieza) * Number(p.merma || 0)), 0);
  const valorProducidoMes= pedidos.filter(p => p.status === "terminado" && p.fecha_termino?.startsWith(mesActual) && p.costo_pieza != null)
    .reduce((s, p) => s + (Number(p.costo_pieza) * Number(p.piezas_prod || 0)), 0);
  const perdidaMermaMes  = pedidos.filter(p => p.status === "terminado" && p.fecha_termino?.startsWith(mesActual) && p.costo_pieza != null)
    .reduce((s, p) => s + (Number(p.costo_pieza) * Number(p.merma || 0)), 0);
  const pedMes  = pedidos.filter(p => p.status === "terminado" && p.fecha_termino?.startsWith(mesActual));
  const pedPrev = pedidos.filter(p => p.status === "terminado" && p.fecha_termino?.startsWith(mesPrev));

  const cajasMes  = prodDiaria.filter(r => r.fecha?.startsWith(mesActual)).reduce((s, r) => s + Number(r.cajas_dia || 0), 0);
  const cajasPrev = prodDiaria.filter(r => r.fecha?.startsWith(mesPrev)).reduce((s, r) => s + Number(r.cajas_dia || 0), 0);

  const mermaPctMes  = (() => { const ps = pedMes.filter(p => p.merma_pct != null && p.merma_pct !== ""); return ps.length ? (ps.reduce((s,p) => s + Number(p.merma_pct), 0) / ps.length).toFixed(1) : null; })();
  const mermaPctPrev = (() => { const ps = pedPrev.filter(p => p.merma_pct != null && p.merma_pct !== ""); return ps.length ? (ps.reduce((s,p) => s + Number(p.merma_pct), 0) / ps.length).toFixed(1) : null; })();

  const valorMes  = pedidos.filter(p => p.status === "terminado" && p.fecha_termino?.startsWith(mesActual) && p.costo_pieza != null).reduce((s, p) => s + Number(p.costo_pieza) * Number(p.piezas_prod || 0), 0);
  const valorPrev = pedidos.filter(p => p.status === "terminado" && p.fecha_termino?.startsWith(mesPrev)   && p.costo_pieza != null).reduce((s, p) => s + Number(p.costo_pieza) * Number(p.piezas_prod || 0), 0);

  const delta = (curr, prev) => {
    if (!prev) return null;
    const pct = ((curr - prev) / prev * 100).toFixed(0);
    return { pct: Math.abs(pct), sube: curr >= prev };
  };
  const tintaMes = pedMes.reduce((s, p) => s + Number(p.tinta_kg || 0), 0);
  const alcoholMes = pedMes.reduce((s, p) => s + Number(p.alcohol_litros || 0), 0);
  const rollosMes = pedMes.reduce((s, p) => s + Number(p.rollos_usados || 0), 0);

  const tintaPorColor = (() => {
    const map = {};
    // Solo pedidos con costo calculado (flujo nuevo, valores en kg confiables)
    pedidos.filter(p => p.status === "terminado" && p.tinta_kg && p.costo_pieza != null).forEach(p => {
      const k = (p.color || p.tinta_tipo || "Sin color").trim();
      if (!map[k]) map[k] = { total: 0, mes: 0, pedidos: 0 };
      map[k].total   += Number(p.tinta_kg);
      map[k].pedidos += 1;
      if (p.fecha_termino?.startsWith(mesActual)) map[k].mes += Number(p.tinta_kg);
    });
    return Object.entries(map).map(([color, d]) => ({ color, ...d })).sort((a, b) => b.total - a.total);
  })();

  const tipoCintaStats = (() => {
    const map = {};
    pedidos.filter(p => p.status === "terminado" && p.costo_pieza != null).forEach(p => {
      const k = (p.tipo || "Sin tipo").trim();
      if (!map[k]) map[k] = { rollos: 0, rollosMes: 0, pedidos: 0 };
      map[k].rollos   += Number(p.rollos_usados || 0);
      map[k].pedidos  += 1;
      if (p.fecha_termino?.startsWith(mesActual)) map[k].rollosMes += Number(p.rollos_usados || 0);
    });
    return Object.entries(map).map(([tipo, d]) => ({ tipo, ...d })).sort((a, b) => b.rollos - a.rollos);
  })();

  const generarPDF = () => {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const W = 210, mg = 14;
    const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    const fmtM = n => MESES[n - 1] || "";
    const fechaGen = new Date().toLocaleString("es-MX", { day: "2-digit", month: "long", year: "numeric" });
    const C = { hdr: [26, 39, 68], acc: [201, 146, 42], alt: [244, 246, 251], tot: [220, 228, 248] };

    const anios = [...new Set([
      ...pedidos.map(p => p.fecha_solicitud?.slice(0, 4)),
      ...pedidos.map(p => p.fecha_termino?.slice(0, 4)),
      ...prodDiaria.map(r => r.fecha?.slice(0, 4)),
      ...fallas.map(f => f.fecha?.slice(0, 4)),
      ...proveedores.map(p => p.fecha?.slice(0, 4)),
    ].filter(Boolean))].sort();

    let pgNum = 0;
    const drawHdr = () => {
      pgNum++;
      doc.setFillColor(...C.hdr); doc.rect(0, 0, W, 26, "F");
      doc.setFillColor(...C.acc); doc.rect(0, 26, W, 1.5, "F");
      doc.setTextColor(...C.acc); doc.setFontSize(15); doc.setFont(undefined, "bold");
      doc.text("EEMSA System", mg, 12);
      doc.setFontSize(8.5); doc.setFont(undefined, "normal");
      doc.setTextColor(185, 205, 235);
      doc.text(`Reporte Histórico Mensual  ·  ${fechaGen}`, mg, 20);
      doc.setTextColor(170); doc.setFontSize(8);
      doc.text(`Pág. ${pgNum}`, W - mg, 20, { align: "right" });
    };
    const newPage = () => { doc.addPage(); drawHdr(); return 34; };

    const drawTbl = (startY, head, body, extraOpts = {}) => {
      const { fontSize = 8.5, ...restOpts } = extraOpts;
      return autoTable(doc, {
        startY, head: [head], body,
        styles: { fontSize, cellPadding: { top: 2.5, right: 3, bottom: 2.5, left: 3 }, lineColor: [210, 215, 230], lineWidth: 0.15 },
        headStyles: { fillColor: C.hdr, textColor: C.acc, fontStyle: "bold", fontSize: Math.max(fontSize, 8.5) },
        alternateRowStyles: { fillColor: C.alt },
        margin: { left: mg, right: mg },
        didParseCell: (d) => {
          if (d.section === "body" && d.row.raw[0] === "TOTAL") {
            d.cell.styles.fontStyle = "bold"; d.cell.styles.fillColor = C.tot;
          }
        },
        ...restOpts,
      });
    };

    // ── Página 1 ──
    drawHdr();

    // Resumen comparativo
    doc.setTextColor(...C.hdr); doc.setFontSize(11); doc.setFont(undefined, "bold");
    doc.text("Resumen Comparativo por Año", mg, 37);
    doc.setFont(undefined, "normal");

    const R = anios.map(a => {
      const ps = pedidos.filter(p => p.fecha_solicitud?.startsWith(a));
      const term = pedidos.filter(p => p.status === "terminado" && p.fecha_termino?.startsWith(a));
      const mArr = term.filter(p => p.merma_pct !== null && p.merma_pct !== "");
      const fs = fallas.filter(f => f.fecha?.startsWith(a));
      const rs = prodDiaria.filter(r => r.fecha?.startsWith(a));
      const cs = proveedores.filter(p => p.fecha?.startsWith(a));
      return {
        ped: ps.length, term: term.length,
        cajasPed: ps.reduce((s, p) => s + Number(p.cajas || 0), 0),
        cajasP: rs.reduce((s, r) => s + Number(r.cajas_dia || 0), 0),
        merma: mArr.length ? (mArr.reduce((s, p) => s + Number(p.merma_pct), 0) / mArr.length).toFixed(1) + "%" : "—",
        fls: fs.length, minP: fs.reduce((s, f) => s + Number(f.min_paro || 0), 0),
        gasto: cs.reduce((s, p) => s + Number(p.monto || 0), 0),
      };
    });
    drawTbl(41, ["Indicador", ...anios], [
      ["Total pedidos",      ...R.map(r => r.ped)],
      ["Pedidos terminados", ...R.map(r => r.term)],
      ["Cajas (pedidos)",    ...R.map(r => r.cajasPed)],
      ["Cajas producidas",   ...R.map(r => r.cajasP)],
      ["% Merma promedio",   ...R.map(r => r.merma)],
      ["Total fallas",       ...R.map(r => r.fls)],
      ["Min. de paro total", ...R.map(r => r.minP)],
      ["Gasto en compras",   ...R.map(r => `$${fmt(r.gasto)}`)],
    ], { columnStyles: { 0: { fontStyle: "bold", fillColor: [232, 238, 252], textColor: [30, 50, 120] } } });

    // ── Renderizador de sección ──
    const renderSec = (titulo, head, buildRows, tblOpts = {}) => {
      let y = doc.lastAutoTable.finalY + 14;
      if (y > 258) y = newPage();

      doc.setFillColor(...C.hdr); doc.rect(mg, y, W - mg * 2, 7.5, "F");
      doc.setTextColor(...C.acc); doc.setFontSize(9.5); doc.setFont(undefined, "bold");
      doc.text(titulo, mg + 3, y + 5.2);
      doc.setFont(undefined, "normal");

      let isFirst = true;
      anios.forEach(anio => {
        const rows = buildRows(anio);
        if (!rows.length) return;

        let tblY;
        if (isFirst) {
          doc.setTextColor(70, 95, 165); doc.setFontSize(8.5); doc.setFont(undefined, "bold");
          doc.text(`▸ ${anio}`, mg, y + 12);
          doc.setFont(undefined, "normal");
          tblY = y + 15;
          isFirst = false;
        } else {
          const prev = doc.lastAutoTable.finalY;
          if (prev + 18 > 265) {
            const ny = newPage();
            doc.setTextColor(120, 140, 185); doc.setFontSize(8); doc.setFont(undefined, "italic");
            doc.text(`${titulo} (cont.)`, mg, ny);
            doc.setFont(undefined, "normal");
            doc.setTextColor(70, 95, 165); doc.setFontSize(8.5); doc.setFont(undefined, "bold");
            doc.text(`▸ ${anio}`, mg, ny + 7);
            doc.setFont(undefined, "normal");
            tblY = ny + 10;
          } else {
            doc.setTextColor(70, 95, 165); doc.setFontSize(8.5); doc.setFont(undefined, "bold");
            doc.text(`▸ ${anio}`, mg, prev + 8);
            doc.setFont(undefined, "normal");
            tblY = prev + 11;
          }
        }
        drawTbl(tblY, head, rows, tblOpts);
      });

      if (isFirst) {
        doc.setTextColor(150); doc.setFontSize(8.5);
        doc.text("Sin datos registrados.", mg + 3, y + 16);
      }
    };

    // 1. Pedidos terminados por mes (por fecha de término)
    renderSec("1. Pedidos terminados por mes (por fecha de término)", ["Mes", "Pedidos term.", "Cajas", "Merma pzas.", "Merma % prom."], anio => {
      const rows = [];
      for (let m = 1; m <= 12; m++) {
        const k = `${anio}-${String(m).padStart(2, "0")}`;
        const ps = pedidos.filter(p => p.status === "terminado" && p.fecha_termino?.startsWith(k));
        if (!ps.length) continue;
        const cajas = ps.reduce((s, p) => s + Number(p.cajas || 0), 0);
        const mermaP = ps.reduce((s, p) => s + Number(p.merma || 0), 0);
        const mArr = ps.filter(p => p.merma_pct !== null && p.merma_pct !== "");
        rows.push([fmtM(m), ps.length, cajas, mermaP || "—", mArr.length ? (mArr.reduce((s, p) => s + Number(p.merma_pct), 0) / mArr.length).toFixed(1) + "%" : "—"]);
      }
      if (rows.length > 1) {
        const totMerma = rows.reduce((s, r) => s + (isNaN(Number(r[3])) ? 0 : Number(r[3])), 0);
        rows.push(["TOTAL", rows.reduce((s,r)=>s+r[1],0), rows.reduce((s,r)=>s+r[2],0), totMerma || "—", "—"]);
      }
      return rows;
    });

    // 2. Producción
    renderSec("2. Producción diaria por mes", ["Mes", "Días prod.", "Cajas totales", "Prom./día", "Días con meta", "% meta"], anio => {
      const rows = [];
      for (let m = 1; m <= 12; m++) {
        const k = `${anio}-${String(m).padStart(2, "0")}`;
        const rs = prodDiaria.filter(r => r.fecha?.startsWith(k));
        if (!rs.length) continue;
        const dias = [...new Set(rs.map(r => r.fecha))];
        const cajasT = rs.reduce((s, r) => s + Number(r.cajas_dia || 0), 0);
        const conMeta = dias.filter(f => rs.filter(r => r.fecha === f).reduce((s, r) => s + Number(r.cajas_dia || 0), 0) >= META_CAJAS).length;
        rows.push([fmtM(m), dias.length, cajasT, dias.length ? Math.round(cajasT/dias.length) : 0, `${conMeta}/${dias.length}`, `${dias.length ? Math.round(conMeta/dias.length*100) : 0}%`]);
      }
      if (rows.length > 1) rows.push(["TOTAL", rows.reduce((s,r)=>s+r[1],0), rows.reduce((s,r)=>s+r[2],0), "—", "—", "—"]);
      return rows;
    });

    // 3. Fallas
    renderSec("3. Fallas por mes", ["Mes", "Total fallas", "Min. de paro", "Críticas", "Moderadas", "Abiertas"], anio => {
      const rows = [];
      for (let m = 1; m <= 12; m++) {
        const k = `${anio}-${String(m).padStart(2, "0")}`;
        const fs = fallas.filter(f => f.fecha?.startsWith(k));
        if (!fs.length) continue;
        rows.push([fmtM(m), fs.length, fs.reduce((s,f)=>s+Number(f.min_paro||0),0), fs.filter(f=>f.sev==="critica").length, fs.filter(f=>f.sev==="moderada").length, fs.filter(f=>f.status==="abierta").length]);
      }
      if (rows.length > 1) rows.push(["TOTAL", rows.reduce((s,r)=>s+r[1],0), rows.reduce((s,r)=>s+r[2],0), rows.reduce((s,r)=>s+r[3],0), rows.reduce((s,r)=>s+r[4],0), rows.reduce((s,r)=>s+r[5],0)]);
      return rows;
    });

    // 4. Compras
    renderSec("4. Compras de refacciones por mes", ["Mes", "No. compras", "Monto total", "Prom. por compra"], anio => {
      const rows = [];
      for (let m = 1; m <= 12; m++) {
        const k = `${anio}-${String(m).padStart(2, "0")}`;
        const cs = proveedores.filter(p => p.fecha?.startsWith(k));
        if (!cs.length) continue;
        const monto = cs.reduce((s, p) => s + Number(p.monto || 0), 0);
        rows.push([fmtM(m), cs.length, `$${fmt(monto)}`, `$${fmt(cs.length ? Math.round(monto/cs.length) : 0)}`]);
      }
      if (rows.length > 1) {
        const totalMonto = rows.reduce((s, r) => s + Number(String(r[2]).replace(/[^0-9.]/g, "")), 0);
        const totalComp = rows.reduce((s, r) => s + r[1], 0);
        rows.push(["TOTAL", totalComp, `$${fmt(totalMonto)}`, `$${fmt(totalComp ? Math.round(totalMonto/totalComp) : 0)}`]);
      }
      return rows;
    });

    // 5. Desglose por cinta / pedido finalizado
    renderSec("5. Desglose de cintas finalizadas por mes", ["Mes", "Pedido", "Cliente", "Medida", "Cajas", "Merma pzas.", "Merma %"], anio => {
      const ps = pedidos
        .filter(p => p.status === "terminado" && p.fecha_termino?.startsWith(anio))
        .sort((a, b) => (a.fecha_termino || "").localeCompare(b.fecha_termino || ""));
      if (!ps.length) return [];
      const rows = ps.map(p => [
        p.fecha_termino ? fmtM(parseInt(p.fecha_termino.slice(5, 7))) : "—",
        p.num || "—",
        p.cliente || "—",
        p.medida || "—",
        p.cajas || 0,
        (p.merma !== null && p.merma !== undefined && p.merma !== "") ? p.merma : "—",
        (p.merma_pct !== null && p.merma_pct !== undefined && p.merma_pct !== "") ? p.merma_pct + "%" : "—",
      ]);
      const mArr = ps.filter(p => p.merma_pct !== null && p.merma_pct !== undefined && p.merma_pct !== "");
      const avgMerma = mArr.length ? (mArr.reduce((s, p) => s + Number(p.merma_pct), 0) / mArr.length).toFixed(1) + "%" : "—";
      const totCajas = ps.reduce((s, p) => s + Number(p.cajas || 0), 0);
      const totMermaP = ps.reduce((s, p) => s + Number(p.merma || 0), 0);
      rows.push(["TOTAL", `${ps.length} cintas`, "", "", totCajas, totMermaP || "—", avgMerma]);
      return rows;
    }, { fontSize: 8 });

    // ── Footers en todas las páginas ──
    const totalPgs = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPgs; i++) {
      doc.setPage(i);
      doc.setFillColor(...C.hdr); doc.rect(0, 288, W, 10, "F");
      doc.setTextColor(...C.acc); doc.setFontSize(7);
      doc.text("EEMSA System  ·  Reporte Confidencial", mg, 294);
      doc.setTextColor(180); doc.setFontSize(7);
      doc.text(`${i} / ${totalPgs}`, W - mg, 294, { align: "right" });
    }

    doc.save(`EEMSA_Reporte_${new Date().getFullYear()}.pdf`);
  };

  const chartCard = { background: "#181b24", borderRadius: 12, padding: "14px 16px", marginBottom: 14, border: "1px solid #22263a" };
  const mermaColor = Number(mermaPct) > META_MERMA_PCT ? "#ff4d4d" : "#4be87a";

  return (
    <div>

      {/* ── Encabezado ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h2 className="sec-title" style={{ marginBottom: 0 }}>Dashboard</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => exportarExcel({ pedidos, fallas, prodDiaria, proveedores })}>📊 Excel</button>
          <button className="btn btn-ghost btn-sm" onClick={generarPDF}>📄 PDF</button>
        </div>
      </div>

      {/* ── KPIs principales (4 tarjetas) ── */}
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card accent"><div className="stat-val">{activos}</div><div className="stat-lbl">Pedidos activos</div></div>
        <div className={`stat-card ${metaHoyCumplida ? "green" : "red"}`}><div className="stat-val">{cajasHoy}<span style={{ fontSize: 14, opacity: .6 }}>/{META_CAJAS}</span></div><div className="stat-lbl">Cajas hoy</div></div>
        <div className="stat-card orange"><div className="stat-val">{mermaPct}%</div><div className="stat-lbl">Merma del mes</div></div>
        <div className={`stat-card ${fallasAbiertas > 0 ? "red" : "green"}`}><div className="stat-val">{fallasAbiertas}</div><div className="stat-lbl">Fallas abiertas</div></div>
      </div>

      {/* ── Comparativo mes a mes ── */}
      {(cajasMes > 0 || valorMes > 0) && (cajasPrev > 0 || valorPrev > 0) && (() => {
        const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
        const lblMes  = MESES[parseInt(mesActual.split('-')[1]) - 1];
        const lblPrev = MESES[parseInt(mesPrev.split('-')[1]) - 1];
        const items = [
          { lbl: "Cajas producidas", curr: cajasMes, prev: cajasPrev, fmt: v => v, menorEsMejor: false },
          ...(mermaPctMes && mermaPctPrev ? [{ lbl: "Merma %", curr: Number(mermaPctMes), prev: Number(mermaPctPrev), fmt: v => v + "%", menorEsMejor: true }] : []),
          ...(valorMes > 0 || valorPrev > 0 ? [{ lbl: "Valor producido", curr: valorMes, prev: valorPrev, fmt: v => "$" + fmt(Math.round(v)), menorEsMejor: false }] : []),
        ];
        return (
          <>
            <h3 className="sub-title">📊 {lblMes} vs {lblPrev}</h3>
            <div style={{ background: "#181b24", borderRadius: 12, padding: "12px 16px", marginBottom: 20, border: "1px solid #22263a" }}>
              {items.map(it => {
                const d = delta(it.curr, it.prev);
                const mejora = d ? (it.menorEsMejor ? !d.sube : d.sube) : null;
                return (
                  <div key={it.lbl} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #13161e" }}>
                    <span style={{ fontSize: 13, color: "#9aa0bc" }}>{it.lbl}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 11, color: "#3a3f5a" }}>{it.fmt(it.prev)}</span>
                      <span style={{ fontSize: 11, color: "#3a3f5a" }}>→</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#e0e0e0" }}>{it.fmt(it.curr)}</span>
                      {d && <span style={{ fontSize: 12, fontWeight: 700, color: mejora ? "#4be87a" : "#ff4d4d" }}>{d.sube ? "▲" : "▼"}{d.pct}%</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}

      {/* ── Sección Producción ── */}
      <h3 className="sub-title">📈 Producción</h3>
      <div className="stat-grid" style={{ marginBottom: 12 }}>
        <div className="stat-card green"><div className="stat-val">{cajasTerminadas}</div><div className="stat-lbl">Cajas terminadas</div></div>
        <div className={`stat-card ${pctMeta >= 80 ? "green" : pctMeta >= 50 ? "orange" : "red"}`}><div className="stat-val">{pctMeta}%</div><div className="stat-lbl">Días con meta ({diasConMeta}/{diasDelMes.length})</div></div>
        {rollosMes > 0 && <div className="stat-card accent"><div className="stat-val">{rollosMes}</div><div className="stat-lbl">Rollos (mes)</div></div>}
        {tintaMes > 0 && <div className="stat-card blue"><div className="stat-val">{tintaMes.toFixed(1)}<span style={{ fontSize: 13 }}> kg</span></div><div className="stat-lbl">Tinta (mes)</div></div>}
        {alcoholMes > 0 && <div className="stat-card orange"><div className="stat-val">{alcoholMes.toFixed(1)}<span style={{ fontSize: 13 }}> L</span></div><div className="stat-lbl">Alcohol (mes)</div></div>}
      </div>
      <div style={chartCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: "#9aa0bc", fontWeight: 600 }}>Cajas diarias — últimas 2 semanas</span>
          <div style={{ display: "flex", gap: 10, fontSize: 10, color: "#545a78" }}>
            <span><span style={{ color: "#4be87a" }}>■</span> Con meta</span>
            <span><span style={{ color: "#ff4d4d" }}>■</span> Sin meta</span>
          </div>
        </div>
        <BarChart data={ultimas14} meta={META_CAJAS} />
      </div>

      {ultimas8sem.some(s => s.val > 0) && (
        <div style={chartCard}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: "#9aa0bc", fontWeight: 600 }}>Cajas por semana — últimas 8 semanas</span>
            <span style={{ fontSize: 10, color: "#545a78" }}>meta {META_CAJAS * 5}/sem</span>
          </div>
          <BarChart data={ultimas8sem} meta={META_CAJAS * 5} />
        </div>
      )}

      {/* ── Sección Producción en $ ── */}
      <h3 className="sub-title">💰 Tu máquina en números</h3>
      <div className="stat-grid" style={{ marginBottom: 8 }}>
        <div className="stat-card green">
          <div className="stat-val" style={{ fontSize: 18 }}>${fmt(Math.round(valorProducidoMes))}</div>
          <div className="stat-lbl">Valor producido este mes</div>
        </div>
        <div className="stat-card red">
          <div className="stat-val" style={{ fontSize: 18 }}>${fmt(Math.round(perdidaMermaMes))}</div>
          <div className="stat-lbl">Perdido en merma este mes</div>
        </div>
      </div>
      <div className="stat-grid" style={{ marginBottom: 12 }}>
        <div className="stat-card blue">
          <div className="stat-val" style={{ fontSize: 18 }}>${fmt(Math.round(valorProducido))}</div>
          <div className="stat-lbl">Valor producido total</div>
        </div>
        <div className="stat-card orange">
          <div className="stat-val" style={{ fontSize: 18 }}>${fmt(Math.round(perdidaMerma))}</div>
          <div className="stat-lbl">Perdido en merma total</div>
        </div>
        {valorProducido > 0 && perdidaMerma > 0 && (
          <div className="stat-card accent">
            <div className="stat-val" style={{ fontSize: 18 }}>{((perdidaMerma / valorProducido) * 100).toFixed(1)}%</div>
            <div className="stat-lbl">Merma vs producción</div>
          </div>
        )}
      </div>

      {/* ── Sección Pedidos ── */}
      <h3 className="sub-title">📋 Pedidos</h3>
      <div className="stat-grid" style={{ marginBottom: 12 }}>
        <div className="stat-card blue"><div className="stat-val">{cajasTotal}</div><div className="stat-lbl">Cajas en sistema</div></div>
        <div className={`stat-card ${vencidos > 0 ? "red" : "green"}`}><div className="stat-val">{vencidos}</div><div className="stat-lbl">Vencidos</div></div>
        {tiempoPromedio !== null && <div className="stat-card blue"><div className="stat-val">{tiempoPromedio}<span style={{ fontSize: 13 }}> d</span></div><div className="stat-lbl">Días prom. por pedido</div></div>}
      </div>

      {/* Barra de merma */}
      <div style={{ ...chartCard, padding: "12px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: "#9aa0bc", fontWeight: 600 }}>Merma del mes vs meta máx. {META_MERMA_PCT}%</span>
          <span style={{ fontSize: 13, color: mermaColor, fontWeight: 700 }}>{mermaPct}%</span>
        </div>
        <div style={{ background: "#22263a", borderRadius: 6, height: 9, overflow: "hidden" }}>
          <div style={{ width: `${Math.min(100, (Number(mermaPct) / META_MERMA_PCT) * 100)}%`, height: "100%", background: mermaColor, borderRadius: 6, transition: "width .5s" }} />
        </div>
      </div>

      {pedidosMerma.length > 0 && (
        <div style={chartCard}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: "#9aa0bc", fontWeight: 600 }}>% Merma por pedido (últimos 10)</span>
            <div style={{ display: "flex", gap: 10, fontSize: 10, color: "#545a78" }}>
              <span><span style={{ color: "#4be87a" }}>■</span> OK</span>
              <span><span style={{ color: "#ff4d4d" }}>■</span> Alta</span>
            </div>
          </div>
          <BarChart data={pedidosMerma} meta={META_MERMA_PCT} lowerIsBetter />
        </div>
      )}

      {/* Lista urgentes */}
      {pedidosUrgentes.length > 0 && (
        <>
          <h3 className="sub-title" style={{ marginTop: 4 }}>🚨 Próximos a vencer</h3>
          <div className="list" style={{ marginBottom: 20 }}>
            {pedidosUrgentes.map(p => {
              const ep = estadoPlazo(p.diasRest);
              const bordeColor = p.status === "terminado" ? "#4be87a" : p.status === "proceso" ? "#4a9eff" : "#ff9900";
              return (
                <div key={p.id} className="list-item" style={{ borderLeft: `3px solid ${bordeColor}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div><strong>#{p.num}</strong> — {p.cliente}</div>
                    {ep && <span className={`badge ${ep.cls}`}>{ep.txt}</span>}
                  </div>
                  <div className="muted">{p.tipo} · {p.medida} · {p.cajas} cajas</div>
                  {p.merma_pct !== undefined && p.merma_pct !== "" && (
                    <div className="muted">Merma: <span style={{ color: Number(p.merma_pct) > META_MERMA_PCT ? "#ff4d4d" : "#4be87a", fontWeight: 600 }}>{p.merma_pct}%</span></div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Sección Fallas ── */}
      {fallasPorComp.length > 0 && (
        <>
          <h3 className="sub-title">🔩 Fallas</h3>
          <div style={chartCard}>
            <span style={{ fontSize: 12, color: "#9aa0bc", fontWeight: 600 }}>Minutos de paro por componente</span>
            <ResponsiveContainer width="100%" height={210}>
              <PieChart>
                <Pie data={fallasPorComp.map(d => ({ name: d.lbl, value: d.val }))} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={3}>
                  {fallasPorComp.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip content={<ChartTip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#9aa0bc', paddingTop: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* ── Sección Clientes & Refacciones ── */}
      {topClientes.length > 0 && (
        <>
          <h3 className="sub-title">🏆 Clientes</h3>
          <div style={chartCard}>
            <span style={{ fontSize: 12, color: "#9aa0bc", fontWeight: 600 }}>Top clientes por cajas terminadas</span>
            <ResponsiveContainer width="100%" height={topClientes.length * 44 + 16}>
              <ReBarChart data={topClientes} layout="vertical" margin={{ top: 10, right: 40, bottom: 0, left: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="lbl" tick={{ fill: '#9aa0bc', fontSize: 11 }} axisLine={false} tickLine={false} width={100} />
                <Tooltip formatter={v => [`${v} cajas`]} contentStyle={{ background: '#181b24', border: '1px solid #2d3249', borderRadius: 8, fontSize: 12 }} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="val" radius={[0, 4, 4, 0]} label={{ position: 'right', fill: '#545a78', fontSize: 11 }}>
                  {topClientes.map((_, i) => <Cell key={i} fill={['#4b8fe8','#4be87a','#e8b84b','#e8894b','#e84b4b'][i]} />)}
                </Bar>
              </ReBarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* ── Rentabilidad por cliente ── */}
      {rentabilidadClientes.length > 0 && (
        <>
          <h3 className="sub-title">💹 Rentabilidad por cliente</h3>
          <div style={chartCard}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #22263a' }}>
                    {['Cliente','Pedidos','Valor producido','Pérd. merma'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', color: '#545a78', fontWeight: 600, textAlign: h === 'Cliente' ? 'left' : 'right', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rentabilidadClientes.map((r, i) => (
                    <tr key={r.nombre} style={{ borderBottom: '1px solid #13161e', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                      <td style={{ padding: '8px 10px', color: '#e0e0e0', fontWeight: 600, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nombre}</td>
                      <td style={{ padding: '8px 10px', color: '#545a78', textAlign: 'right' }}>{r.pedidos}</td>
                      <td style={{ padding: '8px 10px', color: '#4b8fe8', textAlign: 'right', fontWeight: 700 }}>${fmt(Math.round(r.valor))}</td>
                      <td style={{ padding: '8px 10px', color: '#ff4d4d', textAlign: 'right' }}>${fmt(Math.round(r.merma))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Tinta por color ── */}
      <h3 className="sub-title">🎨 Tinta por color</h3>
      <div style={chartCard}>
        {tintaPorColor.length === 0
          ? <div style={{ textAlign: 'center', color: '#3a3f5a', fontSize: 13, padding: '12px 0' }}>Sin datos aún — se llena al finalizar pedidos</div>
          : <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #22263a' }}>
                    {['Color','Pedidos','Este mes','Total'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', color: '#545a78', fontWeight: 600, textAlign: h === 'Color' ? 'left' : 'right', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tintaPorColor.map((r, i) => (
                    <tr key={r.color} style={{ borderBottom: '1px solid #13161e', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                      <td style={{ padding: '8px 10px', color: '#e0e0e0', fontWeight: 600 }}>{r.color}</td>
                      <td style={{ padding: '8px 10px', color: '#545a78', textAlign: 'right' }}>{r.pedidos}</td>
                      <td style={{ padding: '8px 10px', color: '#4be87a', textAlign: 'right', fontWeight: 700 }}>{r.mes > 0 ? r.mes.toFixed(2) + ' kg' : '—'}</td>
                      <td style={{ padding: '8px 10px', color: '#4b8fe8', textAlign: 'right', fontWeight: 700 }}>{r.total.toFixed(2)} kg</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        }
      </div>

      {/* ── Por tipo de cinta ── */}
      <h3 className="sub-title">🧷 Por tipo de cinta</h3>
      <div style={chartCard}>
        {tipoCintaStats.length === 0
          ? <div style={{ textAlign: 'center', color: '#3a3f5a', fontSize: 13, padding: '12px 0' }}>Sin datos aún — se llena al finalizar pedidos</div>
          : <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #22263a' }}>
                    {['Tipo','Pedidos','Rollos MP este mes','Rollos MP total'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', color: '#545a78', fontWeight: 600, textAlign: h === 'Tipo' ? 'left' : 'right', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tipoCintaStats.map((r, i) => (
                    <tr key={r.tipo} style={{ borderBottom: '1px solid #13161e', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                      <td style={{ padding: '8px 10px', color: '#e0e0e0', fontWeight: 600, textTransform: 'capitalize' }}>{r.tipo}</td>
                      <td style={{ padding: '8px 10px', color: '#545a78', textAlign: 'right' }}>{r.pedidos}</td>
                      <td style={{ padding: '8px 10px', color: '#4be87a', textAlign: 'right', fontWeight: 700 }}>{r.rollosMes > 0 ? r.rollosMes.toFixed(2) : '—'}</td>
                      <td style={{ padding: '8px 10px', color: '#4b8fe8', textAlign: 'right', fontWeight: 700 }}>{r.rollos.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        }
      </div>

      <h3 className="sub-title">🔧 Refacciones</h3>
      <div className="stat-grid">
        <div className="stat-card blue"><div className="stat-val">${fmt(gastoRef)}</div><div className="stat-lbl">Gasto en compras</div></div>
        <div className="stat-card accent"><div className="stat-val">${fmt(valorInventario)}</div><div className="stat-lbl">Valor inventario</div></div>
        <div className={`stat-card ${stockBajoDash > 0 ? "red" : "green"}`}><div className="stat-val">{stockBajoDash}</div><div className="stat-lbl">Stock bajo</div></div>
      </div>

    </div>
  );
}
