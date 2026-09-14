import { useState, useRef, useEffect } from "react";
import { authHeaders } from "../lib/auth";

// Botón flotante minimalista, disponible en cualquier pantalla para quien
// tenga el modo "jarvis" (o sea admin) -- ya no es una pantalla/módulo
// aparte. Nunca escribe nada ni controla una máquina: las 3 frases
// conocidas llaman /api/registro?tabla=jarvis-app con la sesión normal del
// usuario (ver api/registro.js), gratis e instantáneo, sin IA. Si el texto
// (dictado) no matchea ninguna de esas 3, se manda a Claude via /api/chat
// (rama "jarvis", ver api/chat.js) -- esa rama tampoco puede escribir nada
// (no se le pasan herramientas) ni usa más datos que los mismos resúmenes
// de siempre. En ningún caso se usa ni se expone JARVIS_API_SECRET ni
// ANTHROPIC_KEY en este archivo ni en ningún otro código de React -- viven
// solo del lado del servidor. La voz (entrada y salida) sigue siendo APIs
// del propio navegador, sin servicio externo.
//
// No hay transcripción ni historial en pantalla: se responde con voz y una
// tarjeta breve que se cierra sola.
//
// OJO Safari/iOS: SpeechRecognition (voz -> texto) nunca se implementó ahí
// -- ni en Safari de escritorio ni en los navegadores de iOS, que por regla
// de Apple todos corren sobre el motor de Safari por debajo. No hay forma
// de arreglar eso con código sin mandar el audio a un servicio externo (lo
// cual se pidió evitar). Por eso, donde no hay SpeechRecognition, tocar el
// botón enfoca un campo minúsculo para abrir el dictado nativo del teclado
// (en iPhone, el micrófono del teclado de iOS) sobre ese mismo campo. La voz
// de SALIDA (speechSynthesis) sí funciona en Safari/iOS.
const ETIQUETA_STATUS = { anotado: "anotado(s)", proceso: "en proceso", terminado: "terminado(s)", pendiente: "pendiente(s)" };

// Coincidencia por palabras clave, no un modelo de lenguaje -- determinista
// y sin costo extra para esta primera versión. Si no reconoce nada, se lo
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
// carga -- null cuando ya se confirmó que no existe.
const RecognitionCtor = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition || null) : null;

export default function Jarvis({ perfil }) {
  const [input, setInput] = useState("");
  const [dictando, setDictando] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hablando, setHablando] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const [ultimaRespuesta, setUltimaRespuesta] = useState("");
  const [mostrarTarjeta, setMostrarTarjeta] = useState(false);
  const [vozEs, setVozEs] = useState(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const ocultarTimerRef = useRef(null);

  const puedeHablar = typeof window !== "undefined" && "speechSynthesis" in window;
  const puedeEscuchar = !!RecognitionCtor;

  const tieneAcceso = !!perfil && (perfil.esAdmin || perfil.modos?.includes("jarvis"));

  // getVoices() puede llegar vacío la primera vez (carga async, sobre todo
  // en Safari) -- se reintenta con onvoiceschanged. Se prefiere es-MX, si no
  // cualquier voz en español disponible en el dispositivo.
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

  useEffect(() => { if (dictando) inputRef.current?.focus(); }, [dictando]);

  // La tarjeta de respuesta se cierra sola -- no queda historial en pantalla.
  useEffect(() => {
    if (!mostrarTarjeta) return;
    clearTimeout(ocultarTimerRef.current);
    ocultarTimerRef.current = setTimeout(() => setMostrarTarjeta(false), 9000);
    return () => clearTimeout(ocultarTimerRef.current);
  }, [mostrarTarjeta, ultimaRespuesta]);

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
    const texto = (textoDirecto ?? "").trim();
    if (!texto || loading) return;

    const consulta = interpretarConsulta(texto);
    setLoading(true);
    let respuesta;
    try {
      if (consulta) {
        // Camino gratis e instantáneo -- sin llamar a Claude -- para las 3
        // frases que ya reconoce el filtro de palabras clave.
        const res = await fetch(`/api/registro?tabla=jarvis-app&consulta=${consulta}`, { headers: authHeaders() });
        const data = await res.json();
        if (!res.ok || data.error) respuesta = `❌ ${data.error || "Error al consultar."}`;
        else if (consulta === "pedidos_hoy") respuesta = formatearPedidosHoy(data);
        else if (consulta === "siat_1") respuesta = formatearSiat1(data);
        else respuesta = formatearInventarioCinta(data);
      } else {
        // El filtro no reconoció la frase -- se manda a Claude (ver
        // api/chat.js, rama jarvis) en vez de decir "no entendí". Sigue
        // siendo de solo lectura: esa rama no tiene herramientas de
        // escritura ni usa más datos que los mismos resúmenes de arriba.
        // No se manda historial previo -- cada pregunta es independiente,
        // igual que no queda transcripción visible en pantalla.
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ jarvis: true, messages: [{ role: "user", content: texto }] }),
        });
        const data = await res.json();
        respuesta = (!res.ok || data.error) ? `❌ ${data.error || "Error al consultar."}` : (data.reply || "Sin respuesta.");
      }
    } catch {
      respuesta = "❌ Error de conexión.";
    }
    setUltimaRespuesta(respuesta);
    setMostrarTarjeta(true);
    setLoading(false);
    hablar(respuesta);
  };

  // Un solo toque: escucha una frase, la transcribe y la manda directo a
  // preguntar() -- solo existe en navegadores que de verdad soportan
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

  const alTocarBoton = () => {
    if (loading) return;
    if (puedeEscuchar) { escuchando ? detenerEscucha() : escuchar(); return; }
    // Sin SpeechRecognition (Safari/iOS y algunos otros navegadores): se
    // enfoca un campo mínimo para que el propio teclado ofrezca su
    // dictado nativo -- no hay forma de abrirlo directamente sin eso.
    setDictando(d => !d);
  };

  const enviarDictado = () => {
    const texto = input.trim();
    setInput("");
    setDictando(false);
    if (texto) preguntar(texto);
  };

  if (!tieneAcceso) return null;

  return (
    <div style={{ position: "fixed", right: 16, bottom: 78, zIndex: 500, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
      {mostrarTarjeta && ultimaRespuesta && (
        <div style={{
          maxWidth: 280, background: "var(--surface)", border: "1px solid var(--border, #2a2d3a)",
          borderRadius: 12, padding: "10px 12px", boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
          fontSize: 12.5, whiteSpace: "pre-line", lineHeight: 1.5,
        }}>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginBottom: 6 }}>
            {puedeHablar && (
              <>
                <button onClick={() => hablar(ultimaRespuesta)} disabled={hablando} title="Repetir" style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 13, opacity: 0.75, padding: 0 }}>🔁</button>
                <button onClick={detenerVoz} disabled={!hablando} title="Detener voz" style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 13, opacity: 0.75, padding: 0 }}>⏹</button>
              </>
            )}
            <button onClick={() => setMostrarTarjeta(false)} title="Cerrar" style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 13, opacity: 0.75, padding: 0 }}>✕</button>
          </div>
          {ultimaRespuesta}
        </div>
      )}

      {dictando && !puedeEscuchar && (
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && enviarDictado()}
          onBlur={enviarDictado}
          placeholder="Dicta tu pregunta…"
          style={{
            width: 200, fontSize: 13, padding: "8px 10px", borderRadius: 20,
            border: "1px solid var(--border, #2a2d3a)", background: "var(--surface)", color: "inherit",
          }}
        />
      )}

      <button
        onClick={alTocarBoton}
        disabled={loading}
        title="Jarvis"
        style={{
          width: 52, height: 52, borderRadius: "50%", border: "none", cursor: loading ? "default" : "pointer",
          background: escuchando ? "var(--red, #e84b4b)" : "var(--tan, #c9922a)",
          color: "#1a1a1a", fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
        }}
      >
        {loading ? "⏳" : escuchando ? "🔴" : "🎙️"}
      </button>
    </div>
  );
}
