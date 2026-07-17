import { useState, useEffect } from "react";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../lib/supabase';
import { authHeaders } from '../lib/auth';
import { uid, today, fmt, subirConUrlFirmada, unificarPorTexto } from '../lib/utils';
import { MAQUINAS } from '../lib/constants';
import { sendWhatsApp } from '../utils/whatsapp';
import { IcoPlus } from './Icons';

const Ico = ({ icon: I, size = 13 }) => <span style={{ display: "inline-flex", fontSize: size, verticalAlign: -2 }}><I /></span>;
const mapsUrl = (direccion) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`;

export default function Refacciones({ refs, setRefs, proveedores, setProveedores }) {
  const [subTab, setSubTab] = useState("compras");
  const [form, setForm] = useState({ nombre: "", costo: "", maq: "SIAT L36 #1", proveedor: "", fecha: today(), notas: "", stock: "1", stock_min: "1" });
  const [formProv, setFormProv] = useState({ nombre: "", telefono: "", direccion: "", monto: "", fecha: today(), que_compro: "", categoria: "" });
  const CATEGORIAS = ["Neumática", "Eléctrica", "Electrónica", "Mecánica", "Torno", "Servicio", "Componentes"];
  const CATEGORIA_COLOR = { "Neumática": "#4b8fe8", "Eléctrica": "#e8b84b", "Electrónica": "#9b59b6", "Mecánica": "#27ae60", "Torno": "#f39c12", "Servicio": "#4be8d8", "Componentes": "#c0392b" };
  const [imagen, setImagen] = useState(null);
  const [preview, setPreview] = useState(null);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const [busquedaInv, setBusquedaInv] = useState("");
  const [busquedaCompras, setBusquedaCompras] = useState("");
  const [modalCompra, setModalCompra] = useState(null);
  const [filtroCategoria, setFiltroCategoria] = useState("Todos");
  const [busquedaProv, setBusquedaProv] = useState("");
  const [ajustandoId, setAjustandoId] = useState(null);
  const [cantidadAjuste, setCantidadAjuste] = useState("");
  const [formQueja, setFormQueja] = useState({ proveedor: "", fecha: today(), lote: "", material: "", cantidad_afectada: "", factura_remision: "", detectado_por: "", accion_solicitada: "Reposición", descripcion: "", elaboro: "", autorizo: "" });
  const [imagenesQueja, setImagenesQueja] = useState([]);
  const [previewsQueja, setPreviewsQueja] = useState([]);
  const [guardandoQueja, setGuardandoQueja] = useState(false);
  const [quejaView, setQuejaView] = useState("nueva");
  const [quejas, setQuejas] = useState([]);
  const [quejasCargadas, setQuejasCargadas] = useState(false);
  const [filtroProveedorQuejas, setFiltroProveedorQuejas] = useState("");
  const [descargandoQuejaId, setDescargandoQuejaId] = useState(null);
  const showToast = t => { setToast(t); setTimeout(() => setToast(""), 2200); };
  const proveedoresSugeridos = [...new Set([...proveedores.map(p => p.nombre), ...refs.map(r => r.proveedor)].filter(Boolean))].sort();
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const updP = (k, v) => setFormProv(f => ({ ...f, [k]: v }));
  const updQ = (k, v) => setFormQueja(f => ({ ...f, [k]: v }));

  const handleImagen = (e) => { const file = e.target.files[0]; if (!file) return; setImagen(file); setPreview(URL.createObjectURL(file)); };
  const handleImagenesQueja = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setImagenesQueja(prev => [...prev, ...files]);
    setPreviewsQueja(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
    e.target.value = "";
  };
  const quitarImagenQueja = (idx) => {
    setImagenesQueja(prev => prev.filter((_, i) => i !== idx));
    setPreviewsQueja(prev => prev.filter((_, i) => i !== idx));
  };

  // Carga el historial de quejas la primera vez que se abre esa vista
  useEffect(() => {
    if (quejaView === "historial" && !quejasCargadas) {
      supabase.from("quejas_mp").select("*").order("created", { ascending: false }).then(({ data, error }) => {
        if (!error && data) setQuejas(data);
        setQuejasCargadas(true);
      });
    }
  }, [quejaView, quejasCargadas]);

  // Folio QMP-<año>-### : busca el último folio del año actual y lo incrementa
  const generarFolioQueja = async () => {
    const prefix = `QMP-${new Date().getFullYear()}-`;
    const { data } = await supabase.from("quejas_mp").select("folio").like("folio", `${prefix}%`).order("folio", { ascending: false }).limit(1);
    let n = 1;
    if (data && data.length) {
      const last = parseInt(String(data[0].folio).split("-").pop(), 10);
      if (!isNaN(last)) n = last + 1;
    }
    return `${prefix}${String(n).padStart(3, "0")}`;
  };

  // Convierte un File (input) a {dataUrl, w, h, formato} para insertarlo en el PDF
  const fileToImgData = (file) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const dataUrl = r.result;
      const img = new Image();
      img.onload = () => resolve({ dataUrl, w: img.width, h: img.height, formato: file.type.includes("png") ? "PNG" : "JPEG" });
      img.onerror = reject;
      img.src = dataUrl;
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });

  // Descarga la imagen original (sin comprimir) desde Supabase Storage para el PDF
  const urlToImgData = (path) => new Promise((resolve, reject) => {
    const { data } = supabase.storage.from("quejas").getPublicUrl(path);
    fetch(data.publicUrl).then(resp => resp.blob()).then(blob => {
      const r = new FileReader();
      r.onload = () => {
        const dataUrl = r.result;
        const img = new Image();
        img.onload = () => resolve({ dataUrl, w: img.width, h: img.height, formato: blob.type.includes("png") ? "PNG" : "JPEG" });
        img.onerror = reject;
        img.src = dataUrl;
      };
      r.onerror = reject;
      r.readAsDataURL(blob);
    }).catch(reject);
  });

  const PX_TO_MM = 25.4 / 96;
  const MAX_IMG_H_MM = 300 * PX_TO_MM; // ~79.4mm = 300px de alto, tamaño original

  const piePaginaQueja = (doc, W, H) => {
    doc.setFontSize(7); doc.setTextColor(150, 150, 150);
    doc.text("EEMSA System · Tel. (871) 103-9578 · jeduardosl@eemsa.com.mx", W / 2, H - 6, { align: "center" });
  };

  // Construye el PDF de una queja (datos + imágenes ya cargadas en memoria)
  const construirPDFQueja = (queja, imgs) => {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const W = 210, H = 297, mg = 14;
    const PAGE_BOTTOM = 270;

    const encabezado = (titulo) => {
      doc.setFillColor(26, 39, 68); doc.rect(0, 0, W, 30, "F");
      doc.setTextColor(201, 146, 42); doc.setFontSize(18); doc.setFont(undefined, "bold");
      doc.text("EEMSA System", mg, 13);
      doc.setFontSize(10); doc.setFont(undefined, "normal");
      doc.text(titulo, mg, 22);
      doc.setTextColor(255, 255, 255); doc.setFontSize(10);
      doc.text(`Folio: ${queja.folio}`, W - mg, 13, { align: "right" });
      doc.text(`Fecha: ${queja.fecha}`, W - mg, 20, { align: "right" });
      doc.setTextColor(0, 0, 0);
    };

    encabezado("Reporte de Queja — Materia Prima");

    autoTable(doc, {
      startY: 36,
      body: [
        ["Proveedor", queja.proveedor || "—"],
        ["Fecha", queja.fecha || "—"],
        ["No. Pedido / Lote", queja.lote || "—"],
        ["Material / Producto", queja.material || "—"],
        ["Cantidad afectada", queja.cantidad_afectada || "—"],
        ["No. de factura / remisión", queja.factura_remision || "—"],
        ["Detectado por", queja.detectado_por || "—"],
        ["Acción solicitada", queja.accion_solicitada || "—"],
      ],
      theme: "plain", styles: { fontSize: 10 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 55, textColor: [100, 100, 100] } },
    });

    let y = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(11); doc.setTextColor(26, 39, 68); doc.setFont(undefined, "bold");
    doc.text("Descripción del problema", mg, y);
    doc.setFont(undefined, "normal"); doc.setFontSize(10); doc.setTextColor(0, 0, 0);
    const lineas = doc.splitTextToSize(queja.descripcion || "—", W - mg * 2);
    doc.text(lineas, mg, y + 7);
    y += 7 + lineas.length * 5 + 10;

    if (imgs.length > 0) {
      for (let i = 0; i < imgs.length; i++) {
        const img = imgs[i];
        let w = W - mg * 2, h = (img.h / img.w) * w;
        if (h > MAX_IMG_H_MM) { h = MAX_IMG_H_MM; w = (img.w / img.h) * h; }
        if (y + 7 + h > PAGE_BOTTOM) {
          piePaginaQueja(doc, W, H);
          doc.addPage();
          encabezado("Reporte de Queja — Evidencia fotográfica (cont.)");
          y = 36;
        }
        doc.setFontSize(10); doc.setTextColor(26, 39, 68); doc.setFont(undefined, "bold");
        doc.text(`Evidencia ${i + 1} de ${imgs.length}`, mg, y);
        y += 4;
        const x = mg + (W - mg * 2 - w) / 2;
        doc.setDrawColor(200, 200, 200);
        doc.rect(x - 1, y - 1, w + 2, h + 2);
        doc.addImage(img.dataUrl, img.formato, x, y, w, h);
        y += h + 8;
      }
    }

    if (y + 22 > PAGE_BOTTOM) { piePaginaQueja(doc, W, H); doc.addPage(); encabezado("Reporte de Queja — Materia Prima"); y = 36; }
    const sigY = y + 16;
    doc.setDrawColor(180, 180, 180);
    doc.line(mg, sigY, 92, sigY); doc.line(118, sigY, W - mg, sigY);
    doc.setFontSize(9); doc.setTextColor(100, 100, 100);
    doc.text("Elaboró", mg, sigY + 6);
    doc.text("Autorizó", 118, sigY + 6);
    doc.setFontSize(10); doc.setTextColor(0, 0, 0); doc.setFont(undefined, "bold");
    doc.text(queja.elaboro || "—", mg, sigY + 12);
    doc.text(queja.autorizo || "—", 118, sigY + 12);
    doc.setFont(undefined, "normal");

    piePaginaQueja(doc, W, H);
    return doc;
  };

  // Genera y descarga el PDF de una queja. Si recibe "files" (recién creada) usa
  // esas imágenes directamente; si no, las trae desde Supabase Storage.
  const descargarQueja = async (queja, files = null) => {
    setDescargandoQuejaId(queja.folio);
    try {
      let imgs = [];
      if (files && files.length) {
        imgs = await Promise.all(files.map(fileToImgData));
      } else if (queja.imagenes && queja.imagenes.length) {
        imgs = await Promise.all(queja.imagenes.map(urlToImgData));
      }
      const doc = construirPDFQueja(queja, imgs);
      doc.save(`Queja_${queja.folio}_${(queja.proveedor || "proveedor").replace(/\s+/g, "_")}.pdf`);
    } catch (e) {
      showToast("❌ Error al generar PDF: " + e.message);
    }
    setDescargandoQuejaId(null);
  };

  const guardarQueja = async () => {
    if (!formQueja.proveedor || !formQueja.descripcion) { showToast("⚠ Proveedor y descripción obligatorios"); return; }
    setGuardandoQueja(true);
    try {
      const folio = await generarFolioQueja();
      const imagenes = [];
      if (imagenesQueja.length) {
        const paths = imagenesQueja.map(file => `${folio}/${uid()}_${file.name}`);
        const resFirmas = await fetch('/api/quejas-mp?action=upload-url', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ paths }) });
        const { firmas, error: errFirmas } = await resFirmas.json();
        if (!resFirmas.ok) throw new Error(errFirmas || 'Error al preparar subida de imágenes');
        for (let i = 0; i < imagenesQueja.length; i++) {
          const { path, token } = firmas[i];
          const { error } = await supabase.storage.from("quejas").uploadToSignedUrl(path, token, imagenesQueja[i]);
          if (error) throw error;
          imagenes.push(path);
        }
      }
      const nuevo = {
        folio, fecha: formQueja.fecha, proveedor: unificarPorTexto(formQueja.proveedor, proveedoresSugeridos), lote: formQueja.lote, material: formQueja.material,
        cantidad_afectada: formQueja.cantidad_afectada, factura_remision: formQueja.factura_remision,
        detectado_por: formQueja.detectado_por, accion_solicitada: formQueja.accion_solicitada,
        descripcion: formQueja.descripcion, elaboro: formQueja.elaboro, autorizo: formQueja.autorizo,
        imagenes,
      };
      const res = await fetch('/api/quejas-mp', { method: 'POST', headers: authHeaders(), body: JSON.stringify(nuevo) });
      const guardada = await res.json();
      if (!res.ok) throw new Error(guardada.error || 'Error al guardar');
      if (quejasCargadas) setQuejas(q => [guardada, ...q]);
      showToast(`✓ Queja ${folio} guardada`);
      await descargarQueja(guardada, imagenesQueja);
      setFormQueja({ proveedor: "", fecha: today(), lote: "", material: "", cantidad_afectada: "", factura_remision: "", detectado_por: "", accion_solicitada: "Reposición", descripcion: "", elaboro: "", autorizo: "" });
      setImagenesQueja([]); setPreviewsQueja([]);
    } catch (e) {
      showToast("❌ Error: " + e.message);
    }
    setGuardandoQueja(false);
  };

  const actualizarEstatusQueja = async (id, estatus) => {
    const res = await fetch('/api/quejas-mp', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ id, estatus }) });
    if (!res.ok) { showToast("❌ Error al actualizar estatus"); return; }
    setQuejas(q => q.map(x => x.id === id ? { ...x, estatus } : x));
  };

  const eliminarQueja = async (q) => {
    if (!window.confirm(`¿Eliminar la queja ${q.folio}? Esta acción no se puede deshacer.`)) return;
    const res = await fetch('/api/quejas-mp', { method: 'DELETE', headers: authHeaders(), body: JSON.stringify({ id: q.id }) });
    if (!res.ok) { showToast("❌ Error al eliminar"); return; }
    setQuejas(qs => qs.filter(x => x.id !== q.id));
    showToast(`✓ Queja ${q.folio} eliminada`);
  };

  const quejasFiltradas = quejas.filter(q => !filtroProveedorQuejas || String(q.proveedor || "").toLowerCase().includes(filtroProveedorQuejas.toLowerCase()));

  const analizar = async () => {
    if (!imagen) { showToast("⚠ Selecciona una imagen primero"); return; }
    setLoading(true);
    try {
      const base64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.onerror = rej; r.readAsDataURL(imagen); });
      const response = await fetch("/api/chat", { method: "POST", headers: authHeaders(), body: JSON.stringify({ image: base64, mediaType: imagen.type, extractTicket: true }) });
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
    if (imagen) { const { data } = await subirConUrlFirmada(supabase, "refacciones", `tickets/${uid()}_${imagen.name}`, imagen, authHeaders()); if (data) { const { data: url } = supabase.storage.from("refacciones").getPublicUrl(data.path); imagen_url = url.publicUrl; } }
    const nombreProv = unificarPorTexto(formProv.nombre, proveedoresSugeridos);
    try {
      const res = await fetch('/api/refacciones?tabla=proveedores', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ nombre: nombreProv, telefono: formProv.telefono, direccion: formProv.direccion, monto: formProv.monto, fecha: formProv.fecha, que_compro: formProv.que_compro, categoria: formProv.categoria || null, imagen_url }),
      });
      const nuevo = await res.json();
      if (!res.ok) { showToast("❌ Error: " + (nuevo.error || "desconocido")); setLoading(false); return; }
      setProveedores(p => [nuevo, ...p]);
      setFormProv({ nombre: "", telefono: "", direccion: "", monto: "", fecha: today(), que_compro: "", categoria: "" });
      setImagen(null); setPreview(null);
      showToast("✓ Compra guardada ☁️");
    } catch (e) { showToast("❌ Error: " + e.message); }
    setLoading(false);
  };

  const saveRef = async () => {
    if (!form.nombre || !form.costo) { showToast("⚠ Nombre y costo obligatorios"); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/refacciones', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ nombre: form.nombre, costo: form.costo, maq: form.maq, proveedor: unificarPorTexto(form.proveedor, proveedoresSugeridos), fecha: form.fecha, notas: form.notas, stock: form.stock, stock_min: form.stock_min }),
      });
      const nuevo = await res.json();
      if (!res.ok) { showToast("❌ Error: " + (nuevo.error || "desconocido")); setLoading(false); return; }
      setRefs(r => [nuevo, ...r]);
      setForm(f => ({ ...f, nombre: "", costo: "", proveedor: "", notas: "", stock: "1", stock_min: "1" }));
      showToast("✓ Refacción guardada ☁️");
    } catch (e) { showToast("❌ Error: " + e.message); }
    setLoading(false);
  };

  const delRef = async id => {
    if (!window.confirm("¿Eliminar?")) return;
    const res = await fetch('/api/refacciones', { method: 'DELETE', headers: authHeaders(), body: JSON.stringify({ id }) });
    if (!res.ok) { showToast("❌ Error al eliminar"); return; }
    setRefs(r => r.filter(x => x.id !== id));
  };
  const ajustarStock = async (r) => {
    const cantidad = parseInt(cantidadAjuste, 10);
    if (isNaN(cantidad) || cantidad === 0) { showToast("⚠ Ingresa una cantidad válida"); return; }
    const nuevoStock = Number(r.stock || 0) + cantidad;
    if (nuevoStock < 0) { showToast("⚠ Stock no puede ser negativo"); return; }
    const res = await fetch('/api/refacciones', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ id: r.id, stock: nuevoStock }) });
    if (!res.ok) { showToast("❌ Error al actualizar"); return; }
    setRefs(refs => refs.map(x => x.id === r.id ? { ...x, stock: nuevoStock } : x));
    setAjustandoId(null); setCantidadAjuste("");
    showToast(`✓ Stock: ${nuevoStock} unidades`);
    const min = r.stock_min ?? 1;
    if (min > 0 && nuevoStock <= min) {
      sendWhatsApp(`⚠️ Stock bajo: ${r.nombre} — quedan ${nuevoStock} unidades (mín: ${min})`);
    }
  };
  const usarRef = async (r) => {
    const nuevoStock = Number(r.stock) - 1;
    if (nuevoStock < 0) { showToast("⚠ Sin stock disponible"); return; }
    const res = await fetch('/api/refacciones', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ id: r.id, stock: nuevoStock }) });
    if (!res.ok) { showToast("❌ Error al actualizar"); return; }
    setRefs(refs => refs.map(x => x.id === r.id ? { ...x, stock: nuevoStock } : x));
    showToast(`✓ Stock actualizado: ${nuevoStock} restantes`);
    const min = r.stock_min ?? 1;
    if (min > 0 && nuevoStock <= min) {
      sendWhatsApp(`⚠️ Stock bajo: ${r.nombre} — quedan ${nuevoStock} unidades (mín: ${min})`);
    }
  };
  const delCompra = async id => {
    if (!window.confirm("¿Eliminar?")) return;
    const res = await fetch('/api/refacciones?tabla=proveedores', { method: 'DELETE', headers: authHeaders(), body: JSON.stringify({ id }) });
    if (!res.ok) { showToast("❌ Error al eliminar"); return; }
    setProveedores(p => p.filter(x => x.id !== id));
  };

  const guardarCompra = async () => {
    if (!modalCompra) return;
    const actualizado = {
      nombre:     modalCompra.nombre,
      telefono:   modalCompra.telefono || null,
      direccion:  modalCompra.direccion || null,
      monto:      modalCompra.monto,
      fecha:      modalCompra.fecha,
      que_compro: modalCompra.que_compro || null,
      categoria:  modalCompra.categoria || null,
    };
    const res = await fetch('/api/refacciones?tabla=proveedores', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ id: modalCompra.id, ...actualizado }) });
    const data = await res.json();
    if (!res.ok) { showToast("❌ Error: " + (data.error || "desconocido")); return; }
    setProveedores(ps => ps.map(p => p.id === modalCompra.id ? { ...p, ...actualizado } : p));
    setModalCompra(null);
    showToast("✓ Compra actualizada");
  };

  const hoy = new Date();
  const [mesSel, setMesSel] = useState(() => hoy.toISOString().slice(0, 7));
  const cambiarMes = (d) => {
    const [y, m] = mesSel.split("-").map(Number);
    const nd = new Date(y, m - 1 + d, 1);
    setMesSel(`${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, "0")}`);
  };
  const nomMes = new Date(mesSel + "-15").toLocaleDateString("es-MX", { month: "long", year: "numeric" });
  const comprasMes = proveedores.filter(p => (p.fecha || "").startsWith(mesSel));
  const totalCompras = comprasMes.reduce((s, p) => s + Number(p.monto || 0), 0);
  const totalRefs = refs.reduce((s, r) => s + (Number(r.costo || 0) * Number(r.stock || 1)), 0);
  const stockBajo = refs.filter(r => { const min = r.stock_min ?? 1; return min > 0 && Number(r.stock || 0) <= min; }).length;
  const refsFiltradas = refs.filter(r => !busquedaInv || [r.nombre, r.maq, r.proveedor].some(v => String(v || "").toLowerCase().includes(busquedaInv.toLowerCase())));
  const comprasFiltradas = comprasMes.filter(p => !busquedaCompras || [p.nombre, p.que_compro].some(v => String(v || "").toLowerCase().includes(busquedaCompras.toLowerCase())));
  const listaProveedores = Object.values(proveedores.reduce((acc, p) => {
    const key = (p.nombre || "").trim().toLowerCase();
    if (!acc[key]) acc[key] = { nombre: p.nombre, telefono: "", direccion: "", categoria: "", compras: [] };
    if (p.telefono) acc[key].telefono = p.telefono;
    if (p.direccion) acc[key].direccion = p.direccion;
    if (p.categoria) acc[key].categoria = p.categoria;
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
        <div className="stat-card blue"><div className="stat-val">${fmt(totalCompras)}</div><div className="stat-lbl" style={{ textTransform: "capitalize" }}>{nomMes}</div></div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, marginTop: 12 }}>
        <button className={`btn ${subTab === "compras" ? "btn-primary" : "btn-ghost"}`} onClick={() => setSubTab("compras")}>🛒 Compras</button>
        <button className={`btn ${subTab === "proveedores" ? "btn-primary" : "btn-ghost"}`} onClick={() => setSubTab("proveedores")}>🏪 Proveedores</button>
        <button className={`btn ${subTab === "inventario" ? "btn-primary" : "btn-ghost"}`} onClick={() => setSubTab("inventario")}>📦 Inventario</button>
        <button className={`btn ${subTab === "quejas" ? "btn-primary" : "btn-ghost"}`} onClick={() => setSubTab("quejas")}>⚠️ Queja MP</button>
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
            <div className="field"><label>Proveedor *</label>
              <input value={formProv.nombre} onChange={e => updP("nombre", e.target.value)} placeholder="Nombre del proveedor" list="proveedores-list" />
              <datalist id="proveedores-list">{proveedoresSugeridos.map(p => <option key={p} value={p} />)}</datalist>
            </div>
            <div className="field"><label>Teléfono</label><input value={formProv.telefono} onChange={e => updP("telefono", e.target.value)} placeholder="667 123 4567" /></div>
            <div className="field"><label>Monto ($MXN) *</label><input type="number" value={formProv.monto} onChange={e => updP("monto", e.target.value)} placeholder="850.00" /></div>
            <div className="field"><label>Fecha</label><input type="date" value={formProv.fecha} onChange={e => updP("fecha", e.target.value)} /></div>
            <div className="field full"><label>Dirección</label><input value={formProv.direccion} onChange={e => updP("direccion", e.target.value)} placeholder="Calle, colonia, ciudad" /></div>
            <div className="field full"><label>Qué se compró</label><input value={formProv.que_compro} onChange={e => updP("que_compro", e.target.value)} placeholder="Rodillo anilox, correa…" /></div>
            <div className="field"><label>Categoría</label>
              <select value={formProv.categoria} onChange={e => updP("categoria", e.target.value)}>
                <option value="">— Sin categoría —</option>
                {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <button className="btn btn-primary btn-block" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }} onClick={saveCompra} disabled={loading}>{loading ? "Guardando…" : <><Ico icon={IcoPlus} size={15} /> Registrar compra</>}</button>
          <h3 className="sub-title" style={{ marginTop: 20 }}>Historial de compras</h3>
          {/* Navegador de mes */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#1a1d26", borderRadius: 10, padding: "8px 12px", marginBottom: 10 }}>
            <button onClick={() => cambiarMes(-1)} style={{ background: "transparent", border: "none", color: "#c9922a", fontSize: 20, cursor: "pointer", padding: "0 6px" }}>‹</button>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#e0e0e0", textTransform: "capitalize" }}>{nomMes} · <span style={{ color: "#c9922a" }}>${fmt(totalCompras)}</span></span>
            <button onClick={() => cambiarMes(1)} disabled={mesSel >= hoy.toISOString().slice(0, 7)} style={{ background: "transparent", border: "none", color: mesSel >= hoy.toISOString().slice(0, 7) ? "#333" : "#c9922a", fontSize: 20, cursor: mesSel >= hoy.toISOString().slice(0, 7) ? "default" : "pointer", padding: "0 6px" }}>›</button>
          </div>
          <input value={busquedaCompras} onChange={e => setBusquedaCompras(e.target.value)} placeholder="🔍 Buscar proveedor, qué se compró…" style={{ width: "100%", marginBottom: 8, background: "#1a1d26", border: "1px solid #2a2d3a", borderRadius: 8, padding: "8px 12px", color: "#e0e0e0", fontSize: 13 }} />
          {proveedores.length === 0 ? <p className="empty">Sin compras registradas.</p> : (
            <div className="list">
              {comprasFiltradas.map(p => (
                <div key={p.id} className="list-item">
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <strong>{p.nombre}</strong>
                      <span className="badge b-accent">${fmt(p.monto)}</span>
                      {p.categoria && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 8px", borderRadius: 20, background: (CATEGORIA_COLOR[p.categoria] || "#555") + "22", color: CATEGORIA_COLOR[p.categoria] || "#aaa", border: `1px solid ${CATEGORIA_COLOR[p.categoria] || "#555"}` }}>
                          {p.categoria}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setModalCompra({ ...p })}>✏️</button>
                      <button className="btn btn-danger btn-sm" onClick={() => delCompra(p.id)}>✕</button>
                    </div>
                  </div>
                  <div className="muted">{p.fecha} · {p.telefono}</div>
                  {p.direccion && <div className="muted">📍 <a href={mapsUrl(p.direccion)} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>{p.direccion}</a></div>}
                  {p.que_compro && <div className="muted">🔧 {p.que_compro}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {subTab === "proveedores" && (() => {
        const provFiltrados = listaProveedores
          .filter(p => filtroCategoria === "Todos" || p.categoria === filtroCategoria)
          .filter(p => !busquedaProv || p.nombre.toLowerCase().includes(busquedaProv.toLowerCase()));
        return (
          <div>
            <h3 className="sub-title">Proveedores ({listaProveedores.length})</h3>

            {/* Búsqueda */}
            <input
              value={busquedaProv}
              onChange={e => setBusquedaProv(e.target.value)}
              placeholder="🔍 Buscar proveedor…"
              style={{ width: "100%", marginBottom: 10, background: "#1a1d26", border: "1px solid #2a2d3a", borderRadius: 8, padding: "8px 12px", color: "#e0e0e0", fontSize: 13 }}
            />

            {/* Filtros por categoría */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
              {["Todos", ...CATEGORIAS].map(cat => {
                const color = CATEGORIA_COLOR[cat] || "#c9922a";
                const activo = filtroCategoria === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setFiltroCategoria(cat)}
                    style={{
                      padding: "5px 14px", borderRadius: 20, border: `1.5px solid ${cat === "Todos" ? "#c9922a" : color}`,
                      background: activo ? (cat === "Todos" ? "#c9922a" : color) : "transparent",
                      color: activo ? "#000" : (cat === "Todos" ? "#c9922a" : color),
                      fontWeight: 700, fontSize: 12, cursor: "pointer",
                    }}
                  >
                    {cat === "Todos" ? "Todos" : cat}
                    <span style={{ marginLeft: 5, opacity: .7 }}>
                      {cat === "Todos" ? listaProveedores.length : listaProveedores.filter(p => p.categoria === cat).length}
                    </span>
                  </button>
                );
              })}
            </div>

            {provFiltrados.length === 0
              ? <p className="empty">Sin proveedores en esta categoría.</p>
              : (
                <div style={{ display: "grid", gap: 12 }}>
                  {provFiltrados.map(p => {
                    const color = CATEGORIA_COLOR[p.categoria] || "#3a3f5a";
                    return (
                      <div key={p.nombre} style={{
                        background: "#13161e",
                        borderRadius: 14,
                        borderLeft: `4px solid ${color}`,
                        padding: 16,
                        boxShadow: `0 0 0 1px ${color}22`,
                      }}>
                        {/* Header */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                          <div>
                            <div style={{ fontSize: 17, fontWeight: 800, color: "#e0e0e0" }}>{p.nombre}</div>
                            {p.categoria && (
                              <span style={{ display: "inline-block", marginTop: 4, fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 20, background: color + "22", color, border: `1px solid ${color}` }}>
                                {p.categoria}
                              </span>
                            )}
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 20, fontWeight: 900, color }}>
                              ${fmt(p.total)}
                            </div>
                            <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>total gastado</div>
                          </div>
                        </div>

                        {/* Contacto */}
                        {(p.telefono || p.direccion) && (
                          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
                            {p.telefono && <span style={{ fontSize: 12, color: "#aaa" }}>📞 {p.telefono}</span>}
                            {p.direccion && <a href={mapsUrl(p.direccion)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#aaa", textDecoration: "underline" }}>📍 {p.direccion}</a>}
                          </div>
                        )}

                        {/* Stats */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                          <div style={{ background: "#0d0f14", borderRadius: 8, padding: "8px 12px" }}>
                            <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".05em" }}>Compras</div>
                            <div style={{ fontSize: 22, fontWeight: 800, color: "#e0e0e0" }}>{p.compras.length}</div>
                          </div>
                          <div style={{ background: "#0d0f14", borderRadius: 8, padding: "8px 12px" }}>
                            <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".05em" }}>Última compra</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#e0e0e0", marginTop: 2 }}>
                              {p.compras.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""))[0]?.fecha || "—"}
                            </div>
                          </div>
                        </div>

                        {/* Historial compras */}
                        <div style={{ borderTop: "1px solid #1e2130", paddingTop: 10 }}>
                          <div style={{ fontSize: 10, color: "#555", fontWeight: 700, letterSpacing: ".06em", marginBottom: 8, textTransform: "uppercase" }}>Historial</div>
                          {p.compras.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "")).map((c, i) => (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 0", borderBottom: i < p.compras.length - 1 ? "1px solid #1a1d26" : "none" }}>
                              <span style={{ color: "#aaa" }}>{c.fecha} · {c.que_compro || "—"}</span>
                              <span style={{ color, fontWeight: 700, whiteSpace: "nowrap" }}>${fmt(c.monto)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            }
          </div>
        );
      })()}
      {subTab === "inventario" && (
        <div>
          <h3 className="sub-title">Agregar refacción</h3>
          <div className="form-grid">
            <div className="field"><label>Refacción *</label><input value={form.nombre} onChange={e => upd("nombre", e.target.value)} placeholder="Rodillo anilox, correa…" /></div>
            <div className="field"><label>Costo ($MXN) *</label><input type="number" value={form.costo} onChange={e => upd("costo", e.target.value)} placeholder="850.00" /></div>
            <div className="field"><label>Stock actual</label><input type="number" value={form.stock} onChange={e => upd("stock", e.target.value)} placeholder="1" /></div>
            <div className="field"><label>Stock mínimo</label><input type="number" value={form.stock_min} onChange={e => upd("stock_min", e.target.value)} placeholder="1" /></div>
            <div className="field"><label>Máquina</label><select value={form.maq} onChange={e => upd("maq", e.target.value)}>{MAQUINAS.map(m => <option key={m}>{m}</option>)}</select></div>
            <div className="field"><label>Proveedor</label>
              <input value={form.proveedor} onChange={e => upd("proveedor", e.target.value)} placeholder="Ferrelex, Amazon…" list="proveedores-list" />
            </div>
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
      {subTab === "quejas" && (
        <div>
          <h3 className="sub-title">⚠️ Quejas de Materia Prima</h3>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <button className={`btn btn-sm ${quejaView === "nueva" ? "btn-primary" : "btn-ghost"}`} onClick={() => setQuejaView("nueva")}>📝 Nueva queja</button>
            <button className={`btn btn-sm ${quejaView === "historial" ? "btn-primary" : "btn-ghost"}`} onClick={() => setQuejaView("historial")}>📋 Historial</button>
          </div>

          {quejaView === "nueva" && (
            <div>
              <p className="muted" style={{ marginBottom: 12 }}>Genera un documento formal de una página para enviar al proveedor. Se guarda con folio automático.</p>
              <div className="form-grid">
                <div className="field"><label>Proveedor *</label>
                  <input value={formQueja.proveedor} onChange={e => updQ("proveedor", e.target.value)} placeholder="Nombre del proveedor" list="proveedores-list" />
                  <datalist id="proveedores-list">{proveedoresSugeridos.map(p => <option key={p} value={p} />)}</datalist>
                </div>
                <div className="field"><label>Fecha</label><input type="date" value={formQueja.fecha} onChange={e => updQ("fecha", e.target.value)} /></div>
                <div className="field"><label>No. Pedido / Lote</label><input value={formQueja.lote} onChange={e => updQ("lote", e.target.value)} placeholder="Ej: Lote 2456" /></div>
                <div className="field"><label>Material / Producto</label><input value={formQueja.material} onChange={e => updQ("material", e.target.value)} placeholder="Ej: Cinta blanca 2 pulg" /></div>
                <div className="field"><label>Cantidad afectada</label><input value={formQueja.cantidad_afectada} onChange={e => updQ("cantidad_afectada", e.target.value)} placeholder="Ej: 12 rollos / 350 metros" /></div>
                <div className="field"><label>No. de factura o remisión</label><input value={formQueja.factura_remision} onChange={e => updQ("factura_remision", e.target.value)} placeholder="Ej: FAC-10234" /></div>
                <div className="field"><label>Detectado por</label><input value={formQueja.detectado_por} onChange={e => updQ("detectado_por", e.target.value)} placeholder="Nombre del operador" /></div>
                <div className="field"><label>Acción solicitada</label>
                  <select value={formQueja.accion_solicitada} onChange={e => updQ("accion_solicitada", e.target.value)}>
                    <option value="Reposición">Reposición</option>
                    <option value="Nota de crédito">Nota de crédito</option>
                    <option value="Revisión">Revisión</option>
                  </select>
                </div>
                <div className="field full"><label>Descripción del problema *</label><textarea value={formQueja.descripcion} onChange={e => updQ("descripcion", e.target.value)} placeholder="Describe el defecto o problema encontrado…" rows={5} /></div>
                <div className="field full">
                  <label>📷 Fotos de evidencia (puedes seleccionar varias)</label>
                  <input type="file" accept="image/*" multiple onChange={handleImagenesQueja} />
                  {previewsQueja.length > 0 && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                      {previewsQueja.map((src, i) => (
                        <div key={i} style={{ position: "relative" }}>
                          <img src={src} alt={`evidencia ${i + 1}`} style={{ width: 110, height: 80, objectFit: "cover", borderRadius: 8, border: "1px solid #2a2d3a" }} />
                          <button type="button" onClick={() => quitarImagenQueja(i)}
                            style={{ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: "50%", border: "none", background: "#ff4d4d", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", lineHeight: "22px" }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="field"><label>Elaboró</label><input value={formQueja.elaboro} onChange={e => updQ("elaboro", e.target.value)} placeholder="Nombre de quien elabora" /></div>
                <div className="field"><label>Autorizó</label><input value={formQueja.autorizo} onChange={e => updQ("autorizo", e.target.value)} placeholder="Nombre de quien autoriza" /></div>
              </div>
              <button className="btn btn-primary btn-block" onClick={guardarQueja} disabled={guardandoQueja}>{guardandoQueja ? "Guardando…" : "💾 Guardar y generar PDF"}</button>
            </div>
          )}

          {quejaView === "historial" && (
            <div>
              <input value={filtroProveedorQuejas} onChange={e => setFiltroProveedorQuejas(e.target.value)} placeholder="🔍 Buscar por proveedor…" style={{ width: "100%", marginBottom: 8, background: "#1a1d26", border: "1px solid #2a2d3a", borderRadius: 8, padding: "8px 12px", color: "#e0e0e0", fontSize: 13 }} />
              {quejasFiltradas.length === 0 ? <p className="empty">Sin quejas registradas.</p> : (
                <div className="list">
                  {quejasFiltradas.map(q => (
                    <div key={q.id} className="list-item">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div><strong>{q.folio}</strong><span className="badge b-accent">{q.proveedor}</span></div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => descargarQueja(q)} disabled={descargandoQuejaId === q.folio}>{descargandoQuejaId === q.folio ? "…" : "📄 PDF"}</button>
                          <button className="btn btn-danger btn-sm" onClick={() => eliminarQueja(q)}>✕</button>
                        </div>
                      </div>
                      <div className="muted">{q.fecha} · {q.material || "—"}</div>
                      <div style={{ marginTop: 8 }}>
                        <select value={q.estatus} onChange={e => actualizarEstatusQueja(q.id, e.target.value)}
                          className="select-sm"
                          style={{
                            background: q.estatus === "Cerrada" ? "#1e3a24" : q.estatus === "En revisión" ? "#3a3320" : "#3a1e1e",
                            color: q.estatus === "Cerrada" ? "#4be87a" : q.estatus === "En revisión" ? "#e8c84b" : "#ff7a7a",
                            border: "1px solid #2a2d3a", borderRadius: 6,
                          }}>
                          <option value="Abierta">🔴 Abierta</option>
                          <option value="En revisión">🟡 En revisión</option>
                          <option value="Cerrada">🟢 Cerrada</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {modalCompra && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: "#14171f", borderRadius: "16px 16px 0 0", padding: 20, width: "100%", maxWidth: 600, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, color: "#c9922a" }}>✏️ Editar compra</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setModalCompra(null)}>✕</button>
            </div>
            <div className="form-grid">
              <div className="field"><label>Proveedor</label><input value={modalCompra.nombre || ""} onChange={e => setModalCompra(m => ({ ...m, nombre: e.target.value }))} /></div>
              <div className="field"><label>Categoría</label>
                <select value={modalCompra.categoria || ""} onChange={e => setModalCompra(m => ({ ...m, categoria: e.target.value }))}>
                  <option value="">— Sin categoría —</option>
                  {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="field"><label>Monto ($MXN)</label><input type="number" value={modalCompra.monto || ""} onChange={e => setModalCompra(m => ({ ...m, monto: e.target.value }))} /></div>
              <div className="field"><label>Fecha</label><input type="date" value={modalCompra.fecha || ""} onChange={e => setModalCompra(m => ({ ...m, fecha: e.target.value }))} /></div>
              <div className="field"><label>Teléfono</label><input value={modalCompra.telefono || ""} onChange={e => setModalCompra(m => ({ ...m, telefono: e.target.value }))} /></div>
              <div className="field full"><label>Dirección</label><input value={modalCompra.direccion || ""} onChange={e => setModalCompra(m => ({ ...m, direccion: e.target.value }))} /></div>
              <div className="field full"><label>Qué se compró</label><input value={modalCompra.que_compro || ""} onChange={e => setModalCompra(m => ({ ...m, que_compro: e.target.value }))} /></div>
            </div>
            <button className="btn btn-primary btn-block" onClick={guardarCompra}>💾 Guardar cambios</button>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
