// Etiqueta de pedido urgente (prioridad = "urgente", ver ModoVentas.js) --
// la misma en Ventas, Agenda, Modo Operador y la pizarra.
export const esUrgente = (p) => p?.prioridad === "urgente";

export default function BadgeUrgente({ pedido }) {
  if (!esUrgente(pedido)) return null;
  return (
    <span style={{ display: "inline-block", fontSize: 10, fontWeight: 900, letterSpacing: ".06em", color: "#fff", background: "#e84b4b", borderRadius: 999, padding: "2px 8px", marginLeft: 6, verticalAlign: "middle", whiteSpace: "nowrap" }}>⚡ URGENTE</span>
  );
}
