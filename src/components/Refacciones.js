import { useState } from "react";
import { supabase } from '../lib/supabase';
import { uid, today, fmt } from '../lib/utils';
import { MAQUINAS } from '../lib/constants';

export default function Refacciones({ refs, setRefs, proveedores, setProveedores }) {
  const [subTab, setSubTab] = useState("compras");
  const [form, setForm] = useState({ nombre: "", costo: "", maq: "SIAT L36 #1", proveedor: "", fecha: today(), notas: "", stock: "1", stock_min: "1" });
  const [formProv, setFormProv] = useState({ nombre: "", telefono: "", direccion: "", monto: "", fecha: today(), que_compro: "" });
  const [imagen, setImagen] = useState(null);
  const [preview, setPreview] = useState(null);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const [busquedaInv, setBusquedaInv] = useState("");
  const [busquedaCompras, setBusquedaCompras] = useState("");
  const [ajustandoId, setAjustandoId] = useState(null);
  const [cantidadAjuste, setCantidadAjuste] = useState("");
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
    const nuevo = { id: uid(), created: today(), nombre: form.nombre, costo: form.costo, maq: form.maq, proveedor: form.proveedor, fecha: form.fecha, notas: form.notas, stock: form.stock, stock_min: form.stock_min !== "" ? Number(form.stock_min) : 1 };
    const { error } = await supabase.from("refacciones").insert([nuevo]);
    if (error) { showToast("❌ Error: " + error.message); setLoading(false); return; }
    setRefs(r => [nuevo, ...r]);
    setForm(f => ({ ...f, nombre: "", costo: "", proveedor: "", notas: "", stock: "1", stock_min: "1" }));
    showToast("✓ Refacción guardada ☁️");
    setLoading(false);
  };

  const delRef = async id => { if (!window.confirm("¿Eliminar?")) return; await supabase.from("refacciones").delete().eq("id", id); setRefs(r => r.filter(x => x.id !== id)); };
  const ajustarStock = async (r) => {
    const cantidad = parseInt(cantidadAjuste, 10);
    if (isNaN(cantidad) || cantidad === 0) { showToast("⚠ Ingresa una cantidad válida"); return; }
    const nuevoStock = Number(r.stock || 0) + cantidad;
    if (nuevoStock < 0) { showToast("⚠ Stock no puede ser negativo"); return; }
    const { error } = await supabase.from("refacciones").update({ stock: nuevoStock }).eq("id", r.id);
    if (error) { showToast("❌ Error al actualizar"); return; }
    setRefs(refs => refs.map(x => x.id === r.id ? { ...x, stock: nuevoStock } : x));
    setAjustandoId(null); setCantidadAjuste("");
    showToast(`✓ Stock: ${nuevoStock} unidades`);
  };
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
  const stockBajo = refs.filter(r => { const min = r.stock_min ?? 1; return min > 0 && Number(r.stock || 0) <= min; }).length;
  const refsFiltradas = refs.filter(r => !busquedaInv || [r.nombre, r.maq, r.proveedor].some(v => String(v || "").toLowerCase().includes(busquedaInv.toLowerCase())));
  const comprasFiltradas = proveedores.filter(p => !busquedaCompras || [p.nombre, p.que_compro].some(v => String(v || "").toLowerCase().includes(busquedaCompras.toLowerCase())));
  const listaProveedores = Object.values(proveedores.reduce((acc, p) => {
    const key = (p.nombre || "").trim().toLowerCase();
    if (!acc[key]) acc[key] = { nombre: p.nombre, telefono: "", direccion: "", compras: [] };
    if (p.telefono) acc[key].telefono = p.telefono;
    if (p.direccion) acc[key].direccion = p.direccion;
    acc[key].compras.push({ fecha: p.fecha, que_compro: p.que_compro, monto: p.monto, id: p.id });
    return acc;
  }, {})).map(p => ({ ...p, total: p.compras.reduce((s, c) => s + Number(c.monto || 0), 0) })).sort((a, b) => b.total - a.total);

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
        <button className={`btn ${subTab === "proveedores" ? "btn-primary" : "btn-ghost"}`} onClick={() => setSubTab("proveedores")}>🏪 Proveedores</button>
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
      {subTab === "proveedores" && (
        <div>
          <h3 className="sub-title">Proveedores ({listaProveedores.length})</h3>
          {listaProveedores.length === 0 ? <p className="empty">Sin compras registradas.</p> : (
            <div className="list">
              {listaProveedores.map(p => (
                <div key={p.nombre} className="list-item">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <strong style={{ fontSize: 15 }}>{p.nombre}</strong>
                    <span className="badge b-accent">Total: ${fmt(p.total)}</span>
                  </div>
                  {p.telefono && <div className="muted">📞 {p.telefono}</div>}
                  {p.direccion && <div className="muted">📍 {p.direccion}</div>}
                  <div style={{ marginTop: 8, borderTop: "1px solid #2a2d3a", paddingTop: 8 }}>
                    <div style={{ fontSize: 11, color: "#c9922a", marginBottom: 6, fontWeight: 700 }}>Compras ({p.compras.length})</div>
                    {p.compras.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "")).map((c, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4, gap: 8 }}>
                        <span style={{ color: "#aaa" }}>{c.fecha} · {c.que_compro || "—"}</span>
                        <span style={{ color: "#c9922a", whiteSpace: "nowrap" }}>${fmt(c.monto)}</span>
                      </div>
                    ))}
                  </div>
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
                const min = r.stock_min ?? 1; const bajo = min > 0 && Number(r.stock || 0) <= min;
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
                        <button className="btn btn-ghost btn-sm" title="Usar 1" onClick={() => usarRef(r)}>-1</button>
                        <button className="btn btn-ghost btn-sm" title="Agregar stock" onClick={() => { setAjustandoId(r.id); setCantidadAjuste(""); }} style={{ color: "#4be87a" }}>+</button>
                        <button className="btn btn-danger btn-sm" onClick={() => delRef(r.id)}>✕</button>
                      </div>
                    </div>
                    {ajustandoId === r.id && (
                      <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
                        <input type="number" value={cantidadAjuste} onChange={e => setCantidadAjuste(e.target.value)} onKeyDown={e => { if (e.key === "Enter") ajustarStock(r); if (e.key === "Escape") setAjustandoId(null); }} placeholder="ej: 3 ó -1" autoFocus style={{ width: 100, background: "#1a1d26", border: "1px solid #c9922a", borderRadius: 6, padding: "5px 8px", color: "#e0e0e0", fontSize: 13 }} />
                        <button className="btn btn-primary btn-sm" onClick={() => ajustarStock(r)}>✓ Guardar</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setAjustandoId(null)}>✕</button>
                      </div>
                    )}
                    <div className="muted">{r.maq} · {r.proveedor} · {r.fecha} · Min: {r.stock_min ?? 1}</div>
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
