import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useState, useEffect, useRef } from "react";
import "./App.css";
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_KEY
);

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const today = () => new Date().toISOString().slice(0, 10);
const fmt = (n) => Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const diasHabiles = (desde, hasta) => {
  if (!desde || !hasta) return 0;
  let count = 0;
  const d = new Date(desde + "T12:00:00");
  const h = new Date(hasta + "T12:00:00");
  const cur = new Date(d);
  while (cur <= h) { const d = cur.getDay(); if (d !== 0 && d !== 6) count++; cur.setDate(cur.getDate() + 1); }
  return count;
};

const diasHabilesRestantes = (fechaSolicitud) => {
  if (!fechaSolicitud) return null;
  const inicio = new Date(fechaSolicitud + "T12:00:00");
  const limite = new Date(inicio);
  let agregados = 0;
  while (agregados < 15) { limite.setDate(limite.getDate() + 1); const d = limite.getDay(); if (d !== 0 && d !== 6) agregados++; }
  const hoy = new Date(today() + "T12:00:00");
  let restantes = 0;
  const cur = new Date(hoy);
  if (cur > limite) return -diasHabiles(today(), limite.toISOString().slice(0, 10));
  while (cur <= limite) { if (cur.getDay() !== 0) restantes++; cur.setDate(cur.getDate() + 1); }
  return restantes - 1;
};

const estadoPlazo = (dias) => {
  if (dias === null) return null;
  if (dias < 0) return { txt: "VENCIDO", cls: "b-red", color: "#ff4d4d" };
  if (dias <= 3) return { txt: `URGENTE (${dias}d)`, cls: "b-orange", color: "#ff9900" };
  return { txt: `${dias} días`, cls: "b-green", color: "#4be87a" };
};

const MAQUINAS = ["SIAT L36 #1", "SIAT L36 #2", "SIAT L36 #3"];
const TIPOS = ["Blanca", "Canela", "Transparente", "Engomado"];
const OPERADORES = ["William", "Alfredo"];
const COMPS = ["Rodillo anilox", "Sistema de tintas", "Cliché/portacliché", "Motor principal", "Sistema de corte", "Banda transportadora", "Sistema eléctrico", "Otro"];
const STATUS_PED = { anotado: "Anotado", proceso: "En proceso", terminado: "Terminado" };
const SEV = { leve: "Leve", moderada: "Moderada", critica: "Crítica" };
const META_CAJAS = 12;
const META_MERMA_PCT = 3;

function AsistenteIA({ onRefrescar }) {
  const [msgs, setMsgs] = useState([{ role: "assistant", content: "Hola Jesús 👋 Soy el asistente de EEMSA. Puedo **consultar y modificar** el sistema por ti.\n\nEjemplos:\n- *\"Crea el pedido #86 para MAFENSA, 50 cajas blancas, entrega 2026-06-20\"*\n- *\"Registra 12 cajas del pedido 85, operador William\"*\n- *\"La SIAT L36 #1 tuvo 30 min de paro por rodillo anilox, severidad moderada\"*\n- *\"Usa un rodillo anilox del inventario\"*\n- *\"Registra merma del pedido 84: 1800 piezas, 36 con defecto\"*" }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, loading]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", content: input.trim() };
    const next = [...msgs, userMsg];
    setMsgs(next); setInput(""); setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map(m => ({ role: m.role, content: m.content })) })
      });
      const data = await res.json();
      const reply = data?.reply || data?.content?.map(b => b.text || "").join("") || data?.error || "Sin respuesta.";
      setMsgs([...next, { role: "assistant", content: reply }]);
      if (data?.tablas_actualizadas?.length) onRefrescar(data.tablas_actualizadas);
    } catch {
      setMsgs([...next, { role: "assistant", content: "❌ Error de conexión." }]);
    }
    setLoading(false);
  };

  const formatMsg = (txt) => (txt || "")
    .replace(/\n/g, "<br>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>");

  return (
    <div>
      <h2 className="sec-title">🤖 Asistente IA</h2>
      <p className="muted" style={{ marginBottom: 12 }}>Dime qué registrar o consultar — creo, actualizo y muevo datos por ti.</p>
      <div className="chat-box">
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role === "user" ? "msg-u" : "msg-a"}`}
            dangerouslySetInnerHTML={{ __html: formatMsg(m.content) }} />
        ))}
        {loading && <div className="msg msg-a typing">Procesando…</div>}
        <div ref={bottomRef} />
      </div>
      <div className="chat-row">
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Ej: Crea el pedido #86 para ARIAT, 30 cajas, entrega 2026-06-25…" disabled={loading} />
        <button className="btn btn-primary" onClick={send} disabled={loading || !input.trim()}>Enviar</button>
      </div>
      <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setMsgs([{ role: "assistant", content: "Chat reiniciado. ¿Qué necesitas?" }])}>Limpiar</button>
    </div>
  );
}

function ClicheImg({ src, style }) {
  if (!src) return null;
  if (src.startsWith('http')) return <img src={src} alt="cliché" style={style} />;
  const { data } = supabase.storage.from("cliches").getPublicUrl(src);
  if (!data?.publicUrl) return null;
  return <img src={data.publicUrl} alt="cliché" style={style} />;
}

function BarChart({ data, meta }) {
  const max = Math.max(...data.map(d => d.val), meta || 0, 1);
  const BAR_H = 70;
  return (
    <div style={{ paddingBottom: 14 }}>
      <div style={{ position: 'relative', height: BAR_H, display: 'flex', alignItems: 'flex-end', gap: 2 }}>
        {meta > 0 && <div style={{ position: 'absolute', left: 0, right: 0, bottom: Math.round((meta / max) * BAR_H), borderTop: '1px dashed #ff4d4d', pointerEvents: 'none', zIndex: 1 }} />}
        {data.map((d, i) => {
          const h = d.val > 0 ? Math.max(2, Math.round((d.val / max) * BAR_H)) : 2;
          const ok = !meta || d.val >= meta;
          return (
            <div key={i} title={`${d.lbl}: ${d.val} cajas`} style={{ flex: 1, height: h, background: d.val ? (ok ? '#4be87a' : '#c9922a') : '#1e2132', borderRadius: '2px 2px 0 0' }} />
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 2, marginTop: 2 }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 8, color: '#666' }}>{d.lbl}</div>
        ))}
      </div>
    </div>
  );
}

function Dashboard({ pedidos, fallas, refacciones, proveedores, prodDiaria }) {
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
  const stockBajoDash = refacciones.filter(r => Number(r.stock || 0) <= Number(r.stock_min || 1)).length;
  const todayStr = today();
  const cajasHoy = prodDiaria.filter(r => r.fecha === todayStr).reduce((s, r) => s + Number(r.cajas_dia || 0), 0);
  const metaHoyCumplida = cajasHoy >= META_CAJAS;
  const mesActual = today().slice(0, 7);
  const diasDelMes = [...new Set(prodDiaria.filter(r => r.fecha?.startsWith(mesActual)).map(r => r.fecha))];
  const diasConMeta = diasDelMes.filter(fecha => prodDiaria.filter(r => r.fecha === fecha).reduce((s, r) => s + Number(r.cajas_dia || 0), 0) >= META_CAJAS).length;
  const pctMeta = diasDelMes.length > 0 ? Math.round((diasConMeta / diasDelMes.length) * 100) : 0;
  const pedidosUrgentes = pedidos.filter(p => p.status !== "terminado" && p.fecha_solicitud).map(p => ({ ...p, diasRest: diasHabilesRestantes(p.fecha_solicitud) })).sort((a, b) => a.diasRest - b.diasRest).slice(0, 5);
  const ultimas14 = [...Array(14)].map((_, i) => { const d = new Date(today() + "T12:00:00"); d.setDate(d.getDate() - 13 + i); const fecha = d.toISOString().slice(0, 10); const val = prodDiaria.filter(r => r.fecha === fecha).reduce((s, r) => s + Number(r.cajas_dia || 0), 0); return { lbl: fecha.slice(8), val }; });
  const cajasOps = OPERADORES.map(op => prodDiaria.filter(r => r.fecha?.startsWith(mesActual) && r.op === op).reduce((s, r) => s + Number(r.cajas_dia || 0), 0));
  const cajasMax = Math.max(...cajasOps, 1);

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
              <div key={p.id} className="list-item" style={{ borderLeft: `3px solid ${ep?.color || "#444"}` }}>
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
      <h3 className="sub-title">👥 Operadores — {mesActual}</h3>
      <div style={{ background: "#1a1d26", borderRadius: 10, padding: "12px 16px" }}>
        {OPERADORES.map((op, i) => (
          <div key={op} style={{ marginBottom: i < OPERADORES.length - 1 ? 10 : 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: "#e0e0e0", fontWeight: 600 }}>{op}</span>
              <span style={{ color: "#c9922a", fontWeight: 700 }}>{cajasOps[i]} cajas</span>
            </div>
            <div style={{ background: "#2a2d3a", borderRadius: 4, height: 8, overflow: "hidden" }}>
              <div style={{ width: `${Math.round((cajasOps[i] / cajasMax) * 100)}%`, height: "100%", background: i === 0 ? "#4be87a" : "#c9922a", borderRadius: 4, transition: "width .4s" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Pedidos({ pedidos, setPedidos }) {
  const formInicial = { cliente: "", num: "", tipo: "Blanca", medida: "", cajas: "", rollos_caja: "", ancho: "", largo: "", color: "", color_cinta: "", maq: "SIAT L36 #1", op: "William", fecha_solicitud: today(), fecha_inicio: "", fecha_termino: "", piezas_prod: "", merma: "", merma_pct: "", notas: "", status: "anotado" };
  const [form, setForm] = useState(formInicial);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const [modalPedido, setModalPedido] = useState(null);
  const [filtro, setFiltro] = useState("todos");
  const [clicheImg, setClicheImg] = useState(null);
  const [clichePreview, setClichePreview] = useState(null);
  const [modalClicheImg, setModalClicheImg] = useState(null);
  const [modalClichePreview, setModalClichePreview] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const showToast = t => { setToast(t); setTimeout(() => setToast(""), 2500); };
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const rollosTotales = form.cajas && form.rollos_caja ? Number(form.cajas) * Number(form.rollos_caja) : "";

  const save = async () => {
    if (!form.cliente || !form.num || !form.cajas || !form.fecha_solicitud) { showToast("⚠ Llena cliente, número, cajas y fecha solicitada"); return; }
    setLoading(true);
    const n = (v) => v === "" ? null : Number(v);
    let cliche_url = "";
    if (clicheImg) {
      const { data: up } = await supabase.storage.from("cliches").upload(`${uid()}_${clicheImg.name}`, clicheImg);
      if (up) { cliche_url = up.path; }
    }
const nuevo = { id: uid(), created: today(), cliente: form.cliente, num: form.num, tipo: form.tipo, medida: form.medida, cajas: n(form.cajas), rollos_caja: n(form.rollos_caja), rollos_totales: n(rollosTotales) || null, ancho: form.ancho, largo: form.largo, color: form.color, color_cinta: form.color_cinta || null, maq: form.maq, op: form.op, fecha_solicitud: form.fecha_solicitud, fecha_inicio: form.fecha_inicio || null, fecha_termino: form.fecha_termino || null, piezas_prod: n(form.piezas_prod), merma: form.merma || null, merma_pct: form.merma_pct || null, notas: form.notas, status: form.status, cliche_url };
    const { error } = await supabase.from("pedidos").insert([nuevo]);
    if (error) { showToast("❌ Error: " + error.message); setLoading(false); return; }
    setPedidos(p => [nuevo, ...p]);
    setForm(formInicial);
    setClicheImg(null); setClichePreview(null);
    showToast("✓ Pedido anotado ☁️");
    setLoading(false);
  };

  const abrirModal = (p) => setModalPedido({ ...p });
  const cerrarModal = () => { setModalPedido(null); setModalClicheImg(null); setModalClichePreview(null); };

  const guardarModal = async () => {
    if (!modalPedido) return;
    const n2 = (v) => (v === "" || v === null || v === undefined) ? null : Number(v);
    const mPct = modalPedido.piezas_prod && modalPedido.merma
      ? ((Number(modalPedido.merma) / Number(modalPedido.piezas_prod)) * 100).toFixed(2)
      : modalPedido.merma_pct || "";
    const actualizado = {
      id: modalPedido.id, created: modalPedido.created,
      cliente: modalPedido.cliente, num: modalPedido.num,
      tipo: modalPedido.tipo, medida: modalPedido.medida,
      cajas: n2(modalPedido.cajas), rollos_caja: n2(modalPedido.rollos_caja),
      rollos_totales: n2(modalPedido.rollos_totales),
      ancho: modalPedido.ancho, largo: modalPedido.largo,
      color: modalPedido.color, maq: modalPedido.maq, op: modalPedido.op,
      fecha_solicitud: modalPedido.fecha_solicitud,
      fecha_inicio: modalPedido.fecha_inicio || null,
      fecha_termino: modalPedido.fecha_termino || null,
      piezas_prod: n2(modalPedido.piezas_prod),
      merma: modalPedido.merma || null, merma_pct: mPct || null,
      notas: modalPedido.notas, status: modalPedido.status,
      rollos_usados: n2(modalPedido.rollos_usados),
      tinta_tipo: modalPedido.tinta_tipo || null,
      tinta_kg: n2(modalPedido.tinta_kg),
      alcohol_litros: n2(modalPedido.alcohol_litros),
      notas_consumo: modalPedido.notas_consumo || null,
      color_cinta: modalPedido.color_cinta || null,
      cliche_url: modalPedido.cliche_url || null,
    };
    if (modalClicheImg) {
      const { data: up } = await supabase.storage.from("cliches").upload(`${uid()}_${modalClicheImg.name}`, modalClicheImg);
      if (up) { actualizado.cliche_url = up.path; }
    }
    const { error } = await supabase.from("pedidos").update(actualizado).eq("id", modalPedido.id);
    if (error) { showToast("❌ Error: " + error.message); return; }
    setPedidos(p => p.map(x => x.id === actualizado.id ? actualizado : x));
    cerrarModal(); showToast("✓ Pedido actualizado ☁️");
  };

  const del = async id => {
    if (!window.confirm("¿Eliminar pedido?")) return;
    await supabase.from("pedidos").delete().eq("id", id);
    setPedidos(p => p.filter(x => x.id !== id));
  };

  const pedidosFiltrados = pedidos
    .filter(p => filtro === "todos" ? true : p.status === filtro)
    .filter(p => !busqueda || [p.cliente, p.num, p.tipo, p.medida, p.color, p.color_cinta].some(v => String(v || "").toLowerCase().includes(busqueda.toLowerCase())))
    .map(p => ({ ...p, diasRest: diasHabilesRestantes(p.fecha_solicitud) }))
    .sort((a, b) => { if (a.status === "terminado" && b.status !== "terminado") return 1; if (b.status === "terminado" && a.status !== "terminado") return -1; return (a.diasRest ?? 999) - (b.diasRest ?? 999); });
  const colorStatus = s => s === "terminado" ? "b-green" : s === "proceso" ? "b-blue" : "b-orange";

  return (
    <div>
      <h2 className="sec-title">📋 Pedidos</h2>
      <div className="stat-grid">
        <div className="stat-card orange"><div className="stat-val">{pedidos.filter(p => p.status === "anotado").length}</div><div className="stat-lbl">Anotados</div></div>
        <div className="stat-card blue"><div className="stat-val">{pedidos.filter(p => p.status === "proceso").length}</div><div className="stat-lbl">En proceso</div></div>
        <div className="stat-card green"><div className="stat-val">{pedidos.filter(p => p.status === "terminado").length}</div><div className="stat-lbl">Terminados</div></div>
        <div className="stat-card red"><div className="stat-val">{pedidos.filter(p => p.status !== "terminado" && diasHabilesRestantes(p.fecha_solicitud) < 0).length}</div><div className="stat-lbl">Vencidos</div></div>
      </div>
      <h3 className="sub-title">➕ Anotar pedido</h3>
      <div className="form-grid">
        <div className="field"><label>Cliente *</label><input value={form.cliente} onChange={e => upd("cliente", e.target.value)} placeholder="MAFENSA, ARIAT…" /></div>
        <div className="field"><label>No. Pedido *</label><input value={form.num} onChange={e => upd("num", e.target.value)} placeholder="84, 85…" /></div>
        <div className="field"><label>Tipo cinta</label><select value={form.tipo} onChange={e => upd("tipo", e.target.value)}>{TIPOS.map(t => <option key={t}>{t}</option>)}</select></div>
        <div className="field"><label>Medida (ej: 2"x100)</label><input value={form.medida} onChange={e => upd("medida", e.target.value)} placeholder='2"x100' /></div>
        <div className="field"><label>Cajas solicitadas *</label><input type="number" value={form.cajas} onChange={e => upd("cajas", e.target.value)} placeholder="50" /></div>
        <div className="field"><label>Rollos por caja</label><input type="number" value={form.rollos_caja} onChange={e => upd("rollos_caja", e.target.value)} placeholder="36" /></div>
        {rollosTotales && <div className="field"><label>Rollos totales (auto)</label><input value={rollosTotales} readOnly style={{ background: "#1a2744", color: "#c9922a" }} /></div>}
        <div className="field"><label>Ancho (pulg)</label><input value={form.ancho} onChange={e => upd("ancho", e.target.value)} placeholder='2"' /></div>
        <div className="field"><label>Largo (m)</label><input type="number" value={form.largo} onChange={e => upd("largo", e.target.value)} placeholder="100" /></div>
        <div className="field"><label>Color impresión</label><input value={form.color} onChange={e => upd("color", e.target.value)} placeholder="Rojo PMS 485" /></div>
        <div className="field"><label>Color de tinta</label><input value={form.color_cinta} onChange={e => upd("color_cinta", e.target.value)} placeholder="Rojo, Azul PMS 285, Negro…" /></div>
        <div className="field full"><label>📷 Foto del cliché</label><input type="file" accept="image/*" onChange={e => { const f = e.target.files[0]; if (!f) return; setClicheImg(f); setClichePreview(URL.createObjectURL(f)); }} />{clichePreview && <img src={clichePreview} alt="cliché" style={{ width: "100%", maxWidth: 260, marginTop: 8, borderRadius: 8, border: "1px solid #2a2d3a" }} />}</div>
        <div className="field"><label>Máquina</label><select value={form.maq} onChange={e => upd("maq", e.target.value)}>{MAQUINAS.map(m => <option key={m}>{m}</option>)}</select></div>
        <div className="field"><label>Operador</label><select value={form.op} onChange={e => upd("op", e.target.value)}>{OPERADORES.map(o => <option key={o}>{o}</option>)}</select></div>
        <div className="field"><label>Fecha solicitada *</label><input type="date" value={form.fecha_solicitud} onChange={e => upd("fecha_solicitud", e.target.value)} /></div>
        <div className="field full"><label>Notas</label><textarea value={form.notas} onChange={e => upd("notas", e.target.value)} placeholder="Observaciones…" /></div>
      </div>
      <button className="btn btn-primary btn-block" onClick={save} disabled={loading}>{loading ? "Guardando…" : "📝 Anotar pedido"}</button>
      <div style={{ display: "flex", gap: 8, margin: "16px 0 8px", flexWrap: "wrap" }}>
        {[["todos", "Todos"], ["anotado", "Anotados"], ["proceso", "En proceso"], ["terminado", "Terminados"]].map(([k, v]) => (
          <button key={k} className={`btn btn-sm ${filtro === k ? "btn-primary" : "btn-ghost"}`} onClick={() => setFiltro(k)}>{v}</button>
        ))}
      </div>
      <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="🔍 Buscar por cliente, número, tipo, medida…" style={{ width: "100%", marginBottom: 8, background: "#1a1d26", border: "1px solid #2a2d3a", borderRadius: 8, padding: "8px 12px", color: "#e0e0e0", fontSize: 13 }} />
      <h3 className="sub-title">Registro ({pedidosFiltrados.length})</h3>
      {pedidosFiltrados.length === 0 ? <p className="empty">Sin pedidos en este filtro.</p> : (
        <div className="list">
          {pedidosFiltrados.map(p => {
            const ep = estadoPlazo(p.diasRest);
            const mermaOk = p.merma_pct !== "" && p.merma_pct !== undefined ? Number(p.merma_pct) <= META_MERMA_PCT : null;
            return (
              <div key={p.id} className="list-item" style={{ borderLeft: `3px solid ${ep?.color || "#333"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6, flexWrap: "wrap" }}>
                  <div><strong>{p.num}</strong> — {p.cliente}<span className={`badge ${colorStatus(p.status)}`}>{STATUS_PED[p.status] || p.status}</span>{ep && <span className={`badge ${ep.cls}`}>{ep.txt}</span>}</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => abrirModal(p)}>✏️</button>
                    <button className="btn btn-danger btn-sm" onClick={() => del(p.id)}>✕</button>
                  </div>
                </div>
                <div className="muted">{p.tipo} · {p.medida} · {p.cajas} cajas · {p.maq}</div>
                <div className="muted">Sol: {p.fecha_solicitud}{p.fecha_inicio && ` · Inicio: ${p.fecha_inicio}`}{p.fecha_termino && ` · Fin: ${p.fecha_termino}`}</div>
                {p.status === "terminado" && p.merma_pct !== "" && p.merma_pct !== undefined && (<div className="muted">Merma: <span style={{ color: mermaOk ? "#4be87a" : "#ff4d4d", fontWeight: 700 }}>{p.merma_pct}% {mermaOk ? "🟢 OK" : "🔴 EXCEDIDA"}</span></div>)}
                {p.color_cinta && <div className="muted">🎨 Tinta: {p.color_cinta}</div>}
                {p.cliche_url && <ClicheImg src={p.cliche_url} style={{ width: 80, height: 56, objectFit: "cover", borderRadius: 6, marginTop: 4, border: "1px solid #2a2d3a" }} />}
                {p.notas && <div className="muted">📝 {p.notas}</div>}
                {(p.rollos_usados || p.tinta_kg || p.alcohol_litros) && (
                  <div className="muted" style={{ color: "#c9922a" }}>
                    📦 {p.rollos_usados ? `${p.rollos_usados} rollos` : ""}
                    {p.tinta_tipo ? ` · Tinta: ${p.tinta_tipo}` : ""}
                    {p.tinta_kg ? ` ${p.tinta_kg}kg` : ""}
                    {p.alcohol_litros ? ` · Alcohol: ${p.alcohol_litros}L` : ""}
                    {p.notas_consumo ? ` · ${p.notas_consumo}` : ""}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {modalPedido && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: "#14171f", borderRadius: "16px 16px 0 0", padding: 20, width: "100%", maxWidth: 600, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ margin: 0, color: "#c9922a" }}>✏️ Editar pedido {modalPedido.num}</h3>
              <button className="btn btn-ghost btn-sm" onClick={cerrarModal}>✕</button>
            </div>
            <div className="form-grid">
              <div className="field"><label>Status</label><select value={modalPedido.status} onChange={e => setModalPedido(m => ({ ...m, status: e.target.value }))}>{Object.entries(STATUS_PED).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div className="field"><label>Operador</label><select value={modalPedido.op || ""} onChange={e => setModalPedido(m => ({ ...m, op: e.target.value }))}>{OPERADORES.map(o => <option key={o}>{o}</option>)}</select></div>
              <div className="field"><label>Cajas solicitadas</label><input type="number" value={modalPedido.cajas || ""} onChange={e => setModalPedido(m => ({ ...m, cajas: e.target.value }))} /></div>
              <div className="field"><label>Rollos por caja</label><input type="number" value={modalPedido.rollos_caja || ""} onChange={e => setModalPedido(m => ({ ...m, rollos_caja: e.target.value }))} /></div>
              <div className="field"><label>Fecha solicitada</label><input type="date" value={modalPedido.fecha_solicitud || ""} onChange={e => setModalPedido(m => ({ ...m, fecha_solicitud: e.target.value }))} /></div>
              <div className="field"><label>Fecha inicio</label><input type="date" value={modalPedido.fecha_inicio || ""} onChange={e => setModalPedido(m => ({ ...m, fecha_inicio: e.target.value }))} /></div>
              <div className="field"><label>Fecha término</label><input type="date" value={modalPedido.fecha_termino || ""} onChange={e => setModalPedido(m => ({ ...m, fecha_termino: e.target.value }))} /></div>
              <div className="field"><label>Piezas producidas</label><input type="number" value={modalPedido.piezas_prod || ""} onChange={e => setModalPedido(m => ({ ...m, piezas_prod: e.target.value }))} placeholder="1800" /></div>
              <div className="field"><label>Merma (piezas)</label><input type="number" value={modalPedido.merma || ""} onChange={e => setModalPedido(m => ({ ...m, merma: e.target.value }))} placeholder="24" /></div>
              {modalPedido.piezas_prod && modalPedido.merma && (<div className="field"><label>% Merma (auto)</label><input value={((Number(modalPedido.merma) / Number(modalPedido.piezas_prod)) * 100).toFixed(2) + "%"} readOnly style={{ background: "#1a2744", color: Number(modalPedido.merma) / Number(modalPedido.piezas_prod) * 100 > META_MERMA_PCT ? "#ff4d4d" : "#4be87a" }} /></div>)}
              <div className="field full"><label>Notas</label><textarea value={modalPedido.notas || ""} onChange={e => setModalPedido(m => ({ ...m, notas: e.target.value }))} /></div>
              <div className="field"><label>Color de tinta</label><input value={modalPedido.color_cinta || ""} onChange={e => setModalPedido(m => ({ ...m, color_cinta: e.target.value }))} placeholder="Rojo, Azul PMS 285, Negro…" /></div>
              <div className="field full"><label>📷 Foto del cliché</label>
                {modalPedido.cliche_url && !modalClichePreview && <ClicheImg src={modalPedido.cliche_url} style={{ width: "100%", maxWidth: 260, marginBottom: 8, borderRadius: 8, border: "1px solid #2a2d3a" }} />}
                {modalClichePreview && <img src={modalClichePreview} alt="cliché nuevo" style={{ width: "100%", maxWidth: 260, marginBottom: 8, borderRadius: 8, border: "1px solid #c9922a" }} />}
                <input type="file" accept="image/*" onChange={e => { const f = e.target.files[0]; if (!f) return; setModalClicheImg(f); setModalClichePreview(URL.createObjectURL(f)); }} />
              </div>
            </div>
            <div style={{ borderTop: "1px solid #2a2d3a", margin: "16px 0 12px", paddingTop: 12 }}>
              <div style={{ fontSize: 12, color: "#c9922a", fontWeight: 700, marginBottom: 10 }}>📦 Consumos de producción</div>
              <div className="form-grid">
                <div className="field"><label>Rollos usados</label><input type="number" value={modalPedido.rollos_usados || ""} onChange={e => setModalPedido(m => ({ ...m, rollos_usados: e.target.value }))} placeholder="36" /></div>
                <div className="field"><label>Tipo de tinta</label><input value={modalPedido.tinta_tipo || ""} onChange={e => setModalPedido(m => ({ ...m, tinta_tipo: e.target.value }))} placeholder="Roja UV, Azul PMS…" /></div>
                <div className="field"><label>Tinta usada (kg)</label><input type="number" step="0.01" value={modalPedido.tinta_kg || ""} onChange={e => setModalPedido(m => ({ ...m, tinta_kg: e.target.value }))} placeholder="0.5" /></div>
                <div className="field"><label>Alcohol (litros)</label><input type="number" step="0.01" value={modalPedido.alcohol_litros || ""} onChange={e => setModalPedido(m => ({ ...m, alcohol_litros: e.target.value }))} placeholder="1.0" /></div>
                <div className="field full"><label>Otros insumos / notas</label><input value={modalPedido.notas_consumo || ""} onChange={e => setModalPedido(m => ({ ...m, notas_consumo: e.target.value }))} placeholder="Cliché nuevo, solvente, etc." /></div>
              </div>
            </div>
            <button className="btn btn-primary btn-block" onClick={guardarModal}>💾 Guardar cambios</button>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function ProdDiaria({ prodDiaria, setProdDiaria, pedidos }) {
  const formInicial = { fecha: today(), num_pedido: "", cajas_dia: "", op: "William", notas: "" };
  const [form, setForm] = useState(formInicial);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const showToast = t => { setToast(t); setTimeout(() => setToast(""), 2500); };
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const pedidoRel = pedidos.find(p => p.num === form.num_pedido || String(p.num) === String(form.num_pedido));
  const cajasHoy = prodDiaria.filter(r => r.fecha === form.fecha).reduce((s, r) => s + Number(r.cajas_dia || 0), 0);
  const cajasHoyConNuevo = cajasHoy + Number(form.cajas_dia || 0);
  const metaCumplida = cajasHoyConNuevo >= META_CAJAS;

  const save = async () => {
    if (!form.num_pedido || !form.cajas_dia) { showToast("⚠ Llena pedido y cajas"); return; }
    setLoading(true);
    const nuevo = { id: uid(), created: today(), fecha: form.fecha, num_pedido: form.num_pedido, cajas_dia: form.cajas_dia, op: form.op, notas: form.notas };
    const { error } = await supabase.from("prod_diaria").insert([nuevo]);
    if (error) { showToast("❌ Error: " + error.message); setLoading(false); return; }
    setProdDiaria(p => [nuevo, ...p]);
    setForm(f => ({ ...f, num_pedido: "", cajas_dia: "", notas: "" }));
    showToast("✓ Producción registrada ☁️");
    setLoading(false);
  };

  const del = async id => {
    if (!window.confirm("¿Eliminar registro?")) return;
    await supabase.from("prod_diaria").delete().eq("id", id);
    setProdDiaria(p => p.filter(x => x.id !== id));
  };

  const porFecha = prodDiaria.reduce((acc, r) => { if (!acc[r.fecha]) acc[r.fecha] = []; acc[r.fecha].push(r); return acc; }, {});
  const fechas = Object.keys(porFecha).sort((a, b) => b.localeCompare(a)).slice(0, 14);

  return (
    <div>
      <h2 className="sec-title">📅 Producción Diaria</h2>
      <div style={{ background: "#1a1d26", borderRadius: 10, padding: "12px 16px", marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#aaa", fontSize: 12 }}>Cajas hoy ({today()})</span>
          <span style={{ color: cajasHoy >= META_CAJAS ? "#4be87a" : "#ff9900", fontWeight: 700, fontSize: 18 }}>{cajasHoy} / {META_CAJAS}</span>
        </div>
        <div style={{ background: "#2a2d3a", borderRadius: 4, height: 8, marginTop: 6, overflow: "hidden" }}>
          <div style={{ width: `${Math.min(100, (cajasHoy / META_CAJAS) * 100)}%`, height: "100%", background: cajasHoy >= META_CAJAS ? "#4be87a" : "#c9922a", transition: "width .4s" }} />
        </div>
        <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>Meta: {META_CAJAS} cajas {cajasHoy >= META_CAJAS ? "✅ CUMPLIDA" : `— faltan ${META_CAJAS - cajasHoy}`}</div>
      </div>
      <h3 className="sub-title">Registrar producción del día</h3>
      <div className="form-grid">
        <div className="field"><label>Fecha</label><input type="date" value={form.fecha} onChange={e => upd("fecha", e.target.value)} /></div>
        <div className="field"><label>No. Pedido *</label>
          <select value={form.num_pedido} onChange={e => upd("num_pedido", e.target.value)}>
            <option value="">— Selecciona —</option>
            {pedidos.filter(p => p.status !== "terminado").map(p => (<option key={p.id} value={p.num}>{p.num} — {p.cliente}</option>))}
          </select>
        </div>
        {pedidoRel && <div className="field"><label>Medida</label><input value={pedidoRel.medida || ""} readOnly style={{ background: "#1a2744", color: "#c9922a" }} /></div>}
        {pedidoRel?.cliche_url && (
          <div className="field full">
            <label>Cliché del pedido</label>
            <ClicheImg src={pedidoRel.cliche_url} style={{ width: "100%", maxWidth: 300, borderRadius: 8, border: "1px solid #2a2d3a", marginTop: 4 }} />
          </div>
        )}
        <div className="field"><label>Cajas del día *</label><input type="number" value={form.cajas_dia} onChange={e => upd("cajas_dia", e.target.value)} placeholder="12" /></div>
        <div className="field"><label>Operador</label><select value={form.op} onChange={e => upd("op", e.target.value)}>{OPERADORES.map(o => <option key={o}>{o}</option>)}</select></div>
        {form.cajas_dia && (<div className="field"><label>Total del día</label><input value={`${cajasHoyConNuevo} cajas ${metaCumplida ? "✅ Meta cumplida" : `(faltan ${META_CAJAS - cajasHoyConNuevo})`}`} readOnly style={{ background: "#1a2744", color: metaCumplida ? "#4be87a" : "#c9922a" }} /></div>)}
        <div className="field full"><label>Observaciones</label><textarea value={form.notas} onChange={e => upd("notas", e.target.value)} placeholder="Incidencias, velocidad, ajustes…" /></div>
      </div>
      <button className="btn btn-primary btn-block" onClick={save} disabled={loading}>{loading ? "Guardando…" : "✅ Registrar producción"}</button>
      <h3 className="sub-title" style={{ marginTop: 20 }}>Historial (últimos 14 días)</h3>
      {fechas.length === 0 ? <p className="empty">Sin registros.</p> : (
        <div>
          {fechas.map(fecha => {
            const registros = porFecha[fecha];
            const totalDia = registros.reduce((s, r) => s + Number(r.cajas_dia || 0), 0);
            const cumple = totalDia >= META_CAJAS;
            return (
              <div key={fecha} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #2a2d3a" }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{fecha}</span>
                  <span style={{ color: cumple ? "#4be87a" : "#ff4d4d", fontWeight: 700, fontSize: 13 }}>{totalDia} cajas {cumple ? "✅" : "❌"}</span>
                </div>
                {registros.map(r => {
                  const ped = pedidos.find(p => String(p.num) === String(r.num_pedido));
                  return (
                    <div key={r.id} className="list-item" style={{ marginTop: 4 }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <div><strong>Ped. {r.num_pedido}</strong> {ped ? `— ${ped.cliente}` : ""} · {r.cajas_dia} cajas</div>
                        <button className="btn btn-danger btn-sm" onClick={() => del(r.id)}>✕</button>
                      </div>
                      <div className="muted">{r.op}{r.notas ? ` · ${r.notas}` : ""}</div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Refacciones({ refs, setRefs, proveedores, setProveedores }) {
  const [subTab, setSubTab] = useState("compras");
  const [form, setForm] = useState({ nombre: "", costo: "", maq: "SIAT L36 #1", proveedor: "", fecha: today(), notas: "", stock: "1", stock_min: "1" });
  const [formProv, setFormProv] = useState({ nombre: "", telefono: "", direccion: "", monto: "", fecha: today(), que_compro: "" });
  const [imagen, setImagen] = useState(null);
  const [preview, setPreview] = useState(null);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const [busquedaInv, setBusquedaInv] = useState("");
  const [busquedaCompras, setBusquedaCompras] = useState("");
  const showToast = t => { setToast(t); setTimeout(() => setToast(""), 2200); };
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const updP = (k, v) => setFormProv(f => ({ ...f, [k]: v }));

  const handleImagen = (e) => { const file = e.target.files[0]; if (!file) return; setImagen(file); setPreview(URL.createObjectURL(file)); };

  const analizar = async () => {
    if (!imagen) { showToast("⚠ Selecciona una imagen primero"); return; }
    setLoading(true);
    try {
      const base64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.onerror = rej; r.readAsDataURL(imagen); });
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: base64, mediaType: imagen.type, extractTicket: true }) });
      const data = await response.json();
      const texto = data?.content?.map(b => b.text || "").join("") || "";
      try { const json = JSON.parse(texto.replace(/```json|```/g, "").trim()); setFormProv({ nombre: json.nombre || "", telefono: json.telefono || "", direccion: json.direccion || "", monto: json.monto || "", fecha: json.fecha || today(), que_compro: json.que_compro || "" }); showToast("✓ Datos extraídos por IA"); } catch { showToast("⚠ Llena manualmente"); }
    } catch { showToast("❌ Error al analizar"); }
    setLoading(false);
  };

  const saveCompra = async () => {
    if (!formProv.nombre || !formProv.monto) { showToast("⚠ Nombre y monto obligatorios"); return; }
    setLoading(true);
    let imagen_url = "";
    if (imagen) { const { data } = await supabase.storage.from("refacciones").upload(`tickets/${uid()}_${imagen.name}`, imagen); if (data) { const { data: url } = supabase.storage.from("refacciones").getPublicUrl(data.path); imagen_url = url.publicUrl; } }
    const nuevo = { id: uid(), created: today(), nombre: formProv.nombre, telefono: formProv.telefono, direccion: formProv.direccion, monto: formProv.monto, fecha: formProv.fecha, que_compro: formProv.que_compro, imagen_url };
    const { error } = await supabase.from("proveedores").insert([nuevo]);
    if (error) { showToast("❌ Error: " + error.message); setLoading(false); return; }
    setProveedores(p => [nuevo, ...p]);
    setFormProv({ nombre: "", telefono: "", direccion: "", monto: "", fecha: today(), que_compro: "" });
    setImagen(null); setPreview(null);
    showToast("✓ Compra guardada ☁️");
    setLoading(false);
  };

  const saveRef = async () => {
    if (!form.nombre || !form.costo) { showToast("⚠ Nombre y costo obligatorios"); return; }
    setLoading(true);
    const nuevo = { id: uid(), created: today(), nombre: form.nombre, costo: form.costo, maq: form.maq, proveedor: form.proveedor, fecha: form.fecha, notas: form.notas, stock: form.stock, stock_min: form.stock_min || 1 };
    const { error } = await supabase.from("refacciones").insert([nuevo]);
    if (error) { showToast("❌ Error: " + error.message); setLoading(false); return; }
    setRefs(r => [nuevo, ...r]);
    setForm(f => ({ ...f, nombre: "", costo: "", proveedor: "", notas: "", stock: "1", stock_min: "1" }));
    showToast("✓ Refacción guardada ☁️");
    setLoading(false);
  };

  const delRef = async id => { if (!window.confirm("¿Eliminar?")) return; await supabase.from("refacciones").delete().eq("id", id); setRefs(r => r.filter(x => x.id !== id)); };
  const usarRef = async (r) => {
  const nuevoStock = Number(r.stock) - 1;
  if (nuevoStock < 0) { showToast("⚠ Sin stock disponible"); return; }
  const { error } = await supabase.from("refacciones").update({ stock: nuevoStock }).eq("id", r.id);
  if (error) { showToast("❌ Error al actualizar"); return; }
  setRefs(refs => refs.map(x => x.id === r.id ? { ...x, stock: nuevoStock } : x));
  showToast(`✓ Stock actualizado: ${nuevoStock} restantes`);
};
  const delCompra = async id => { if (!window.confirm("¿Eliminar?")) return; await supabase.from("proveedores").delete().eq("id", id); setProveedores(p => p.filter(x => x.id !== id)); };
  const totalCompras = proveedores.reduce((s, p) => s + Number(p.monto || 0), 0);
  const totalRefs = refs.reduce((s, r) => s + (Number(r.costo || 0) * Number(r.stock || 1)), 0);
  const stockBajo = refs.filter(r => Number(r.stock || 0) <= Number(r.stock_min || 1)).length;
  const refsFiltradas = refs.filter(r => !busquedaInv || [r.nombre, r.maq, r.proveedor].some(v => String(v || "").toLowerCase().includes(busquedaInv.toLowerCase())));
  const comprasFiltradas = proveedores.filter(p => !busquedaCompras || [p.nombre, p.que_compro].some(v => String(v || "").toLowerCase().includes(busquedaCompras.toLowerCase())));

  return (
    <div>
      <h2 className="sec-title">🔧 Refacciones</h2>
      <div className="stat-grid">
        <div className="stat-card accent"><div className="stat-val">{refs.length}</div><div className="stat-lbl">En inventario</div></div>
        <div className="stat-card red"><div className="stat-val">${fmt(totalRefs)}</div><div className="stat-lbl">Valor inventario</div></div>
        <div className={`stat-card ${stockBajo > 0 ? "red" : "green"}`}><div className="stat-val">{stockBajo}</div><div className="stat-lbl">Stock bajo ⚠</div></div>
        <div className="stat-card blue"><div className="stat-val">${fmt(totalCompras)}</div><div className="stat-lbl">Gasto total</div></div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, marginTop: 12 }}>
        <button className={`btn ${subTab === "compras" ? "btn-primary" : "btn-ghost"}`} onClick={() => setSubTab("compras")}>🛒 Compras</button>
        <button className={`btn ${subTab === "inventario" ? "btn-primary" : "btn-ghost"}`} onClick={() => setSubTab("inventario")}>📦 Inventario</button>
      </div>
      {subTab === "compras" && (
        <div>
          <h3 className="sub-title">Registrar compra</h3>
          <div className="field full" style={{ marginBottom: 12 }}>
            <label>📷 Foto del ticket</label>
            <input type="file" accept="image/*" onChange={handleImagen} />
            {preview && <img src={preview} alt="ticket" style={{ width: "100%", maxWidth: 300, marginTop: 8, borderRadius: 8 }} />}
            <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={analizar} disabled={loading || !imagen}>{loading ? "Analizando…" : "🤖 Analizar con IA"}</button>
          </div>
          <div className="form-grid">
            <div className="field"><label>Proveedor *</label><input value={formProv.nombre} onChange={e => updP("nombre", e.target.value)} placeholder="Nombre del proveedor" /></div>
            <div className="field"><label>Teléfono</label><input value={formProv.telefono} onChange={e => updP("telefono", e.target.value)} placeholder="667 123 4567" /></div>
            <div className="field"><label>Monto ($MXN) *</label><input type="number" value={formProv.monto} onChange={e => updP("monto", e.target.value)} placeholder="850.00" /></div>
            <div className="field"><label>Fecha</label><input type="date" value={formProv.fecha} onChange={e => updP("fecha", e.target.value)} /></div>
            <div className="field full"><label>Dirección</label><input value={formProv.direccion} onChange={e => updP("direccion", e.target.value)} placeholder="Calle, colonia, ciudad" /></div>
            <div className="field full"><label>Qué se compró</label><input value={formProv.que_compro} onChange={e => updP("que_compro", e.target.value)} placeholder="Rodillo anilox, correa…" /></div>
          </div>
          <button className="btn btn-primary btn-block" onClick={saveCompra} disabled={loading}>{loading ? "Guardando…" : "+ Registrar compra"}</button>
          <h3 className="sub-title" style={{ marginTop: 20 }}>Historial de compras</h3>
          <input value={busquedaCompras} onChange={e => setBusquedaCompras(e.target.value)} placeholder="🔍 Buscar proveedor, qué se compró…" style={{ width: "100%", marginBottom: 8, background: "#1a1d26", border: "1px solid #2a2d3a", borderRadius: 8, padding: "8px 12px", color: "#e0e0e0", fontSize: 13 }} />
          {proveedores.length === 0 ? <p className="empty">Sin compras registradas.</p> : (
            <div className="list">
              {comprasFiltradas.map(p => (
                <div key={p.id} className="list-item">
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div><strong>{p.nombre}</strong><span className="badge b-accent">${fmt(p.monto)}</span></div>
                    <button className="btn btn-danger btn-sm" onClick={() => delCompra(p.id)}>✕</button>
                  </div>
                  <div className="muted">{p.fecha} · {p.telefono}</div>
                  {p.direccion && <div className="muted">📍 {p.direccion}</div>}
                  {p.que_compro && <div className="muted">🔧 {p.que_compro}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {subTab === "inventario" && (
        <div>
          <h3 className="sub-title">Agregar refacción</h3>
          <div className="form-grid">
            <div className="field"><label>Refacción *</label><input value={form.nombre} onChange={e => upd("nombre", e.target.value)} placeholder="Rodillo anilox, correa…" /></div>
            <div className="field"><label>Costo ($MXN) *</label><input type="number" value={form.costo} onChange={e => upd("costo", e.target.value)} placeholder="850.00" /></div>
            <div className="field"><label>Stock actual</label><input type="number" value={form.stock} onChange={e => upd("stock", e.target.value)} placeholder="1" /></div>
            <div className="field"><label>Stock mínimo</label><input type="number" value={form.stock_min} onChange={e => upd("stock_min", e.target.value)} placeholder="1" /></div>
            <div className="field"><label>Máquina</label><select value={form.maq} onChange={e => upd("maq", e.target.value)}>{MAQUINAS.map(m => <option key={m}>{m}</option>)}</select></div>
            <div className="field"><label>Proveedor</label><input value={form.proveedor} onChange={e => upd("proveedor", e.target.value)} placeholder="Ferrelex, Amazon…" /></div>
            <div className="field"><label>Fecha compra</label><input type="date" value={form.fecha} onChange={e => upd("fecha", e.target.value)} /></div>
            <div className="field full"><label>Notas</label><textarea value={form.notas} onChange={e => upd("notas", e.target.value)} placeholder="Número de parte, observaciones…" /></div>
          </div>
          <button className="btn btn-primary btn-block" onClick={saveRef} disabled={loading}>{loading ? "Guardando…" : "+ Agregar al inventario"}</button>
          <h3 className="sub-title" style={{ marginTop: 20 }}>Inventario</h3>
          <input value={busquedaInv} onChange={e => setBusquedaInv(e.target.value)} placeholder="🔍 Buscar refacción, máquina, proveedor…" style={{ width: "100%", marginBottom: 8, background: "#1a1d26", border: "1px solid #2a2d3a", borderRadius: 8, padding: "8px 12px", color: "#e0e0e0", fontSize: 13 }} />
          {refs.length === 0 ? <p className="empty">Sin refacciones en inventario.</p> : (
            <div className="list">
              {refsFiltradas.map(r => {
                const bajo = Number(r.stock || 0) <= Number(r.stock_min || 1);
                return (
                  <div key={r.id} className="list-item" style={{ borderLeft: bajo ? "3px solid #ff4d4d" : undefined }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <div>
                        <strong>{r.nombre}</strong>
                        <span className="badge b-accent">${fmt(r.costo)}</span>
                        <span className={`badge ${bajo ? "b-red" : "b-green"}`}>Stock: {r.stock || 0}</span>
                        {bajo && <span className="badge b-red">BAJO</span>}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => usarRef(r)}>-1</button>
                        <button className="btn btn-danger btn-sm" onClick={() => delRef(r.id)}>✕</button>
                      </div>
                    </div>
                    <div className="muted">{r.maq} · {r.proveedor} · {r.fecha} · Min: {r.stock_min || 1}</div>
                    {r.notas && <div className="muted">{r.notas}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Fallas({ fallas, setFallas }) {
  const [form, setForm] = useState({ fecha: today(), maq: "SIAT L36 #1", comp: "Rodillo anilox", min_paro: "", sev: "leve", op: "", descripcion: "", accion: "", status: "abierta" });
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const [busqueda, setBusqueda] = useState("");
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
        <div className="field"><label>Componente</label><select value={form.comp} onChange={e => upd("comp", e.target.value)}>{COMPS.map(c => <option key={c}>{c}</option>)}</select></div>
        <div className="field"><label>Minutos de paro *</label><input type="number" value={form.min_paro} onChange={e => upd("min_paro", e.target.value)} placeholder="30" /></div>
        <div className="field"><label>Severidad</label><select value={form.sev} onChange={e => upd("sev", e.target.value)}>{Object.entries(SEV).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="field"><label>Operador</label><select value={form.op} onChange={e => upd("op", e.target.value)}><option value="">—</option>{OPERADORES.map(o => <option key={o}>{o}</option>)}</select></div>
        <div className="field full"><label>Descripción *</label><textarea value={form.descripcion} onChange={e => upd("descripcion", e.target.value)} placeholder="¿Qué ocurrió?" /></div>
        <div className="field full"><label>Acción correctiva</label><textarea value={form.accion} onChange={e => upd("accion", e.target.value)} placeholder="¿Cómo se resolvió?" /></div>
      </div>
      <button className="btn btn-primary btn-block" onClick={save} disabled={loading}>{loading ? "Guardando…" : "+ Registrar falla"}</button>
      <h3 className="sub-title" style={{ marginTop: 20 }}>Historial</h3>
      <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="🔍 Buscar por máquina, componente, descripción…" style={{ width: "100%", marginBottom: 8, background: "#1a1d26", border: "1px solid #2a2d3a", borderRadius: 8, padding: "8px 12px", color: "#e0e0e0", fontSize: 13 }} />
      {fallas.length === 0 ? <p className="empty">Sin fallas. ¡Buena señal! 🟢</p> : (
        <div className="list">
          {fallas.filter(f => !busqueda || [f.maq, f.comp, f.descripcion, f.op, f.sev].some(v => String(v || "").toLowerCase().includes(busqueda.toLowerCase()))).map(f => (
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

const TABS = [
  { id: "dash", ico: "📊", lbl: "Dashboard" },
  { id: "ped", ico: "📋", lbl: "Pedidos" },
  { id: "prod", ico: "📅", lbl: "Producción" },
  { id: "ref", ico: "🔧", lbl: "Refacciones" },
  { id: "fal", ico: "⚠️", lbl: "Fallas" },
  { id: "ia", ico: "🤖", lbl: "Asistente" },
];

export default function App() {
  const [tab, setTab] = useState("dash");
  const [pedidos, setPedidos] = useState([]);
  const [fallas, setFallas] = useState([]);
  const [refs, setRefs] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [prodDiaria, setProdDiaria] = useState([]);
  const [cargando, setCargando] = useState(true);

  const cargarTablas = async (tablas) => {
    const mapa = {
      pedidos:    (d) => setPedidos(d),
      fallas:     (d) => setFallas(d),
      refacciones:(d) => setRefs(d),
      proveedores:(d) => setProveedores(d),
      prod_diaria:(d) => setProdDiaria(d),
    };
    await Promise.all(tablas.map(async t => {
      const { data } = await supabase.from(t).select("*");
      if (data && mapa[t]) mapa[t](data);
    }));
  };

  useEffect(() => {
    const cargar = async () => {
      await cargarTablas(["pedidos", "fallas", "refacciones", "proveedores", "prod_diaria"]);
      setCargando(false);
    };
    cargar();
  }, []);

  if (cargando) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column", gap: 16, background: "#0d0f14", color: "#e8b84b" }}>
      <div style={{ fontSize: 40 }}>⚙️</div>
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700, letterSpacing: ".1em" }}>CARGANDO EEMSA SYSTEM…</div>
    </div>
  );

  return (
    <div className="app">
      <header className="header">
        <div className="logo">EE</div>
        <div>
          <div className="header-title">EEMSA System</div>
          <div className="header-sub">Control SIAT L36 · Asesoría · Calidad · Innovación</div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 11, color: "#4be87a" }}>● En línea</div>
      </header>
      <div className="tab-bar">
        {TABS.map(t => (
          <button key={t.id} className={`tab-btn ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            <span>{t.ico}</span><span>{t.lbl}</span>
          </button>
        ))}
      </div>
      <main className="main">
        {tab === "dash" && <Dashboard pedidos={pedidos} fallas={fallas} refacciones={refs} proveedores={proveedores} prodDiaria={prodDiaria} />}
        {tab === "ped" && <Pedidos pedidos={pedidos} setPedidos={setPedidos} />}
        {tab === "prod" && <ProdDiaria prodDiaria={prodDiaria} setProdDiaria={setProdDiaria} pedidos={pedidos} />}
        {tab === "ref" && <Refacciones refs={refs} setRefs={setRefs} proveedores={proveedores} setProveedores={setProveedores} />}
        {tab === "fal" && <Fallas fallas={fallas} setFallas={setFallas} />}
        {tab === "ia" && <AsistenteIA onRefrescar={cargarTablas} />}
      </main>
    </div>
  );
}