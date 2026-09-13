import { useState, useRef, useEffect } from "react";
import { authHeaders } from "../lib/auth";
import { IcoMic } from "./Icons";

// Pantalla de solo lectura, pensada para consultarse rapido desde el celular
// (dictado incluido: en iPhone el teclado de iOS ya trae microfono en
// cualquier campo de texto, no hace falta Web Speech API -- que ademas
// Safari/iOS nunca implemento). Nunca escribe nada ni controla una maquina:
// solo llama /api/registro?tabla=jarvis-app con la sesion normal del
// usuario (ver api/registro.js) -- el secreto JARVIS_API_SECRET no existe
// en este archivo ni en ningun otro codigo de React.
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

export default function Jarvis({ onSalir }) {
  const [historial, setHistorial] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [leerEnVoz, setLeerEnVoz] = useState(false);
  const bottomRef = useRef(null);
  const puedeHablar = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [historial, loading]);

  const hablar = (texto) => {
    if (!puedeHablar) return;
    window.speechSynthesis.cancel();
    const utt = new window.SpeechSynthesisUtterance(texto.replace(/[⚠❌\n]/g, " "));
    utt.lang = "es-MX";
    window.speechSynthesis.speak(utt);
  };

  const preguntar = async (textoDirecto) => {
    const texto = (textoDirecto ?? input).trim();
    if (!texto || loading) return;
    setInput("");

    const consulta = interpretarConsulta(texto);
    if (!consulta) {
      setHistorial(h => [...h, { pregunta: texto, respuesta: 'No reconocí esa consulta. Usa uno de los botones de arriba, o incluye "pedido", "SIAT" o "inventario"/"cinta".' }]);
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
    setLoading(false);
    if (leerEnVoz) hablar(respuesta);
  };

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

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {FRASES_RAPIDAS.map(f => (
            <button key={f.texto} className="btn btn-ghost btn-sm" disabled={loading} onClick={() => preguntar(f.texto)}>{f.label}</button>
          ))}
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#999", marginBottom: 10, cursor: puedeHablar ? "pointer" : "not-allowed" }}>
          <input type="checkbox" checked={leerEnVoz} disabled={!puedeHablar} onChange={e => setLeerEnVoz(e.target.checked)} />
          🔊 Leer respuestas en voz alta{!puedeHablar ? " (no disponible en este navegador)" : ""}
        </label>

        <div className="chat-box">
          {historial.length === 0 && <div className="msg msg-a">Escribe o dicta una pregunta, o toca uno de los botones de arriba.</div>}
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
