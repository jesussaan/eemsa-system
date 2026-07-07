const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DIAS  = ["LUN","MAR","MIÉ","JUE","VIE","SÁB","DOM"];

export default function CalendarGrid({ mes, setMes, diaSel, onSelectDia, pedidos, chipColor, hoy, onHoy }) {
  const mesStr  = `${mes.y}-${String(mes.m + 1).padStart(2, "0")}`;
  const numDias = new Date(mes.y, mes.m + 1, 0).getDate();
  const offset  = (() => { const d = new Date(mes.y, mes.m, 1).getDay(); return d === 0 ? 6 : d - 1; })();

  const porDia = d => {
    const k = `${mesStr}-${String(d).padStart(2, "0")}`;
    return pedidos.filter(p => p.fecha_estimada === k);
  };

  const prev = () => setMes(x => x.m === 0 ? { y: x.y - 1, m: 11 } : { ...x, m: x.m - 1 });
  const next = () => setMes(x => x.m === 11 ? { y: x.y + 1, m: 0 } : { ...x, m: x.m + 1 });

  return (
    <div style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", padding: 16, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <button onClick={prev} style={{ background: "transparent", border: "1px solid var(--border-light)", borderRadius: 10, color: "var(--text-2)", fontSize: 20, width: 38, height: 38, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "var(--font-h)", fontWeight: 900, fontSize: 22, color: "var(--accent)", letterSpacing: ".08em" }}>{MESES[mes.m].toUpperCase()}</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: -2 }}>{mes.y}</div>
        </div>
        <button onClick={next} style={{ background: "transparent", border: "1px solid var(--border-light)", borderRadius: 10, color: "var(--text-2)", fontSize: 20, width: 38, height: 38, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3, marginBottom: 4 }}>
        {DIAS.map(d => <div key={d} style={{ textAlign: "center", fontSize: 9, fontWeight: 700, color: "var(--muted)", letterSpacing: ".06em", padding: "3px 0" }}>{d}</div>)}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
        {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: numDias }, (_, i) => i + 1).map(d => {
          const pds   = porDia(d);
          const dStr  = `${mesStr}-${String(d).padStart(2, "0")}`;
          const esHoy = dStr === hoy;
          const sel   = diaSel === d;
          return (
            <div
              key={d}
              onClick={() => onSelectDia(sel ? null : d)}
              style={{
                background: sel ? "#1a2744" : esHoy ? "#1a1a0d" : "var(--card)",
                border: `1.5px solid ${esHoy ? "var(--accent)" : sel ? "var(--blue)" : pds.length > 0 ? "var(--border-light)" : "var(--border)"}`,
                borderRadius: 10, padding: "6px 4px 5px", minHeight: 56,
                cursor: "pointer", transition: "border-color .15s",
              }}
            >
              <div style={{ textAlign: "center", fontSize: 12, fontWeight: esHoy ? 800 : 400, color: esHoy ? "var(--accent)" : sel ? "var(--blue)" : "var(--text-2)", marginBottom: 3 }}>{d}</div>
              {pds.slice(0, 2).map(p => (
                <div key={p.id} style={{ background: chipColor(p), borderRadius: 3, padding: "1px 3px", fontSize: 8, fontWeight: 700, color: "#000", marginBottom: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.num} {(p.cliente || "").slice(0, 7)}
                </div>
              ))}
              {pds.length > 2 && <div style={{ fontSize: 8, color: "var(--muted)", textAlign: "center" }}>+{pds.length - 2}</div>}
              {pds.length === 0 && esHoy && <div style={{ width: 6, height: 6, background: "rgba(232,184,75,0.27)", borderRadius: "50%", margin: "2px auto 0" }} />}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 14, marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
        {[["var(--accent)", "Anotado"], ["var(--blue)", "En proceso"], ["var(--red)", "Vencido"]].map(([c, l]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--muted)" }}>
            <div style={{ width: 9, height: 9, background: c, borderRadius: 2 }} />{l}
          </div>
        ))}
        {onHoy && <button onClick={onHoy} style={{ marginLeft: "auto", background: "transparent", border: "1px solid var(--border-light)", borderRadius: 6, color: "var(--text-2)", fontSize: 10, padding: "2px 8px", cursor: "pointer" }}>Hoy</button>}
      </div>
    </div>
  );
}
