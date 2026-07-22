import { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, BarChart as ReBarChart, Bar, XAxis, YAxis } from 'recharts';
import BarChart from './BarChart';
import { today, fmt, diasHabilesRestantes, estadoPlazo } from '../lib/utils';
import { META_CAJAS, META_MERMA_PCT, REBOB_CLIENTE, REBOB_COLOR, SEV } from '../lib/constants';
import { notificar } from '../lib/notificaciones';
import { exportarExcel } from '../lib/exportExcel';
import { analizarComponentes } from '../lib/mantenimiento';
import { IcoDash, IcoFal, IcoMoney, IcoCompare, IcoTrendUp, IcoTrophy, IcoDroplet, IcoTapeRoll, IcoRef, IcoRoll } from './Icons';
import EditorCostos from './EditorCostos';

const SECCIONES = [
  { id: 'resumen',    lbl: 'Resumen',    Icon: IcoDash },
  { id: 'produccion', lbl: 'Producción', Icon: IcoTrendUp },
  { id: 'finanzas',   lbl: 'Finanzas',   Icon: IcoMoney },
  { id: 'consumibles', lbl: 'Consumibles', Icon: IcoDroplet },
  { id: 'rebobinado', lbl: 'Rebobinado', Icon: IcoRoll },
];
const SubTitle = ({ icon: Icon, children }) => (
  <h3 className="sub-title"><span style={{ display: 'inline-flex', fontSize: 14 }}><Icon /></span>{children}</h3>
);

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

// Componentes de la SIAT L36 y de la Rebobinadora -- ambas maquinas
// reportan fallas en la misma tabla, asi que las dos deben poder
// aparecer en esta grafica.
const LBL_COMP = {
  "Rodillo anilox": "Anilox", "Sistema de tintas": "Tintas", "Cliché/portacliché": "Cliché",
  "Motor principal": "Motor", "Sistema de corte": "Corte", "Banda transportadora": "Banda",
  "Sistema eléctrico": "Eléct.", "Resortes de Mandriles Chicos": "Resortes",
  "Cuchillas de corte": "Cuchillas", "Motor rebobinador": "Motor rebob.",
  "Sistema de frenado": "Frenado", "Mandriles": "Mandriles",
  "Otro": "Otro",
};

const delta = (curr, prev) => {
  if (!prev) return null;
  const pct = ((curr - prev) / prev * 100).toFixed(0);
  return { pct: Math.abs(pct), sube: curr >= prev };
};

export default function Dashboard({ pedidos: pedidosProp, fallas, refacciones, proveedores, prodDiaria }) {
  const [seccion, setSeccion] = useState('resumen');

  useEffect(() => {
    const hoy = today();
    const yaAvisado = localStorage.getItem('vencidos_avisado');
    if (yaAvisado === hoy) return;
    const vencidos = pedidosProp
      .filter(p => p.cliente !== REBOB_CLIENTE && p.status !== "terminado" && p.fecha_solicitud)
      .map(p => ({ ...p, dias: diasHabilesRestantes(p.fecha_solicitud) }))
      .filter(p => p.dias < 0);
    if (vencidos.length > 0) {
      notificar('pedidos_vencidos', { pedidos: vencidos.map(p => ({ num: p.num, cliente: p.cliente, dias: p.dias })) });
      localStorage.setItem('vencidos_avisado', hoy);
    }
  }, [pedidosProp]);

  // Todo lo derivado de las 5 tablas se recalcula solo cuando esas tablas
  // cambian (p.ej. llega un evento realtime) -- no en cada cambio de
  // sub-pestana (`seccion`) ni cuando el padre se re-renderiza por datos
  // de otra pantalla que no se muestran aqui (lista_materiales, etc.).
  const {
    pedidos, activos, fallasAbiertas, valorInventario, cajasTotal, vencidos, stockBajoDash,
    cajasHoy, metaHoyCumplida, mesActual, mesPrev, cajasTerminadasMes, gastoRefMes, diasDelMes, diasConMeta, pctMeta,
    pedidosUrgentes, ultimas14, pedidosMerma, tiempoPromedio, componentesVencidos, fallasPorComp, topClientes,
    rentabilidadClientes, historialCostos, valorProducido, perdidaMerma, valorProducidoMes, perdidaMermaMes,
    mermaPctMes, mermaPctPrev, valorMes, valorPrev, tintaMes, alcoholMes, rollosMes,
    tintaPorColor, tipoCintaStats, rebPendientes, rebPiezasTotal, rebCajasTotal, rebMermaPctProm,
    rebPorMaterial, rebPorAdhesivo, rebRecientes,
  } = useMemo(() => {
    // Rebobinado es produccion de stock, no pedidos de cliente reales -- se
    // excluye de Resumen/Produccion/Finanzas/Consumibles y tiene su propia
    // pestana con sus propias metricas (ver mas abajo).
    const pedidos = pedidosProp.filter(p => p.cliente !== REBOB_CLIENTE);
    const pedidosRebobinado = pedidosProp.filter(p => p.cliente === REBOB_CLIENTE);
    const activos = pedidos.filter(p => p.status !== "terminado").length;
    const fallasAbiertas = fallas.filter(f => f.status === "abierta").length;
    const valorInventario = refacciones.reduce((s, r) => s + (Number(r.costo || 0) * Number(r.stock || 1)), 0);
    const cajasTotal = pedidos.reduce((s, p) => s + Number(p.cajas || 0), 0);
    const vencidos = pedidos.filter(p => p.status !== "terminado" && diasHabilesRestantes(p.fecha_solicitud) < 0).length;
    const stockBajoDash = refacciones.filter(r => { const min = r.stock_min ?? 1; return min > 0 && Number(r.stock || 0) <= min; }).length;
    const todayStr = today();
    const mesActual = todayStr.slice(0, 7);
    const mesPrev = (() => { const [y, m] = mesActual.split('-').map(Number); return m === 1 ? `${y-1}-12` : `${y}-${String(m-1).padStart(2,'0')}`; })();

    // Agrupa prodDiaria por fecha en una sola pasada -- antes cada dia del
    // mes (y cada una de las ultimas 14 fechas) volvia a recorrer toda la
    // tabla con su propio filter+reduce, un O(n*m) que se pone lento con
    // meses de historial acumulado.
    const cajasPorFecha = prodDiaria.reduce((m, r) => {
      if (r.fecha) m[r.fecha] = (m[r.fecha] || 0) + Number(r.cajas_dia || 0);
      return m;
    }, {});
    const cajasHoy = cajasPorFecha[todayStr] || 0;
    const metaHoyCumplida = cajasHoy >= META_CAJAS;
    const cajasTerminadasMes = pedidos.filter(p => p.status === "terminado" && p.fecha_termino?.startsWith(mesActual)).reduce((s, p) => s + Number(p.cajas || 0), 0);
    const gastoRefMes = proveedores.filter(p => p.fecha?.startsWith(mesActual)).reduce((s, p) => s + Number(p.monto || 0), 0);
    const diasDelMes = Object.keys(cajasPorFecha).filter(fecha => fecha.startsWith(mesActual));
    const diasConMeta = diasDelMes.filter(fecha => cajasPorFecha[fecha] >= META_CAJAS).length;
    const pctMeta = diasDelMes.length > 0 ? Math.round((diasConMeta / diasDelMes.length) * 100) : 0;
    const pedidosUrgentes = pedidos.filter(p => p.status !== "terminado" && p.fecha_solicitud).map(p => ({ ...p, diasRest: diasHabilesRestantes(p.fecha_solicitud) })).sort((a, b) => a.diasRest - b.diasRest).slice(0, 5);
    const ultimas14 = [...Array(14)].map((_, i) => { const d = new Date(todayStr + "T12:00:00"); d.setDate(d.getDate() - 13 + i); const fecha = d.toISOString().slice(0, 10); return { lbl: fecha.slice(8), val: cajasPorFecha[fecha] || 0 }; });
    const pedidosMerma = pedidos.filter(p => p.status === "terminado" && p.merma_pct !== null && p.merma_pct !== "").slice(-10).map(p => ({ lbl: String(p.cliente).slice(0, 6), val: Number(p.merma_pct) }));
    const pedConTiempo = pedidos.filter(p => p.status === "terminado" && p.fecha_inicio && p.fecha_termino);
    const tiempoPromedio = pedConTiempo.length > 0 ? Math.round(pedConTiempo.reduce((s, p) => s + (new Date(p.fecha_termino + "T12:00:00") - new Date(p.fecha_inicio + "T12:00:00")) / 86400000 + 1, 0) / pedConTiempo.length) : null;
    const componentesVencidos = analizarComponentes(fallas).filter(c => c.vencido);

    const fallasPorComp = Object.entries(LBL_COMP)
      .map(([comp, lbl]) => ({ lbl, val: fallas.filter(f => f.comp === comp && f.fecha?.startsWith(mesActual)).reduce((s, f) => s + Number(f.min_paro || 0), 0) }))
      .filter(d => d.val > 0).sort((a, b) => b.val - a.val);

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
    // Historial por cinta -- una fila por corrida terminada, mas reciente primero.
    const historialCostos = [...pedidosConCosto]
      .sort((a, b) => (b.fecha_termino || "").localeCompare(a.fecha_termino || ""))
      .map(p => ({
        id: p.id, num: p.num, cliente: p.cliente, fecha: p.fecha_termino,
        piezas: Number(p.piezas_prod || 0),
        costoPieza: Number(p.costo_pieza),
        valor: Number(p.costo_pieza) * Number(p.piezas_prod || 0),
        merma: Number(p.costo_pieza) * Number(p.merma || 0),
      }));
    const valorProducido   = pedidosConCosto.reduce((s, p) => s + (Number(p.costo_pieza) * Number(p.piezas_prod || 0)), 0);
    const perdidaMerma     = pedidosConCosto.reduce((s, p) => s + (Number(p.costo_pieza) * Number(p.merma || 0)), 0);
    const valorProducidoMes= pedidos.filter(p => p.status === "terminado" && p.fecha_termino?.startsWith(mesActual) && p.costo_pieza != null)
      .reduce((s, p) => s + (Number(p.costo_pieza) * Number(p.piezas_prod || 0)), 0);
    const perdidaMermaMes  = pedidos.filter(p => p.status === "terminado" && p.fecha_termino?.startsWith(mesActual) && p.costo_pieza != null)
      .reduce((s, p) => s + (Number(p.costo_pieza) * Number(p.merma || 0)), 0);
    const pedMes  = pedidos.filter(p => p.status === "terminado" && p.fecha_termino?.startsWith(mesActual));
    const pedPrev = pedidos.filter(p => p.status === "terminado" && p.fecha_termino?.startsWith(mesPrev));

    const mermaPctMes  = (() => { const ps = pedMes.filter(p => p.merma_pct != null && p.merma_pct !== ""); return ps.length ? (ps.reduce((s,p) => s + Number(p.merma_pct), 0) / ps.length).toFixed(1) : null; })();
    const mermaPctPrev = (() => { const ps = pedPrev.filter(p => p.merma_pct != null && p.merma_pct !== ""); return ps.length ? (ps.reduce((s,p) => s + Number(p.merma_pct), 0) / ps.length).toFixed(1) : null; })();

    const valorMes  = pedidos.filter(p => p.status === "terminado" && p.fecha_termino?.startsWith(mesActual) && p.costo_pieza != null).reduce((s, p) => s + Number(p.costo_pieza) * Number(p.piezas_prod || 0), 0);
    const valorPrev = pedidos.filter(p => p.status === "terminado" && p.fecha_termino?.startsWith(mesPrev)   && p.costo_pieza != null).reduce((s, p) => s + Number(p.costo_pieza) * Number(p.piezas_prod || 0), 0);

    const tintaMes = pedMes.reduce((s, p) => s + Number(p.tinta_kg || 0), 0);
    const alcoholMes = pedMes.reduce((s, p) => s + Number(p.alcohol_litros || 0), 0);
    const rollosMes = pedMes.reduce((s, p) => s + Number(p.rollos_usados || 0), 0);

    const tintaPorColor = (() => {
      const map = {};
      // Agrupa ignorando mayus/minusculas -- "Negro" y "NEGRO" son la misma
      // tinta aunque se hayan escrito distinto en algun pedido viejo. Se
      // muestra con la primera forma que se vio.
      const sumar = (k, kg) => {
        k = (k || "Sin color").trim();
        const key = k.toLowerCase();
        if (!map[key]) map[key] = { color: k, total: 0, pedidos: 0 };
        map[key].total   += kg;
        map[key].pedidos += 1;
      };
      // Solo el mes actual -- antes tambien exigia costo_pieza calculado, lo
      // que dejaba fuera pedidos con tinta_kg real pero sin costear (la mitad
      // de los terminados en algunos meses no aparecian aqui).
      pedidos.filter(p => p.status === "terminado" && p.tinta_kg && p.fecha_termino?.startsWith(mesActual)).forEach(p => {
        sumar(p.color || p.tinta_tipo, Number(p.tinta_kg));
        if (p.tinta_kg2) sumar(p.color2, Number(p.tinta_kg2));
      });
      return Object.values(map).sort((a, b) => b.total - a.total);
    })();

    const tipoCintaStats = (() => {
      const map = {};
      pedidos.filter(p => p.status === "terminado" && p.fecha_termino?.startsWith(mesActual)).forEach(p => {
        const k = (p.tipo || "Sin tipo").trim();
        if (!map[k]) map[k] = { rollos: 0, pedidos: 0 };
        map[k].rollos   += Number(p.rollos_usados || 0);
        map[k].pedidos  += 1;
      });
      return Object.entries(map).map(([tipo, d]) => ({ tipo, ...d })).sort((a, b) => b.rollos - a.rollos);
    })();

    // ── Rebobinado (stock, separado de los pedidos de cliente) ──
    const rebPendientes = pedidosRebobinado.filter(p => p.status === "pendiente").length;
    const rebPiezasTotal = pedidosRebobinado.reduce((s, p) => s + Number(p.piezas_prod || 0), 0);
    const rebCajasTotal = pedidosRebobinado.reduce((s, p) => s + Number(p.cajas || 0), 0);
    const rebConMerma = pedidosRebobinado.filter(p => p.merma_pct != null && p.merma_pct !== "");
    const rebMermaPctProm = rebConMerma.length ? (rebConMerma.reduce((s, p) => s + Number(p.merma_pct), 0) / rebConMerma.length).toFixed(1) : null;
    const rebPorGrupo = (campo) => {
      const map = {};
      pedidosRebobinado.forEach(p => {
        const k = p[campo] || "Sin dato";
        if (!map[k]) map[k] = { piezas: 0, cajas: 0, pedidos: 0 };
        map[k].piezas += Number(p.piezas_prod || 0);
        map[k].cajas  += Number(p.cajas || 0);
        map[k].pedidos += 1;
      });
      return Object.entries(map).map(([k, d]) => ({ k, ...d })).sort((a, b) => b.piezas - a.piezas);
    };
    const rebPorMaterial = rebPorGrupo('tipo');
    const rebPorAdhesivo = rebPorGrupo('color');
    const rebRecientes = [...pedidosRebobinado].sort((a, b) => (b.created || "").localeCompare(a.created || "")).slice(0, 10);

    return {
      pedidos, activos, fallasAbiertas, valorInventario, cajasTotal, vencidos, stockBajoDash,
      cajasHoy, metaHoyCumplida, mesActual, mesPrev, cajasTerminadasMes, gastoRefMes, diasDelMes, diasConMeta, pctMeta,
      pedidosUrgentes, ultimas14, pedidosMerma, tiempoPromedio, componentesVencidos, fallasPorComp, topClientes,
      rentabilidadClientes, historialCostos, valorProducido, perdidaMerma, valorProducidoMes, perdidaMermaMes,
      mermaPctMes, mermaPctPrev, valorMes, valorPrev, tintaMes, alcoholMes, rollosMes,
      tintaPorColor, tipoCintaStats, rebPendientes, rebPiezasTotal, rebCajasTotal, rebMermaPctProm,
      rebPorMaterial, rebPorAdhesivo, rebRecientes,
    };
  }, [pedidosProp, fallas, refacciones, proveedores, prodDiaria]);

  const generarPDF = async () => {
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
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

    // Logo real para la portada y el encabezado de cada pagina -- si por lo
    // que sea no carga, el PDF se sigue generando sin el (nunca truena por esto).
    let logoData = null;
    try {
      const resp = await fetch('/logo512.png');
      const blob = await resp.blob();
      logoData = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
    } catch (_) { /* sin logo */ }

    // La portada cuenta como pag. 1 (no llama a drawHdr) -- arranca en 1
    // para que el numero de pagina del encabezado normal ya salga correcto.
    let pgNum = 1;
    const drawHdr = () => {
      pgNum++;
      doc.setFillColor(...C.hdr); doc.rect(0, 0, W, 26, "F");
      doc.setFillColor(...C.acc); doc.rect(0, 26, W, 1.5, "F");
      if (logoData) doc.addImage(logoData, "PNG", mg, 5, 16, 16);
      const tx = logoData ? mg + 20 : mg;
      doc.setTextColor(...C.acc); doc.setFontSize(15); doc.setFont(undefined, "bold");
      doc.text("EEMSA System", tx, 12);
      doc.setFontSize(8.5); doc.setFont(undefined, "normal");
      doc.setTextColor(185, 205, 235);
      doc.text(`Reporte Mensual  ·  ${fechaGen}`, tx, 20);
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

    // ── Portada: logo, titulo del mes en curso y resumen ejecutivo ──
    // Todo en la portada es del MES ACTUAL (lo que importa para tomar
    // decisiones ya) -- nada de comparativas por año ni de "cajas
    // producidas" (esa venia de Producción diaria, que no se ha llenado y
    // siempre marcaba 0). El historial mes a mes de todos los años queda
    // hasta el final del documento, no compite con la portada.
    const [anioActualNum, mesNumActual] = mesActual.split("-").map(Number);
    doc.setFillColor(...C.hdr); doc.rect(0, 0, W, 92, "F");
    doc.setFillColor(...C.acc); doc.rect(0, 92, W, 2, "F");
    if (logoData) doc.addImage(logoData, "PNG", W / 2 - 18, 14, 36, 36);
    doc.setTextColor(...C.acc); doc.setFontSize(24); doc.setFont(undefined, "bold");
    doc.text("EEMSA System", W / 2, 62, { align: "center" });
    doc.setFontSize(12); doc.setFont(undefined, "normal"); doc.setTextColor(200, 210, 235);
    doc.text(`Reporte Mensual — ${fmtM(mesNumActual)} ${anioActualNum}`, W / 2, 70, { align: "center" });
    doc.setFontSize(8.5); doc.setTextColor(150, 165, 200);
    doc.text(`Generado el ${fechaGen}`, W / 2, 78, { align: "center" });
    doc.setFontSize(7.5); doc.setTextColor(130, 145, 180);
    doc.text("Historial mes a mes de todos los años al final de este documento", W / 2, 85, { align: "center" });

    // Resumen ejecutivo del mes en curso
    const pedidosTerminadosMesCount = pedidos.filter(p => p.status === "terminado" && p.fecha_termino?.startsWith(mesActual)).length;
    const fallasMesArr = fallas.filter(f => f.fecha?.startsWith(mesActual));
    const minParoMes = fallasMesArr.reduce((s, f) => s + Number(f.min_paro || 0), 0);

    const kpis = [
      { val: pedidosTerminadosMesCount.toLocaleString("es-MX"), lbl: "Pedidos terminados (mes)", color: [75, 143, 232] },
      { val: mermaPctMes != null ? `${mermaPctMes}%` : "—", lbl: "Merma promedio (mes)", color: [232, 75, 75] },
      { val: fallasMesArr.length.toLocaleString("es-MX"), lbl: `Fallas del mes (${fmt(minParoMes)} min. paro)`, color: [232, 137, 75] },
      { val: `$${fmt(gastoRefMes)}`, lbl: "Gasto en refacciones (mes)", color: [155, 111, 232] },
      { val: `$${fmt(Math.round(valorProducidoMes))}`, lbl: "Valor producido (mes)", color: [75, 232, 122] },
    ];
    const kpiGap = 6, kpiW = (W - mg * 2 - kpiGap * 2) / 3, kpiH = 30, kpiY0 = 104;
    kpis.forEach((k, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const x = mg + col * (kpiW + kpiGap), y = kpiY0 + row * (kpiH + kpiGap);
      doc.setFillColor(246, 247, 251); doc.rect(x, y, kpiW, kpiH, "F");
      doc.setFillColor(...k.color); doc.rect(x, y, kpiW, 1.6, "F");
      doc.setTextColor(...k.color); doc.setFontSize(16); doc.setFont(undefined, "bold");
      doc.text(String(k.val), x + kpiW / 2, y + 15, { align: "center" });
      doc.setTextColor(90, 95, 110); doc.setFontSize(7.3); doc.setFont(undefined, "normal");
      doc.text(k.lbl, x + kpiW / 2, y + 23, { align: "center", maxWidth: kpiW - 6 });
    });

    // ── Grafica: % merma de los ultimos 12 meses (unica grafica -- la de
    // "cajas producidas" se quito porque depende de Producción diaria) ──
    const drawBarChart = (x, y, w, h, titulo, datos, opts = {}) => {
      doc.setTextColor(...C.hdr); doc.setFontSize(9.5); doc.setFont(undefined, "bold");
      doc.text(titulo, x, y - 6, { maxWidth: w });
      doc.setFont(undefined, "normal");
      const vals = datos.map(d => d.val ?? 0);
      const maxVal = Math.max(...vals, opts.refLineVal || 0, 1);
      const barBase = y + h - 12;
      const barGap = 2;
      const barW = (w - barGap * (datos.length - 1)) / datos.length;
      datos.forEach((d, i) => {
        const bx = x + i * (barW + barGap);
        const val = d.val ?? 0;
        const bh = (val / maxVal) * (h - 12);
        const by = barBase - bh;
        const color = opts.colorFn ? opts.colorFn(d.val) : C.acc;
        if (d.val != null) {
          doc.setFillColor(...color); doc.rect(bx, by, barW, Math.max(bh, 0.3), "F");
          doc.setFontSize(6); doc.setTextColor(90, 95, 110);
          doc.text(opts.fmtVal ? opts.fmtVal(d.val) : String(Math.round(d.val)), bx + barW / 2, by - 1.5, { align: "center" });
        }
        doc.setFontSize(6.2); doc.setTextColor(120, 125, 140);
        doc.text(d.lbl, bx + barW / 2, y + h - 6, { align: "center" });
      });
      if (opts.refLineVal != null) {
        const refY = barBase - (opts.refLineVal / maxVal) * (h - 12);
        doc.setDrawColor(232, 75, 75); doc.setLineWidth(0.35);
        doc.line(x, refY, x + w, refY);
      }
      doc.setDrawColor(210, 215, 230); doc.setLineWidth(0.2);
      doc.line(x, barBase, x + w, barBase);
    };

    const hoy = new Date();
    const ultimos12Fechas = [...Array(12)].map((_, i) => new Date(hoy.getFullYear(), hoy.getMonth() - 11 + i, 1));
    const ultimosMerma12 = ultimos12Fechas.map(d => {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const ps = pedidos.filter(p => p.status === "terminado" && p.fecha_termino?.startsWith(key) && p.merma_pct !== null && p.merma_pct !== "");
      const val = ps.length ? ps.reduce((s, p) => s + Number(p.merma_pct), 0) / ps.length : null;
      return { lbl: `${fmtM(d.getMonth() + 1).slice(0, 3)} ${String(d.getFullYear()).slice(2)}`, val };
    });

    const chartY = 182, chartH = 68, chartW = W - mg * 2;
    drawBarChart(mg, chartY, chartW, chartH, `% Merma — últimos 12 meses (meta ${META_MERMA_PCT}%)`, ultimosMerma12, {
      colorFn: v => v == null ? [200, 200, 200] : (v > META_MERMA_PCT ? [232, 75, 75] : [75, 232, 122]),
      fmtVal: v => v.toFixed(1) + "%",
      refLineVal: META_MERMA_PCT,
    });

    // ── Detalle del mes en curso (pág. 2+) ──
    newPage();
    doc.setTextColor(...C.hdr); doc.setFontSize(13); doc.setFont(undefined, "bold");
    doc.text(`Detalle del mes — ${fmtM(mesNumActual)} ${anioActualNum}`, mg, 37);
    doc.setFont(undefined, "normal");

    // Version simple de renderSec: una sola tabla, sin agrupar por año --
    // regresa el Y donde quedo para encadenar la siguiente seccion, y
    // funciona aunque el mes no tenga datos (nunca depende de una tabla
    // previa que pudiera no existir).
    const seccionMes = (titulo, head, rows, y, tblOpts = {}) => {
      if (y > 258) y = newPage();
      doc.setFillColor(...C.hdr); doc.rect(mg, y, W - mg * 2, 7.5, "F");
      doc.setTextColor(...C.acc); doc.setFontSize(9.5); doc.setFont(undefined, "bold");
      doc.text(titulo, mg + 3, y + 5.2);
      doc.setFont(undefined, "normal");
      if (!rows.length) {
        doc.setTextColor(150); doc.setFontSize(8.5);
        doc.text("Sin datos registrados este mes.", mg + 3, y + 16);
        return y + 26;
      }
      drawTbl(y + 11, head, rows, tblOpts);
      return doc.lastAutoTable.finalY;
    };

    let yMes = 44;
    const pedMesRows = pedidos
      .filter(p => p.status === "terminado" && p.fecha_termino?.startsWith(mesActual))
      .sort((a, b) => (a.fecha_termino || "").localeCompare(b.fecha_termino || ""))
      .map(p => [p.num || "—", p.cliente || "—", p.medida || "—", p.cajas || 0, (p.merma_pct != null && p.merma_pct !== "") ? p.merma_pct + "%" : "—"]);
    yMes = seccionMes("Pedidos terminados este mes", ["Pedido", "Cliente", "Medida", "Cajas", "Merma %"], pedMesRows, yMes);

    const fallasMesRows = [...fallasMesArr]
      .sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""))
      .map(f => [f.fecha || "—", f.maq || "—", f.comp || "—", SEV[f.sev] || f.sev || "—", f.min_paro || 0, f.status === "abierta" ? "Abierta" : "Cerrada"]);
    yMes = seccionMes("Fallas registradas este mes", ["Fecha", "Máquina", "Componente", "Severidad", "Min. paro", "Estatus"], fallasMesRows, yMes + 14);

    const comprasMesRows = proveedores
      .filter(p => p.fecha?.startsWith(mesActual))
      .sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""))
      .map(p => [p.fecha || "—", p.proveedor || "—", p.descripcion || "—", `$${fmt(p.monto || 0)}`]);
    seccionMes("Compras de refacciones este mes", ["Fecha", "Proveedor", "Descripción", "Monto"], comprasMesRows, yMes + 14);

    // ── Historial mes a mes de todos los años (al final del documento) ──
    newPage();
    doc.setTextColor(...C.hdr); doc.setFontSize(13); doc.setFont(undefined, "bold");
    doc.text("Historial mes a mes", mg, 37);
    doc.setFont(undefined, "normal");
    // Por si "Detalle del mes en curso" no dibujo ninguna tabla real (mes
    // sin datos en absoluto) -- asi renderSec siempre tiene un finalY valido.
    doc.lastAutoTable = { finalY: 34 };

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
          doc.text(`• ${anio}`, mg, y + 12);
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
            doc.text(`• ${anio}`, mg, ny + 7);
            doc.setFont(undefined, "normal");
            tblY = ny + 10;
          } else {
            doc.setTextColor(70, 95, 165); doc.setFontSize(8.5); doc.setFont(undefined, "bold");
            doc.text(`• ${anio}`, mg, prev + 8);
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

    // 2. Fallas
    renderSec("2. Fallas por mes", ["Mes", "Total fallas", "Min. de paro", "Críticas", "Moderadas", "Abiertas"], anio => {
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

    // 3. Compras
    renderSec("3. Compras de refacciones por mes", ["Mes", "No. compras", "Monto total", "Prom. por compra"], anio => {
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

    // 4. Desglose por cinta / pedido finalizado
    renderSec("4. Desglose de cintas finalizadas por mes", ["Mes", "Pedido", "Cliente", "Medida", "Cajas", "Merma pzas.", "Merma %"], anio => {
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
  const mermaPctMesShow = mermaPctMes != null ? Number(mermaPctMes) : 0;
  const mermaColor = mermaPctMesShow > META_MERMA_PCT ? "#ff4d4d" : "#4be87a";

  return (
    <div>

      {/* ── Encabezado ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h2 className="sec-title" style={{ marginBottom: 0 }}>Dashboard</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => exportarExcel({ pedidos, fallas, prodDiaria, proveedores })}>Excel</button>
          <button className="btn btn-ghost btn-sm" onClick={generarPDF}>PDF</button>
        </div>
      </div>

      <div className="dash-tabs">
        {SECCIONES.map(s => (
          <button key={s.id} className={`dash-tab ${seccion === s.id ? "active" : ""}`} onClick={() => setSeccion(s.id)}>
            <s.Icon />{s.lbl}
          </button>
        ))}
      </div>

      {seccion === 'resumen' && <>
      {/* ── KPIs principales (4 tarjetas) ── */}
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card accent"><div className="stat-val">{activos}</div><div className="stat-lbl">Pedidos activos</div></div>
        <div className={`stat-card ${metaHoyCumplida ? "green" : "red"}`}><div className="stat-val">{cajasHoy}<span style={{ fontSize: 14, opacity: .6 }}>/{META_CAJAS}</span></div><div className="stat-lbl">Cajas hoy</div></div>
        <div className="stat-card orange"><div className="stat-val">{mermaPctMesShow}%</div><div className="stat-lbl">Merma del mes</div></div>
        <div className={`stat-card ${fallasAbiertas > 0 ? "red" : "green"}`}><div className="stat-val">{fallasAbiertas}</div><div className="stat-lbl">Fallas abiertas</div></div>
      </div>

      {/* ── Próximos a vencer ── */}
      {pedidosUrgentes.length > 0 && (
        <>
          <SubTitle icon={IcoFal}>Próximos a vencer</SubTitle>
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
                  {p.merma_pct !== undefined && p.merma_pct !== null && p.merma_pct !== "" && (
                    <div className="muted">Merma: <span style={{ color: Number(p.merma_pct) > META_MERMA_PCT ? "#ff4d4d" : "#4be87a", fontWeight: 600 }}>{p.merma_pct}%</span></div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Mantenimiento preventivo ── */}
      {componentesVencidos.length > 0 && (
        <>
          <SubTitle icon={IcoRef}>Mantenimiento preventivo</SubTitle>
          <div className="list" style={{ marginBottom: 20 }}>
            {componentesVencidos.map(c => (
              <div key={c.comp} className="list-item" style={{ borderLeft: "3px solid var(--red)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div><strong>{c.comp}</strong> — {c.maquinas.join(", ")}</div>
                  <span className="badge b-red">Vencido {Math.abs(c.diasRestantes)}d</span>
                </div>
                <div className="muted">Falla en promedio cada ~{c.promedioIntervalo} días · van {c.diasDesdeUltima} desde la última</div>
              </div>
            ))}
          </div>
        </>
      )}
      </>}

      {seccion === 'finanzas' && <>
      {/* ── Tu máquina en números ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <SubTitle icon={IcoMoney}>Tu máquina en números</SubTitle>
        <EditorCostos label="Editar costos" />
      </div>
      <div className="stat-grid" style={{ marginBottom: 12 }}>
        <div className="stat-card green">
          <div className="stat-val" style={{ fontSize: 18 }}>${fmt(Math.round(valorProducidoMes))}</div>
          <div className="stat-lbl">Valor producido este mes</div>
          {valorProducido !== valorProducidoMes && <div className="muted" style={{ marginTop: 3 }}>Total: ${fmt(Math.round(valorProducido))}</div>}
        </div>
        <div className="stat-card red">
          <div className="stat-val" style={{ fontSize: 18 }}>${fmt(Math.round(perdidaMermaMes))}</div>
          <div className="stat-lbl">Perdido en merma este mes</div>
          {perdidaMerma !== perdidaMermaMes && <div className="muted" style={{ marginTop: 3 }}>Total: ${fmt(Math.round(perdidaMerma))}</div>}
        </div>
        {valorProducido > 0 && perdidaMerma > 0 && (
          <div className="stat-card accent">
            <div className="stat-val" style={{ fontSize: 18 }}>{((perdidaMerma / valorProducido) * 100).toFixed(1)}%</div>
            <div className="stat-lbl">Merma vs producción (total)</div>
          </div>
        )}
      </div>

      {/* ── Comparativo mes a mes ── */}
      {/* "Cajas producidas" (prodDiaria) se quito de aqui -- esa tabla no
          se llena y siempre daba 0 vs 0, un renglon falso en la tarjeta.
          Ahora la tarjeta solo aparece si de verdad hay algo que comparar. */}
      {(() => {
        const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
        const lblMes  = MESES[parseInt(mesActual.split('-')[1]) - 1];
        const lblPrev = MESES[parseInt(mesPrev.split('-')[1]) - 1];
        const items = [
          ...(mermaPctMes && mermaPctPrev ? [{ lbl: "Merma %", curr: Number(mermaPctMes), prev: Number(mermaPctPrev), fmt: v => v + "%", menorEsMejor: true }] : []),
          ...(valorMes > 0 || valorPrev > 0 ? [{ lbl: "Valor producido", curr: valorMes, prev: valorPrev, fmt: v => "$" + fmt(Math.round(v)), menorEsMejor: false }] : []),
        ];
        if (!items.length) return null;
        return (
          <>
            <SubTitle icon={IcoCompare}>{lblMes} vs {lblPrev}</SubTitle>
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
      </>}

      {seccion === 'produccion' && <>
      {/* ── Producción ── */}
      <SubTitle icon={IcoTrendUp}>Producción</SubTitle>
      <div className="stat-grid" style={{ marginBottom: 12 }}>
        <div className="stat-card green"><div className="stat-val">{cajasTerminadasMes}</div><div className="stat-lbl">Cajas terminadas (mes)</div></div>
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

      {/* ── Merma ── */}
      <div className="stat-grid" style={{ marginBottom: 12 }}>
        <div className="stat-card blue"><div className="stat-val">{cajasTotal}</div><div className="stat-lbl">Cajas en sistema</div></div>
        <div className={`stat-card ${vencidos > 0 ? "red" : "green"}`}><div className="stat-val">{vencidos}</div><div className="stat-lbl">Vencidos</div></div>
        {tiempoPromedio !== null && <div className="stat-card blue"><div className="stat-val">{tiempoPromedio}<span style={{ fontSize: 13 }}> d</span></div><div className="stat-lbl">Días prom. por pedido</div></div>}
      </div>
      <div style={{ ...chartCard, padding: "12px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: "#9aa0bc", fontWeight: 600 }}>Merma del mes vs meta máx. {META_MERMA_PCT}%</span>
          <span style={{ fontSize: 13, color: mermaColor, fontWeight: 700 }}>{mermaPctMesShow}%</span>
        </div>
        <div style={{ background: "#22263a", borderRadius: 6, height: 9, overflow: "hidden" }}>
          <div style={{ width: `${Math.min(100, (mermaPctMesShow / META_MERMA_PCT) * 100)}%`, height: "100%", background: mermaColor, borderRadius: 6, transition: "width .5s" }} />
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

      </>}

      {seccion === 'finanzas' && <>
      {/* ── Historial por cinta ── */}
      {historialCostos.length > 0 && (
        <>
          <SubTitle icon={IcoTapeRoll}>Historial por cinta</SubTitle>
          <div style={chartCard}>
            <div style={{ maxHeight: 420, overflowY: 'auto', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #22263a' }}>
                    {['Fecha','Pedido','Cliente','Piezas','Costo/pza','Valor producido','Pérd. merma'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', color: '#545a78', fontWeight: 600, textAlign: (h === 'Cliente' || h === 'Fecha') ? 'left' : 'right', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: '#181b24' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historialCostos.map((r, i) => (
                    <tr key={r.id} style={{ borderBottom: '1px solid #13161e', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                      <td style={{ padding: '8px 10px', color: '#545a78', whiteSpace: 'nowrap' }}>{r.fecha || '—'}</td>
                      <td style={{ padding: '8px 10px', color: '#9aa0bc', whiteSpace: 'nowrap' }}>#{r.num || '—'}</td>
                      <td style={{ padding: '8px 10px', color: '#e0e0e0', fontWeight: 600, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.cliente}</td>
                      <td style={{ padding: '8px 10px', color: '#545a78', textAlign: 'right' }}>{r.piezas.toLocaleString()}</td>
                      <td style={{ padding: '8px 10px', color: '#9aa0bc', textAlign: 'right' }}>${r.costoPieza.toFixed(3)}</td>
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

      {/* ── Rentabilidad por cliente ── */}
      {rentabilidadClientes.length > 0 && (
        <>
          <SubTitle icon={IcoMoney}>Rentabilidad por cliente</SubTitle>
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

      {/* ── Clientes ── */}
      {topClientes.length > 0 && (
        <>
          <SubTitle icon={IcoTrophy}>Clientes</SubTitle>
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

      </>}

      {seccion === 'consumibles' && <>
      {/* ── Tinta por color ── */}
      <SubTitle icon={IcoDroplet}>Tinta por color — este mes</SubTitle>
      <div style={chartCard}>
        {tintaPorColor.length === 0
          ? <div style={{ textAlign: 'center', color: '#3a3f5a', fontSize: 13, padding: '12px 0' }}>Sin datos aún — se llena al finalizar pedidos</div>
          : <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #22263a' }}>
                    {['Color','Pedidos','Kg'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', color: '#545a78', fontWeight: 600, textAlign: h === 'Color' ? 'left' : 'right', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tintaPorColor.map((r, i) => (
                    <tr key={r.color} style={{ borderBottom: '1px solid #13161e', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                      <td style={{ padding: '8px 10px', color: '#e0e0e0', fontWeight: 600 }}>{r.color}</td>
                      <td style={{ padding: '8px 10px', color: '#545a78', textAlign: 'right' }}>{r.pedidos}</td>
                      <td style={{ padding: '8px 10px', color: '#4be87a', textAlign: 'right', fontWeight: 700 }}>{r.total.toFixed(2)} kg</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        }
      </div>

      {/* ── Por tipo de cinta ── */}
      <SubTitle icon={IcoTapeRoll}>Por tipo de cinta — este mes</SubTitle>
      <div style={chartCard}>
        {tipoCintaStats.length === 0
          ? <div style={{ textAlign: 'center', color: '#3a3f5a', fontSize: 13, padding: '12px 0' }}>Sin datos aún — se llena al finalizar pedidos</div>
          : <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #22263a' }}>
                    {['Tipo','Pedidos','Rollos MP'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', color: '#545a78', fontWeight: 600, textAlign: h === 'Tipo' ? 'left' : 'right', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tipoCintaStats.map((r, i) => (
                    <tr key={r.tipo} style={{ borderBottom: '1px solid #13161e', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                      <td style={{ padding: '8px 10px', color: '#e0e0e0', fontWeight: 600, textTransform: 'capitalize' }}>{r.tipo}</td>
                      <td style={{ padding: '8px 10px', color: '#545a78', textAlign: 'right' }}>{r.pedidos}</td>
                      <td style={{ padding: '8px 10px', color: '#4be87a', textAlign: 'right', fontWeight: 700 }}>{r.rollos.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        }
      </div>

      </>}

      {seccion === 'rebobinado' && <>
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card accent"><div className="stat-val">{rebPiezasTotal.toLocaleString()}</div><div className="stat-lbl">Piezas totales</div></div>
        <div className="stat-card blue"><div className="stat-val">{rebCajasTotal.toLocaleString()}</div><div className="stat-lbl">Cajas totales</div></div>
        <div className={`stat-card ${rebMermaPctProm != null && rebMermaPctProm > META_MERMA_PCT ? "red" : "green"}`}><div className="stat-val">{rebMermaPctProm != null ? `${rebMermaPctProm}%` : "—"}</div><div className="stat-lbl">Merma promedio</div></div>
        <div className={`stat-card ${rebPendientes > 0 ? "orange" : "green"}`}><div className="stat-val">{rebPendientes}</div><div className="stat-lbl">Falta dar de alta</div></div>
      </div>

      <SubTitle icon={IcoRoll}>Por material del rollo</SubTitle>
      <div style={chartCard}>
        {rebPorMaterial.length === 0
          ? <div style={{ textAlign: 'center', color: '#3a3f5a', fontSize: 13, padding: '12px 0' }}>Sin datos aún — se llena al registrar en Modo Rebobinado</div>
          : <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #22263a' }}>
                    {['Material','Registros','Cajas','Piezas'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', color: '#545a78', fontWeight: 600, textAlign: h === 'Material' ? 'left' : 'right', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rebPorMaterial.map((r, i) => (
                    <tr key={r.k} style={{ borderBottom: '1px solid #13161e', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                      <td style={{ padding: '8px 10px', color: '#e0e0e0', fontWeight: 600 }}>{r.k}</td>
                      <td style={{ padding: '8px 10px', color: '#545a78', textAlign: 'right' }}>{r.pedidos}</td>
                      <td style={{ padding: '8px 10px', color: '#4b8fe8', textAlign: 'right', fontWeight: 700 }}>{r.cajas.toLocaleString()}</td>
                      <td style={{ padding: '8px 10px', color: REBOB_COLOR, textAlign: 'right', fontWeight: 700 }}>{r.piezas.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        }
      </div>

      <SubTitle icon={IcoDroplet}>Por adhesivo</SubTitle>
      <div style={chartCard}>
        {rebPorAdhesivo.length === 0
          ? <div style={{ textAlign: 'center', color: '#3a3f5a', fontSize: 13, padding: '12px 0' }}>Sin datos aún</div>
          : <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #22263a' }}>
                    {['Adhesivo','Registros','Cajas','Piezas'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', color: '#545a78', fontWeight: 600, textAlign: h === 'Adhesivo' ? 'left' : 'right', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rebPorAdhesivo.map((r, i) => (
                    <tr key={r.k} style={{ borderBottom: '1px solid #13161e', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                      <td style={{ padding: '8px 10px', color: '#e0e0e0', fontWeight: 600 }}>{r.k}</td>
                      <td style={{ padding: '8px 10px', color: '#545a78', textAlign: 'right' }}>{r.pedidos}</td>
                      <td style={{ padding: '8px 10px', color: '#4b8fe8', textAlign: 'right', fontWeight: 700 }}>{r.cajas.toLocaleString()}</td>
                      <td style={{ padding: '8px 10px', color: REBOB_COLOR, textAlign: 'right', fontWeight: 700 }}>{r.piezas.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        }
      </div>

      {rebRecientes.length > 0 && (
        <>
          <SubTitle icon={IcoTapeRoll}>Últimos registros</SubTitle>
          <div className="list" style={{ marginBottom: 20 }}>
            {rebRecientes.map(p => (
              <div key={p.id} className="list-item" style={{ borderLeft: `3px solid ${REBOB_COLOR}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div><strong>#{p.num}</strong> — {p.tipo} · {p.color}</div>
                  <span className={`badge ${p.status === "terminado" ? "b-green" : "b-orange"}`}>{p.status === "terminado" ? "Terminado" : "Falta dar de alta"}</span>
                </div>
                <div className="muted">{p.medida} · {p.cajas} cajas · {Number(p.piezas_prod || 0).toLocaleString()} piezas</div>
                {p.merma_pct != null && p.merma_pct !== "" && (
                  <div className="muted">Merma: <span style={{ color: Number(p.merma_pct) > META_MERMA_PCT ? "#ff4d4d" : "#4be87a", fontWeight: 600 }}>{p.merma_pct}%</span></div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      </>}

      {seccion === 'resumen' && <>
      {/* ── Fallas ── */}
      {fallasPorComp.length > 0 && (
        <>
          <SubTitle icon={IcoFal}>Fallas</SubTitle>
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

      </>}

      {seccion === 'finanzas' && <>
      <SubTitle icon={IcoRef}>Refacciones</SubTitle>
      <div className="stat-grid">
        <div className="stat-card blue"><div className="stat-val">${fmt(gastoRefMes)}</div><div className="stat-lbl">Gasto en compras (mes)</div></div>
        <div className="stat-card accent"><div className="stat-val">${fmt(valorInventario)}</div><div className="stat-lbl">Valor inventario</div></div>
        <div className={`stat-card ${stockBajoDash > 0 ? "red" : "green"}`}><div className="stat-val">{stockBajoDash}</div><div className="stat-lbl">Stock bajo</div></div>
      </div>
      </>}

    </div>
  );
}
