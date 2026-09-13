import { useState, useRef, useEffect } from "react";
import { authHeaders } from "../lib/auth";
import { IcoMic } from "./Icons";

// Pantalla de solo lectura, pensada para consultarse rapido desde el celular.
// Nunca escribe nada ni controla una maquina: solo llama
// /api/registro?tabla=jarvis-app con la sesion normal del usuario (ver
// api/registro.js) -- el secreto JARVIS_API_SECRET no existe en este
// archivo ni en ningun otro codigo de React. Sin IA ni servicio externo:
// tanto la voz de entrada como la de salida son APIs del propio navegador.
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

export default function Jarvis({ onSalir }) {
  const [historial, setHistorial] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [leerEnVoz, setLeerEnVoz] = useState(true);
  const [hablando, setHablando] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const [ultimaRespuesta, setUltimaRespuesta] = useState("");
  const [vozEs, setVozEs] = useState(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);

  const puedeHablar = typeof window !== "undefined" && "speechSynthesis" in window;
  const puedeEscuchar = !!RecognitionCtor;

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [historial, loading]);

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
    if (!consulta) {
      const respuesta = 'No reconocí esa consulta. Usa uno de los botones de arriba, o incluye "pedido", "SIAT" o "inventario"/"cinta".';
      setHistorial(h => [...h, { pregunta: texto, respuesta }]);
      setUltimaRespuesta(respuesta);
      if (leerEnVoz) hablar(respuesta);
      return;
    }

    setLoading(true);
    let respuesta;
    try {
      const res = await fetch(`/api/registro?tabla=jarvis-app&consulta=${consulta}`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok || data.error) respuesta = `❌ ${data.error || "Error al consultar."}`;
      else if (consulta === "pedidos_hoy") respuesta = formatearPedidosHoy(data);
      else if (consulta === "siat_1") respuesta = formatearSiat1(data);
      else respuesta = formatearInventarioCinta(data);
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

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg)" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "var(--surface)", borderBottom: "2px solid var(--tan)", position: "sticky", top: 0, zIndex: 10 }}>
        <img src="/logo192.png" alt="EEMSA" style={{ height: 36, width: "auto" }} />
        <div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 16, color: "#e0e0e0", letterSpacing: ".06em" }}>EEMSA System</div>
          <div style={{ fontSize: 10, color: "var(--tan)", fontWeight: 700, letterSpacing: ".08em" }}>JARVIS</div>
        </div>
        {onSalir && <button onClick={onSalir} style={{ marginLeft: "auto", fontSize: 11, color: "#666", background: "transparent", border: "none", cursor: "pointer", padding: "4px 8px" }}>← Salir</button>}
      </header>

      <main style={{ flex: 1, padding: "16px 16px 82px", maxWidth: 640, margin: "0 auto", width: "100%" }}>
        <h2 className="sec-title"><Ico icon={IcoMic} /> Jarvis</h2>
        <p className="muted" style={{ marginBottom: 12 }}>Preguntas rápidas de solo lectura — nada de esto cambia datos ni controla una máquina.</p>

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
      </main>
    </div>
  );
}

const Ico = ({ icon: I, size = 18 }) => <span style={{ display: "inline-flex", fontSize: size, verticalAlign: -3, marginRight: 4 }}><I /></span>;
