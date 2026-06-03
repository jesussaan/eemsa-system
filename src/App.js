import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { useState, useEffect, useRef } from "react";
import "./App.css";
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://mqroamvsunlfvxggifzc.supabase.co',
  'sb_publishable_KqYvpg98uxNcsCtSb6QX9A_4JEMTdgC'
);

// ── Helpers ──────────────────────────────────────────────────────────────────
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const today = () => new Date().toISOString().slice(0, 10);
const fmt = (n) => Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Constantes ────────────────────────────────────────────────────────────────
const MAQUINAS = ["SIAT L36 #1", "SIAT L36 #2", "SIAT L36 #3"];
const TIPOS = ["Blanca", "Canela", "Transparente", "Engomado"];
const COMPS = ["Rodillo anilox", "Sistema de tintas", "Cliché/portacliché", "Motor principal", "Sistema de corte", "Banda transportadora", "Sistema eléctrico", "Otro"];
const STATUS = { pendiente: "Pendiente", proceso: "En proceso", terminado: "Terminado" };
const SEV = { leve: "Leve", moderada: "Moderada", critica: "Crítica" };

// ════════════════════════════════════════════════════════════════════════════
// ASISTENTE IA
// ════════════════════════════════════════════════════════════════════════════
function AsistenteIA() {
  const [msgs, setMsgs] = useState([
    { role: "assistant", content: "Hola Jesús 👋 Soy el asistente de producción de EEMSA. Pregúntame sobre la SIAT L36, merma, tintas, clichés, SGC o cualquier duda técnica." }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, loading]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", content: input.trim() };
    const next = [...msgs, userMsg];
    setMsgs(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map(m => ({ role: m.role, content: m.content })) })
      });
      const data = await res.json();
      const reply = data?.content?.map(b => b.text || "").join("") || data?.error || "Sin respuesta.";
      setMsgs([...next, { role: "assistant", content: reply }]);
    } catch {
      setMsgs([...next, { role: "assistant", content: "❌ Error de conexión." }]);
    }
    setLoading(false);
  };

  return (
    <div>
      <h2 className="sec-title">🤖 Asistente IA</h2>
      <p className="muted" style={{ marginBottom: 12 }}>Pregunta sobre SIAT L36, anilox, clichés, merma, tintas o procedimientos SGC.</p>
      <div className="chat-box">
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role === "user" ? "msg-u" : "msg-a"}`}
            dangerouslySetInnerHTML={{ __html: (m.content || "").replace(/\n/g, "<br>").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }} />
        ))}
        {loading && <div className="msg msg-a typing">Escribiendo…</div>}
        <div ref={bottomRef} />
      </div>
      <div className="chat-row">
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Escribe tu pregunta…" disabled={loading} />
        <button className="btn btn-primary" onClick={send} disabled={loading || !input.trim()}>Enviar</button>
      </div>
      <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setMsgs([{ role: "assistant", content: "Chat reiniciado. ¿En qué te ayudo?" }])}>Limpiar</button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════════════════════
function Dashboard({ pedidos, fallas, refacciones, proveedores }) {
  const activos = pedidos.filter(p => p.status !== "terminado").length;
  const terminados = pedidos.filter(p => p.status === "terminado").length;
  const fallasAbiertas = fallas.filter(f => f.status === "abierta").length;
  const gastoRef = refacciones.reduce((s, r) => s + Number(r.costo || 0), 0);
  const mermaTotal = pedidos.reduce((s, p) => s + Number(p.merma || 0), 0);
const piezasTotal = pedidos.reduce((s, p) => s + Number(p.piezas || 0), 0);
const mermaPct = piezasTotal > 0 ? ((mermaTotal / piezasTotal) * 100).toFixed(1) : 0;
const cajasElaboradas = pedidos.filter(p => p.status === "terminado").reduce((s, p) => s + Number(p.piezas || 0), 0);
const generarPDF = () => {
    const doc = new jsPDF();
    const mes = new Date().toLocaleString("es-MX", { month: "long", year: "numeric" });
    doc.setFillColor(26, 39, 68);
    doc.rect(0, 0, 210, 30, "F");
    doc.setTextColor(201, 146, 42);
    doc.setFontSize(18);
    doc.text("EEMSA System", 14, 15);
    doc.setFontSize(10);
    doc.text(`Reporte mensual — ${mes}`, 14, 23);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.text("Resumen de Pedidos", 14, 40);
    autoTable(doc, {
      startY: 44,
      head: [["No. Pedido", "Cliente", "Piezas", "Status", "Merma"]],
      body: pedidos.map(p => [p.num, p.cliente, p.piezas, p.status, p.merma || 0]),
    });
    doc.text("Fallas", 14, doc.lastAutoTable.finalY + 10);
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 14,
      head: [["Fecha", "Máquina", "Componente", "Min Paro", "Severidad"]],
      body: fallas.map(f => [f.fecha, f.maq, f.comp, f.min_paro, f.sev]),
    });
    doc.text("Compras", 14, doc.lastAutoTable.finalY + 10);
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 14,
      head: [["Proveedor", "Qué se compró", "Monto", "Fecha"]],
      body: proveedores.map(p => [p.nombre, p.que_compro, `$${fmt(p.monto)}`, p.fecha]),
    });
    doc.save(`EEMSA_Reporte_${mes}.pdf`);
  };
  return (
    <div>
      <h2 className="sec-title">📊 Dashboard</h2>
      <button className="btn btn-primary" style={{ marginBottom: 12 }} onClick={generarPDF}>📄 Generar reporte PDF</button>
      <div className="stat-grid">
        <div className="stat-card accent"><div className="stat-val">{activos}</div><div className="stat-lbl">Pedidos activos</div></div>
        <div className="stat-card green"><div className="stat-val">{terminados}</div><div className="stat-lbl">Terminados</div></div>
        <div className="stat-card red"><div className="stat-val">{fallasAbiertas}</div><div className="stat-lbl">Fallas abiertas</div></div>
        <div className="stat-card blue"><div className="stat-val">${fmt(gastoRef)}</div><div className="stat-lbl">Gasto refacciones</div></div>
        <div className="stat-card orange"><div className="stat-val">{mermaPct}%</div><div className="stat-lbl">Merma total (pzas)</div></div>
        <div className="stat-card green"><div className="stat-val">{cajasElaboradas.toLocaleString()}</div><div className="stat-lbl">Cajas elaboradas</div></div>
      </div>
      <h3 className="sub-title">Pedidos recientes</h3>
      {pedidos.length === 0 ? <p className="empty">Sin pedidos aún.</p> : (
        <div className="list">
          {pedidos.slice(0, 5).map(p => (
            <div key={p.id} className="list-item">
              <div><strong>{p.num}</strong> — {p.cliente}
                <span className={`badge ${p.status === "terminado" ? "b-green" : p.status === "proceso" ? "b-blue" : "b-orange"}`}>{STATUS[p.status]}</span>
              </div>
              <div className="muted">{p.maq} · {p.fecha}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PEDIDOS
// ════════════════════════════════════════════════════════════════════════════
function Pedidos({ pedidos, setPedidos }) {
  const [form, setForm] = useState({ cliente: "", num: "", piezas: "", ancho: "", largo: "", tipo: "Blanca", color: "", maq: "SIAT L36 #1", op: "", fecha: today(), status: "pendiente", merma: "", notas: "" });
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);

  const showToast = t => { setToast(t); setTimeout(() => setToast(""), 2200); };
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.cliente || !form.num || !form.piezas) { showToast("⚠ Llena cliente, número y piezas"); return; }
    setLoading(true);
    const nuevo = { ...form, id: uid(), created: today() };
    const { error } = await supabase.from("pedidos").insert([nuevo]);
    if (error) { showToast("❌ Error al guardar"); setLoading(false); return; }
    setPedidos(p => [nuevo, ...p]);
    setForm(f => ({ ...f, cliente: "", num: "", piezas: "", ancho: "", largo: "", color: "", op: "", notas: "", merma: "" }));
    showToast("✓ Pedido guardado en la nube ☁️");
    setLoading(false);
  };

  const del = async id => {
    if (!window.confirm("¿Eliminar pedido?")) return;
    await supabase.from("pedidos").delete().eq("id", id);
    setPedidos(p => p.filter(x => x.id !== id));
  };

  const chg = async (id, s) => {
    await supabase.from("pedidos").update({ status: s }).eq("id", id);
    setPedidos(p => p.map(x => x.id === id ? { ...x, status: s } : x));
  };

  return (
    <div>
      <h2 className="sec-title">📋 Pedidos</h2>
      <div className="stat-grid">
        <div className="stat-card accent"><div className="stat-val">{pedidos.length}</div><div className="stat-lbl">Total</div></div>
        <div className="stat-card blue"><div className="stat-val">{pedidos.filter(p => p.status === "proceso").length}</div><div className="stat-lbl">En proceso</div></div>
        <div className="stat-card green"><div className="stat-val">{pedidos.filter(p => p.status === "terminado").length}</div><div className="stat-lbl">Terminados</div></div>
      </div>
      <h3 className="sub-title">Nuevo pedido</h3>
      <div className="form-grid">
        <div className="field"><label>Cliente *</label><input value={form.cliente} onChange={e => upd("cliente", e.target.value)} placeholder="Nombre del cliente" /></div>
        <div className="field"><label>No. Pedido *</label><input value={form.num} onChange={e => upd("num", e.target.value)} placeholder="P-2026-001" /></div>
        <div className="field"><label>Piezas *</label><input type="number" value={form.piezas} onChange={e => upd("piezas", e.target.value)} placeholder="5000" /></div>
        <div className="field"><label>Fecha entrega</label><input type="date" value={form.fecha} onChange={e => upd("fecha", e.target.value)} /></div>
        <div className="field"><label>Ancho (mm)</label><input type="number" value={form.ancho} onChange={e => upd("ancho", e.target.value)} placeholder="48" /></div>
        <div className="field"><label>Largo (m)</label><input type="number" value={form.largo} onChange={e => upd("largo", e.target.value)} placeholder="100" /></div>
        <div className="field"><label>Tipo cinta</label><select value={form.tipo} onChange={e => upd("tipo", e.target.value)}>{TIPOS.map(t => <option key={t}>{t}</option>)}</select></div>
        <div className="field"><label>Color impresión</label><input value={form.color} onChange={e => upd("color", e.target.value)} placeholder="Rojo PMS 485" /></div>
        <div className="field"><label>Máquina</label><select value={form.maq} onChange={e => upd("maq", e.target.value)}>{MAQUINAS.map(m => <option key={m}>{m}</option>)}</select></div>
        <div className="field"><label>Operador</label><input value={form.op} onChange={e => upd("op", e.target.value)} placeholder="William / Alfredo" /></div>
        <div className="field"><label>Estado</label><select value={form.status} onChange={e => upd("status", e.target.value)}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="field"><label>Merma (pzas)</label><input type="number" value={form.merma} onChange={e => upd("merma", e.target.value)} placeholder="0" /></div>
        <div className="field full"><label>Notas</label><textarea value={form.notas} onChange={e => upd("notas", e.target.value)} placeholder="Observaciones…" /></div>
      </div>
      <button className="btn btn-primary btn-block" onClick={save} disabled={loading}>{loading ? "Guardando…" : "+ Registrar pedido"}</button>
      <h3 className="sub-title" style={{ marginTop: 20 }}>Registro</h3>
      {pedidos.length === 0 ? <p className="empty">Sin pedidos registrados.</p> : (
        <div className="list">
          {pedidos.map(p => (
            <div key={p.id} className="list-item">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                <div><strong>{p.num}</strong> — {p.cliente} · {Number(p.piezas).toLocaleString()} pzas</div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <select value={p.status} onChange={e => chg(p.id, e.target.value)} className="select-sm">
                    {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <button className="btn btn-danger btn-sm" onClick={() => del(p.id)}>✕</button>
                </div>
              </div>
              <div className="muted">{p.maq} · {p.tipo} · {p.color} · Entrega: {p.fecha}</div>
              {p.notas && <div className="muted">{p.notas}</div>}
            </div>
          ))}
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════
// REFACCIONES & PROVEEDORES
// ════════════════════════════════════════════════════════════════════════════
function Refacciones({ refs, setRefs, proveedores, setProveedores }) {
  const [subTab, setSubTab] = useState("compras");
  const [form, setForm] = useState({ nombre: "", costo: "", maq: "SIAT L36 #1", proveedor: "", fecha: today(), dias_entrega: "", falla: "", notas: "", stock: "1" });
  const [formProv, setFormProv] = useState({ nombre: "", telefono: "", direccion: "", monto: "", fecha: today(), que_compro: "" });
  const [imagen, setImagen] = useState(null);
  const [preview, setPreview] = useState(null);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);

  const showToast = t => { setToast(t); setTimeout(() => setToast(""), 2200); };
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const updP = (k, v) => setFormProv(f => ({ ...f, [k]: v }));

  const handleImagen = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImagen(file);
    setPreview(URL.createObjectURL(file));
  };

  const analizar = async () => {
    if (!imagen) { showToast("⚠ Selecciona una imagen primero"); return; }
    setLoading(true);
    try {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(",")[1]);
        r.onerror = rej;
        r.readAsDataURL(imagen);
      });
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mediaType: imagen.type, extractTicket: true })
      });
      const data = await response.json();
      const texto = data?.content?.map(b => b.text || "").join("") || "";
      try {
        const json = JSON.parse(texto.replace(/```json|```/g, "").trim());
        setFormProv({ nombre: json.nombre || "", telefono: json.telefono || "", direccion: json.direccion || "", monto: json.monto || "", fecha: json.fecha || today(), que_compro: json.que_compro || "" });
        showToast("✓ Datos extraídos por IA");
      } catch { showToast("⚠ Llena manualmente"); }
    } catch { showToast("❌ Error al analizar"); }
    setLoading(false);
  };

  const saveCompra = async () => {
    if (!formProv.nombre || !formProv.monto) { showToast("⚠ Nombre y monto obligatorios"); return; }
    setLoading(true);
    let imagen_url = "";
    if (imagen) {
      const { data } = await supabase.storage.from("refacciones").upload(`tickets/${uid()}_${imagen.name}`, imagen);
      if (data) {
        const { data: url } = supabase.storage.from("refacciones").getPublicUrl(data.path);
        imagen_url = url.publicUrl;
      }
    }
    const nuevo = { ...formProv, id: uid(), imagen_url, created: today() };
    const { error } = await supabase.from("proveedores").insert([nuevo]);
    if (error) { showToast("❌ Error al guardar"); setLoading(false); return; }
    setProveedores(p => [nuevo, ...p]);
    setFormProv({ nombre: "", telefono: "", direccion: "", monto: "", fecha: today(), que_compro: "" });
    setImagen(null); setPreview(null);
    showToast("✓ Compra guardada ☁️");
    setLoading(false);
  };

  const saveRef = async () => {
    if (!form.nombre || !form.costo) { showToast("⚠ Nombre y costo obligatorios"); return; }
    setLoading(true);
    const nuevo = { ...form, id: uid(), created: today() };
    const { error } = await supabase.from("refacciones").insert([nuevo]);
    if (error) { showToast("❌ Error al guardar"); setLoading(false); return; }
    setRefs(r => [nuevo, ...r]);
    setForm(f => ({ ...f, nombre: "", costo: "", proveedor: "", dias_entrega: "", falla: "", notas: "", stock: "1" }));
    showToast("✓ Refacción guardada ☁️");
    setLoading(false);
  };

  const delRef = async id => {
    if (!window.confirm("¿Eliminar?")) return;
    await supabase.from("refacciones").delete().eq("id", id);
    setRefs(r => r.filter(x => x.id !== id));
  };

  const delCompra = async id => {
    if (!window.confirm("¿Eliminar?")) return;
    await supabase.from("proveedores").delete().eq("id", id);
    setProveedores(p => p.filter(x => x.id !== id));
  };

  const totalCompras = proveedores.reduce((s, p) => s + Number(p.monto || 0), 0);
  const totalRefs = refs.reduce((s, r) => s + Number(r.costo || 0), 0);

  return (
    <div>
      <h2 className="sec-title">🔧 Refacciones</h2>
      <div className="stat-grid">
        <div className="stat-card accent"><div className="stat-val">{refs.length}</div><div className="stat-lbl">En inventario</div></div>
        <div className="stat-card red"><div className="stat-val">${fmt(totalRefs)}</div><div className="stat-lbl">Valor inventario</div></div>
        <div className="stat-card orange"><div className="stat-val">{proveedores.length}</div><div className="stat-lbl">Compras</div></div>
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
          {proveedores.length === 0 ? <p className="empty">Sin compras registradas.</p> : (
            <div className="list">
              {proveedores.map(p => (
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
            <div className="field"><label>Stock</label><input type="number" value={form.stock} onChange={e => upd("stock", e.target.value)} placeholder="1" /></div>
            <div className="field"><label>Máquina</label><select value={form.maq} onChange={e => upd("maq", e.target.value)}>{MAQUINAS.map(m => <option key={m}>{m}</option>)}</select></div>
            <div className="field"><label>Proveedor</label><input value={form.proveedor} onChange={e => upd("proveedor", e.target.value)} placeholder="Ferrelex, Amazon…" /></div>
            <div className="field"><label>Fecha compra</label><input type="date" value={form.fecha} onChange={e => upd("fecha", e.target.value)} /></div>
            <div className="field full"><label>Notas</label><textarea value={form.notas} onChange={e => upd("notas", e.target.value)} placeholder="Número de parte, observaciones…" /></div>
          </div>
          <button className="btn btn-primary btn-block" onClick={saveRef} disabled={loading}>{loading ? "Guardando…" : "+ Agregar al inventario"}</button>
          <h3 className="sub-title" style={{ marginTop: 20 }}>Inventario</h3>
          {refs.length === 0 ? <p className="empty">Sin refacciones en inventario.</p> : (
            <div className="list">
              {refs.map(r => (
                <div key={r.id} className="list-item">
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div><strong>{r.nombre}</strong><span className="badge b-accent">${fmt(r.costo)}</span><span className={`badge ${Number(r.stock) <= 1 ? "b-red" : "b-green"}`}>Stock: {r.stock || 1}</span></div>
                    <button className="btn btn-danger btn-sm" onClick={() => delRef(r.id)}>✕</button>
                  </div>
                  <div className="muted">{r.maq} · {r.proveedor} · {r.fecha}</div>
                  {r.notas && <div className="muted">{r.notas}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// FALLAS
// ════════════════════════════════════════════════════════════════════════════
function Fallas({ fallas, setFallas }) {
  const [form, setForm] = useState({ fecha: today(), maq: "SIAT L36 #1", comp: "Rodillo anilox", min_paro: "", sev: "leve", op: "", descripcion: "", accion: "", status: "abierta" });
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);

  const showToast = t => { setToast(t); setTimeout(() => setToast(""), 2200); };
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.descripcion || !form.min_paro) { showToast("⚠ Descripción y minutos son obligatorios"); return; }
    setLoading(true);
    const nuevo = { ...form, id: uid(), created: today() };
    const { error } = await supabase.from("fallas").insert([nuevo]);
    if (error) { showToast("❌ Error al guardar"); setLoading(false); return; }
    setFallas(f => [nuevo, ...f]);
    setForm(f => ({ ...f, min_paro: "", descripcion: "", accion: "", status: "abierta" }));
    showToast("✓ Falla guardada en la nube ☁️");
    setLoading(false);
  };

  const del = async id => {
    if (!window.confirm("¿Eliminar?")) return;
    await supabase.from("fallas").delete().eq("id", id);
    setFallas(f => f.filter(x => x.id !== id));
  };

  const close = async id => {
    await supabase.from("fallas").update({ status: "cerrada" }).eq("id", id);
    setFallas(f => f.map(x => x.id === id ? { ...x, status: "cerrada" } : x));
  };

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
        <div className="field"><label>Operador</label><input value={form.op} onChange={e => upd("op", e.target.value)} placeholder="William / Alfredo" /></div>
        <div className="field full"><label>Descripción *</label><textarea value={form.descripcion} onChange={e => upd("descripcion", e.target.value)} placeholder="¿Qué ocurrió?" /></div>
        <div className="field full"><label>Acción correctiva</label><textarea value={form.accion} onChange={e => upd("accion", e.target.value)} placeholder="¿Cómo se resolvió?" /></div>
      </div>
      <button className="btn btn-primary btn-block" onClick={save} disabled={loading}>{loading ? "Guardando…" : "+ Registrar falla"}</button>
      <h3 className="sub-title" style={{ marginTop: 20 }}>Historial</h3>
      {fallas.length === 0 ? <p className="empty">Sin fallas. ¡Buena señal! 🟢</p> : (
        <div className="list">
          {fallas.map(f => (
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

// ════════════════════════════════════════════════════════════════════════════
// APP ROOT
// ════════════════════════════════════════════════════════════════════════════
const TABS = [
  { id: "dash", ico: "📊", lbl: "Dashboard" },
  { id: "ped", ico: "📋", lbl: "Pedidos" },
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
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const cargar = async () => {
      const [p, f, r, prov] = await Promise.all([
  supabase.from("pedidos").select("*").order("created", { ascending: false }),
  supabase.from("fallas").select("*").order("created", { ascending: false }),
  supabase.from("refacciones").select("*").order("created", { ascending: false }),
  supabase.from("proveedores").select("*").order("created", { ascending: false }),
]);
if (p.data) setPedidos(p.data);
if (f.data) setFallas(f.data);
if (r.data) setRefs(r.data);
if (prov.data) setProveedores(prov.data);
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
        {tab === "dash" && <Dashboard pedidos={pedidos} fallas={fallas} refacciones={refs} />}
        {tab === "ped" && <Pedidos pedidos={pedidos} setPedidos={setPedidos} />}
       {tab === "ref" && <Refacciones refs={refs} setRefs={setRefs} proveedores={proveedores} setProveedores={setProveedores} />}
        {tab === "fal" && <Fallas fallas={fallas} setFallas={setFallas} />}
        {tab === "ia" && <AsistenteIA />}
       
      </main>
    </div>
  );
}