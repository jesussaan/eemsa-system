import { useState, useEffect, useRef } from "react";
import { authHeaders } from '../lib/auth';
import { fmt } from '../lib/utils';
import { confirmar } from '../lib/confirm';
import { QRCodeSVG } from 'qrcode.react';
import { TIPOS, ROLLOS_POR_CAJA_MP, CENTROS_POR_CAJA, LITROS_POR_TAMBO_SOLVENTE, KG_POR_CUBETA_TINTA } from '../lib/constants';
import { proyectarConsumoPendientes } from '../lib/produccion';
import { sendWhatsApp } from '../utils/whatsapp';
import { IcoPlus, IcoScan } from './Icons';

const Ico = ({ icon: I, size = 13 }) => <span style={{ display: "inline-flex", fontSize: size, verticalAlign: -2 }}><I /></span>;
const UNIDADES = ["Rollo", "Kg", "Litro", "Pieza", "Metro", "Otro"];
const inputStyle = { width: "100%", background: "#1a1d26", border: "1px solid #2a2d3a", borderRadius: 8, padding: "8px 12px", color: "#e0e0e0", fontSize: 13 };
// Categorias que alimentan el consumo automatico al finalizar un pedido
// (ver api/inventario.js accion=consumo-automatico) -- "otro" es 100% manual.
const CATEGORIAS = [
  { key: "otro",     label: "Otro (manual)" },
  { key: "rollo_mp", label: "Rollo MP (por tipo de cinta)" },
  { key: "tinta",    label: "Tinta (por color)" },
  { key: "solvente", label: "Solvente/Alcohol" },
  { key: "centro",   label: "Centros (por ancho)" },
];
const CATEGORIA_LBL = Object.fromEntries(CATEGORIAS.map(c => [c.key, c.label]));
const ANCHOS_CENTRO = Object.keys(CENTROS_POR_CAJA); // ['2','3']

// Como llega fisicamente cada categoria -- no todo es "tarima" (pallet):
// Rollo MP si llega en tarima, Centros llegan en cajas sueltas (sin tarima),
// Solvente en tambo, Tinta por cubeta. `ratio` deja capturar "cuantos
// contenedores llegaron" en vez de hacer la cuenta de cabeza cada vez.
const CONTENEDOR_INFO = {
  rollo_mp: { label: "Tarima", icon: "🧱", ratioNombre: "Cajas", ratio: () => ROLLOS_POR_CAJA_MP, ratioTexto: () => `${ROLLOS_POR_CAJA_MP} rollos/caja` },
  centro:   { label: "Caja",   icon: "📦", ratioNombre: "Cajas", ratio: (mv) => CENTROS_POR_CAJA[mv] || 0, ratioTexto: (mv) => `${CENTROS_POR_CAJA[mv] || "?"} piezas/caja` },
  solvente: { label: "Tambo",  icon: "🛢️", ratioNombre: "Tambos", ratio: () => LITROS_POR_TAMBO_SOLVENTE, ratioTexto: () => `${LITROS_POR_TAMBO_SOLVENTE} L/tambo` },
  tinta:    { label: "Cubeta", icon: "🪣", ratioNombre: "Cubetas", ratio: () => KG_POR_CUBETA_TINTA, ratioTexto: () => `${KG_POR_CUBETA_TINTA} kg/cubeta` },
  otro:     { label: "Lote",   icon: "🏷️", ratioNombre: null, ratio: null, ratioTexto: null },
};
const contenedorDe = (m) => CONTENEDOR_INFO[m?.categoria] || CONTENEDOR_INFO.otro;

export default function Inventario({ materiales, setMateriales, tarimas = [], setTarimas, pedidos = [], onSalir }) {
  const [subTab, setSubTab] = useState("stock");
  const [form, setForm] = useState({ nombre: "", unidad: "Rollo", stock: "0", stock_min: "0", costo_unitario: "", notas: "", categoria: "otro", match_valor: "" });
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [codigo, setCodigo] = useState("");
  const [entradaId, setEntradaId] = useState(null);
  const [cantidadEntrada, setCantidadEntrada] = useState("");
  const [contenedoresEntrada, setContenedoresEntrada] = useState(""); // cajas/tambos recibidos -- auto-llena cantidadEntrada
  const [loteEntrada, setLoteEntrada] = useState("");
  const [proveedorEntrada, setProveedorEntrada] = useState("");
  const [guardandoId, setGuardandoId] = useState(null);
  const [tarimaRecienCreada, setTarimaRecienCreada] = useState(null); // { ...tarima } -- para mostrar su QR justo despues de crearla
  const [movimientos, setMovimientos] = useState([]);
  const [movimientosCargados, setMovimientosCargados] = useState(false);
  const [filtroMov, setFiltroMov] = useState("");
  const [busquedaTarimas, setBusquedaTarimas] = useState("");
  const [verAgotadas, setVerAgotadas] = useState(false);
  const [verQrTarimaId, setVerQrTarimaId] = useState(null);
  const [tarimaEscaneadaId, setTarimaEscaneadaId] = useState(null);
  const [salidaTarimaId, setSalidaTarimaId] = useState(null);
  const [cantidadSalida, setCantidadSalida] = useState("");
  const [motivoSalida, setMotivoSalida] = useState("");
  const [guardandoSalidaId, setGuardandoSalidaId] = useState(null);
  const codigoRef = useRef(null);

  const showToast = t => { setToast(t); setTimeout(() => setToast(""), 2600); };
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const materialDe = (tarimaOMaterialId) => materiales.find(m => m.id === tarimaOMaterialId);
  // El QR ya no trae solo el id suelto -- trae un link a /tarima/<id> (ver
  // InfoTarima.js) para que CUALQUIER camara de celular, no solo el escaner
  // de esta pantalla, muestre material/cantidad/lote al tiro sin tener que
  // pegar el codigo aqui a mano.
  const urlTarima = (tarimaId) => `${window.location.origin}/tarima/${tarimaId}`;
  // Vista grande del QR (pantalla completa, dentro de la misma app) -- antes
  // se llamaba a window.print()/window.open(), pero en varios celulares eso
  // abre un dialogo del sistema sin boton claro de "regresar"; si alguien se
  // queda atorado ahi y fuerza cerrar la app puede sentir que se perdio la
  // tarima (no es asi: ya quedo guardada, solo se pierde la pantalla). Esta
  // vista es 100% de React -- el "✕" siempre funciona. Para imprimir de
  // verdad, se usa el menu de imprimir del propio navegador desde aqui.
  const [vistaGrande, setVistaGrande] = useState(null); // { id, linea1, linea2 }

  // Historial se carga solo la primera vez que se abre esa pestana (igual
  // que quejas_mp en Refacciones.js), para no bajar todo el historial de
  // movimientos en cada carga de la app.
  useEffect(() => {
    if (subTab === "movimientos" && !movimientosCargados) {
      fetch('/api/inventario?accion=movimientos', { headers: authHeaders() })
        .then(r => r.json())
        .then(data => { if (Array.isArray(data)) setMovimientos(data); })
        .catch(() => {})
        .finally(() => setMovimientosCargados(true));
    }
  }, [subTab, movimientosCargados]);

  // Deja el cursor listo en el campo de codigo al entrar a Stock, para que
  // una pistola lectora (que solo "teclea" y da Enter) funcione sin que
  // nadie tenga que tocar la pantalla primero.
  useEffect(() => {
    if (subTab === "stock" || subTab === "tarimas") codigoRef.current?.focus();
  }, [subTab]);

  const crearMaterial = async () => {
    if (!form.nombre.trim()) { showToast("⚠ Nombre obligatorio"); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/inventario', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ nombre: form.nombre, unidad: form.unidad, stock: form.stock, stock_min: form.stock_min, costo_unitario: form.costo_unitario, notas: form.notas, categoria: form.categoria, match_valor: form.categoria === "otro" ? null : form.match_valor }),
      });
      const nuevo = await res.json();
      if (!res.ok) { showToast("❌ Error: " + (nuevo.error || "desconocido")); setLoading(false); return; }
      setMateriales(m => [nuevo, ...m]);
      setForm({ nombre: "", unidad: "Rollo", stock: "0", stock_min: "0", costo_unitario: "", notas: "", categoria: "otro", match_valor: "" });
      showToast("✓ Material agregado ☁️");
    } catch (e) { showToast("❌ Error: " + e.message); }
    setLoading(false);
  };

  const eliminarMaterial = async (m) => {
    if (!(await confirmar(`¿Eliminar "${m.nombre}"? También se borra su historial de tarimas y movimientos.`))) return;
    const res = await fetch('/api/inventario', { method: 'DELETE', headers: authHeaders(), body: JSON.stringify({ id: m.id }) });
    if (!res.ok) { showToast("❌ Error al eliminar"); return; }
    setMateriales(ms => ms.filter(x => x.id !== m.id));
    setTarimas(ts => ts.filter(t => t.material_id !== m.id));
  };

  // Registra una entrada = recibe una tarima nueva (pallet fisico) de ese
  // material -- lote/proveedor opcionales, pero cada entrada SIEMPRE nace
  // como su propia tarima con su propio QR (ver api/inventario.js), para
  // poder rastrearla despues y consumirla FIFO.
  const registrarEntrada = async (m) => {
    if (guardandoId) return;
    const cant = Number(cantidadEntrada);
    if (!(cant > 0)) { showToast("⚠ Ingresa una cantidad válida"); return; }
    setGuardandoId(m.id);
    try {
      const res = await fetch('/api/inventario?accion=movimiento', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ material_id: m.id, cantidad: cant, lote: loteEntrada || null, proveedor: proveedorEntrada || null }),
      });
      const data = await res.json();
      if (!res.ok) { showToast("❌ " + (data.error || "Error al registrar")); setGuardandoId(null); return; }
      setMateriales(ms => ms.map(x => x.id === m.id ? { ...x, stock: data.stock } : x));
      if (data.tarima) setTarimas(ts => ts.some(t => t.id === data.tarima.id) ? ts : [data.tarima, ...ts]);
      if (movimientosCargados) {
        setMovimientos(mv => [{ id: `local-${Date.now()}`, created: new Date().toISOString(), material_id: m.id, material_nombre: m.nombre, tipo: 'entrada', cantidad: cant, origen: 'manual', tarima_id: data.tarima?.id, motivo: [proveedorEntrada, loteEntrada].filter(Boolean).join(' · ') }, ...mv]);
      }
      showToast(`✓ ${contenedorDe(m).label} registrada: ${data.stock} ${m.unidad} en stock`);
      setEntradaId(null); setCantidadEntrada(""); setContenedoresEntrada(""); setLoteEntrada(""); setProveedorEntrada("");
      setTarimaRecienCreada(data.tarima ? { ...data.tarima, material_nombre: m.nombre } : null);
    } catch (e) { showToast("❌ Error: " + e.message); }
    setGuardandoId(null);
  };

  // Registra una salida de UNA tarima especifica (se escaneo su QR, o se
  // eligio a mano en la pestana Tarimas) -- no aplica FIFO aqui: el que
  // captura ya eligio el pallet fisico que tiene enfrente.
  const registrarSalidaTarima = async (t) => {
    if (guardandoSalidaId) return;
    const cant = Number(cantidadSalida);
    if (!(cant > 0)) { showToast("⚠ Ingresa una cantidad válida"); return; }
    setGuardandoSalidaId(t.id);
    try {
      const res = await fetch('/api/inventario?accion=salida-tarima', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ tarima_id: t.id, cantidad: cant, motivo: motivoSalida || null }),
      });
      const data = await res.json();
      if (!res.ok) { showToast("❌ " + (data.error || "Error al registrar")); setGuardandoSalidaId(null); return; }
      const nuevaCantidadTarima = Number(t.cantidad_actual) - cant;
      setTarimas(ts => ts.map(x => x.id === t.id ? { ...x, cantidad_actual: nuevaCantidadTarima, activa: nuevaCantidadTarima > 0 } : x));
      setMateriales(ms => ms.map(x => x.id === t.material_id ? { ...x, stock: data.stock } : x));
      const mat = materialDe(t.material_id);
      showToast(`✓ Salida registrada de la tarima${t.lote ? ` (${t.lote})` : ""}`);
      if (data.cruzoMinimo && mat) sendWhatsApp(`⚠️ Stock bajo: ${mat.nombre} — quedan ${fmt(data.stock)} ${mat.unidad} (mín: ${fmt(data.stock_min)})`);
      setSalidaTarimaId(null); setCantidadSalida(""); setMotivoSalida("");
    } catch (e) { showToast("❌ Error: " + e.message); }
    setGuardandoSalidaId(null);
  };

  // El input de "codigo" recibe lo mismo que teclearia una pistola lectora
  // o la camara (tipea el contenido del QR + Enter): el QR de una tarima
  // ahora trae un link completo (/tarima/<id>, ver urlTarima arriba), asi
  // que aqui se saca el id tanto si viene la URL completa como si viene
  // solo el id suelto (pistolas viejas o texto pegado a mano).
  const idDeCodigo = (val) => {
    const m = val.match(/\/tarima\/([^/?#]+)/);
    return m ? m[1] : val;
  };
  const buscarPorCodigo = (e) => {
    if (e.key !== "Enter") return;
    const val = idDeCodigo(codigo.trim());
    setCodigo("");
    if (!val) return;
    const t = tarimas.find(x => x.id === val);
    if (!t) { showToast("⚠ Código no encontrado"); return; }
    const mat = materialDe(t.material_id);
    setSubTab("tarimas");
    setVerQrTarimaId(null);
    setSalidaTarimaId(null); setCantidadSalida(""); setMotivoSalida("");
    setTarimaEscaneadaId(t.id);
    showToast(`📦 ${mat?.nombre || "Tarima"}${t.lote ? ` · ${t.lote}` : ""}`);
  };
  // Se busca en `tarimas` (no se guarda una copia) para que el numero
  // siempre sea el mas reciente -- si mientras tienes la tarjeta abierta
  // se descuenta sola por una corrida de produccion (Realtime), se actualiza
  // aqui mismo sin que nadie tenga que volver a escanear.
  const tarimaEscaneada = tarimaEscaneadaId ? tarimas.find(t => t.id === tarimaEscaneadaId) : null;

  const totalValor = materiales.reduce((s, m) => s + (Number(m.costo_unitario || 0) * Number(m.stock || 0)), 0);
  const stockBajo = materiales.filter(m => Number(m.stock_min || 0) > 0 && Number(m.stock || 0) <= Number(m.stock_min)).length;
  const materialesFiltrados = materiales.filter(m => !busqueda || m.nombre.toLowerCase().includes(busqueda.toLowerCase()));
  const movimientosFiltrados = movimientos.filter(mv => !filtroMov || (mv.material_nombre || "").toLowerCase().includes(filtroMov.toLowerCase()));

  // Orden FIFO: activas primero (la mas vieja arriba), agotadas al final --
  // asi salta a la vista cual pallet se consume primero.
  const tarimasOrdenadas = [...tarimas].sort((a, b) => {
    if (a.activa !== b.activa) return a.activa ? -1 : 1;
    return (a.fecha_recepcion || "").localeCompare(b.fecha_recepcion || "") || (a.created || "").localeCompare(b.created || "");
  });
  const tarimasFiltradas = tarimasOrdenadas
    .filter(t => verAgotadas || t.activa)
    .filter(t => {
      if (!busquedaTarimas) return true;
      const mat = materialDe(t.material_id);
      const q = busquedaTarimas.toLowerCase();
      return [mat?.nombre, t.lote, t.proveedor].some(v => String(v || "").toLowerCase().includes(q));
    });
  // Primera tarima activa por material, en orden FIFO -- es la que se
  // consume primero (automatico o escaneada), se marca en la lista.
  const primeraFifoPorMaterial = {};
  tarimasOrdenadas.filter(t => t.activa).forEach(t => { if (!(t.material_id in primeraFifoPorMaterial)) primeraFifoPorMaterial[t.material_id] = t.id; });

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg)" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "var(--surface)", borderBottom: "2px solid var(--tan)", position: "sticky", top: 0, zIndex: 10 }}>
        <img src="/logo192.png" alt="EEMSA" style={{ height: 36, width: "auto" }} />
        <div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 16, color: "#e0e0e0", letterSpacing: ".06em" }}>EEMSA System</div>
          <div style={{ fontSize: 10, color: "var(--tan)", fontWeight: 700, letterSpacing: ".08em" }}>INVENTARIO</div>
        </div>
        {onSalir && <button onClick={onSalir} style={{ marginLeft: "auto", fontSize: 11, color: "#666", background: "transparent", border: "none", cursor: "pointer", padding: "4px 8px" }}>← Salir</button>}
      </header>

      <main style={{ flex: 1, padding: "16px 16px 82px", maxWidth: 900, margin: "0 auto", width: "100%" }}>
      <h2 className="sec-title">📦 Inventario</h2>
      <div className="stat-grid">
        <div className="stat-card accent"><div className="stat-val">{materiales.length}</div><div className="stat-lbl">Materiales</div></div>
        <div className="stat-card blue"><div className="stat-val">${fmt(totalValor)}</div><div className="stat-lbl">Valor inventario</div></div>
        <div className={`stat-card ${stockBajo > 0 ? "red" : "green"}`}><div className="stat-val">{stockBajo}</div><div className="stat-lbl">Stock bajo ⚠</div></div>
        <div className="stat-card accent"><div className="stat-val">{tarimas.filter(t => t.activa).length}</div><div className="stat-lbl">Tarimas activas</div></div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, marginTop: 12, flexWrap: "wrap" }}>
        <button className={`btn ${subTab === "stock" ? "btn-primary" : "btn-ghost"}`} onClick={() => setSubTab("stock")}>📦 Stock</button>
        <button className={`btn ${subTab === "tarimas" ? "btn-primary" : "btn-ghost"}`} onClick={() => setSubTab("tarimas")}>🧱 Tarimas</button>
        <button className={`btn ${subTab === "proyeccion" ? "btn-primary" : "btn-ghost"}`} onClick={() => setSubTab("proyeccion")}>📈 Proyección</button>
        <button className={`btn ${subTab === "movimientos" ? "btn-primary" : "btn-ghost"}`} onClick={() => setSubTab("movimientos")}>📋 Movimientos</button>
      </div>

      {subTab === "stock" && (
        <div>
          <div className="field full" style={{ marginBottom: 14 }}>
            <label><Ico icon={IcoScan} /> Escanear tarima (pistola o cámara)</label>
            <input ref={codigoRef} value={codigo} onChange={e => setCodigo(e.target.value)} onKeyDown={buscarPorCodigo}
              placeholder="Escanea el QR de la tarima (o pégalo aquí) y presiona Enter" style={inputStyle} />
          </div>

          <h3 className="sub-title">Agregar material</h3>
          <div className="form-grid">
            <div className="field"><label>Material *</label><input value={form.nombre} onChange={e => upd("nombre", e.target.value)} placeholder="Ej: Rollo cartón kraft 36&quot;" /></div>
            <div className="field"><label>Unidad</label>
              <select value={form.unidad} onChange={e => upd("unidad", e.target.value)}>{UNIDADES.map(u => <option key={u}>{u}</option>)}</select>
            </div>
            <div className="field"><label>Stock inicial</label><input type="number" value={form.stock} onChange={e => upd("stock", e.target.value)} placeholder="0" /></div>
            <div className="field"><label>Stock mínimo</label><input type="number" value={form.stock_min} onChange={e => upd("stock_min", e.target.value)} placeholder="0" /></div>
            <div className="field"><label>Costo unitario ($MXN)</label><input type="number" value={form.costo_unitario} onChange={e => upd("costo_unitario", e.target.value)} placeholder="Opcional" /></div>
            <div className="field"><label>Categoría (auto-consumo)</label>
              <select value={form.categoria} onChange={e => { upd("categoria", e.target.value); upd("match_valor", ""); }}>
                {CATEGORIAS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
            {form.categoria === "rollo_mp" && (
              <div className="field"><label>Tipo de cinta</label>
                <select value={form.match_valor} onChange={e => upd("match_valor", e.target.value)}>
                  <option value="">— Selecciona —</option>
                  {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            )}
            {form.categoria === "tinta" && (
              <div className="field"><label>Color de tinta</label><input value={form.match_valor} onChange={e => upd("match_valor", e.target.value)} placeholder="Ej: Roja UV, Azul PMS…" /></div>
            )}
            {form.categoria === "centro" && (
              <div className="field"><label>Ancho</label>
                <select value={form.match_valor} onChange={e => upd("match_valor", e.target.value)}>
                  <option value="">— Selecciona —</option>
                  {ANCHOS_CENTRO.map(a => <option key={a} value={a}>{a}" ({CENTROS_POR_CAJA[a]} piezas/caja)</option>)}
                </select>
              </div>
            )}
            {(form.categoria === "rollo_mp" || form.categoria === "tinta" || form.categoria === "centro") && (
              <div className="field full" style={{ fontSize: 11, color: "#666", marginTop: -6 }}>
                {form.categoria === "centro"
                  ? "Se descuenta 1 pieza por cada pieza producida en pedidos de ese ancho, al finalizar en Modo Operador."
                  : `Al finalizar un pedido de este ${form.categoria === "rollo_mp" ? "tipo de cinta" : "color"} en Modo Operador, el stock se descuenta solo (FIFO, del lote más viejo).`}
              </div>
            )}
            <div className="field full"><label>Notas</label><textarea value={form.notas} onChange={e => upd("notas", e.target.value)} placeholder="Proveedor habitual, observaciones…" /></div>
          </div>
          <button className="btn btn-primary btn-block" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }} onClick={crearMaterial} disabled={loading}>{loading ? "Guardando…" : <><Ico icon={IcoPlus} size={15} /> Agregar al inventario</>}</button>

          <h3 className="sub-title" style={{ marginTop: 20 }}>Materiales</h3>
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="🔍 Buscar material…" style={{ ...inputStyle, marginBottom: 8 }} />
          {materiales.length === 0 ? <p className="empty">Sin materiales en inventario.</p> : (
            <div className="list">
              {materialesFiltrados.map(m => {
                const min = Number(m.stock_min || 0);
                const bajo = min > 0 && Number(m.stock || 0) <= min;
                return (
                  <div key={m.id} className="list-item" style={{ borderLeft: bajo ? "3px solid #ff4d4d" : undefined }}>
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                      <div>
                        <strong>{m.nombre}</strong>
                        <span className={`badge ${bajo ? "b-red" : "b-green"}`}>Stock: {fmt(m.stock)} {m.unidad}</span>
                        {bajo && <span className="badge b-red">BAJO</span>}
                        {m.categoria && m.categoria !== "otro" && (
                          <span className="badge b-accent" title={m.match_valor || ""}>🤖 {CATEGORIA_LBL[m.categoria] || m.categoria}{m.match_valor ? `: ${m.match_valor}` : ""}</span>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" title="Registrar entrada" style={{ color: "#4be87a" }} onClick={() => { setEntradaId(entradaId === m.id ? null : m.id); setCantidadEntrada(""); setContenedoresEntrada(""); setLoteEntrada(""); setProveedorEntrada(""); setTarimaRecienCreada(null); }} disabled={guardandoId === m.id}>
                          <Ico icon={IcoPlus} size={12} /> Entrada
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => eliminarMaterial(m)}>✕</button>
                      </div>
                    </div>

                    {entradaId === m.id && (() => {
                      const cont = contenedorDe(m);
                      const ratioVal = cont.ratio ? cont.ratio(m.match_valor) : 0;
                      return (
                        <div style={{ marginTop: 8 }}>
                          {ratioVal > 0 && (
                            <div style={{ marginBottom: 6 }}>
                              <input type="number" value={contenedoresEntrada}
                                onChange={e => { const v = e.target.value; setContenedoresEntrada(v); setCantidadEntrada(v !== "" ? String(Number(v) * ratioVal) : ""); }}
                                onKeyDown={e => { if (e.key === "Escape") setEntradaId(null); }}
                                placeholder={`${cont.ratioNombre} recibidas`} autoFocus
                                style={{ width: 160, background: "#1a1d26", border: "1px solid #4be87a", borderRadius: 6, padding: "5px 8px", color: "#e0e0e0", fontSize: 13 }} />
                              <span style={{ fontSize: 11, color: "#666", marginLeft: 8 }}>× {cont.ratioTexto(m.match_valor)}{cantidadEntrada !== "" ? ` = ${fmt(cantidadEntrada)} ${m.unidad}` : ""}</span>
                            </div>
                          )}
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                            <input type="number" value={cantidadEntrada} onChange={e => setCantidadEntrada(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") registrarEntrada(m); if (e.key === "Escape") setEntradaId(null); }}
                              placeholder={`Cantidad (${m.unidad})`} autoFocus={!ratioVal} style={{ width: 140, background: "#1a1d26", border: "1px solid #4be87a", borderRadius: 6, padding: "5px 8px", color: "#e0e0e0", fontSize: 13 }} />
                            <input value={loteEntrada} onChange={e => setLoteEntrada(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") registrarEntrada(m); if (e.key === "Escape") setEntradaId(null); }}
                              placeholder="Lote (opcional)" style={{ width: 140, background: "#1a1d26", border: "1px solid #2a2d3a", borderRadius: 6, padding: "5px 8px", color: "#e0e0e0", fontSize: 13 }} />
                            <input value={proveedorEntrada} onChange={e => setProveedorEntrada(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") registrarEntrada(m); if (e.key === "Escape") setEntradaId(null); }}
                              placeholder="Proveedor (opcional)" style={{ flex: 1, minWidth: 140, background: "#1a1d26", border: "1px solid #2a2d3a", borderRadius: 6, padding: "5px 8px", color: "#e0e0e0", fontSize: 13 }} />
                            <button className="btn btn-primary btn-sm" onClick={() => registrarEntrada(m)} disabled={guardandoId === m.id}>{guardandoId === m.id ? "Guardando…" : `✓ Registrar ${cont.label.toLowerCase()}`}</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEntradaId(null)}>✕</button>
                          </div>
                          <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>Cada entrada crea {cont.label === "Tarima" ? "una tarima nueva" : `un lote nuevo (${cont.label.toLowerCase()})`} con su propio código QR — imprímelo y pégalo.</div>
                        </div>
                      );
                    })()}

                    {tarimaRecienCreada && tarimaRecienCreada.material_id === m.id && (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, marginTop: 10, padding: 12, background: "#0d0f14", borderRadius: 10, border: "1px solid #4be87a" }}>
                        <span style={{ fontSize: 12, color: "#4be87a", fontWeight: 700 }}>✓ {contenedorDe(m).icon} {contenedorDe(m).label} #{tarimaRecienCreada.numero} creada — imprime este QR</span>
                        <QRCodeSVG value={urlTarima(tarimaRecienCreada.id)} size={110} bgColor="#0d0f14" fgColor="#e0e0e0" />
                        <span style={{ fontSize: 11, color: "#666", wordBreak: "break-all", textAlign: "center" }}>{tarimaRecienCreada.id}</span>
                        {tarimaRecienCreada.lote && <span className="muted" style={{ fontSize: 11 }}>Lote: {tarimaRecienCreada.lote}</span>}
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="btn btn-primary btn-sm" onClick={() => setVistaGrande({ id: tarimaRecienCreada.id, linea1: `${m.nombre} #${tarimaRecienCreada.numero}`, linea2: tarimaRecienCreada.lote ? `Lote: ${tarimaRecienCreada.lote}` : "" })}>🔍 Ver / imprimir</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setTarimaRecienCreada(null)}>Cerrar</button>
                        </div>
                      </div>
                    )}

                    <div className="muted">{m.unidad}{m.costo_unitario ? ` · $${fmt(m.costo_unitario)}/u` : ""} · Min: {fmt(m.stock_min || 0)}</div>
                    {m.notas && <div className="muted">{m.notas}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {subTab === "tarimas" && (
        <div>
          <h3 className="sub-title">Tarimas</h3>

          <div className="field full" style={{ marginBottom: 14 }}>
            <label><Ico icon={IcoScan} /> Escanear tarima (pistola o cámara) — para contar rápido</label>
            <input ref={codigoRef} value={codigo} onChange={e => setCodigo(e.target.value)} onKeyDown={buscarPorCodigo}
              placeholder="Escanea el QR de la tarima (o pégalo aquí) y presiona Enter" style={inputStyle} />
          </div>

          {tarimaEscaneada && (() => {
            const mat = materialDe(tarimaEscaneada.material_id);
            const cont = contenedorDe(mat);
            return (
              <div style={{ background: "#0d0f14", border: "1.5px solid var(--tan, #c9a06a)", borderRadius: 12, padding: 16, marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 11, color: "#c9a06a", fontWeight: 700, letterSpacing: ".05em" }}>📷 {cont.icon} {cont.label.toUpperCase()} ESCANEADA</div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: "#e0e0e0", marginTop: 2 }}>{mat?.nombre || "Material eliminado"} #{tarimaEscaneada.numero ?? "?"}</div>
                    {(tarimaEscaneada.lote || tarimaEscaneada.proveedor) && (
                      <div className="muted">{[tarimaEscaneada.lote, tarimaEscaneada.proveedor].filter(Boolean).join(" · ")}</div>
                    )}
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setTarimaEscaneadaId(null); setSalidaTarimaId(null); }}>✕</button>
                </div>
                <div style={{ textAlign: "center", margin: "14px 0" }}>
                  <div style={{ fontSize: 44, fontWeight: 900, color: tarimaEscaneada.activa ? "#4be87a" : "#ff4d4d", lineHeight: 1 }}>{fmt(tarimaEscaneada.cantidad_actual)}</div>
                  <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{mat?.unidad || ""} en vivo — de {fmt(tarimaEscaneada.cantidad_inicial)} recibidos{!tarimaEscaneada.activa ? " · AGOTADA" : ""}</div>
                </div>
                {tarimaEscaneada.activa && salidaTarimaId !== tarimaEscaneada.id && (
                  <button className="btn btn-primary btn-block btn-sm" onClick={() => { setSalidaTarimaId(tarimaEscaneada.id); setCantidadSalida(""); setMotivoSalida(""); }}>− Registrar salida</button>
                )}
                {salidaTarimaId === tarimaEscaneada.id && (
                  <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center", flexWrap: "wrap" }}>
                    <input type="number" value={cantidadSalida} onChange={e => setCantidadSalida(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") registrarSalidaTarima(tarimaEscaneada); if (e.key === "Escape") setSalidaTarimaId(null); }}
                      placeholder={`Cantidad (máx ${fmt(tarimaEscaneada.cantidad_actual)})`} autoFocus style={{ width: 160, background: "#1a1d26", border: "1px solid #ff9900", borderRadius: 6, padding: "5px 8px", color: "#e0e0e0", fontSize: 13 }} />
                    <input value={motivoSalida} onChange={e => setMotivoSalida(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") registrarSalidaTarima(tarimaEscaneada); if (e.key === "Escape") setSalidaTarimaId(null); }}
                      placeholder="Motivo (opcional)" style={{ flex: 1, minWidth: 140, background: "#1a1d26", border: "1px solid #2a2d3a", borderRadius: 6, padding: "5px 8px", color: "#e0e0e0", fontSize: 13 }} />
                    <button className="btn btn-primary btn-sm" onClick={() => registrarSalidaTarima(tarimaEscaneada)} disabled={guardandoSalidaId === tarimaEscaneada.id}>{guardandoSalidaId === tarimaEscaneada.id ? "Guardando…" : "✓ Registrar"}</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setSalidaTarimaId(null)}>✕</button>
                  </div>
                )}
              </div>
            );
          })()}

          <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <input value={busquedaTarimas} onChange={e => setBusquedaTarimas(e.target.value)} placeholder="🔍 Buscar material, lote, proveedor…" style={{ ...inputStyle, flex: 1, minWidth: 200 }} />
            <button className={`btn btn-sm ${verAgotadas ? "btn-primary" : "btn-ghost"}`} onClick={() => setVerAgotadas(v => !v)}>{verAgotadas ? "✓ Viendo agotadas" : "Ver agotadas"}</button>
          </div>
          {tarimasFiltradas.length === 0 ? <p className="empty">Sin tarimas{verAgotadas ? "" : " activas"}. Registra una entrada en la pestaña Stock.</p> : (
            <div className="list">
              {tarimasFiltradas.map(t => {
                const mat = materialDe(t.material_id);
                const cont = contenedorDe(mat);
                const esFifoSiguiente = t.activa && primeraFifoPorMaterial[t.material_id] === t.id;
                return (
                  <div key={t.id} className="list-item" style={{ borderLeft: !t.activa ? "3px solid #3a3f5a" : esFifoSiguiente ? "3px solid #4be87a" : undefined, opacity: t.activa ? 1 : 0.6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                      <div>
                        <span className="muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".04em" }}>{cont.icon} {cont.label} #{t.numero ?? "?"}</span><br />
                        <strong>{mat?.nombre || "Material eliminado"}</strong>
                        <span className={`badge ${t.activa ? "b-green" : "b-red"}`}>{fmt(t.cantidad_actual)} / {fmt(t.cantidad_inicial)} {mat?.unidad || ""}</span>
                        {!t.activa && <span className="badge b-red">AGOTADA</span>}
                        {esFifoSiguiente && <span className="badge b-accent">⏩ Siguiente FIFO</span>}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" title="Ver código QR" onClick={() => setVerQrTarimaId(verQrTarimaId === t.id ? null : t.id)}>▦</button>
                        {t.activa && (
                          <button className="btn btn-ghost btn-sm" title="Registrar salida" style={{ color: "#ff9900" }} onClick={() => { setSalidaTarimaId(salidaTarimaId === t.id ? null : t.id); setCantidadSalida(""); setMotivoSalida(""); }} disabled={guardandoSalidaId === t.id}>
                            − Salida
                          </button>
                        )}
                      </div>
                    </div>

                    {verQrTarimaId === t.id && (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, marginTop: 10, padding: 12, background: "#0d0f14", borderRadius: 10 }}>
                        <QRCodeSVG value={urlTarima(t.id)} size={110} bgColor="#0d0f14" fgColor="#e0e0e0" />
                        <span style={{ fontSize: 11, color: "#666", wordBreak: "break-all", textAlign: "center" }}>{t.id}</span>
                        <button className="btn btn-primary btn-sm" onClick={() => setVistaGrande({ id: t.id, linea1: `${mat?.nombre || ""} #${t.numero ?? "?"}`, linea2: t.lote ? `Lote: ${t.lote}` : "" })}>🔍 Ver / imprimir</button>
                      </div>
                    )}

                    {salidaTarimaId === t.id && (
                      <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <input type="number" value={cantidadSalida} onChange={e => setCantidadSalida(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") registrarSalidaTarima(t); if (e.key === "Escape") setSalidaTarimaId(null); }}
                          placeholder={`Cantidad (máx ${fmt(t.cantidad_actual)})`} autoFocus style={{ width: 160, background: "#1a1d26", border: "1px solid #ff9900", borderRadius: 6, padding: "5px 8px", color: "#e0e0e0", fontSize: 13 }} />
                        <input value={motivoSalida} onChange={e => setMotivoSalida(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") registrarSalidaTarima(t); if (e.key === "Escape") setSalidaTarimaId(null); }}
                          placeholder="Motivo (opcional)" style={{ flex: 1, minWidth: 140, background: "#1a1d26", border: "1px solid #2a2d3a", borderRadius: 6, padding: "5px 8px", color: "#e0e0e0", fontSize: 13 }} />
                        <button className="btn btn-primary btn-sm" onClick={() => registrarSalidaTarima(t)} disabled={guardandoSalidaId === t.id}>{guardandoSalidaId === t.id ? "Guardando…" : "✓ Registrar"}</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setSalidaTarimaId(null)}>✕</button>
                      </div>
                    )}

                    <div className="muted">{t.lote ? `Lote: ${t.lote} · ` : ""}{t.proveedor ? `${t.proveedor} · ` : ""}Recibida: {t.fecha_recepcion}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {subTab === "proyeccion" && (() => {
        const { porTipo, porColor, porCentro, solventeTotal } = proyectarConsumoPendientes(pedidos);
        const materialPara = (categoria, valor) => {
          const v = (valor || "").trim().toLowerCase();
          if (!v) return null;
          return materiales.find(m => m.categoria === categoria && (m.match_valor || "").trim().toLowerCase() === v) || null;
        };
        const materialSolvente = materiales.find(m => m.categoria === "solvente") || null;
        const Fila = ({ etiqueta, pedidosN, proyectado, unidad, mat, estimado }) => {
          const remanente = mat ? Number(mat.stock) - proyectado : null;
          const min = mat ? Number(mat.stock_min || 0) : 0;
          const critico = mat && (remanente < 0 || (min > 0 && remanente <= min));
          return (
            <tr style={{ borderBottom: "1px solid #1a1d26" }}>
              <td style={{ padding: "8px 10px", color: "#e0e0e0", fontWeight: 600 }}>{etiqueta}</td>
              <td style={{ padding: "8px 10px", color: "#888", textAlign: "right" }}>{pedidosN}</td>
              <td style={{ padding: "8px 10px", color: "#4b8fe8", textAlign: "right", fontWeight: 700 }}>{proyectado.toFixed(2)} {unidad}{estimado ? " ≈" : ""}</td>
              <td style={{ padding: "8px 10px", textAlign: "right", color: mat ? "#e0e0e0" : "#555" }}>{mat ? `${fmt(mat.stock)} ${unidad}` : "— sin vincular"}</td>
              <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: !mat ? "#555" : critico ? "#ff4d4d" : "#4be87a" }}>
                {mat ? `${remanente.toFixed(2)} ${unidad}${critico ? " ⚠" : ""}` : "—"}
              </td>
            </tr>
          );
        };
        const hayDatos = porTipo.length > 0 || porColor.length > 0 || porCentro.length > 0 || solventeTotal > 0;
        return (
          <div>
            <h3 className="sub-title">Proyección de consumo — pedidos en cola</h3>
            <p className="muted" style={{ marginBottom: 12 }}>Suma lo que van a necesitar los pedidos "anotados" y "en proceso" (aún no finalizados) contra el stock actual, para avisar antes de que se acabe algo — no hasta que ya cruzó el mínimo. Las filas con ≈ usan diseño/portacliché por default porque el pedido todavía no los tiene capturados.</p>
            {!hayDatos ? <p className="empty">No hay pedidos pendientes con datos suficientes para proyectar (falta ancho/largo/cajas).</p> : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #2a2d3a" }}>
                      {["Material", "Pedidos", "Se necesita", "Stock actual", "Quedaría"].map(h => (
                        <th key={h} style={{ padding: "6px 10px", color: "#888", fontWeight: 600, textAlign: h === "Material" ? "left" : "right", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {porTipo.map(r => (
                      <Fila key={`tipo-${r.tipo}`} etiqueta={`🧵 ${r.tipo}`} pedidosN={r.pedidos} proyectado={r.rollos} unidad="rollos" mat={materialPara("rollo_mp", r.tipo)} estimado={false} />
                    ))}
                    {porColor.map(r => (
                      <Fila key={`color-${r.color}`} etiqueta={`🎨 ${r.color}`} pedidosN={r.pedidos} proyectado={r.kg} unidad="kg" mat={materialPara("tinta", r.color)} estimado={r.estimado} />
                    ))}
                    {porCentro.map(r => (
                      <Fila key={`centro-${r.ancho}`} etiqueta={`📦 Centros ${r.ancho}"`} pedidosN={r.pedidos} proyectado={r.piezas} unidad="pzas" mat={materialPara("centro", r.ancho)} estimado={false} />
                    ))}
                    {solventeTotal > 0 && (
                      <Fila etiqueta="💧 Solvente/Alcohol" pedidosN="—" proyectado={solventeTotal} unidad="kg" mat={materialSolvente} estimado={false} />
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {subTab === "movimientos" && (
        <div>
          <h3 className="sub-title">Historial de movimientos</h3>
          <input value={filtroMov} onChange={e => setFiltroMov(e.target.value)} placeholder="🔍 Buscar material…" style={{ ...inputStyle, marginBottom: 8 }} />
          {!movimientosCargados ? <p className="empty">Cargando…</p> : movimientosFiltrados.length === 0 ? <p className="empty">Sin movimientos registrados.</p> : (
            <div className="list">
              {movimientosFiltrados.map(mv => (
                <div key={mv.id} className="list-item">
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                    <div>
                      <strong>{mv.material_nombre}</strong>
                      <span className={`badge ${mv.tipo === "salida" ? "b-red" : "b-green"}`}>{mv.tipo === "salida" ? "-" : "+"}{fmt(mv.cantidad)}</span>
                      {mv.origen === "corrida_automatica" && <span className="badge b-accent">🤖 Automático{mv.pedido_num ? ` · #${mv.pedido_num}` : ""}</span>}
                    </div>
                    <span className="muted">{new Date(mv.created).toLocaleString("es-MX")}</span>
                  </div>
                  {mv.motivo && <div className="muted">{mv.motivo}</div>}
                  {mv.usuario_email && <div className="muted">Por: {mv.usuario_email}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
      </main>

      {vistaGrande && (
        <div style={{ position: "fixed", inset: 0, background: "#fff", zIndex: 999, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <button onClick={() => setVistaGrande(null)} aria-label="Cerrar"
            style={{ position: "absolute", top: 16, right: 16, fontSize: 30, lineHeight: 1, background: "transparent", border: "none", color: "#000", cursor: "pointer", padding: 8 }}>✕</button>
          <div style={{ fontSize: 32, fontWeight: 800, color: "#111", textAlign: "center", marginBottom: 6 }}>{vistaGrande.linea1}</div>
          {vistaGrande.linea2 && <div style={{ fontSize: 18, color: "#444", marginBottom: 20 }}>{vistaGrande.linea2}</div>}
          <QRCodeSVG value={urlTarima(vistaGrande.id)} size={280} bgColor="#ffffff" fgColor="#000000" />
          <div style={{ fontSize: 11, color: "#999", marginTop: 16, wordBreak: "break-all", maxWidth: "90vw", textAlign: "center" }}>{vistaGrande.id}</div>
          <div style={{ fontSize: 12, color: "#888", marginTop: 24, textAlign: "center", maxWidth: 320 }}>Para imprimir, usa el menú de tu navegador (⋮ o compartir → Imprimir), o tómale captura de pantalla.</div>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 20, color: "#666", border: "1px solid #ccc" }} onClick={() => setVistaGrande(null)}>Cerrar</button>
        </div>
      )}
    </div>
  );
}
