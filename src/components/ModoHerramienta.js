import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "../lib/supabase";
import { authHeaders } from "../lib/auth";
import { confirmar } from "../lib/confirm";
import { OPERADORES, REBOB_OPERADORES } from "../lib/constants";

// Control de herramientas del taller (modo "herramienta", ver App.js).
// Cada tipo (Desarmadores, Pinzas de presion...) tiene `cantidad` piezas
// numeradas del 1 en adelante, y su propio QR (/herramienta/<id>) que se
// pega donde se guardan: al escanearlo se abre ese tipo para sacar o
// regresar piezas. Tablas y reglas en supabase_herramientas.sql; escritura
// por /api/inventario?modulo=herramientas (api/_lib/herramientas.js).
const API = "/api/inventario?modulo=herramientas";
const DIAS_AVISO = 3; // una pieza fuera mas de esto sale en naranja
const COLOR = "var(--orange)";

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

export default function ModoHerramienta({ onSalir, tipoInicial }) {
  const [tipos, setTipos] = useState([]);
  const [prestamos, setPrestamos] = useState([]); // solo abiertos
  const [cargado, setCargado] = useState(false);
  const [selId, setSelId] = useState(tipoInicial || null);
  const [marcadas, setMarcadas] = useState([]); // numeros seleccionados en el detalle
  const [pidiendoPersona, setPidiendoPersona] = useState(false);
  const [persona, setPersona] = useState("");
  const [editando, setEditando] = useState(null); // { id?, nombre, cantidad, ubicacion }
  const [qrDe, setQrDe] = useState(null); // tipo para ver su QR | "todos"
  const [toast, setToast] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const showToast = (t) => { setToast(t); setTimeout(() => setToast(""), 2800); };

  const cargar = async () => {
    const [{ data: t }, { data: p }] = await Promise.all([
      supabase.from("herramienta_tipos").select("*").order("orden").order("nombre"),
      supabase.from("herramienta_prestamos").select("*").is("regreso", null),
    ]);
    setTipos(t || []);
    setPrestamos(p || []);
    setCargado(true);
  };

  useEffect(() => {
    cargar();
    const canal = supabase.channel("rt_herramientas")
      .on("postgres_changes", { event: "*", schema: "public", table: "herramienta_tipos" }, () => cargar())
      .on("postgres_changes", { event: "*", schema: "public", table: "herramienta_prestamos" }, () => cargar())
      .subscribe();
    return () => supabase.removeChannel(canal);
  }, []);

  const prestamosDe = (tipoId) => prestamos.filter(p => p.tipo_id === tipoId);
  const prestamoDePieza = (tipoId, numero) => prestamos.find(p => p.tipo_id === tipoId && p.numero === numero);
  const sel = tipos.find(t => t.id === selId) || null;

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
    const { id, nombre, cantidad, ubicacion } = editando;
    if (!String(nombre || "").trim()) { showToast("⚠ Ponle nombre"); return; }
    setOcupado(true);
    try {
      if (id) await llamar("PUT", { action: "tipo", id, nombre, cantidad, ubicacion });
      else await llamar("POST", { action: "tipo", nombre, cantidad, ubicacion });
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

  const totalPiezas = tipos.reduce((s, t) => s + (t.cantidad || 0), 0);
  const totalFuera = prestamos.length;
  const atrasadas = prestamos.filter(p => diasDesde(p.salida) >= DIAS_AVISO).length;

  const tarjeta = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: 14, marginBottom: 10 };
  const inputStyle = { width: "100%", background: "var(--bg)", border: "1px solid var(--border-light)", borderRadius: 8, padding: "10px 12px", color: "var(--text)", fontSize: 14, boxSizing: "border-box" };

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
        {!cargado ? <p className="empty">Cargando…</p> : !sel ? (
          <>
            <h2 className="sec-title">🔧 Herramienta</h2>
            <div className="stat-grid" style={{ marginBottom: 16 }}>
              <div className="stat-card accent"><div className="stat-val">{totalPiezas}</div><div className="stat-lbl">Piezas</div></div>
              <div className="stat-card green"><div className="stat-val">{totalPiezas - totalFuera}</div><div className="stat-lbl">En su lugar</div></div>
              <div className={`stat-card ${totalFuera ? "orange" : "green"}`}><div className="stat-val">{totalFuera}</div><div className="stat-lbl">Prestadas</div></div>
              <div className={`stat-card ${atrasadas ? "red" : "green"}`}><div className="stat-val">{atrasadas}</div><div className="stat-lbl">{DIAS_AVISO}+ días fuera</div></div>
            </div>

            {tipos.map(t => {
              const fuera = prestamosDe(t.id);
              const libres = (t.cantidad || 0) - fuera.length;
              const pct = t.cantidad ? (libres / t.cantidad) * 100 : 0;
              const hayAtrasadas = fuera.some(p => diasDesde(p.salida) >= DIAS_AVISO);
              return (
                <div key={t.id} onClick={() => abrirTipo(t.id)} style={{ ...tarjeta, cursor: "pointer", borderLeft: `4px solid ${hayAtrasadas ? "var(--red)" : fuera.length ? COLOR : "var(--green)"}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <div style={{ fontSize: 17, fontWeight: 800, color: "var(--text)" }}>{t.nombre}</div>
                    <div style={{ fontSize: 13, color: "var(--text-2)", whiteSpace: "nowrap" }}>
                      {t.cantidad ? <><strong style={{ color: libres ? "var(--green)" : "var(--red)", fontSize: 18 }}>{libres}</strong> / {t.cantidad} disponibles</> : <span style={{ color: COLOR, fontWeight: 700 }}>Pon cuántas hay →</span>}
                    </div>
                  </div>
                  {t.ubicacion && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>📍 {t.ubicacion}</div>}
                  {t.cantidad > 0 && (
                    <div style={{ height: 6, borderRadius: 999, background: "var(--bg)", marginTop: 10, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: "var(--green)" }} />
                    </div>
                  )}
                  {fuera.length > 0 && (
                    <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 8 }}>
                      {fuera.sort((a, b) => a.numero - b.numero).slice(0, 4).map(p => (
                        <span key={p.id} style={{ marginRight: 12, color: diasDesde(p.salida) >= DIAS_AVISO ? "var(--red)" : "var(--text-2)" }}>#{p.numero} {p.persona}</span>
                      ))}
                      {fuera.length > 4 && <span>y {fuera.length - 4} más</span>}
                    </div>
                  )}
                </div>
              );
            })}

            <button onClick={() => setEditando({ nombre: "", cantidad: "", ubicacion: "" })} style={{ width: "100%", padding: "13px 0", borderRadius: 14, border: `1.5px dashed ${COLOR}`, background: "var(--orange-dim)", color: COLOR, fontWeight: 800, fontSize: 15, cursor: "pointer", marginTop: 6 }}>+ Nuevo tipo de herramienta</button>
          </>
        ) : (
          <>
            <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} onClick={cerrarTipo}>← Todas</button>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 4 }}>
              <h2 className="sec-title" style={{ margin: 0 }}>{sel.nombre}</h2>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setQrDe(sel)} className="btn btn-ghost btn-sm">QR</button>
                <button onClick={() => setEditando({ id: sel.id, nombre: sel.nombre, cantidad: String(sel.cantidad || 0), ubicacion: sel.ubicacion || "" })} className="btn btn-ghost btn-sm">✏️ Editar</button>
              </div>
            </div>
            <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 14 }}>
              {sel.ubicacion && <>📍 {sel.ubicacion} · </>}
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
        )}
      </main>

      {/* Alta / edicion de un tipo */}
      {editando && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={() => setEditando(null)}>
          <div style={{ background: "var(--surface)", borderRadius: "18px 18px 0 0", width: "100%", maxWidth: 520, padding: "20px 16px 32px" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", marginBottom: 14 }}>{editando.id ? "Editar tipo" : "Nuevo tipo de herramienta"}</div>
            <label style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 600 }}>Nombre</label>
            <input value={editando.nombre} onChange={e => setEditando(x => ({ ...x, nombre: e.target.value }))} placeholder="Ej: Llaves españolas" style={{ ...inputStyle, margin: "4px 0 12px" }} />
            <label style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 600 }}>¿Cuántas hay? <span style={{ color: "var(--muted)", fontWeight: 400 }}>(se numeran del 1 en adelante)</span></label>
            <input type="number" min="0" value={editando.cantidad} onChange={e => setEditando(x => ({ ...x, cantidad: e.target.value }))} placeholder="Ej: 10" style={{ ...inputStyle, margin: "4px 0 12px", fontSize: 18, fontWeight: 800 }} />
            <label style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 600 }}>¿Dónde se guardan? <span style={{ color: "var(--muted)", fontWeight: 400 }}>(opcional)</span></label>
            <input value={editando.ubicacion} onChange={e => setEditando(x => ({ ...x, ubicacion: e.target.value }))} placeholder="Ej: Tablero junto a la SIAT" style={{ ...inputStyle, margin: "4px 0 16px" }} />
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

      {/* QR de un tipo, o la hoja con todos para imprimir */}
      {qrDe && (
        <div className="herr-qr-hoja" style={{ position: "fixed", inset: 0, background: "#fff", zIndex: 400, overflowY: "auto", color: "#111" }}>
          <style>{`@media print { body * { visibility: hidden; } .herr-qr-hoja, .herr-qr-hoja * { visibility: visible; } .herr-qr-hoja { position: absolute !important; inset: 0; } .herr-no-print { display: none !important; } }`}</style>
          <div className="herr-no-print" style={{ display: "flex", gap: 8, padding: 12, borderBottom: "1px solid #ddd", position: "sticky", top: 0, background: "#fff" }}>
            <button onClick={() => window.print()} style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: "#e8894b", color: "#fff", fontWeight: 800, cursor: "pointer" }}>🖨️ Imprimir</button>
            <button onClick={() => setQrDe(null)} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #ccc", background: "#fff", color: "#333", fontWeight: 700, cursor: "pointer" }}>Cerrar</button>
            <span style={{ alignSelf: "center", fontSize: 12, color: "#666" }}>Pégalo donde se guarda ese tipo de herramienta.</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: qrDe === "todos" ? "repeat(auto-fill, minmax(230px, 1fr))" : "1fr", gap: 16, padding: 16, justifyItems: "center" }}>
            {(qrDe === "todos" ? tipos : [qrDe]).map(t => (
              <div key={t.id} style={{ border: "2px solid #111", borderRadius: 12, padding: 14, textAlign: "center", width: 220, breakInside: "avoid" }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", color: "#666" }}>EEMSA · HERRAMIENTA</div>
                <div style={{ fontSize: 19, fontWeight: 900, margin: "4px 0 10px" }}>{t.nombre}</div>
                <QRCodeSVG value={urlQR(t.id)} size={170} />
                <div style={{ fontSize: 11, color: "#444", marginTop: 8 }}>{t.cantidad ? `Piezas #1 a #${t.cantidad}` : ""}{t.ubicacion ? ` · ${t.ubicacion}` : ""}</div>
                <div style={{ fontSize: 10, color: "#888", marginTop: 4 }}>Escanéalo para sacar o regresar</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
