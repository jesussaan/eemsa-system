import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useState, useRef, useEffect } from "react";
import ClicheImg from './ClicheImg';
import CalculadoraProduccion from './CalculadoraProduccion';
import { supabase } from '../lib/supabase';
import { uid, today, diasHabilesRestantes, estadoPlazo, alertaEntrega, siguienteNumPedido } from '../lib/utils';
import { MAQUINAS, TIPOS, OPERADORES, STATUS_PED, META_MERMA_PCT } from '../lib/constants';
import { sendWhatsApp, mensajePedidoNuevo } from '../utils/whatsapp';

export default function Pedidos({ pedidos, setPedidos }) {
  const formInicial = { cliente: "", num: "", tipo: "Blanca", medida: "", cajas: "", rollos_caja: "", rollos_totales: "", ancho: "", largo: "", portaliche: "30.9", diseno: "normal", color: "", color_cinta: "", maq: "SIAT L36 #1", op: "William", fecha_solicitud: today(), fecha_estimada: "", fecha_inicio: "", fecha_termino: "", piezas_prod: "", merma: "", merma_pct: "", notas: "", status: "anotado" };
  const [form, setForm] = useState(() => ({ ...formInicial, num: siguienteNumPedido(pedidos) }));
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const [modalPedido, setModalPedido] = useState(null);
  const [filtro, setFiltro] = useState("activos");
  const [clicheImg, setClicheImg] = useState(null);
  const [clichePreview, setClichePreview] = useState(null);
  const [modalClicheImg, setModalClicheImg] = useState(null);
  const [modalClichePreview, setModalClichePreview] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [showCalc, setShowCalc] = useState(false);
  const [plantillas, setPlantillas] = useState([]);
  const [showPlantillas, setShowPlantillas] = useState(false);
  const [nombrePlantilla, setNombrePlantilla] = useState("");
  const [showGuardarPl, setShowGuardarPl] = useState(false);
  const formRef = useRef(null);

  useEffect(() => {
    supabase.from('plantillas').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setPlantillas(data); });
  }, []);

  const aplicarPlantilla = (pl) => {
    setForm(f => ({
      ...f,
      cliente:     pl.cliente     || f.cliente,
      tipo:        pl.tipo        || f.tipo,
      medida:      pl.medida      || f.medida,
      ancho:       pl.ancho       != null ? String(pl.ancho) : f.ancho,
      largo:       pl.largo       != null ? String(pl.largo) : f.largo,
      cajas:       pl.cajas       != null ? String(pl.cajas) : f.cajas,
      rollos_caja: pl.rollos_caja != null ? String(pl.rollos_caja) : f.rollos_caja,
      rollos_totales: pl.cajas && pl.rollos_caja ? String(pl.cajas * pl.rollos_caja) : f.rollos_totales,
      color:       pl.color       || f.color,
      notas:       pl.notas       || f.notas,
    }));
    setShowPlantillas(false);
    showToast("📋 Plantilla aplicada");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const guardarPlantilla = async () => {
    if (!nombrePlantilla.trim()) { showToast("⚠ Escribe un nombre"); return; }
    const nueva = {
      nombre: nombrePlantilla.trim(),
      cliente: form.cliente || null, tipo: form.tipo || null,
      medida: form.medida || null, ancho: form.ancho ? Number(form.ancho) : null,
      largo: form.largo ? Number(form.largo) : null,
      cajas: form.cajas ? Number(form.cajas) : null,
      rollos_caja: form.rollos_caja ? Number(form.rollos_caja) : null,
      color: form.color || null, notas: form.notas || null,
    };
    const { data, error } = await supabase.from('plantillas').insert([nueva]).select().single();
    if (error) { showToast("❌ Error: " + error.message); return; }
    setPlantillas(p => [data, ...p]);
    setNombrePlantilla("");
    setShowGuardarPl(false);
    showToast("✓ Plantilla guardada");
  };

  const eliminarPlantilla = async (id) => {
    await supabase.from('plantillas').delete().eq('id', id);
    setPlantillas(p => p.filter(x => x.id !== id));
  };
  const showToast = t => { setToast(t); setTimeout(() => setToast(""), 2500); };
  const upd = (k, v) => setForm(f => {
    const nf = { ...f, [k]: v };
    if ((k === "cajas" || k === "rollos_caja") && !f.rollos_totales) {
      const c = k === "cajas" ? v : nf.cajas;
      const r = k === "rollos_caja" ? v : nf.rollos_caja;
      if (c && r) nf.rollos_totales = String(Number(c) * Number(r));
    }
    return nf;
  });

  const clonarPedido = (p) => {
    setForm({
      ...formInicial,
      cliente: p.cliente || "",
      num: siguienteNumPedido(pedidos),
      tipo: p.tipo || "Blanca",
      medida: p.medida || "",
      cajas: p.cajas || "",
      rollos_caja: p.rollos_caja || "",
      rollos_totales: p.rollos_totales || "",
      ancho: p.ancho || "",
      largo: p.largo || "",
      portaliche: p.portaliche || "30.9",
      diseno: p.diseno || "normal",
      color: p.color || "",
      maq: p.maq || "SIAT L36 #1",
      op: p.op || "William",
      fecha_solicitud: today(),
      status: "anotado",
    });
    setClicheImg(null); setClichePreview(null);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    showToast("🔁 Pedido clonado — ajusta los datos y anota");
  };

  const generarNotaEntrega = (p) => {
    const doc = new jsPDF();
    doc.setFillColor(26, 39, 68); doc.rect(0, 0, 210, 30, "F");
    doc.setTextColor(201, 146, 42); doc.setFontSize(18); doc.text("EEMSA System", 14, 13);
    doc.setFontSize(10); doc.text("Nota de Entrega", 14, 22);
    doc.setTextColor(255, 255, 255); doc.setFontSize(11);
    doc.text(`No. Pedido: ${p.num}`, 140, 13);
    doc.text(`Fecha: ${today()}`, 140, 22);
    doc.setTextColor(0, 0, 0);
    autoTable(doc, {
      startY: 36,
      body: [
        ["Cliente", p.cliente || "—"],
        ["No. Pedido", String(p.num || "—")],
        ["Fecha solicitud", p.fecha_solicitud || "—"],
        ["Máquina", p.maq || "—"],
        ["Operador", p.op || "—"],
      ],
      theme: "plain", styles: { fontSize: 10 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 55, textColor: [100, 100, 100] } },
    });
    doc.setFontSize(11); doc.setTextColor(26, 39, 68);
    doc.text("Producto", 14, doc.lastAutoTable.finalY + 10);
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 13,
      head: [["Tipo", "Medida", "Cajas", "Rollos/caja", "Color impresión"]],
      body: [[p.tipo || "—", p.medida || "—", String(p.cajas || "—"), String(p.rollos_caja || "—"), p.color || "—"]],
      styles: { fontSize: 10 }, headStyles: { fillColor: [26, 39, 68], textColor: [201, 146, 42] },
    });
    const consumoRows = [];
    if (p.fecha_inicio) consumoRows.push(["Fecha inicio producción", p.fecha_inicio]);
    if (p.fecha_termino) consumoRows.push(["Fecha término producción", p.fecha_termino]);
    if (p.fecha_inicio && p.fecha_termino) consumoRows.push(["Días de producción", `${Math.round((new Date(p.fecha_termino + "T12:00:00") - new Date(p.fecha_inicio + "T12:00:00")) / 86400000) + 1} días`]);
    if (p.rollos_usados) consumoRows.push(["Rollos usados", String(p.rollos_usados)]);
    if (p.tinta_tipo) consumoRows.push(["Tipo de tinta", p.tinta_tipo]);
    if (p.tinta_kg) consumoRows.push(["Tinta usada", `${p.tinta_kg} kg`]);
    if (p.alcohol_litros) consumoRows.push(["Alcohol utilizado", `${p.alcohol_litros} L`]);
    if (p.merma_pct) consumoRows.push(["% Merma", `${p.merma_pct}%`]);
    if (consumoRows.length > 0) {
      doc.text("Producción y consumos", 14, doc.lastAutoTable.finalY + 10);
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 13,
        body: consumoRows,
        theme: "plain", styles: { fontSize: 10 },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 70, textColor: [100, 100, 100] } },
      });
    }
    if (p.notas) {
      doc.setFontSize(9); doc.setTextColor(120, 120, 120);
      doc.text(`Notas: ${p.notas}`, 14, doc.lastAutoTable.finalY + 10);
    }
    const sigY = Math.min(doc.lastAutoTable ? doc.lastAutoTable.finalY + 28 : 240, 255);
    doc.setDrawColor(180, 180, 180);
    doc.line(14, sigY, 92, sigY); doc.line(118, sigY, 196, sigY);
    doc.setFontSize(9); doc.setTextColor(100, 100, 100);
    doc.text("Entregado por", 14, sigY + 6);
    doc.text("Recibido por (firma y sello)", 118, sigY + 6);
    doc.setFontSize(7); doc.setTextColor(160, 160, 160);
    doc.text("EEMSA System · Control de producción SIAT L36", 14, 290);
    doc.save(`NotaEntrega_Ped${p.num}_${(p.cliente || "").replace(/\s/g, "_")}.pdf`);
  };

  const save = async () => {
    if (!form.cliente || !form.num || !form.cajas || !form.fecha_solicitud) { showToast("⚠ Llena cliente, número, cajas y fecha solicitada"); return; }
    setLoading(true);
    const n = (v) => v === "" ? null : Number(v);
    let cliche_url = "";
    if (clicheImg) {
      const { data: up, error: upErr } = await supabase.storage.from("cliches").upload(`${uid()}_${clicheImg.name}`, clicheImg);
      if (upErr) { showToast("⚠ Foto no subida: " + upErr.message); }
      else if (up) { cliche_url = up.path; }
    }
    const nuevo = { id: uid(), created: today(), cliente: form.cliente, num: form.num, tipo: form.tipo, medida: form.medida, cajas: n(form.cajas), rollos_caja: n(form.rollos_caja), rollos_totales: n(form.rollos_totales), ancho: form.ancho, largo: form.largo, portaliche: form.portaliche || "30.9", diseno: form.diseno || "normal", color: form.color, color_cinta: form.color_cinta || null, maq: form.maq, op: form.op, fecha_solicitud: form.fecha_solicitud, fecha_estimada: form.fecha_estimada || null, fecha_inicio: form.fecha_inicio || null, fecha_termino: form.fecha_termino || null, piezas_prod: n(form.piezas_prod), merma: form.merma || null, merma_pct: form.merma_pct || null, notas: form.notas, status: form.status, cliche_url };
    const { error } = await supabase.from("pedidos").insert([nuevo]);
    if (error) { showToast("❌ Error: " + error.message); setLoading(false); return; }
    setPedidos(p => [nuevo, ...p]);
    setForm({ ...formInicial, num: siguienteNumPedido([nuevo, ...pedidos]) });
    setClicheImg(null); setClichePreview(null);
    sendWhatsApp(mensajePedidoNuevo(nuevo));
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
    const original = pedidos.find(x => x.id === modalPedido.id);
    let fechaOriginal = modalPedido.fecha_original || null;
    if (original?.fecha_estimada && modalPedido.fecha_estimada && original.fecha_estimada !== modalPedido.fecha_estimada && !fechaOriginal) {
      fechaOriginal = original.fecha_estimada;
    }
    if (!modalPedido.fecha_estimada) fechaOriginal = null;
    const actualizado = {
      id: modalPedido.id, created: modalPedido.created,
      cliente: modalPedido.cliente, num: modalPedido.num,
      tipo: modalPedido.tipo, medida: modalPedido.medida,
      cajas: n2(modalPedido.cajas), rollos_caja: n2(modalPedido.rollos_caja),
      rollos_totales: n2(modalPedido.rollos_totales),
      ancho: modalPedido.ancho, largo: modalPedido.largo,
      color: modalPedido.color, maq: modalPedido.maq, op: modalPedido.op,
      fecha_solicitud: modalPedido.fecha_solicitud,
      fecha_estimada: modalPedido.fecha_estimada || null,
      fecha_original: fechaOriginal,
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
      portaliche: modalPedido.portaliche || "30.9",
      diseno: modalPedido.diseno || "normal",
      color_cinta: modalPedido.color_cinta || null,
      cliche_url: modalPedido.cliche_url || null,
      foto_producto_url: modalPedido.foto_producto_url || null,
    };
    if (modalClicheImg) {
      const { data: up, error: upErr } = await supabase.storage.from("cliches").upload(`${uid()}_${modalClicheImg.name}`, modalClicheImg);
      if (upErr) { showToast("⚠ Foto no subida: " + upErr.message); }
      else if (up) { actualizado.cliche_url = up.path; }
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

  const darDeAlta = async (id) => {
    await supabase.from("pedidos").update({ status: "anotado" }).eq("id", id);
    setPedidos(ps => ps.map(p => p.id === id ? { ...p, status: "anotado" } : p));
    showToast("✓ Pedido dado de alta");
  };

  const pedidosPendientes = pedidos.filter(p => p.status === "pendiente").filter(p => !busqueda || [p.cliente, p.num, p.tipo, p.medida].some(v => String(v || "").toLowerCase().includes(busqueda.toLowerCase())));
  const pedidosFiltrados = pedidos
    .filter(p => filtro === "pendiente" ? p.status === "pendiente" : (p.status !== "pendiente" && (filtro === "todos" ? true : filtro === "activos" ? ["anotado", "proceso"].includes(p.status) : p.status === filtro)))
    .filter(p => !busqueda || [p.cliente, p.num, p.tipo, p.medida, p.color, p.color_cinta].some(v => String(v || "").toLowerCase().includes(busqueda.toLowerCase())))
    .map(p => ({ ...p, diasRest: p.status !== "terminado" ? diasHabilesRestantes(p.fecha_solicitud) : null }))
    .sort((a, b) => { if (a.status === "terminado" && b.status !== "terminado") return 1; if (b.status === "terminado" && a.status !== "terminado") return -1; return (a.diasRest ?? 999) - (b.diasRest ?? 999); });
  const colorStatus = s => s === "terminado" ? "b-green" : s === "proceso" ? "b-blue" : s === "pendiente" ? "b-red" : "b-orange";

  return (
    <div>
      <h2 className="sec-title">📋 Pedidos</h2>
      <div className="stat-grid">
        <div className="stat-card red"><div className="stat-val">{pedidos.filter(p => p.status === "pendiente").length}</div><div className="stat-lbl">Falta dar de alta</div></div>
        <div className="stat-card orange"><div className="stat-val">{pedidos.filter(p => p.status === "anotado").length}</div><div className="stat-lbl">Anotados</div></div>
        <div className="stat-card blue"><div className="stat-val">{pedidos.filter(p => p.status === "proceso").length}</div><div className="stat-lbl">En proceso</div></div>
        <div className="stat-card green"><div className="stat-val">{pedidos.filter(p => p.status === "terminado").length}</div><div className="stat-lbl">Terminados</div></div>
      </div>

      {pedidosPendientes.length > 0 && (
        <div style={{ background: "#1a0a0a", border: "2px solid #ff4d4d", borderRadius: 12, padding: 14, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: "#ff4d4d", fontWeight: 700, fontSize: 14 }}>🔔 Falta dar de alta</span>
            <span style={{ background: "#ff4d4d", color: "#fff", borderRadius: 20, padding: "2px 8px", fontSize: 12, fontWeight: 700 }}>{pedidosPendientes.length}</span>
          </div>
          <div className="list" style={{ margin: 0 }}>
            {pedidosPendientes.map(p => (
              <div key={p.id} className="list-item" style={{ borderLeft: "3px solid #ff4d4d", background: "#14080a" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6, flexWrap: "wrap" }}>
                  <div><strong>{p.num}</strong> — {p.cliente}</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => abrirModal(p)}>✏️</button>
                    <button className="btn btn-danger btn-sm" onClick={() => del(p.id)}>✕</button>
                    <button onClick={() => darDeAlta(p.id)} style={{ padding: "4px 12px", borderRadius: 8, background: "#4be87a", color: "#000", border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>✓ Dar de alta</button>
                  </div>
                </div>
                <div className="muted">{p.tipo} · {p.medida} · {p.cajas} cajas · Sol: {p.fecha_solicitud}</div>
                {p.notas && <div className="muted">📝 {p.notas}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 className="sub-title" ref={formRef} style={{ margin: 0 }}>➕ Anotar pedido</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowPlantillas(true)}>📋 Plantillas</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowCalc(true)}>🧮 Calculadora</button>
        </div>
      </div>

      {/* Modal plantillas */}
      {showPlantillas && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={() => setShowPlantillas(false)}>
          <div style={{ background: '#181b24', borderRadius: '18px 18px 0 0', width: '100%', maxWidth: 500, padding: '20px 16px 32px', maxHeight: '75vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#e0e0e0', marginBottom: 14 }}>📋 Plantillas guardadas</div>
            {plantillas.length === 0 ? (
              <div style={{ color: '#545a78', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No hay plantillas. Llena el formulario y guarda una.</div>
            ) : plantillas.map(pl => (
              <div key={pl.id} style={{ background: '#0d0f14', borderRadius: 10, padding: '12px 14px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, color: '#e0e0e0', fontSize: 14 }}>{pl.nombre}</div>
                  <div style={{ fontSize: 12, color: '#545a78', marginTop: 2 }}>
                    {[pl.cliente, pl.tipo, pl.medida, pl.cajas ? `${pl.cajas} cajas` : null].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => aplicarPlantilla(pl)} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#4be87a', color: '#000', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Usar</button>
                  <button onClick={() => eliminarPlantilla(pl.id)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #2a2d3a', background: 'transparent', color: '#ff4d4d', fontSize: 14, cursor: 'pointer' }}>🗑</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="form-grid">
        <div className="field"><label>Cliente *</label><input value={form.cliente} onChange={e => upd("cliente", e.target.value)} placeholder="MAFENSA, ARIAT…" /></div>
        <div className="field"><label>No. Pedido * <span style={{ color: "#666", fontWeight: 400 }}>(sugerido)</span></label><input value={form.num} onChange={e => upd("num", e.target.value)} placeholder="84, 85…" /></div>
        <div className="field"><label>Tipo cinta</label><select value={form.tipo} onChange={e => upd("tipo", e.target.value)}>{TIPOS.map(t => <option key={t}>{t}</option>)}</select></div>
        <div className="field"><label>Medida (ej: 2"x100)</label><input value={form.medida} onChange={e => upd("medida", e.target.value)} placeholder='2"x100' /></div>
        <div className="field"><label>Cajas solicitadas *</label><input type="number" value={form.cajas} onChange={e => upd("cajas", e.target.value)} placeholder="50" /></div>
        <div className="field"><label>Rollos por caja</label><input type="number" value={form.rollos_caja} onChange={e => upd("rollos_caja", e.target.value)} placeholder="36" /></div>
        <div className="field"><label>Rollos / piezas totales</label><input type="number" value={form.rollos_totales} onChange={e => upd("rollos_totales", e.target.value)} placeholder="1800" /></div>
        <div className="field"><label>Ancho (pulg)</label><input value={form.ancho} onChange={e => upd("ancho", e.target.value)} placeholder='2"' /></div>
        <div className="field"><label>Largo (m)</label><input type="number" value={form.largo} onChange={e => upd("largo", e.target.value)} placeholder="100" /></div>
        <div className="field full">
          <label>Portacliché</label>
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            {["30.9","25.4","29.0"].map(v => (
              <button key={v} type="button" onClick={() => upd("portaliche", v)} style={{ flex: 1, padding: "8px 0", borderRadius: 6, border: "2px solid", borderColor: form.portaliche === v ? "#c9922a" : "#2a2d3a", background: form.portaliche === v ? "#c9922a22" : "transparent", color: form.portaliche === v ? "#c9922a" : "#666", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{v} cm</button>
            ))}
          </div>
        </div>
        <div className="field full">
          <label>Diseño / cobertura</label>
          <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
            {[{k:"chica",l:"Letra chica",p:"12.5%"},{k:"normal",l:"Normal",p:"27.5%"},{k:"grande",l:"Grande",p:"45%"},{k:"relleno",l:"Relleno",p:"82.5%"}].map(d => (
              <button key={d.k} type="button" onClick={() => upd("diseno", d.k)} style={{ flex: 1, minWidth: 70, padding: "7px 4px", borderRadius: 6, border: "2px solid", borderColor: form.diseno === d.k ? "#4b8fe8" : "#2a2d3a", background: form.diseno === d.k ? "#4b8fe822" : "transparent", color: form.diseno === d.k ? "#4b8fe8" : "#666", fontWeight: 700, fontSize: 11, cursor: "pointer", textAlign: "center", lineHeight: 1.3 }}>{d.l}<br/><span style={{ fontWeight: 400, opacity: .7 }}>{d.p}</span></button>
            ))}
          </div>
        </div>
        <div className="field"><label>Color impresión</label><input value={form.color} onChange={e => upd("color", e.target.value)} placeholder="Rojo PMS 485" /></div>
        <div className="field full"><label>📷 Foto del cliché</label><input type="file" accept="image/*" onChange={e => { const f = e.target.files[0]; if (!f) return; setClicheImg(f); setClichePreview(URL.createObjectURL(f)); }} />{clichePreview && <img src={clichePreview} alt="cliché" style={{ width: "100%", maxWidth: 260, marginTop: 8, borderRadius: 8, border: "1px solid #2a2d3a" }} />}</div>
        <div className="field"><label>Máquina</label><select value={form.maq} onChange={e => upd("maq", e.target.value)}>{MAQUINAS.map(m => <option key={m}>{m}</option>)}</select></div>
        <div className="field"><label>Operador</label><select value={form.op} onChange={e => upd("op", e.target.value)}>{OPERADORES.map(o => <option key={o}>{o}</option>)}</select></div>
        <div className="field"><label>Fecha solicitada *</label><input type="date" value={form.fecha_solicitud} onChange={e => upd("fecha_solicitud", e.target.value)} /></div>
        <div className="field"><label>📅 Entrega estimada</label><input type="date" value={form.fecha_estimada} onChange={e => upd("fecha_estimada", e.target.value)} /></div>
        <div className="field full"><label>Notas</label><textarea value={form.notas} onChange={e => upd("notas", e.target.value)} placeholder="Observaciones…" /></div>
      </div>
      <button className="btn btn-primary btn-block" onClick={save} disabled={loading}>{loading ? "Guardando…" : "📝 Anotar pedido"}</button>

      {showGuardarPl ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input value={nombrePlantilla} onChange={e => setNombrePlantilla(e.target.value)} placeholder="Nombre de la plantilla…" style={{ flex: 1, background: '#1a1d26', border: '1px solid #2a2d3a', borderRadius: 8, padding: '8px 12px', color: '#e0e0e0', fontSize: 13 }} onKeyDown={e => e.key === 'Enter' && guardarPlantilla()} />
          <button onClick={guardarPlantilla} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#4be87a', color: '#000', fontWeight: 700, cursor: 'pointer' }}>💾</button>
          <button onClick={() => { setShowGuardarPl(false); setNombrePlantilla(''); }} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #2a2d3a', background: 'transparent', color: '#545a78', cursor: 'pointer' }}>✕</button>
        </div>
      ) : (
        <button className="btn btn-ghost btn-block" style={{ marginTop: 8, fontSize: 12 }} onClick={() => setShowGuardarPl(true)}>💾 Guardar como plantilla</button>
      )}
      <div style={{ display: "flex", gap: 8, margin: "16px 0 8px", flexWrap: "wrap" }}>
        {[["activos", "🟡 Activos"], ["todos", "Todos"], ["anotado", "Anotados"], ["proceso", "En proceso"], ["terminado", "✅ Terminados"], ["pendiente", "Falta alta"]].map(([k, v]) => (
          <button key={k} className={`btn btn-sm ${filtro === k ? "btn-primary" : "btn-ghost"}`} onClick={() => setFiltro(k)}>{v}</button>
        ))}
      </div>
      <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="🔍 Buscar por cliente, número, tipo, medida…" style={{ width: "100%", marginBottom: 8, background: "#1a1d26", border: "1px solid #2a2d3a", borderRadius: 8, padding: "8px 12px", color: "#e0e0e0", fontSize: 13 }} />
      <h3 className="sub-title">Registro ({pedidosFiltrados.length})</h3>
      {pedidosFiltrados.length === 0 ? <p className="empty">Sin pedidos en este filtro.</p> : (
        <div className="list">
          {pedidosFiltrados.map(p => {
            const mermaOk = p.merma_pct !== "" && p.merma_pct !== undefined ? Number(p.merma_pct) <= META_MERMA_PCT : null;
            const badge = p.status !== "terminado" ? estadoPlazo(p.diasRest) : null;
            const alerta = alertaEntrega(p.fecha_estimada, p.status);
            return (
              <div key={p.id} className="list-item" style={{ borderLeft: `3px solid ${alerta ? alerta.borde : p.status === "terminado" ? "#4be87a" : p.status === "proceso" ? "#4a9eff" : "#ff9900"}`, background: alerta ? alerta.bg : undefined, transition: "background .2s" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6, flexWrap: "wrap" }}>
                  <div><strong>{p.num}</strong> — {p.cliente}<span className={`badge ${colorStatus(p.status)}`}>{STATUS_PED[p.status] || p.status}</span>{badge && <span className={`badge ${badge.cls}`}>{badge.txt}</span>}{alerta && <span style={{ fontSize: 12, fontWeight: 700, color: alerta.color, marginLeft: 4 }}>{alerta.txt}</span>}</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" title="Nota de entrega PDF" onClick={() => generarNotaEntrega(p)}>📄</button>
                    <button className="btn btn-ghost btn-sm" title="Clonar pedido" onClick={() => clonarPedido(p)}>🔁</button>
<button className="btn btn-ghost btn-sm" onClick={() => abrirModal(p)}>✏️</button>
                    <button className="btn btn-danger btn-sm" onClick={() => del(p.id)}>✕</button>
                  </div>
                </div>
                <div className="muted">{p.tipo} · {p.medida} · {p.cajas} cajas · {p.maq}</div>
                <div className="muted">Sol: {p.fecha_solicitud}{p.fecha_estimada && <span style={{ color: "#e8b84b", fontWeight: 600 }}> · Est. entrega: {p.fecha_estimada}</span>}{p.fecha_inicio && ` · Inicio: ${p.fecha_inicio}`}{p.fecha_termino && ` · Fin: ${p.fecha_termino}`}</div>
                {p.status === "terminado" && p.fecha_inicio && p.fecha_termino && (<div className="muted">⏱ Producción: <span style={{ color: "#4be87a", fontWeight: 700 }}>{Math.round((new Date(p.fecha_termino + "T12:00:00") - new Date(p.fecha_inicio + "T12:00:00")) / 86400000) + 1} días</span> ({p.fecha_inicio} → {p.fecha_termino})</div>)}
                {p.status === "terminado" && p.merma_pct !== "" && p.merma_pct !== undefined && (<div className="muted">Merma: <span style={{ color: mermaOk ? "#4be87a" : "#ff4d4d", fontWeight: 700 }}>{p.merma_pct}% {mermaOk ? "🟢 OK" : "🔴 EXCEDIDA"}</span></div>)}
                <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                  {p.cliche_url && <ClicheImg src={p.cliche_url} style={{ width: 80, height: 56, objectFit: "cover", borderRadius: 6, border: "1px solid #2a2d3a" }} />}
                  {p.foto_producto_url && (
                    <div>
                      <div style={{ fontSize: 10, color: "#4be87a", marginBottom: 2 }}>Producto terminado</div>
                      <ClicheImg src={p.foto_producto_url} style={{ width: 80, height: 56, objectFit: "cover", borderRadius: 6, border: "1px solid #4be87a" }} />
                    </div>
                  )}
                </div>
                {p.notas && <div className="muted">📝 {p.notas}</div>}
                {p.status === "terminado" && (p.rollos_usados || p.tinta_kg || p.alcohol_litros) && (
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
              <div className="field"><label>Rollos / piezas totales</label><input type="number" value={modalPedido.rollos_totales || ""} onChange={e => setModalPedido(m => ({ ...m, rollos_totales: e.target.value }))} placeholder="1800" /></div>
              <div className="field"><label>Fecha solicitada</label><input type="date" value={modalPedido.fecha_solicitud || ""} onChange={e => setModalPedido(m => ({ ...m, fecha_solicitud: e.target.value }))} /></div>
              <div className="field"><label>📅 Entrega estimada</label><input type="date" value={modalPedido.fecha_estimada || ""} onChange={e => setModalPedido(m => ({ ...m, fecha_estimada: e.target.value }))} /></div>
              <div className="field"><label>Fecha inicio</label><input type="date" value={modalPedido.fecha_inicio || ""} onChange={e => setModalPedido(m => ({ ...m, fecha_inicio: e.target.value }))} /></div>
              <div className="field"><label>Fecha término</label><input type="date" value={modalPedido.fecha_termino || ""} onChange={e => setModalPedido(m => ({ ...m, fecha_termino: e.target.value }))} /></div>
              <div className="field"><label>Piezas producidas</label><input type="number" value={modalPedido.piezas_prod || ""} onChange={e => setModalPedido(m => ({ ...m, piezas_prod: e.target.value }))} placeholder="1800" /></div>
              <div className="field"><label>Merma (piezas)</label><input type="number" value={modalPedido.merma || ""} onChange={e => setModalPedido(m => ({ ...m, merma: e.target.value }))} placeholder="24" /></div>
              {modalPedido.piezas_prod && modalPedido.merma && (<div className="field"><label>% Merma (auto)</label><input value={((Number(modalPedido.merma) / Number(modalPedido.piezas_prod)) * 100).toFixed(2) + "%"} readOnly style={{ background: "#1a2744", color: Number(modalPedido.merma) / Number(modalPedido.piezas_prod) * 100 > META_MERMA_PCT ? "#ff4d4d" : "#4be87a" }} /></div>)}
              <div className="field full"><label>Notas</label><textarea value={modalPedido.notas || ""} onChange={e => setModalPedido(m => ({ ...m, notas: e.target.value }))} /></div>
              <div className="field full"><label>📷 Foto del cliché</label>
                {modalPedido.cliche_url && !modalClichePreview && <ClicheImg src={modalPedido.cliche_url} style={{ width: "100%", maxWidth: 260, marginBottom: 8, borderRadius: 8, border: "1px solid #2a2d3a" }} />}
                {modalClichePreview && <img src={modalClichePreview} alt="cliché nuevo" style={{ width: "100%", maxWidth: 260, marginBottom: 8, borderRadius: 8, border: "1px solid #c9922a" }} />}
                <input type="file" accept="image/*" onChange={e => { const f = e.target.files[0]; if (!f) return; setModalClicheImg(f); setModalClichePreview(URL.createObjectURL(f)); }} />
              </div>
            </div>
            <div style={{ borderTop: "1px solid #2a2d3a", margin: "16px 0 12px", paddingTop: 12 }}>
              <div style={{ fontSize: 12, color: "#c9922a", fontWeight: 700, marginBottom: 10 }}>📦 Consumos de producción</div>
              <div className="form-grid">
                <div className="field"><label>Rollos usados</label><input type="number" step="0.5" value={modalPedido.rollos_usados || ""} onChange={e => setModalPedido(m => ({ ...m, rollos_usados: e.target.value }))} placeholder="36" /></div>
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
      {showCalc && <CalculadoraProduccion pedidos={pedidos} onClose={() => setShowCalc(false)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
