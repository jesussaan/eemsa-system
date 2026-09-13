import { useState, useRef, useEffect } from "react";
import { authHeaders } from "../lib/auth";
import { tieneAccesoModulo } from "../lib/jarvis";
import { IcoMic } from "./Icons";

// Pantalla de solo lectura, pensada para consultarse rapido desde el celular.
// Nunca escribe nada ni controla una maquina: las 3 frases conocidas llaman
// /api/registro?tabla=jarvis-app con la sesion normal del usuario (ver
// api/registro.js), gratis e instantaneo, sin IA. Si el texto (escrito o
// dictado) no matchea ninguna de esas 3, se manda a Claude via /api/chat
// (rama "jarvis", ver api/chat.js) -- esa rama tampoco puede escribir nada
// (no se le pasan herramientas) ni usa mas datos que los mismos 3 resumenes
// de siempre. En ningun caso se usa ni se expone JARVIS_API_SECRET ni
// ANTHROPIC_KEY en este archivo ni en ningun otro codigo de React -- viven
// solo del lado del servidor. La voz (entrada y salida) sigue siendo APIs
// del propio navegador, sin servicio externo.
//
// OJO Safari/iOS: SpeechRecognition (voz -> texto) nunca se implemento ahi
// -- ni en Safari de escritorio ni en los navegadores de iOS, que por regla
// de Apple todos corren sobre el motor de Safari por debajo. No hay forma
// de arreglar eso con codigo sin mandar el audio a un servicio externo (lo
// cual se pidio evitar). Por eso el boton "Hablar" solo aparece donde el
// navegador de verdad puede escuchar; en iPhone cae automaticamente al
// dictado nativo del teclado de iOS sobre el mismo campo de texto de
// siempre. La voz de SALIDA (speechSynthesis) si funciona en Safari/iOS.
const FRASES_RAPIDAS = [
  { label: "📋 Pedidos de hoy", texto: "pedidos de hoy" },
  { label: "🖨️ Cómo va la SIAT 1", texto: "cómo va la SIAT 1" },
  { label: "🎞️ Inventario de cinta", texto: "inventario de cinta" },
];

const ETIQUETA_STATUS = { anotado: "anotado(s)", proceso: "en proceso", terminado: "terminado(s)", pendiente: "pendiente(s)" };

// Coincidencia por palabras clave, no un modelo de lenguaje -- determinista
// y sin costo extra para esta primera version. Si no reconoce nada, se lo
// dice al usuario en vez de adivinar.
const interpretarConsulta = (texto) => {
  const t = (texto || "").toLowerCase();
  if (t.includes("siat")) return "siat_1";
  if (t.includes("pedido")) return "pedidos_hoy";
  if (t.includes("inventario") || t.includes("cinta") || t.includes("rollo")) return "inventario_cinta";
  return null;
};

// Number(...toFixed(2)) redondea Y quita ceros de sobra (471.26 se queda
// 471.26, 48.069999999999999 -- error de punto flotante normal al sumar/
// restar decimales -- se ve como 48.07, 76 se queda 76 sin ".00").
const fmtStock = (n) => Number(Number(n || 0).toFixed(2));

const formatearPedidosHoy = (d) => {
  if (d.total === 0) return `Hoy (${d.fecha}) no se ha anotado ningún pedido todavía.`;
  const partes = Object.entries(d.por_status).map(([s, n]) => `${n} ${ETIQUETA_STATUS[s] || s}`).join(", ");
  return `Hoy (${d.fecha}) van ${d.total} pedido${d.total === 1 ? "" : "s"}: ${partes}.`;
};

const formatearSiat1 = (d) => {
  const base = d.pedido_activo
    ? `SIAT L36 #1 está trabajando en el pedido #${d.pedido_activo.num} de ${d.pedido_activo.cliente} (${d.pedido_activo.tipo}, ${d.pedido_activo.medida}).`
    : "SIAT L36 #1 no tiene ningún pedido en proceso ahora mismo.";
  const cajasHoy = fmtStock(d.cajas_hoy);
  const cajas = ` Lleva ${cajasHoy} caja${cajasHoy === 1 ? "" : "s"} hoy${d.meta_cajas ? ` de una meta de ${d.meta_cajas}` : ""}.`;
  return base + cajas;
};

const formatearInventarioCinta = (d) => {
  if (!d.materiales.length) return "No hay materiales de Rollo MP dados de alta.";
  const lineas = d.materiales.map(m => `${m.tipo || m.nombre}: ${fmtStock(m.stock)} ${m.unidad}${m.bajo ? " ⚠ bajo" : ""}`);
  return `Inventario de Rollo MP:\n${lineas.join("\n")}`;
};

// undefined mientras el navegador no ha definido si existe -- SSR/primera
// carga -- null cuando ya se confirmo que no existe.
const RecognitionCtor = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition || null) : null;

export default function Jarvis({ onSalir, onIrAlPanel, perfil }) {
  const [resumen, setResumen] = useState({}); // { produccion, inventario_critico, agenda, reportes }
  const [historial, setHistorial] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [leerEnVoz, setLeerEnVoz] = useState(true);
  const [hablando, setHablando] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const [ultimaRespuesta, setUltimaRespuesta] = useState("");
  const [vozEs, setVozEs] = useState(null);
  const [mostrarTokens, setMostrarTokens] = useState(false);
  const [tokens, setTokens] = useState([]);
  const [tokenNuevo, setTokenNuevo] = useState(null);
  const [generandoToken, setGenerandoToken] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);

  const puedeHablar = typeof window !== "undefined" && "speechSynthesis" in window;
  const puedeEscuchar = !!RecognitionCtor;

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [historial, loading]);

  // "Mi resumen" -- dashboard por rol: solo pide (y solo muestra) las
  // tarjetas para las que este usuario de verdad tiene el modo dueño del
  // modulo (tieneAccesoModulo, la misma regla que ya aplica el servidor en
  // api/registro.js -- aqui nomas evita pedir algo que de todos modos va a
  // regresar 401). Operador ve Produccion; Inventario ve + esa tarjeta;
  // Supervisor ve todo; Direccion ve solo Reportes (resumen ejecutivo, sin
  // detalle operativo).
  useEffect(() => {
    if (!perfil) return;
    const usuario = { modos: perfil.modos || [], esAdmin: !!perfil.esAdmin };
    const consultas = ["produccion_todas", "inventario_critico", "agenda_urgente", "reportes_mes"]
      .filter(c => tieneAccesoModulo({ produccion_todas: "produccion", inventario_critico: "inventario", agenda_urgente: "agenda", reportes_mes: "reportes" }[c], usuario));
    consultas.forEach(async (c) => {
      try {
        const res = await fetch(`/api/registro?tabla=jarvis-app&consulta=${c}`, { headers: authHeaders() });
        const data = await res.json();
        if (res.ok) setResumen(r => ({ ...r, [c]: data }));
      } catch { /* una tarjeta que falla no debe tumbar las demas */ }
    });
  }, [perfil]);

  // getVoices() puede llegar vacio la primera vez (carga async, sobre todo
  // en Safari) -- se reintenta con onvoiceschanged. Se prefiere es-MX, si no
  // cualquier voz en espanol disponible en el dispositivo.
  useEffect(() => {
    if (!puedeHablar) return;
    const cargarVoces = () => {
      const voces = window.speechSynthesis.getVoices();
      const elegida = voces.find(v => v.lang?.toLowerCase() === "es-mx") || voces.find(v => v.lang?.toLowerCase().startsWith("es")) || null;
      setVozEs(elegida);
    };
    cargarVoces();
    window.speechSynthesis.onvoiceschanged = cargarVoces;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, [puedeHablar]);

  const hablar = (texto) => {
    if (!puedeHablar || !texto) return;
    window.speechSynthesis.cancel();
    const utt = new window.SpeechSynthesisUtterance(texto.replace(/[⚠❌\n]/g, " "));
    utt.lang = "es-MX";
    if (vozEs) utt.voice = vozEs;
    utt.onstart = () => setHablando(true);
    utt.onend = () => setHablando(false);
    utt.onerror = () => setHablando(false);
    window.speechSynthesis.speak(utt);
  };

  const detenerVoz = () => {
    if (!puedeHablar) return;
    window.speechSynthesis.cancel();
    setHablando(false);
  };

  const preguntar = async (textoDirecto) => {
    const texto = (textoDirecto ?? input).trim();
    if (!texto || loading) return;
    setInput("");

    const consulta = interpretarConsulta(texto);
    setLoading(true);
    let respuesta;
    try {
      if (consulta) {
        // Camino gratis e instantaneo -- sin llamar a Claude -- para las 3
        // frases que ya reconoce el filtro de palabras clave.
        const res = await fetch(`/api/registro?tabla=jarvis-app&consulta=${consulta}`, { headers: authHeaders() });
        const data = await res.json();
        if (!res.ok || data.error) respuesta = `❌ ${data.error || "Error al consultar."}`;
        else if (consulta === "pedidos_hoy") respuesta = formatearPedidosHoy(data);
        else if (consulta === "siat_1") respuesta = formatearSiat1(data);
        else respuesta = formatearInventarioCinta(data);
      } else {
        // El filtro no reconocio la frase -- se manda a Claude (ver
        // api/chat.js, rama jarvis) en vez de decir "no entendí". Sigue
        // siendo de solo lectura: esa rama no tiene herramientas de
        // escritura ni usa mas datos que los mismos 3 resumenes de arriba.
        const historialMsgs = historial.flatMap(h => [
          { role: "user", content: h.pregunta },
          { role: "assistant", content: h.respuesta },
        ]);
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ jarvis: true, messages: [...historialMsgs, { role: "user", content: texto }] }),
        });
        const data = await res.json();
        respuesta = (!res.ok || data.error) ? `❌ ${data.error || "Error al consultar."}` : (data.reply || "Sin respuesta.");
      }
    } catch {
      respuesta = "❌ Error de conexión.";
    }
    setHistorial(h => [...h, { pregunta: texto, respuesta }]);
    setUltimaRespuesta(respuesta);
    setLoading(false);
    if (leerEnVoz) hablar(respuesta);
  };

  // Un solo toque: escucha una frase, la transcribe y la manda directo a
  // preguntar() -- mismo pipeline que escribir a mano o tocar un boton
  // rapido. Solo existe en navegadores que de verdad soportan
  // SpeechRecognition (ver nota arriba del archivo sobre Safari/iOS).
  const escuchar = () => {
    if (!puedeEscuchar || escuchando || loading) return;
    const rec = new RecognitionCtor();
    rec.lang = "es-MX";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    recognitionRef.current = rec;
    rec.onstart = () => setEscuchando(true);
    rec.onerror = () => setEscuchando(false);
    rec.onend = () => setEscuchando(false);
    rec.onresult = (e) => {
      const texto = e.results?.[0]?.[0]?.transcript;
      if (texto) preguntar(texto);
    };
    try { rec.start(); } catch { setEscuchando(false); }
  };

  const detenerEscucha = () => { recognitionRef.current?.stop(); setEscuchando(false); };

  // Acceso personal y revocable para Atajos de Siri (ver
  // supabase_jarvis_tokens.sql y la rama x-jarvis-token en api/chat.js). El
  // valor real del token solo llega aqui una vez, al crearlo -- de ahi en
  // adelante el servidor solo guarda su hash, asi que no hay forma de
  // volver a mostrarlo, solo revocarlo y generar uno nuevo.
  const cargarTokens = async () => {
    try {
      const res = await fetch("/api/registro?tabla=jarvis-tokens", { headers: authHeaders() });
      const data = await res.json();
      if (Array.isArray(data)) setTokens(data);
    } catch { /* silencioso -- no es critico para el resto de la pantalla */ }
  };

  const abrirTokens = () => { setMostrarTokens(v => !v); if (!mostrarTokens) cargarTokens(); };

  const generarToken = async () => {
    if (generandoToken) return;
    setGenerandoToken(true);
    setTokenNuevo(null);
    try {
      const res = await fetch("/api/registro?tabla=jarvis-tokens", {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ nombre: "Atajo de Siri" }),
      });
      const data = await res.json();
      if (res.ok && data.token) { setTokenNuevo(data.token); cargarTokens(); }
    } catch { /* el boton se puede volver a tocar */ }
    setGenerandoToken(false);
  };

  const revocarToken = async (id) => {
    try {
      await fetch("/api/registro?tabla=jarvis-tokens", { method: "DELETE", headers: authHeaders(), body: JSON.stringify({ id }) });
      cargarTokens();
    } catch { /* el boton se puede volver a tocar */ }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg)" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "var(--surface)", borderBottom: "2px solid var(--tan)", position: "sticky", top: 0, zIndex: 10 }}>
        <img src="/logo192.png" alt="EEMSA" style={{ height: 36, width: "auto" }} />
        <div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 16, color: "#e0e0e0", letterSpacing: ".06em" }}>EEMSA System</div>
          <div style={{ fontSize: 10, color: "var(--tan)", fontWeight: 700, letterSpacing: ".08em" }}>JARVIS</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {onIrAlPanel && <button onClick={onIrAlPanel} className="btn btn-ghost btn-sm">🖥️ Ir al panel</button>}
          {onSalir && <button onClick={onSalir} style={{ fontSize: 11, color: "#666", background: "transparent", border: "none", cursor: "pointer", padding: "4px 8px" }}>← Salir</button>}
        </div>
      </header>

      <main style={{ flex: 1, padding: "16px 16px 82px", maxWidth: 640, margin: "0 auto", width: "100%" }}>
        <h2 className="sec-title"><Ico icon={IcoMic} /> Jarvis</h2>
        <p className="muted" style={{ marginBottom: 12 }}>Preguntas rápidas de solo lectura — nada de esto cambia datos ni controla una máquina.</p>

        {(resumen.produccion_todas || resumen.inventario_critico || resumen.agenda_urgente || resumen.reportes_mes) && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 16 }}>
            {resumen.produccion_todas?.maquinas?.map(m => (
              <div key={m.maquina} style={{ background: "var(--surface)", border: "1px solid var(--border, #2a2d3a)", borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 10, color: "#666", fontWeight: 700 }}>{m.maquina}</div>
                <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{m.pedido_activo ? `#${m.pedido_activo.num} ${m.pedido_activo.cliente}` : "Libre"}</div>
                <div className="muted" style={{ fontSize: 11 }}>{fmtStock(m.cajas_hoy)}{m.meta_cajas ? `/${m.meta_cajas}` : ""} cajas hoy</div>
              </div>
            ))}
            {resumen.inventario_critico && (
              <div style={{ background: "var(--surface)", border: "1px solid var(--border, #2a2d3a)", borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 10, color: "#666", fontWeight: 700 }}>📦 INVENTARIO CRÍTICO</div>
                <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2, color: resumen.inventario_critico.materiales.length ? "#ff4d4d" : undefined }}>
                  {resumen.inventario_critico.materiales.length}
                </div>
                <div className="muted" style={{ fontSize: 11 }}>{resumen.inventario_critico.materiales.slice(0, 2).map(m => m.nombre).join(", ") || "todo en orden"}</div>
              </div>
            )}
            {resumen.agenda_urgente && (
              <div style={{ background: "var(--surface)", border: "1px solid var(--border, #2a2d3a)", borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 10, color: "#666", fontWeight: 700 }}>📅 ATRASADOS</div>
                <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2, color: resumen.agenda_urgente.atrasados.length ? "#ff4d4d" : undefined }}>
                  {resumen.agenda_urgente.atrasados.length}
                </div>
                <div className="muted" style={{ fontSize: 11 }}>{resumen.agenda_urgente.proximos.length} próximos</div>
              </div>
            )}
            {resumen.reportes_mes && (
              <div style={{ background: "var(--surface)", border: "1px solid var(--border, #2a2d3a)", borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 10, color: "#666", fontWeight: 700 }}>📊 MES ({resumen.reportes_mes.mes})</div>
                <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{fmtStock(resumen.reportes_mes.cajas_producidas_mes)} cajas</div>
                <div className="muted" style={{ fontSize: 11 }}>Merma {resumen.reportes_mes.merma_pct_mes ?? "—"}% · {resumen.reportes_mes.pedidos_terminados_mes} terminados</div>
              </div>
            )}
          </div>
        )}

        {puedeEscuchar ? (
          <button
            className="btn btn-primary"
            onClick={escuchando ? detenerEscucha : escuchar}
            disabled={loading}
            style={{
              width: "100%", padding: "16px 0", fontSize: 16, fontWeight: 800, marginBottom: 10,
              background: escuchando ? "var(--red, #e84b4b)" : undefined,
            }}
          >
            {escuchando ? "🎙️ Escuchando… (toca para cancelar)" : "🎙️ Hablar"}
          </button>
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.focus()}
            style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(201,146,42,0.1)", border: "1px solid rgba(201,146,42,0.3)", color: "#c9922a", fontSize: 12.5, marginBottom: 10, cursor: "pointer" }}
          >
            🎤 Dictado por voz no disponible en este navegador (normal en Safari/iPhone) — toca aquí o el campo de abajo y usa el micrófono de tu teclado para dictar.
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {FRASES_RAPIDAS.map(f => (
            <button key={f.texto} className="btn btn-ghost btn-sm" disabled={loading} onClick={() => preguntar(f.texto)}>{f.label}</button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 10 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#999", cursor: puedeHablar ? "pointer" : "not-allowed" }}>
            <input type="checkbox" checked={leerEnVoz} disabled={!puedeHablar} onChange={e => setLeerEnVoz(e.target.checked)} />
            🔊 Leer respuestas automáticamente{!puedeHablar ? " (no disponible)" : ""}
          </label>
          {puedeHablar && (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => hablar(ultimaRespuesta)} disabled={!ultimaRespuesta || hablando}>🔁 Repetir</button>
              <button className="btn btn-ghost btn-sm" onClick={detenerVoz} disabled={!hablando}>⏹ Detener voz</button>
            </>
          )}
        </div>

        <div className="chat-box">
          {historial.length === 0 && <div className="msg msg-a">Escribe, dicta o toca "Hablar" para hacer una pregunta.</div>}
          {historial.map((h, i) => (
            <div key={i}>
              <div className="msg msg-u">{h.pregunta}</div>
              <div className="msg msg-a" style={{ whiteSpace: "pre-line", display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                <span>{h.respuesta}</span>
                {puedeHablar && (
                  <button onClick={() => hablar(h.respuesta)} title="Leer en voz alta" style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 15, flexShrink: 0 }}>🔊</button>
                )}
              </div>
            </div>
          ))}
          {loading && <div className="msg msg-a typing">Consultando…</div>}
          <div ref={bottomRef} />
        </div>

        <div className="chat-row">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && preguntar()}
            placeholder='Escribe o dicta: "pedidos de hoy"…'
            disabled={loading}
          />
          <button className="btn btn-primary" onClick={() => preguntar()} disabled={loading || !input.trim()}>Enviar</button>
        </div>

        <div style={{ marginTop: 24, borderTop: "1px solid var(--border, #2a2d3a)", paddingTop: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={abrirTokens}>🔑 Acceso para Atajos de Siri {mostrarTokens ? "▲" : "▼"}</button>

          {mostrarTokens && (
            <div style={{ marginTop: 10 }}>
              <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                Genera un token personal para preguntarle a Jarvis desde un Atajo de Siri en tu iPhone, sin abrir la app. Es de solo lectura, hereda tus mismos permisos, y lo puedes revocar cuando quieras.
              </p>

              {tokenNuevo && (
                <div style={{ background: "rgba(75,232,122,0.1)", border: "1px solid rgba(75,232,122,0.35)", borderRadius: 8, padding: 12, marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: "#4be87a", fontWeight: 700, marginBottom: 6 }}>⚠ Cópialo ahora — no se vuelve a mostrar</div>
                  <code style={{ display: "block", wordBreak: "break-all", fontSize: 12, background: "#0d0f14", padding: 8, borderRadius: 6 }}>{tokenNuevo}</code>
                  <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => navigator.clipboard?.writeText(tokenNuevo)}>📋 Copiar</button>
                </div>
              )}

              <button className="btn btn-primary btn-sm" onClick={generarToken} disabled={generandoToken} style={{ marginBottom: 12 }}>
                {generandoToken ? "Generando…" : "➕ Generar nuevo token"}
              </button>

              {tokens.length === 0 ? (
                <p className="muted" style={{ fontSize: 12 }}>Todavía no tienes ningún token generado.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {tokens.map(t => (
                    <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 12, background: "var(--surface)", border: "1px solid var(--border, #2a2d3a)", borderRadius: 8, padding: "8px 10px" }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{t.nombre}</div>
                        <div className="muted" style={{ fontSize: 11 }}>
                          {t.revoked_at ? "Revocado" : t.ultimo_uso ? `Último uso: ${new Date(t.ultimo_uso).toLocaleString("es-MX")}` : "Nunca usado"}
                        </div>
                      </div>
                      {!t.revoked_at && <button className="btn btn-ghost btn-sm" onClick={() => revocarToken(t.id)}>Revocar</button>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

const Ico = ({ icon: I, size = 18 }) => <span style={{ display: "inline-flex", fontSize: size, verticalAlign: -3, marginRight: 4 }}><I /></span>;
