import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "../lib/supabase";
import { authHeaders } from "../lib/auth";
import { confirmar } from "../lib/confirm";
import { OPERADORES, REBOB_OPERADORES } from "../lib/constants";

// Control de herramientas del taller (modo "herramienta", ver App.js).
// La herramienta se guarda por cajas (Caja roja, Caja negra...). Las cajas
// con el mismo `grupo` son cajones de un mismo mueble (Archivero: Cajon 1,
// 2, 3) y salen juntas. Cada caja tiene su QR (/herramienta/caja/<id>) que se pega en
// la caja: al escanearlo se abre solo lo que hay adentro. Cada tipo
// (Desarmadores, Dados 1/4"...) tiene `cantidad` piezas numeradas del 1 en
// adelante, y tambien su propio QR (/herramienta/<id>). Tablas y reglas en
// supabase_herramientas.sql y supabase_herramientas_cajas.sql; escritura por
// /api/inventario?modulo=herramientas (api/_lib/herramientas.js).
const API = "/api/inventario?modulo=herramientas";
const DIAS_AVISO = 3; // una pieza fuera mas de esto sale en rojo
const COLOR = "var(--orange)";
const COLORES_CAJA = ["#e84b4b", "#2b2f36", "#3b82f6", "#22a35a", "#f2c230", "#e8894b", "#8a6d3b", "#6b7a8f"];

const llamar = async (method, body) => {
  const res = await fetch(API, { method, headers: authHeaders(), body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Error al guardar");
  return data;
};
const diasDesde = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
const haceCuanto = (iso) => {
  const d = diasDesde(iso);
  if (d <= 0) return "hoy";
  if (d === 1) return "ayer";
  return `hace ${d} días`;
};
const urlQR = (id) => `${window.location.origin}/herramienta/${id}`;
const urlQRCaja = (id) => `${window.location.origin}/herramienta/caja/${id}`;

// Nombres que ya se usaron (para no escribirlos cada vez) + los de planta.
const cargarPersonas = () => {
  let guardadas = [];
  try { guardadas = JSON.parse(localStorage.getItem("eemsa_herr_personas") || "[]"); } catch { guardadas = []; }
  return [...new Set([...guardadas, ...OPERADORES, ...REBOB_OPERADORES])];
};
const recordarPersona = (nombre) => {
  try {
    const previas = JSON.parse(localStorage.getItem("eemsa_herr_personas") || "[]");
    localStorage.setItem("eemsa_herr_personas", JSON.stringify([nombre, ...previas.filter(p => p !== nombre)].slice(0, 12)));
  } catch { /* sin localStorage: no pasa nada */ }
};

// Circulito con el color de la caja (con borde, para que la negra se vea en modo oscuro).
const PuntoCaja = ({ color, size = 14 }) => (
  <span style={{ display: "inline-block", width: size, height: size, borderRadius: 4, background: color || "var(--muted)", border: "1.5px solid var(--border-light)", flexShrink: 0 }} />
);

export default function ModoHerramienta({ onSalir, tipoInicial, cajaInicial }) {
  const [cajas, setCajas] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [prestamos, setPrestamos] = useState([]); // solo abiertos
  const [cargado, setCargado] = useState(false);
  const [cajaId, setCajaId] = useState(cajaInicial || null); // caja abierta (o null = todas)
  const [selId, setSelId] = useState(tipoInicial || null);
  const [marcadas, setMarcadas] = useState([]); // numeros seleccionados en el detalle
  const [pidiendoPersona, setPidiendoPersona] = useState(false);
  const [persona, setPersona] = useState("");
  const [editando, setEditando] = useState(null); // tipo: { id?, nombre, cantidad, caja_id }
  const [editandoCaja, setEditandoCaja] = useState(null); // { id?, nombre, color }
  const [qrDe, setQrDe] = useState(null); // { tipo } | { caja } | "todos"
  const [toast, setToast] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const showToast = (t) => { setToast(t); setTimeout(() => setToast(""), 2800); };

  const cargar = async () => {
    const [{ data: c }, { data: t }, { data: p }] = await Promise.all([
      supabase.from("herramienta_cajas").select("*").order("orden").order("nombre"),
      supabase.from("herramienta_tipos").select("*").order("orden").order("nombre"),
      supabase.from("herramienta_prestamos").select("*").is("regreso", null),
    ]);
    setCajas(c || []);
    setTipos(t || []);
    setPrestamos(p || []);
    setCargado(true);
  };

  useEffect(() => {
    cargar();
    const canal = supabase.channel("rt_herramientas")
      .on("postgres_changes", { event: "*", schema: "public", table: "herramienta_cajas" }, () => cargar())
      .on("postgres_changes", { event: "*", schema: "public", table: "herramienta_tipos" }, () => cargar())
      .on("postgres_changes", { event: "*", schema: "public", table: "herramienta_prestamos" }, () => cargar())
      .subscribe();
    return () => supabase.removeChannel(canal);
  }, []);

  const prestamosDe = (tipoId) => prestamos.filter(p => p.tipo_id === tipoId);
  const prestamoDePieza = (tipoId, numero) => prestamos.find(p => p.tipo_id === tipoId && p.numero === numero);
  const cajaDe = (t) => cajas.find(c => c.id === t?.caja_id) || null;
  // "Archivero · Cajón 1": las cajas con el mismo grupo son cajones de un mismo mueble.
  const nombreCaja = (c) => c ? (c.grupo ? `${c.grupo} · ${c.nombre}` : c.nombre) : "";
  // Para la pantalla principal: cada caja sola, o un grupo con sus cajones.
  const bloques = cajas.reduce((acc, c) => {
    const previo = c.grupo && acc.find(b => b.grupo === c.grupo);
    if (previo) previo.cajas.push(c);
    else acc.push({ grupo: c.grupo || null, cajas: [c] });
    return acc;
  }, []);
  const tiposDeCaja = (id) => tipos.filter(t => t.caja_id === id);
  const sinCaja = tipos.filter(t => !cajaDe(t));
  const sel = tipos.find(t => t.id === selId) || null;
  const cajaSel = cajas.find(c => c.id === cajaId) || null;

  const abrirTipo = (id) => { setSelId(id); setMarcadas([]); setPidiendoPersona(false); };
  const cerrarTipo = () => { setSelId(null); setMarcadas([]); setPidiendoPersona(false); };
  const toggleMarca = (n) => setMarcadas(m => m.includes(n) ? m.filter(x => x !== n) : [...m, n].sort((a, b) => a - b));

  // Lo marcado es todo disponible (sacar) o todo prestado (regresar) -- no se
  // mezcla: al tocar una pieza de la otra clase se empieza de nuevo.
  const tocarPieza = (n) => {
    const prestada = !!prestamoDePieza(sel.id, n);
    const claseActual = marcadas.length ? !!prestamoDePieza(sel.id, marcadas[0]) : prestada;
    if (claseActual !== prestada) { setMarcadas([n]); setPidiendoPersona(false); return; }
    toggleMarca(n);
  };
  const marcadasPrestadas = sel && marcadas.length > 0 && !!prestamoDePieza(sel.id, marcadas[0]);

  const sacar = async () => {
    const nombre = persona.trim();
    if (!nombre) { showToast("⚠ ¿Quién se la lleva?"); return; }
    setOcupado(true);
    try {
      await llamar("POST", { action: "sacar", tipo_id: sel.id, numeros: marcadas, persona: nombre });
      recordarPersona(nombre);
      showToast(`✓ ${sel.nombre} ${marcadas.map(n => "#" + n).join(", ")} → ${nombre}`);
      setMarcadas([]); setPidiendoPersona(false); setPersona("");
      cargar();
    } catch (e) { showToast("❌ " + e.message); }
    setOcupado(false);
  };

  const regresar = async () => {
    const ids = marcadas.map(n => prestamoDePieza(sel.id, n)?.id).filter(Boolean);
    setOcupado(true);
    try {
      await llamar("PUT", { action: "regresar", ids });
      showToast(`✓ Regresaron ${sel.nombre} ${marcadas.map(n => "#" + n).join(", ")}`);
      setMarcadas([]);
      cargar();
    } catch (e) { showToast("❌ " + e.message); }
    setOcupado(false);
  };

  const guardarTipo = async () => {
    const { id, nombre, cantidad, caja_id } = editando;
    if (!String(nombre || "").trim()) { showToast("⚠ Ponle nombre"); return; }
    setOcupado(true);
    try {
      if (id) await llamar("PUT", { action: "tipo", id, nombre, cantidad, caja_id });
      else await llamar("POST", { action: "tipo", nombre, cantidad, caja_id });
      showToast("✓ Guardado");
      setEditando(null);
      cargar();
    } catch (e) { showToast("❌ " + e.message); }
    setOcupado(false);
  };

  const borrarTipo = async (t) => {
    if (!(await confirmar(`¿Borrar "${t.nombre}" con sus ${t.cantidad} piezas? Se pierde su historial.`))) return;
    try {
      await llamar("DELETE", { id: t.id });
      showToast("✓ Borrado");
      setEditando(null); cerrarTipo(); cargar();
    } catch (e) { showToast("❌ " + e.message); }
  };

  const guardarCaja = async () => {
    const { id, nombre, grupo, color } = editandoCaja;
    if (!String(nombre || "").trim()) { showToast("⚠ Ponle nombre a la caja"); return; }
    setOcupado(true);
    try {
      if (id) await llamar("PUT", { action: "caja", id, nombre, grupo, color });
      else await llamar("POST", { action: "caja", nombre, grupo, color });
      showToast("✓ Caja guardada");
      setEditandoCaja(null);
      cargar();
    } catch (e) { showToast("❌ " + e.message); }
    setOcupado(false);
  };

  const borrarCaja = async (c) => {
    if (!(await confirmar(`¿Borrar la caja "${nombreCaja(c)}"?`))) return;
    try {
      await llamar("DELETE", { action: "caja", id: c.id });
      showToast("✓ Caja borrada");
      setEditandoCaja(null); setCajaId(null); cargar();
    } catch (e) { showToast("❌ " + e.message); }
  };

  const resumen = (lista) => {
    const total = lista.reduce((s, t) => s + (t.cantidad || 0), 0);
    const fuera = prestamos.filter(p => lista.some(t => t.id === p.tipo_id));
    return { total, fuera: fuera.length, atrasadas: fuera.filter(p => diasDesde(p.salida) >= DIAS_AVISO).length };
  };
  const general = resumen(tipos);

  const tarjeta = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: 14, marginBottom: 10 };
  const inputStyle = { width: "100%", background: "var(--bg)", border: "1px solid var(--border-light)", borderRadius: 8, padding: "10px 12px", color: "var(--text)", fontSize: 14, boxSizing: "border-box" };

  const tarjetaTipo = (t) => {
    const fuera = prestamosDe(t.id);
    const libres = (t.cantidad || 0) - fuera.length;
    const pct = t.cantidad ? (libres / t.cantidad) * 100 : 0;
    const hayAtrasadas = fuera.some(p => diasDesde(p.salida) >= DIAS_AVISO);
    return (
      <div key={t.id} onClick={() => abrirTipo(t.id)} style={{ ...tarjeta, cursor: "pointer", borderLeft: `4px solid ${hayAtrasadas ? "var(--red)" : fuera.length ? COLOR : "var(--green)"}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>{t.nombre}</div>
          <div style={{ fontSize: 13, color: "var(--text-2)", whiteSpace: "nowrap" }}>
            {t.cantidad ? <><strong style={{ color: libres ? "var(--green)" : "var(--red)", fontSize: 18 }}>{libres}</strong> / {t.cantidad} disponibles</> : <span style={{ color: COLOR, fontWeight: 700 }}>Pon cuántas hay →</span>}
          </div>
        </div>
        {t.cantidad > 0 && (
          <div style={{ height: 6, borderRadius: 999, background: "var(--bg)", marginTop: 10, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "var(--green)" }} />
          </div>
        )}
        {fuera.length > 0 && (
          <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 8 }}>
            {[...fuera].sort((a, b) => a.numero - b.numero).slice(0, 4).map(p => (
              <span key={p.id} style={{ marginRight: 12, color: diasDesde(p.salida) >= DIAS_AVISO ? "var(--red)" : "var(--text-2)" }}>#{p.numero} {p.persona}</span>
            ))}
            {fuera.length > 4 && <span>y {fuera.length - 4} más</span>}
          </div>
        )}
      </div>
    );
  };

  // Encabezado de una caja: color, nombre, cuantas piezas hay fuera y su QR.
  const encabezadoCaja = (c, lista, abrible, enGrupo) => {
    const r = resumen(lista);
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: enGrupo ? "12px 0 8px" : "18px 0 8px" }}>
        <div onClick={abrible ? () => setCajaId(c.id) : undefined} style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, cursor: abrible ? "pointer" : "default" }}>
          <PuntoCaja color={c.color} size={enGrupo ? 14 : 18} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: enGrupo ? 17 : 20, fontWeight: 800, color: "var(--text)", letterSpacing: ".02em" }}>{enGrupo ? c.nombre : nombreCaja(c)}</div>
            <div style={{ fontSize: 11, color: r.atrasadas ? "var(--red)" : r.fuera ? COLOR : "var(--muted)" }}>
              {lista.length} tipo{lista.length === 1 ? "" : "s"} · {r.total - r.fuera} de {r.total} en su lugar{r.fuera ? ` · ${r.fuera} prestada${r.fuera === 1 ? "" : "s"}` : ""}
            </div>
          </div>
        </div>
        <button onClick={() => setQrDe({ caja: c })} className="btn btn-ghost btn-sm">QR</button>
        <button onClick={() => setEditandoCaja({ id: c.id, nombre: c.nombre, grupo: c.grupo || "", color: c.color || "" })} className="btn btn-ghost btn-sm">✏️</button>
      </div>
    );
  };

  const botonNuevoTipo = (caja_id) => (
    <button onClick={() => setEditando({ nombre: "", cantidad: "", caja_id: caja_id || "" })} style={{ width: "100%", padding: "11px 0", borderRadius: 14, border: `1.5px dashed ${COLOR}`, background: "var(--orange-dim)", color: COLOR, fontWeight: 800, fontSize: 14, cursor: "pointer", marginTop: 2 }}>+ Nuevo tipo de herramienta</button>
  );

  const cajaDelSel = cajaDe(sel);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg)" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "var(--surface)", borderBottom: `2px solid ${COLOR}`, position: "sticky", top: 0, zIndex: 10 }}>
        <img src="/logo192.png" alt="EEMSA" style={{ height: 36, width: "auto" }} />
        <div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 16, color: "var(--text)", letterSpacing: ".06em" }}>EEMSA System</div>
          <div style={{ fontSize: 10, color: COLOR, fontWeight: 700, letterSpacing: ".08em" }}>HERRAMIENTA</div>
        </div>
        <button onClick={() => setQrDe("todos")} style={{ marginLeft: "auto", fontSize: 11, color: COLOR, background: "transparent", border: `1px solid ${COLOR}`, borderRadius: 6, cursor: "pointer", padding: "5px 10px" }}>🖨️ Imprimir QRs</button>
        {onSalir && <button onClick={onSalir} style={{ fontSize: 11, color: "var(--muted)", background: "transparent", border: "none", cursor: "pointer", padding: "4px 8px" }}>← Salir</button>}
      </header>

      <main style={{ flex: 1, padding: "16px 16px 82px", maxWidth: 720, margin: "0 auto", width: "100%" }}>
        {!cargado ? <p className="empty">Cargando…</p> : sel ? (
          <>
            <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} onClick={cerrarTipo}>← {cajaSel ? nombreCaja(cajaSel) : "Todas las cajas"}</button>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 4 }}>
              <h2 className="sec-title" style={{ margin: 0 }}>{sel.nombre}</h2>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setQrDe({ tipo: sel })} className="btn btn-ghost btn-sm">QR</button>
                <button onClick={() => setEditando({ id: sel.id, nombre: sel.nombre, cantidad: String(sel.cantidad || 0), caja_id: sel.caja_id || "" })} className="btn btn-ghost btn-sm">✏️ Editar</button>
              </div>
            </div>
            <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 14, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {cajaDelSel && <><PuntoCaja color={cajaDelSel.color} size={12} /> {nombreCaja(cajaDelSel)} · </>}
              {(sel.cantidad || 0) - prestamosDe(sel.id).length} de {sel.cantidad || 0} disponibles
            </div>

            {!sel.cantidad ? (
              <div style={{ ...tarjeta, textAlign: "center", color: "var(--text-2)" }}>
                Todavía no tiene piezas. Toca <strong>✏️ Editar</strong> y pon cuántas hay; se numeran solas del 1 en adelante.
              </div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
                  Toca las piezas <span style={{ color: "var(--green)", fontWeight: 700 }}>verdes</span> para sacarlas o las <span style={{ color: COLOR, fontWeight: 700 }}>prestadas</span> para regresarlas.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8, marginBottom: 16 }}>
                  {Array.from({ length: sel.cantidad }, (_, i) => i + 1).map(n => {
                    const p = prestamoDePieza(sel.id, n);
                    const marcada = marcadas.includes(n);
                    const atrasada = p && diasDesde(p.salida) >= DIAS_AVISO;
                    const base = p ? (atrasada ? "var(--red)" : COLOR) : "var(--green)";
                    return (
                      <button key={n} type="button" onClick={() => tocarPieza(n)} style={{ textAlign: "left", cursor: "pointer", borderRadius: 12, padding: "10px 10px", border: `2px solid ${marcada ? "var(--text)" : base}`, background: marcada ? base : "var(--card)", color: marcada ? "#0b0d11" : "var(--text)", minHeight: 74 }}>
                        <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 24, fontWeight: 900, lineHeight: 1, color: marcada ? "#0b0d11" : base }}>#{n}</div>
                        {p ? (
                          <>
                            <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.persona}</div>
                            <div style={{ fontSize: 10, opacity: 0.8 }}>{haceCuanto(p.salida)}</div>
                          </>
                        ) : <div style={{ fontSize: 11, marginTop: 6, opacity: 0.8 }}>En su lugar</div>}
                      </button>
                    );
                  })}
                </div>

                {marcadas.length > 0 && !marcadasPrestadas && !pidiendoPersona && (
                  <button className="btn btn-primary btn-block" style={{ padding: 15, fontSize: 16 }} onClick={() => setPidiendoPersona(true)}>
                    Sacar {marcadas.map(n => "#" + n).join(", ")}
                  </button>
                )}
                {marcadas.length > 0 && !marcadasPrestadas && pidiendoPersona && (
                  <div style={{ ...tarjeta, border: `1.5px solid ${COLOR}` }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>¿Quién se lleva {marcadas.map(n => "#" + n).join(", ")}?</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                      {cargarPersonas().map(n => (
                        <button key={n} type="button" onClick={() => setPersona(n)} style={{ padding: "8px 12px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 700, border: `1.5px solid ${persona === n ? COLOR : "var(--border-light)"}`, background: persona === n ? "var(--orange-dim)" : "transparent", color: persona === n ? COLOR : "var(--text-2)" }}>{n}</button>
                      ))}
                    </div>
                    <input value={persona} onChange={e => setPersona(e.target.value)} placeholder="O escribe el nombre" style={{ ...inputStyle, marginBottom: 10 }} />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-primary" style={{ flex: 2 }} disabled={ocupado} onClick={sacar}>{ocupado ? "Guardando…" : "✓ Confirmar"}</button>
                      <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setPidiendoPersona(false)}>Cancelar</button>
                    </div>
                  </div>
                )}
                {marcadasPrestadas && (
                  <button className="btn btn-primary btn-block" style={{ padding: 15, fontSize: 16 }} disabled={ocupado} onClick={regresar}>
                    {ocupado ? "Guardando…" : `↩ Regresar ${marcadas.map(n => "#" + n).join(", ")}`}
                  </button>
                )}
              </>
            )}
          </>
        ) : cajaSel ? (
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => setCajaId(null)}>← Todas las cajas</button>
            {encabezadoCaja(cajaSel, tiposDeCaja(cajaSel.id), false)}
            {tiposDeCaja(cajaSel.id).length === 0 && <div style={{ ...tarjeta, textAlign: "center", color: "var(--text-2)" }}>Esta caja todavía no tiene herramienta.</div>}
            {tiposDeCaja(cajaSel.id).map(tarjetaTipo)}
            {botonNuevoTipo(cajaSel.id)}
          </>
        ) : (
          <>
            <h2 className="sec-title">🔧 Herramienta</h2>
            <div className="stat-grid" style={{ marginBottom: 8 }}>
              <div className="stat-card accent"><div className="stat-val">{general.total}</div><div className="stat-lbl">Piezas</div></div>
              <div className="stat-card green"><div className="stat-val">{general.total - general.fuera}</div><div className="stat-lbl">En su lugar</div></div>
              <div className={`stat-card ${general.fuera ? "orange" : "green"}`}><div className="stat-val">{general.fuera}</div><div className="stat-lbl">Prestadas</div></div>
              <div className={`stat-card ${general.atrasadas ? "red" : "green"}`}><div className="stat-val">{general.atrasadas}</div><div className="stat-lbl">{DIAS_AVISO}+ días fuera</div></div>
            </div>

            {bloques.map(b => b.grupo ? (
              <div key={"g-" + b.grupo} style={{ marginTop: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <PuntoCaja color={b.cajas[0].color} size={18} />
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 20, fontWeight: 800, color: "var(--text)", letterSpacing: ".02em" }}>{b.grupo}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>{b.cajas.length} cajones</div>
                </div>
                <div style={{ borderLeft: "2px solid var(--border-light)", paddingLeft: 12, marginLeft: 8 }}>
                  {b.cajas.map(c => (
                    <div key={c.id}>
                      {encabezadoCaja(c, tiposDeCaja(c.id), true, true)}
                      {tiposDeCaja(c.id).map(tarjetaTipo)}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div key={b.cajas[0].id}>
                {encabezadoCaja(b.cajas[0], tiposDeCaja(b.cajas[0].id), true)}
                {tiposDeCaja(b.cajas[0].id).map(tarjetaTipo)}
              </div>
            ))}
            {sinCaja.length > 0 && (
              <>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 20, fontWeight: 800, color: "var(--muted)", margin: "18px 0 8px" }}>Sin caja</div>
                {sinCaja.map(tarjetaTipo)}
              </>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <div style={{ flex: 1 }}>{botonNuevoTipo(null)}</div>
              <button onClick={() => setEditandoCaja({ nombre: "", grupo: "", color: COLORES_CAJA[0] })} style={{ flex: 1, padding: "11px 0", borderRadius: 14, border: "1.5px dashed var(--border-light)", background: "transparent", color: "var(--text-2)", fontWeight: 800, fontSize: 14, cursor: "pointer", marginTop: 2 }}>+ Nueva caja</button>
            </div>
          </>
        )}
      </main>

      {/* Alta / edicion de un tipo */}
      {editando && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={() => setEditando(null)}>
          <div style={{ background: "var(--surface)", borderRadius: "18px 18px 0 0", width: "100%", maxWidth: 520, padding: "20px 16px 32px", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", marginBottom: 14 }}>{editando.id ? "Editar tipo" : "Nuevo tipo de herramienta"}</div>
            <label style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 600 }}>Nombre</label>
            <input value={editando.nombre} onChange={e => setEditando(x => ({ ...x, nombre: e.target.value }))} placeholder="Ej: Llaves españolas" style={{ ...inputStyle, margin: "4px 0 12px" }} />
            <label style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 600 }}>¿Cuántas hay? <span style={{ color: "var(--muted)", fontWeight: 400 }}>(se numeran del 1 en adelante)</span></label>
            <input type="number" min="0" value={editando.cantidad} onChange={e => setEditando(x => ({ ...x, cantidad: e.target.value }))} placeholder="Ej: 10" style={{ ...inputStyle, margin: "4px 0 12px", fontSize: 18, fontWeight: 800 }} />
            <label style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 600 }}>¿En qué caja va?</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "6px 0 16px" }}>
              {cajas.map(c => {
                const activa = editando.caja_id === c.id;
                return (
                  <button key={c.id} type="button" onClick={() => setEditando(x => ({ ...x, caja_id: c.id }))} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 700, border: `1.5px solid ${activa ? COLOR : "var(--border-light)"}`, background: activa ? "var(--orange-dim)" : "transparent", color: activa ? COLOR : "var(--text-2)" }}>
                    <PuntoCaja color={c.color} size={12} /> {nombreCaja(c)}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 2 }} disabled={ocupado} onClick={guardarTipo}>{ocupado ? "Guardando…" : "✓ Guardar"}</button>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setEditando(null)}>Cancelar</button>
            </div>
            {editando.id && (
              <button onClick={() => borrarTipo(tipos.find(t => t.id === editando.id))} style={{ marginTop: 14, width: "100%", background: "transparent", border: "none", color: "var(--red)", fontSize: 12, cursor: "pointer" }}>Borrar este tipo</button>
            )}
          </div>
        </div>
      )}

      {/* Alta / edicion de una caja */}
      {editandoCaja && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={() => setEditandoCaja(null)}>
          <div style={{ background: "var(--surface)", borderRadius: "18px 18px 0 0", width: "100%", maxWidth: 520, padding: "20px 16px 32px" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", marginBottom: 14 }}>{editandoCaja.id ? "Editar caja" : "Nueva caja"}</div>
            <label style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 600 }}>Nombre</label>
            <input value={editandoCaja.nombre} onChange={e => setEditandoCaja(x => ({ ...x, nombre: e.target.value }))} placeholder="Ej: Caja azul, Cajón 4" style={{ ...inputStyle, margin: "4px 0 12px" }} />
            <label style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 600 }}>¿Es un cajón de un mueble? <span style={{ color: "var(--muted)", fontWeight: 400 }}>(opcional: los cajones con el mismo mueble salen juntos)</span></label>
            <input value={editandoCaja.grupo} onChange={e => setEditandoCaja(x => ({ ...x, grupo: e.target.value }))} placeholder="Ej: Archivero" style={{ ...inputStyle, margin: "4px 0 12px" }} />
            <label style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 600 }}>Color</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "6px 0 16px" }}>
              {COLORES_CAJA.map(col => (
                <button key={col} type="button" onClick={() => setEditandoCaja(x => ({ ...x, color: col }))} style={{ width: 36, height: 36, borderRadius: 8, cursor: "pointer", background: col, border: editandoCaja.color === col ? "3px solid var(--text)" : "1.5px solid var(--border-light)" }} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 2 }} disabled={ocupado} onClick={guardarCaja}>{ocupado ? "Guardando…" : "✓ Guardar"}</button>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setEditandoCaja(null)}>Cancelar</button>
            </div>
            {editandoCaja.id && (
              <button onClick={() => borrarCaja(cajas.find(c => c.id === editandoCaja.id))} style={{ marginTop: 14, width: "100%", background: "transparent", border: "none", color: "var(--red)", fontSize: 12, cursor: "pointer" }}>Borrar esta caja</button>
            )}
          </div>
        </div>
      )}

      {/* QR de una caja o un tipo, o la hoja con todas las cajas para imprimir.
          Va directo en <body> (portal) para que al imprimir se pueda esconder
          toda la app y la hoja fluya en varias paginas sin cortarse. */}
      {qrDe && createPortal(
        <div className="herr-qr-hoja" style={{ position: "fixed", inset: 0, background: "#fff", zIndex: 400, overflowY: "auto", color: "#111" }}>
          <style>{`@media print {
            @page { size: letter; margin: 10mm; }
            body > *:not(.herr-qr-hoja) { display: none !important; }
            html, body { background: #fff !important; height: auto !important; overflow: visible !important; }
            .herr-qr-hoja { position: static !important; overflow: visible !important; inset: auto !important; }
            .herr-no-print { display: none !important; }
            .herr-qr-lista { display: block !important; padding: 0 !important; text-align: left; }
            .herr-qr-card { display: inline-block !important; vertical-align: top; margin: 0 3mm 5mm 0 !important; break-inside: avoid; page-break-inside: avoid; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }`}</style>
          <div className="herr-no-print" style={{ display: "flex", gap: 8, padding: 12, borderBottom: "1px solid #ddd", position: "sticky", top: 0, background: "#fff" }}>
            <button onClick={() => window.print()} style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: "#e8894b", color: "#fff", fontWeight: 800, cursor: "pointer" }}>🖨️ Imprimir</button>
            <button onClick={() => setQrDe(null)} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #ccc", background: "#fff", color: "#333", fontWeight: 700, cursor: "pointer" }}>Cerrar</button>
            <span style={{ alignSelf: "center", fontSize: 12, color: "#666" }}>Pega cada QR en su caja o cajón.</span>
          </div>
          <div className="herr-qr-lista" style={{ display: "flex", flexWrap: "wrap", gap: 16, padding: 16, justifyContent: "center" }}>
            {qrDe.tipo ? (
              <div className="herr-qr-card" style={{ border: "2px solid #111", borderRadius: 12, padding: 10, textAlign: "center", width: 220, boxSizing: "border-box" }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", color: "#666" }}>EEMSA · HERRAMIENTA</div>
                <div style={{ fontSize: 19, fontWeight: 900, margin: "4px 0 10px" }}>{qrDe.tipo.nombre}</div>
                <QRCodeSVG value={urlQR(qrDe.tipo.id)} size={140} />
                <div style={{ fontSize: 11, color: "#444", marginTop: 8 }}>{qrDe.tipo.cantidad ? `Piezas #1 a #${qrDe.tipo.cantidad}` : ""}{cajaDe(qrDe.tipo) ? ` · ${nombreCaja(cajaDe(qrDe.tipo))}` : ""}</div>
                <div style={{ fontSize: 10, color: "#888", marginTop: 4 }}>Escanéalo para sacar o regresar</div>
              </div>
            ) : (qrDe === "todos" ? bloques.flatMap(b => b.cajas) : [qrDe.caja]).map(c => (
              <div key={c.id} className="herr-qr-card" style={{ border: "2px solid #111", borderTop: `10px solid ${c.color || "#111"}`, borderRadius: 12, padding: 10, textAlign: "center", width: 220, boxSizing: "border-box" }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", color: "#666" }}>EEMSA · HERRAMIENTA</div>
                {c.grupo && <div style={{ fontSize: 13, fontWeight: 800, color: "#444", marginTop: 4 }}>{c.grupo}</div>}
                <div style={{ fontSize: 19, fontWeight: 900, margin: c.grupo ? "0 0 10px" : "4px 0 10px" }}>{c.nombre}</div>
                <QRCodeSVG value={urlQRCaja(c.id)} size={140} />
                <div style={{ fontSize: 11, color: "#444", marginTop: 8, lineHeight: 1.4 }}>
                  {tiposDeCaja(c.id).map(t => t.nombre + (t.cantidad ? ` (${t.cantidad})` : "")).join(" · ")}
                </div>
                <div style={{ fontSize: 10, color: "#888", marginTop: 4 }}>Escanéalo para sacar o regresar</div>
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
