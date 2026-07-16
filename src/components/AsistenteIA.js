import { useState, useEffect, useRef } from "react";
import { authHeaders } from "../lib/auth";

export default function AsistenteIA({ onRefrescar }) {
  const [msgs, setMsgs] = useState([{ role: "assistant", content: "Hola Jesús 👋 Soy el asistente de EEMSA. Puedo **consultar y modificar** el sistema por ti.\n\nEjemplos:\n- *\"Crea el pedido #86 para MAFENSA, 50 cajas blancas, entrega 2026-06-20\"*\n- *\"Registra 12 cajas del pedido 85, operador William\"*\n- *\"La SIAT L36 #1 tuvo 30 min de paro por rodillo anilox, severidad moderada\"*\n- *\"Usa un rodillo anilox del inventario\"*\n- *\"Registra merma del pedido 84: 1800 piezas, 36 con defecto\"*" }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, loading]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", content: input.trim() };
    const next = [...msgs, userMsg];
    setMsgs(next); setInput(""); setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ messages: next.map(m => ({ role: m.role, content: m.content })) })
      });
      const data = await res.json();
      const reply = data?.reply || data?.content?.map(b => b.text || "").join("") || data?.error || "Sin respuesta.";
      setMsgs([...next, { role: "assistant", content: reply }]);
      if (data?.tablas_actualizadas?.length) onRefrescar(data.tablas_actualizadas);
    } catch {
      setMsgs([...next, { role: "assistant", content: "❌ Error de conexión." }]);
    }
    setLoading(false);
  };

  const escapeHtml = (s) => s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const formatMsg = (txt) => escapeHtml(txt || "")
    .replace(/\n/g, "<br>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>");

  return (
    <div>
      <h2 className="sec-title">🤖 Asistente IA</h2>
      <p className="muted" style={{ marginBottom: 12 }}>Dime qué registrar o consultar — creo, actualizo y muevo datos por ti.</p>
      <div className="chat-box">
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role === "user" ? "msg-u" : "msg-a"}`}
            dangerouslySetInnerHTML={{ __html: formatMsg(m.content) }} />
        ))}
        {loading && <div className="msg msg-a typing">Procesando…</div>}
        <div ref={bottomRef} />
      </div>
      <div className="chat-row">
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Ej: Crea el pedido #86 para ARIAT, 30 cajas, entrega 2026-06-25…" disabled={loading} />
        <button className="btn btn-primary" onClick={send} disabled={loading || !input.trim()}>Enviar</button>
      </div>
      <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setMsgs([{ role: "assistant", content: "Chat reiniciado. ¿Qué necesitas?" }])}>Limpiar</button>
    </div>
  );
}
